import type { Appointment, Conversation } from "../db/types";
import { rxNo } from "../rx/pdf";
import { byPeriod, freeSlots, type Period, type Slot } from "../slots";
import { fmtDay, fmtRange, weekday } from "../time";
import type { Out, Send } from "../wa/types";
import {
  BACK,
  type BotCtx,
  input,
  platformId,
  saveState,
  say,
  today,
} from "./ctx";

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

async function step(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const i = input(c.msg);

  // Keywords and menu taps work from any state.
  if (i === "/book" || i === "book") return startBook(c, conv);
  if (i === "menu" || i === "hi") return menu(c, conv);
  if (i === "mine") return mine(c, conv);
  if (i === "cancel") return cancelList(c, conv);
  if (i === "rx") return rxList(c, conv);
  if (i?.startsWith("rx:")) return sendRx(c, conv, i.slice(3));
  if (i === "chat") {
    await saveState(c.store, conv, "chat");
    return [
      say(
        `Sure — ${c.doctor.name} will reply here personally. Type /book any time to book an appointment.`,
      ),
    ];
  }

  switch (conv.state) {
    case "idle":
      return menu(c, conv);
    case "chat": {
      const gap = !conv.lastInboundAt || +c.now - +conv.lastInboundAt >= DAY;
      return gap ? menu(c, conv) : [];
    }
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
async function prompt(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  switch (conv.state) {
    case "book_name":
      return [namePrompt(conv.ctx.lastName as string | undefined)];
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
      return [reasonPrompt()];
    case "cancel_pick":
      return cancelList(c, conv);
    case "cancel_reason":
      return [cancelReasonPrompt()];
    default:
      return menu(c, conv);
  }
}

async function menu(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const { store, doctor, msg, now } = c;
  const t = today(now);
  const all = await store.patientAppointments(doctor.id, msg.from);
  const todays = all.filter((a) => a.startsAt >= t.from && a.startsAt < t.to);
  // WhatsApp limits: title 24 chars, description 72 chars.
  const rows = [
    {
      id: "book",
      title: "Book appointment",
      description: "Pick a time to see the doctor today",
    },
  ];
  if (todays.length)
    rows.push({
      id: "mine",
      title: "My appointments",
      description: "See your booking for today",
    });
  if (todays.some((a) => a.status === "CONFIRMED"))
    rows.push({
      id: "cancel",
      title: "Cancel appointment",
      description: "Cancel your booking for today",
    });
  if (all.some((a) => a.prescriptionPdfPath))
    rows.push({
      id: "rx",
      title: "My prescriptions",
      description: "Get the prescription PDF from a past visit",
    });
  rows.push({
    id: "chat",
    title: "Chat with the clinic",
    description: "Talk to the clinic directly. Type /book to book later",
  });
  await saveState(store, conv, "idle");
  return [
    {
      kind: "list",
      body: `👋 Welcome to ${doctor.clinicName}. What would you like to do?`,
      button: "Choose an option",
      rows,
    },
  ];
}

async function mine(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const t = today(c.now);
  const todays = (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter((a) => a.startsAt >= t.from && a.startsAt < t.to)
    .reverse();
  await saveState(c.store, conv, "idle");
  if (!todays.length) return [say("No appointments today.")];
  return [
    say(
      `Today:\n${todays.map((a) => `📅 ${fmtRange(a.startsAt, a.endsAt)} — ${a.patientName} (${a.status})`).join("\n")}`,
    ),
  ];
}

function namePrompt(lastName?: string): Out {
  if (!lastName) return say("Sure! What's the patient's full name?");
  return {
    kind: "buttons",
    body: `Welcome back! Your last visit was booked for "${lastName}". Tap below to reuse that name, or type a different patient's name.`,
    buttons: [{ id: "yesname", title: `Yes, ${lastName}` }],
  };
}

async function startBook(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const { date } = today(c.now);
  if (
    !c.doctor.workingDays.includes(weekday(date)) ||
    (await c.store.isClosed(c.doctor.id, date))
  ) {
    await saveState(c.store, conv, "idle");
    return [
      say(
        `Sorry, ${c.doctor.name} isn't taking bookings today. Please try again tomorrow.`,
      ),
    ];
  }
  const past = await c.store.patientAppointments(c.doctor.id, c.msg.from);
  const lastName = past[0]?.patientName;
  await saveState(c.store, conv, "book_name", lastName ? { lastName } : {});
  return [namePrompt(lastName)];
}

async function todaysFree(c: BotCtx): Promise<Slot[]> {
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

const PERIOD_TITLE: Record<Period, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

async function periods(
  c: BotCtx,
  conv: Conversation,
  ctx: Record<string, unknown>,
): Promise<Reply[]> {
  const by = byPeriod(c.doctor, await todaysFree(c));
  const buttons = (Object.keys(PERIOD_TITLE) as Period[])
    .filter((p) => by[p].length > 0)
    .map((p) => ({
      id: `p:${p}`,
      title: `${PERIOD_TITLE[p]} (${by[p].length})`,
    }));
  if (!buttons.length) {
    await saveState(c.store, conv, "idle");
    return [say("Sorry, no slots are left today.")];
  }
  await saveState(c.store, conv, "book_period", { name: ctx.name });
  // WhatsApp allows 3 buttons; with all three periods shown, Back is typed instead.
  if (buttons.length < 3) buttons.push(BACK);
  const body =
    buttons.length === 3 && buttons[2].id !== "back"
      ? 'Which part of today works for you?\n\nType "back" to change the name.'
      : "Which part of today works for you?";
  return [{ kind: "buttons", body, buttons }];
}

async function times(
  c: BotCtx,
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
  if (more) rows.push({ id: "more", title: "Later times" });
  rows.push(BACK);
  await saveState(c.store, conv, "book_time", {
    name: conv.ctx.name,
    period,
    page,
  });
  return [
    {
      kind: "list",
      body: `${PERIOD_TITLE[period]} slots today. Pick a time:`,
      button: "Choose a time",
      rows,
    },
  ];
}

const JUST_TAKEN = "Sorry, that time was just taken. Please pick another.";

async function pickTime(
  c: BotCtx,
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
      ...(stillAhead ? [say(JUST_TAKEN)] : []),
      ...(await periods(c, conv, conv.ctx)),
    ];
  }
  await saveState(c.store, conv, "book_reason", {
    name: conv.ctx.name,
    period: conv.ctx.period,
    page: conv.ctx.page,
    startsAt: start.toISOString(),
  });
  return [reasonPrompt()];
}

function reasonPrompt(): Out {
  return {
    kind: "buttons",
    body: "Got it. Any specific concern or reason for the visit? (optional — type it, or tap Skip)",
    buttons: [{ id: "skip", title: "Skip" }, BACK],
  };
}

const when = (a: Pick<Appointment, "startsAt" | "endsAt">) =>
  `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`;

async function create(
  c: BotCtx,
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
    return [say(JUST_TAKEN), ...(await periods(c, conv, conv.ctx))];
  await saveState(c.store, conv, "idle");
  return [
    say(
      `You're confirmed with ${c.doctor.name} at ${c.doctor.clinicName}.\n\n📅 ${when(res)}\n\nReply "cancel" any time to cancel this appointment.`,
    ),
    {
      from: platformId(),
      to: c.doctor.personalPhone,
      msg: say(
        `New appointment booked ✅\n\nPatient: ${name}\nPhone: +${c.msg.from}\n📅 ${when(res)}\nReason: ${notes ?? "—"}`,
      ),
    },
  ];
}

async function cancellable(c: BotCtx): Promise<Appointment[]> {
  const t = today(c.now);
  return (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter(
      (a) =>
        a.status === "CONFIRMED" && a.startsAt >= t.from && a.startsAt < t.to,
    )
    .reverse();
}

async function cancelList(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const list = await cancellable(c);
  if (!list.length) {
    await saveState(c.store, conv, "idle");
    return [say("You have no confirmed appointments today.")];
  }
  await saveState(c.store, conv, "cancel_pick");
  return [
    {
      kind: "list",
      body: "Which appointment do you want to cancel?",
      button: "Select appointment",
      rows: [
        ...list.slice(0, 9).map((a) => ({
          id: `c:${a.id}`,
          title: fmtRange(a.startsAt, a.endsAt),
          description: a.patientName,
        })),
        BACK,
      ],
    },
  ];
}

function cancelReasonPrompt(): Out {
  return {
    kind: "buttons",
    body: "Got it. Any reason for cancelling? (optional — type it, or tap Skip)",
    buttons: [{ id: "skip", title: "Skip" }, BACK],
  };
}

async function cancelPick(
  c: BotCtx,
  conv: Conversation,
  id: string,
): Promise<Reply[]> {
  if (!(await cancellable(c)).some((a) => a.id === id))
    return cancelList(c, conv);
  await saveState(c.store, conv, "cancel_reason", { appointmentId: id });
  return [cancelReasonPrompt()];
}

async function cancelDone(
  c: BotCtx,
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
  await saveState(c.store, conv, "idle");
  return [
    {
      kind: "buttons",
      body: "Your appointment has been cancelled.",
      buttons: [
        { id: "book", title: "Book again" },
        { id: "menu", title: "Menu" },
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

async function withRx(c: BotCtx): Promise<Appointment[]> {
  return (await c.store.patientAppointments(c.doctor.id, c.msg.from))
    .filter((a) => a.prescriptionPdfPath)
    .slice(0, 9);
}

async function rxList(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const list = await withRx(c);
  if (!list.length) return menu(c, conv);
  await saveState(c.store, conv, "idle");
  return [
    {
      kind: "list",
      body: "Your prescriptions:",
      button: "Choose a visit",
      rows: [
        ...list.map((a) => ({
          id: `rx:${a.id}`,
          title: fmtDay(a.startsAt),
          description: a.patientName,
        })),
        BACK,
      ],
    },
  ];
}

async function sendRx(
  c: BotCtx,
  conv: Conversation,
  id: string,
): Promise<Reply[]> {
  const a = (await withRx(c)).find((x) => x.id === id);
  if (!a?.prescriptionPdfPath) return menu(c, conv);
  return [
    {
      kind: "document",
      link: await c.store.signedUrl("prescriptions", a.prescriptionPdfPath),
      filename: `Prescription-${rxNo(a.id)}.pdf`,
      caption: `Prescription from your visit on ${when(a)} with ${c.doctor.name}.`,
    },
  ];
}
