import type { Appointment, Conversation } from "../db/types";
import { rxNo } from "../rx/pdf";
import { byPeriod, freeSlots, type Period, type Slot } from "../slots";
import { fmtDay, fmtRange, weekday } from "../time";
import type { Out, Send } from "../wa/types";
import { type BotCtx, input, platformId, saveState, say, today } from "./ctx";
import {
  canon,
  LANG_NAME,
  LANG_PICKER,
  LANGS,
  type Lang,
  TEXT,
  type Text,
  typedLang,
} from "./patient-text";

const DAY = 24 * 3600_000;

export async function handlePatient(c: BotCtx): Promise<Send[]> {
  const { store, doctor, msg } = c;
  const conv = await store.getConversation(
    doctor.businessPhoneNumberId,
    msg.from,
  );
  const outs = await step(c, conv);
  return outs.map((m) =>
    "to" in m
      ? m
      : { from: doctor.businessPhoneNumberId, to: msg.from, msg: m },
  );
}

type Reply = Out | Send;
/** The patient's language for this conversation, picked on its first message. */
type PC = BotCtx & { lang: Lang; t: Text };

const GLOBAL = new Set(["book", "menu", "mine", "cancel", "rx", "chat"]);
const isGlobal = (i: string | null) =>
  !!i && (GLOBAL.has(i) || i.startsWith("rx:") || i === "language");

async function step(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const i = canon(input(c.msg));
  const gap = !conv.lastInboundAt || +c.now - +conv.lastInboundAt >= DAY;

  // The language answer: a tap, or typed (number, name, or the script used).
  const picked = i?.startsWith("lang:")
    ? (i.slice(5) as Lang)
    : conv.state === "lang" && c.msg.type === "text"
      ? typedLang(c.msg.text ?? "")
      : null;
  if (picked && LANGS.includes(picked)) {
    const next = conv.state === "lang" ? (conv.ctx.next as string) : "menu";
    return dispatch(
      { ...c, lang: picked, t: TEXT[picked] },
      { ...conv, state: "idle", ctx: {} },
      next,
    );
  }

  // Normal chat: silent until a keyword or a 24 h gap.
  if (conv.state === "chat" && !gap && !isGlobal(i)) return [];

  // Not saved anywhere: asked again in every new conversation.
  const lang = conv.ctx.lang as Lang | undefined;
  if (!lang || !LANGS.includes(lang) || gap || i === "language") {
    const next =
      conv.state === "lang"
        ? (conv.ctx.next as string)
        : isGlobal(i) && i !== "language"
          ? (i as string)
          : "menu";
    await saveState(c.store, conv, "lang", { next });
    return [langPicker(c)];
  }
  return dispatch({ ...c, lang, t: TEXT[lang] }, conv, i);
}

function langPicker(c: BotCtx): Out {
  return {
    kind: "buttons",
    body: LANG_PICKER(c.doctor.clinicName),
    buttons: LANGS.map((l) => ({ id: `lang:${l}`, title: LANG_NAME[l] })),
  };
}

/** Saves a step and keeps the language for the rest of the conversation. */
const save = (
  c: PC,
  conv: Conversation,
  state: string,
  ctx: Record<string, unknown> = {},
) => saveState(c.store, conv, state, { ...ctx, lang: c.lang });
/** The conversation is over: the next message asks the language again. */
const end = (c: PC, conv: Conversation, state: string) =>
  saveState(c.store, conv, state);
const back = (c: PC) => ({ id: "back", title: c.t.back });
const skipBack = (c: PC) => [{ id: "skip", title: c.t.skip }, back(c)];

async function dispatch(
  c: PC,
  conv: Conversation,
  i: string | null,
): Promise<Reply[]> {
  // Keywords and menu taps work from any state.
  if (i === "book") return startBook(c, conv);
  if (i === "menu" || i === "hi") return menu(c, conv);
  if (i === "mine") return mine(c, conv);
  if (i === "cancel") return cancelList(c, conv);
  if (i === "rx") return rxList(c, conv);
  if (i?.startsWith("rx:")) return sendRx(c, conv, i.slice(3));
  if (i === "chat") {
    await end(c, conv, "chat");
    return [say(c.t.chatOn)];
  }

  switch (conv.state) {
    case "idle":
      return menu(c, conv);
    case "book_name": {
      if (i === "back") return menu(c, conv);
      const name =
        c.msg.type === "text"
          ? clean(c.msg.text)
          : i === "yesname"
            ? (conv.ctx.lastName as string)
            : "";
      if (!name) return prompt(c, conv);
      return periods(c, conv, { name });
    }
    case "book_period":
      if (i === "back") return startBook(c, conv);
      if (i?.startsWith("p:")) return times(c, conv, i.slice(2) as Period, 0);
      return prompt(c, conv);
    case "book_time":
      if (i === "back") return periods(c, conv, conv.ctx);
      if (i === "more")
        return times(
          c,
          conv,
          conv.ctx.period as Period,
          Number(conv.ctx.page ?? 0) + 1,
        );
      if (i?.startsWith("t:")) return pickTime(c, conv, i.slice(2));
      return prompt(c, conv);
    case "book_reason":
      if (i === "back")
        return times(
          c,
          conv,
          conv.ctx.period as Period,
          Number(conv.ctx.page ?? 0),
        );
      if (i === "skip") return create(c, conv, null);
      if (c.msg.type === "text" && clean(c.msg.text))
        return create(c, conv, clean(c.msg.text));
      return prompt(c, conv);
    case "cancel_pick":
      if (i === "back") return menu(c, conv);
      if (i?.startsWith("c:")) return cancelPick(c, conv, i.slice(2));
      return prompt(c, conv);
    case "cancel_reason":
      if (i === "back") return cancelList(c, conv);
      if (i === "skip") return cancelDone(c, conv, null);
      if (c.msg.type === "text" && clean(c.msg.text))
        return cancelDone(c, conv, clean(c.msg.text));
      return prompt(c, conv);
    default:
      return menu(c, conv);
  }
}

const clean = (s?: string) => (s ?? "").trim().slice(0, 200);

/** Re-send the current step's prompt. */
async function prompt(c: PC, conv: Conversation): Promise<Reply[]> {
  switch (conv.state) {
    case "book_name":
      return [namePrompt(c, conv.ctx.lastName as string | undefined)];
    case "book_period":
      return periods(c, conv, conv.ctx);
    case "book_time":
      return times(
        c,
        conv,
        conv.ctx.period as Period,
        Number(conv.ctx.page ?? 0),
      );
    case "book_reason":
      return [reasonPrompt(c)];
    case "cancel_pick":
      return cancelList(c, conv);
    case "cancel_reason":
      return [cancelReasonPrompt(c)];
    default:
      return menu(c, conv);
  }
}

async function menu(c: PC, conv: Conversation): Promise<Reply[]> {
  const { store, doctor, msg, now } = c;
  const t = today(now);
  const all = await store.patientAppointments(doctor.id, msg.from);
  const todays = all.filter((a) => a.startsAt >= t.from && a.startsAt < t.to);
  const { t: T } = c;
  const rows = [{ id: "book", ...T.book }];
  if (todays.length) rows.push({ id: "mine", ...T.mine });
  if (todays.some((a) => a.status === "CONFIRMED"))
    rows.push({ id: "cancel", ...T.cancel });
  if (all.some((a) => a.prescriptionPdfPath)) rows.push({ id: "rx", ...T.rx });
  rows.push({ id: "chat", ...T.chat }, { id: "language", ...T.language });
  await save(c, conv, "idle");
  return [
    {
      kind: "list",
      body: T.menuBody(doctor.clinicName),
      button: T.menuButton,
      rows,
    },
  ];
}

async function mine(c: PC, conv: Conversation): Promise<Reply[]> {
  const t = today(c.now);
  const todays = (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter((a) => a.startsAt >= t.from && a.startsAt < t.to)
    .reverse();
  await save(c, conv, "idle");
  if (!todays.length) return [say(c.t.noToday)];
  return [
    say(
      `${c.t.todayHead}\n${todays.map((a) => `📅 ${fmtRange(a.startsAt, a.endsAt)} — ${a.patientName} (${c.t.status[a.status]})`).join("\n")}`,
    ),
  ];
}

function namePrompt(c: PC, lastName?: string): Out {
  if (!lastName) return say(c.t.askName);
  return {
    kind: "buttons",
    body: c.t.welcomeBack(lastName),
    buttons: [{ id: "yesname", title: c.t.yesName(lastName) }],
  };
}

async function startBook(c: PC, conv: Conversation): Promise<Reply[]> {
  const { date } = today(c.now);
  if (
    !c.doctor.workingDays.includes(weekday(date)) ||
    (await c.store.isClosed(c.doctor.id, date))
  ) {
    await save(c, conv, "idle");
    return [say(c.t.notTaking(c.doctor.name))];
  }
  const past = await c.store.patientAppointments(c.doctor.id, c.msg.from);
  const lastName = past[0]?.patientName;
  await save(c, conv, "book_name", lastName ? { lastName } : {});
  return [namePrompt(c, lastName)];
}

async function todaysFree(c: PC): Promise<Slot[]> {
  const t = today(c.now);
  if (await c.store.isClosed(c.doctor.id, t.date)) return [];
  const appts = await c.store.appointmentsBetween(c.doctor.id, t.from, t.to);
  const blocks = await c.store.blocksBetween(c.doctor.id, t.from, t.to);
  const busy = [
    ...appts
      .filter((a) => a.status === "CONFIRMED")
      .map((a) => ({ start: a.startsAt, end: a.endsAt })),
    ...blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];
  return freeSlots(c.doctor, t.date, busy, c.now);
}

const PERIOD_ORDER: Period[] = ["morning", "afternoon", "evening"];

async function periods(
  c: PC,
  conv: Conversation,
  ctx: Record<string, unknown>,
): Promise<Reply[]> {
  const by = byPeriod(c.doctor, await todaysFree(c));
  const buttons = PERIOD_ORDER.filter((p) => by[p].length > 0).map((p) => ({
    id: `p:${p}`,
    title: `${c.t.period[p]} (${by[p].length})`,
  }));
  if (!buttons.length) {
    await save(c, conv, "idle");
    return [say(c.t.noSlots)];
  }
  await save(c, conv, "book_period", { name: ctx.name });
  // WhatsApp allows 3 buttons; with all three periods shown, Back is typed instead.
  if (buttons.length < 3) buttons.push(back(c));
  const body =
    buttons.length === 3 && buttons[2].id !== "back"
      ? `${c.t.whichPart}${c.t.typeBack}`
      : c.t.whichPart;
  return [{ kind: "buttons", body, buttons }];
}

async function times(
  c: PC,
  conv: Conversation,
  period: Period,
  page: number,
): Promise<Reply[]> {
  const slots = byPeriod(c.doctor, await todaysFree(c))[period] ?? [];
  // 10 rows max: up to 8 slots + "Later times" + Back, or up to 9 slots + Back.
  const rest = slots.slice(page * 8);
  if (!rest.length) return periods(c, conv, conv.ctx);
  const more = rest.length > 9;
  const shown = more ? rest.slice(0, 8) : rest;
  const rows = shown.map((s) => ({
    id: `t:${s.start.toISOString()}`,
    title: fmtRange(s.start, s.end),
  }));
  if (more) rows.push({ id: "more", title: c.t.laterTimes });
  rows.push(back(c));
  await save(c, conv, "book_time", {
    name: conv.ctx.name,
    period,
    page,
  });
  return [
    {
      kind: "list",
      body: c.t.slotsBody(c.t.period[period]),
      button: c.t.chooseTime,
      rows,
    },
  ];
}

async function pickTime(
  c: PC,
  conv: Conversation,
  iso: string,
): Promise<Reply[]> {
  const start = new Date(iso);
  const free = await todaysFree(c);
  if (!free.some((s) => +s.start === +start)) {
    const stillAhead =
      !Number.isNaN(+start) &&
      start > c.now &&
      start >= today(c.now).from &&
      start < today(c.now).to;
    return [
      ...(stillAhead ? [say(c.t.justTaken)] : []),
      ...(await periods(c, conv, conv.ctx)),
    ];
  }
  await save(c, conv, "book_reason", {
    name: conv.ctx.name,
    period: conv.ctx.period,
    page: conv.ctx.page,
    startsAt: start.toISOString(),
  });
  return [reasonPrompt(c)];
}

function reasonPrompt(c: PC): Out {
  return { kind: "buttons", body: c.t.reason, buttons: skipBack(c) };
}

const when = (a: Pick<Appointment, "startsAt" | "endsAt">) =>
  `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`;

async function create(
  c: PC,
  conv: Conversation,
  notes: string | null,
): Promise<Reply[]> {
  const startsAt = new Date(conv.ctx.startsAt as string);
  const name = conv.ctx.name as string;
  const endsAt = new Date(+startsAt + c.doctor.slotMinutes * 60_000);
  const free = await todaysFree(c);
  const res = free.some((s) => +s.start === +startsAt)
    ? await c.store.createAppointment({
        doctorId: c.doctor.id,
        patientPhone: c.msg.from,
        patientName: name,
        startsAt,
        endsAt,
        notes,
      })
    : "slot_taken";
  if (res === "slot_taken")
    return [say(c.t.justTaken), ...(await periods(c, conv, conv.ctx))];
  await end(c, conv, "idle");
  return [
    say(c.t.confirmed(c.doctor.name, c.doctor.clinicName, when(res))),
    {
      from: platformId(),
      to: c.doctor.personalPhone,
      msg: say(
        `New appointment booked ✅\n\nPatient: ${name}\nPhone: +${c.msg.from}\n📅 ${when(res)}\nReason: ${notes ?? "—"}`,
      ),
    },
  ];
}

async function cancellable(c: PC): Promise<Appointment[]> {
  const t = today(c.now);
  return (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter(
      (a) =>
        a.status === "CONFIRMED" && a.startsAt >= t.from && a.startsAt < t.to,
    )
    .reverse();
}

async function cancelList(c: PC, conv: Conversation): Promise<Reply[]> {
  const list = await cancellable(c);
  if (!list.length) {
    await save(c, conv, "idle");
    return [say(c.t.noConfirmed)];
  }
  await save(c, conv, "cancel_pick");
  return [
    {
      kind: "list",
      body: c.t.whichCancel,
      button: c.t.selectAppt,
      rows: [
        ...list.slice(0, 9).map((a) => ({
          id: `c:${a.id}`,
          title: fmtRange(a.startsAt, a.endsAt),
          description: a.patientName,
        })),
        back(c),
      ],
    },
  ];
}

function cancelReasonPrompt(c: PC): Out {
  return { kind: "buttons", body: c.t.cancelReason, buttons: skipBack(c) };
}

async function cancelPick(
  c: PC,
  conv: Conversation,
  id: string,
): Promise<Reply[]> {
  if (!(await cancellable(c)).some((a) => a.id === id))
    return cancelList(c, conv);
  await save(c, conv, "cancel_reason", { appointmentId: id });
  return [cancelReasonPrompt(c)];
}

async function cancelDone(
  c: PC,
  conv: Conversation,
  reason: string | null,
): Promise<Reply[]> {
  const a = (await cancellable(c)).find((x) => x.id === conv.ctx.appointmentId);
  if (!a) return cancelList(c, conv);
  await c.store.updateAppointment(a.id, {
    status: "CANCELLED",
    cancelledBy: "patient",
    cancelReason: reason,
  });
  await end(c, conv, "idle");
  return [
    {
      kind: "buttons",
      body: c.t.cancelled,
      buttons: [
        { id: "book", title: c.t.bookAgain },
        { id: "menu", title: c.t.menu },
      ],
    },
    {
      from: platformId(),
      to: c.doctor.personalPhone,
      msg: say(
        `Appointment cancelled by patient ❌\n\nPatient: ${a.patientName}\nPhone: +${a.patientPhone}\n📅 ${when(a)}\nReason: ${reason ?? "—"}`,
      ),
    },
  ];
}

async function withRx(c: PC): Promise<Appointment[]> {
  return (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter((a) => a.prescriptionPdfPath)
    .slice(0, 9);
}

async function rxList(c: PC, conv: Conversation): Promise<Reply[]> {
  const list = await withRx(c);
  if (!list.length) return menu(c, conv);
  await save(c, conv, "idle");
  return [
    {
      kind: "list",
      body: c.t.yourRx,
      button: c.t.chooseVisit,
      rows: [
        ...list.map((a) => ({
          id: `rx:${a.id}`,
          title: fmtDay(a.startsAt),
          description: a.patientName,
        })),
        back(c),
      ],
    },
  ];
}

async function sendRx(c: PC, conv: Conversation, id: string): Promise<Reply[]> {
  const a = (await withRx(c)).find((x) => x.id === id);
  if (!a?.prescriptionPdfPath) return menu(c, conv);
  return [
    {
      kind: "document",
      link: await c.store.signedUrl("prescriptions", a.prescriptionPdfPath),
      filename: `Prescription-${rxNo(a.id)}.pdf`,
      caption: c.t.rxCaption(when(a), c.doctor.name),
    },
  ];
}
