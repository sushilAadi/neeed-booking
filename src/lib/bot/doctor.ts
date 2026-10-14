import type {
  Appointment,
  Conversation,
  Doctor,
  HoursPatch,
} from "../db/types";
import { signRxToken } from "../rx/link";
import { type Med, medSummary, parseRx, type Rx } from "../rx/parse";
import {
  crosses,
  lunchHours,
  overlapsAny,
  PERIODS,
  type Period,
  parseRange,
  periodHours,
  periodRange,
  type Range,
} from "../slots";
import { addDays, atIst, fmtDay, fmtRange, fmtTime } from "../time";
import { windowOpen } from "../wa/deliver";
import type { Out, Send } from "../wa/types";
import {
  completeVisit,
  type RxContent,
  SAVED_CLOSED,
  SAVED_SENT,
} from "./complete";
import {
  BACK,
  type BotCtx,
  input,
  platformId,
  saveState,
  say,
  today,
} from "./ctx";

type Reply = Out | Send;

export async function handleDoctor(c: BotCtx): Promise<Send[]> {
  const conv = await c.store.getConversation(
    platformId(),
    c.doctor.personalPhone,
  );
  const outs = await step(c, conv);
  return outs.map((m) =>
    "to" in m ? m : { from: platformId(), to: c.msg.from, msg: m },
  );
}

const REG_PROMPT =
  'One-time setup: what\'s your medical registration number? (printed on every prescription slip — reply "setup" any time to change it later)';
const SIG_PROMPT =
  "Now send a photo of your signature — sign on plain paper and photograph it.";

async function step(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const i = input(c.msg);
  const setupDone = c.doctor.registrationNumber && c.doctor.signaturePath;

  if (conv.state === "setup_reg") return setupReg(c, conv);
  if (conv.state === "setup_sig") return setupSig(c, conv);
  if (conv.state.startsWith("hrs_")) return hoursStep(c, conv);
  if (i === "setup") return startSetup(c, conv);
  if (!setupDone) {
    await saveState(c.store, conv, "setup_reg");
    return [
      say("Your prescription setup isn't done yet — let's finish that first."),
      say(REG_PROMPT),
    ];
  }
  if (!c.doctor.hoursSet)
    return [
      say("One more setup step: your clinic hours."),
      ...(await askHours(c, conv, "morning", "setup")),
    ];
  if (i === "hours") return hoursMenu(c, conv);
  if (i?.startsWith("h:")) {
    const k = i.slice(2) as HoursKey;
    if (HOURS_KEYS.includes(k)) return askHours(c, conv, k, "edit");
  }

  if (i === "menu" || i === "hi") return menu(c, conv);
  if (i === "today") return todayList(c, conv);
  if (i === "close") return close(c, conv);
  if (i === "open") {
    await c.store.setClosed(c.doctor.id, today(c.now).date, false);
    await saveState(c.store, conv, "idle");
    return [say("Open for bookings today.")];
  }
  if (i === "cancel" || i === "dcancel") return dcancelList(c, conv);
  if (i === "block") return blockDates(c, conv);
  if (i?.startsWith("done:")) return markStart(c, conv, i.slice(5));

  switch (conv.state) {
    case "close_confirm":
      if (i === "back") return menu(c, conv);
      if (i === "cn" || i === "keep") return closeConfirm(c, conv, i);
      return prompt(c, conv);
    case "dcancel_pick":
      if (i === "back") return menu(c, conv);
      if (i?.startsWith("dc:")) return dcancelPick(c, conv, i.slice(3));
      return prompt(c, conv);
    case "dcancel_reason":
      if (i === "back") return dcancelList(c, conv);
      if (i === "skip") return dcancelDone(c, conv, null);
      if (c.msg.type === "text" && clean(c.msg.text))
        return dcancelDone(c, conv, clean(c.msg.text));
      return prompt(c, conv);
    case "rx_input":
      if (i === "back") return todayList(c, conv);
      if (i === "skip") return markDone(c, conv, null);
      if (c.msg.type === "text" && c.msg.text?.trim())
        return rxNames(c, conv, c.msg.text);
      if (c.msg.type === "image" && c.msg.mediaId)
        return markDone(c, conv, {
          mediaId: c.msg.mediaId,
          caption: c.msg.caption?.trim(),
        });
      return prompt(c, conv);
    case "rx_q":
      return rxAnswer(c, conv);
    case "rx_advice":
      if (i === "back") return rxBack(c, conv);
      if (i === "noadvice")
        return rxConfirm(c, conv, { ...rxCtx(conv), advice: [] });
      if (c.msg.type === "text" && clean(c.msg.text))
        return rxConfirm(c, conv, {
          ...rxCtx(conv),
          advice: [clean(c.msg.text)],
        });
      return [ADVICE_Q];
    case "rx_confirm":
      if (i === "back") return rxAskAdvice(c, conv, rxCtx(conv));
      if (i === "restart") {
        await saveState(c.store, conv, "rx_input", {
          appointmentId: conv.ctx.appointmentId,
        });
        return [RX_PROMPT];
      }
      if (i === "send") {
        const x = rxCtx(conv);
        return markDone(c, conv, { rx: { meds: x.meds, advice: x.advice } });
      }
      return [rxSummary(conv.ctx.patient as string, rxCtx(conv))];
    case "block_date":
      if (i === "back") return menu(c, conv);
      if (i?.startsWith("d:")) return blockRanges(c, conv, i.slice(2));
      return prompt(c, conv);
    case "block_range":
      if (i === "back") return blockDates(c, conv);
      if (i === "r:custom") {
        await saveState(c.store, conv, "block_custom", conv.ctx);
        return [say(CUSTOM_PROMPT)];
      }
      if (i === "r:whole" || i === "r:morning" || i === "r:afternoon")
        return blockPreset(
          c,
          conv,
          i.slice(2) as "whole" | "morning" | "afternoon",
        );
      return prompt(c, conv);
    case "block_custom": {
      if (i === "back") return blockRanges(c, conv, conv.ctx.date as string);
      const range = c.msg.type === "text" ? parseRange(c.msg.text ?? "") : null;
      if (!range) return [say(`Couldn't read that. ${CUSTOM_HINT}`)];
      const date = conv.ctx.date as string;
      return blockCheck(c, conv, {
        date,
        start: atIst(date, range.start),
        end: atIst(date, range.end),
        whole: false,
      });
    }
    case "block_confirm":
      if (i === "back") return blockRanges(c, conv, conv.ctx.date as string);
      if (i === "cn" || i === "keep") return blockConfirm(c, conv, i);
      return prompt(c, conv);
    case "idle":
      return menu(c, conv);
    default:
      return prompt(c, conv);
  }
}

const clean = (s?: string) => (s ?? "").trim().slice(0, 200);

async function prompt(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  switch (conv.state) {
    case "close_confirm":
      return close(c, conv);
    case "dcancel_pick":
      return dcancelList(c, conv);
    case "dcancel_reason":
      return [
        skipPrompt(
          "Any reason to give the patient? (optional — type it, or tap Skip)",
        ),
      ];
    default:
      return menu(c, conv);
  }
}

const skipPrompt = (body: string): Out => ({
  kind: "buttons",
  body,
  buttons: [{ id: "skip", title: "Skip" }, BACK],
});

async function startSetup(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  await saveState(c.store, conv, "setup_reg");
  return [say(REG_PROMPT)];
}

async function setupReg(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const reg = c.msg.type === "text" ? clean(c.msg.text).slice(0, 60) : "";
  if (!reg) return [say(REG_PROMPT)];
  await c.store.updateDoctor(c.doctor.id, { registrationNumber: reg });
  await saveState(c.store, conv, "setup_sig");
  return [say(SIG_PROMPT)];
}

async function setupSig(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  if (c.msg.type !== "image" || !c.msg.mediaId || !c.media)
    return [say(SIG_PROMPT)];
  const { bytes, mime } = await c.media(c.msg.mediaId);
  const ext = mime === "image/png" ? "png" : "jpg";
  const path = `${c.doctor.id}.${ext}`;
  await c.store.putFile(
    "signatures",
    path,
    bytes,
    mime === "image/png" ? "image/png" : "image/jpeg",
  );
  await c.store.updateDoctor(c.doctor.id, { signaturePath: path });
  if (!c.doctor.hoursSet)
    return [
      say("Signature saved. Now your clinic hours."),
      ...(await askHours(c, conv, "morning", "setup")),
    ];
  return [
    say(
      'Setup saved. Reply "setup" any time to update your registration number or signature.',
    ),
    ...(await menu(c, conv)),
  ];
}

async function menu(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const closed = await c.store.isClosed(c.doctor.id, today(c.now).date);
  await saveState(c.store, conv, "idle");
  return [
    {
      kind: "list",
      body: `Hi ${c.doctor.name}. What would you like to do?`,
      button: "Choose an option",
      rows: [
        { id: "today", title: "Today" },
        closed
          ? { id: "open", title: "Open today" }
          : { id: "close", title: "Close today" },
        { id: "block", title: "Block my time" },
        { id: "dcancel", title: "Cancel appointment" },
        { id: "hours", title: "Clinic hours" },
        { id: "setup", title: "Prescription setup" },
      ],
    },
  ];
}

async function todays(c: BotCtx): Promise<Appointment[]> {
  const t = today(c.now);
  return c.store.appointmentsBetween(c.doctor.id, t.from, t.to);
}
const confirmedToday = async (c: BotCtx) =>
  (await todays(c)).filter((a) => a.status === "CONFIRMED");

async function todayList(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const all = await todays(c);
  await saveState(c.store, conv, "idle");
  if (!all.length) return [say("No appointments today.")];
  const lines = all.map(
    (a, n) =>
      `${n + 1}. ${fmtRange(a.startsAt, a.endsAt)} — ${a.patientName} (+${a.patientPhone}) [${a.status}]`,
  );
  const out: Reply[] = [say(`Today's appointments:\n${lines.join("\n")}`)];
  const open = all.filter((a) => a.status === "CONFIRMED").slice(0, 10);
  if (open.length)
    out.push({
      kind: "list",
      body: "Tap a patient once their visit is done to mark it complete and add a prescription.",
      button: "Mark complete",
      rows: [
        ...open.slice(0, 9).map((a) => ({
          id: `done:${a.id}`,
          title: a.patientName,
          description: fmtRange(a.startsAt, a.endsAt),
        })),
        BACK,
      ],
    });
  return out;
}

const clashWarning = (n: number): Out => ({
  kind: "buttons",
  body: `You have ${n} confirmed appointment(s) today. What should happen to them?`,
  buttons: [
    { id: "cn", title: "Cancel & notify" },
    { id: "keep", title: "Keep bookings" },
    BACK,
  ],
});

async function close(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const appts = await confirmedToday(c);
  if (!appts.length) {
    await c.store.setClosed(c.doctor.id, today(c.now).date, true);
    await saveState(c.store, conv, "idle");
    return [
      say(
        "Closed for today. Patients will be told you're not taking bookings.",
      ),
    ];
  }
  await saveState(c.store, conv, "close_confirm", { date: today(c.now).date });
  return [clashWarning(appts.length)];
}

async function closeConfirm(
  c: BotCtx,
  conv: Conversation,
  choice: "cn" | "keep",
): Promise<Reply[]> {
  // a warning shown on an earlier day: ask again about today's bookings
  if (conv.ctx.date !== today(c.now).date) return close(c, conv);
  await c.store.setClosed(c.doctor.id, today(c.now).date, true);
  await saveState(c.store, conv, "idle");
  if (choice === "keep")
    return [
      say(
        "Closed for today. Existing bookings are kept; no new bookings will be taken.",
      ),
    ];
  const appts = await confirmedToday(c);
  const notices = await cancelAndNotify(c, appts, null);
  return [
    say(
      `Closed for today. Cancelled ${appts.length} appointment(s); ${notices.length} patient(s) notified.`,
    ),
    ...notices,
  ];
}

/** Cancel as the doctor; returns a notice for each patient whose 24 h window is open. */
export async function cancelAndNotify(
  c: BotCtx,
  appts: Appointment[],
  reason: string | null,
): Promise<Send[]> {
  const out: Send[] = [];
  for (const a of appts) {
    await c.store.updateAppointment(a.id, {
      status: "CANCELLED",
      cancelledBy: "doctor",
      cancelReason: reason,
    });
    if (
      await windowOpen(
        c.store,
        c.doctor.businessPhoneNumberId,
        a.patientPhone,
        c.now,
      )
    )
      out.push({
        from: c.doctor.businessPhoneNumberId,
        to: a.patientPhone,
        msg: say(
          `Sorry, ${c.doctor.name} has cancelled your appointment today (${fmtRange(a.startsAt, a.endsAt)}). Reason: ${reason ?? "doctor unavailable"}. Reply /book to pick another time if available.`,
        ),
      });
  }
  return out;
}

async function dcancelList(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const appts = await confirmedToday(c);
  if (!appts.length) {
    await saveState(c.store, conv, "idle");
    return [say("No confirmed appointments today.")];
  }
  await saveState(c.store, conv, "dcancel_pick");
  return [
    {
      kind: "list",
      body: "Which appointment do you want to cancel?",
      button: "Select appointment",
      rows: [
        ...appts.slice(0, 9).map((a) => ({
          id: `dc:${a.id}`,
          title: fmtRange(a.startsAt, a.endsAt),
          description: a.patientName,
        })),
        BACK,
      ],
    },
  ];
}

async function dcancelPick(
  c: BotCtx,
  conv: Conversation,
  id: string,
): Promise<Reply[]> {
  if (!(await confirmedToday(c)).some((a) => a.id === id))
    return dcancelList(c, conv);
  await saveState(c.store, conv, "dcancel_reason", { appointmentId: id });
  return [
    skipPrompt(
      "Any reason to give the patient? (optional — type it, or tap Skip)",
    ),
  ];
}

async function dcancelDone(
  c: BotCtx,
  conv: Conversation,
  reason: string | null,
): Promise<Reply[]> {
  const a = (await confirmedToday(c)).find(
    (x) => x.id === conv.ctx.appointmentId,
  );
  if (!a) return dcancelList(c, conv);
  const notices = await cancelAndNotify(c, [a], reason);
  await saveState(c.store, conv, "idle");
  return [
    say(
      notices.length
        ? "Cancelled and the patient was notified."
        : "Cancelled. The patient couldn't be messaged (24-hour window closed).",
    ),
    ...notices,
  ];
}

const CUSTOM_HINT = 'Type it like "2pm-5pm" or "14:00-17:00".';
const CUSTOM_PROMPT = `What time range? ${CUSTOM_HINT} (Type "back" to go back.)`;

type PendingBlock = { date: string; start: Date; end: Date; whole: boolean };

const nextDates = (c: BotCtx) =>
  Array.from({ length: 7 }, (_, n) => addDays(today(c.now).date, n));

async function blockDates(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  await saveState(c.store, conv, "block_date");
  return [
    {
      kind: "list",
      body: "Which day do you want to block?",
      button: "Choose a date",
      rows: [
        ...nextDates(c).map((d) => ({
          id: `d:${d}`,
          title: fmtDay(atIst(d, "12:00")),
        })),
        BACK,
      ],
    },
  ];
}

async function blockRanges(
  c: BotCtx,
  conv: Conversation,
  date: string,
): Promise<Reply[]> {
  if (!nextDates(c).includes(date)) return blockDates(c, conv);
  await saveState(c.store, conv, "block_range", { date });
  return [
    {
      kind: "list",
      body: `What do you want to block on ${fmtDay(atIst(date, "12:00"))}?`,
      button: "Choose a range",
      rows: [
        { id: "r:whole", title: "Whole day" },
        { id: "r:morning", title: "Morning" },
        { id: "r:afternoon", title: "Afternoon" },
        { id: "r:custom", title: "Particular time" },
        BACK,
      ],
    },
  ];
}

async function blockPreset(
  c: BotCtx,
  conv: Conversation,
  p: "whole" | "morning" | "afternoon",
): Promise<Reply[]> {
  const date = conv.ctx.date as string;
  if (p === "whole")
    return blockCheck(c, conv, {
      date,
      start: atIst(date, "00:00"),
      end: atIst(addDays(date, 1), "00:00"),
      whole: true,
    });
  const range = periodRange(c.doctor, date, p);
  if (!range) {
    await saveState(c.store, conv, "idle");
    return [say(`Your ${p} hours are Off, so there's nothing to block.`)];
  }
  return blockCheck(c, conv, { date, ...range, whole: false });
}

const pendingBlock = (conv: Conversation): PendingBlock => ({
  date: conv.ctx.date as string,
  start: new Date(conv.ctx.start as string),
  end: new Date(conv.ctx.end as string),
  whole: conv.ctx.whole === true,
});

async function blockClashes(
  c: BotCtx,
  b: PendingBlock,
): Promise<Appointment[]> {
  const from = b.whole ? atIst(b.date, "00:00") : b.start;
  const to = b.whole ? atIst(addDays(b.date, 1), "00:00") : b.end;
  const appts = await c.store.appointmentsBetween(
    c.doctor.id,
    atIst(b.date, "00:00"),
    atIst(addDays(b.date, 1), "00:00"),
  );
  return appts.filter(
    (a) => a.status === "CONFIRMED" && a.startsAt < to && a.endsAt > from,
  );
}

async function blockCheck(
  c: BotCtx,
  conv: Conversation,
  b: PendingBlock,
): Promise<Reply[]> {
  const clashes = await blockClashes(c, b);
  if (!clashes.length) return blockApply(c, conv, b, []);
  await saveState(c.store, conv, "block_confirm", {
    date: b.date,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    whole: b.whole,
  });
  return [clashWarning(clashes.length)];
}

async function blockConfirm(
  c: BotCtx,
  conv: Conversation,
  choice: "cn" | "keep",
): Promise<Reply[]> {
  const b = pendingBlock(conv);
  const notices =
    choice === "cn"
      ? await cancelAndNotify(c, await blockClashes(c, b), null)
      : [];
  return blockApply(c, conv, b, notices);
}

async function blockApply(
  c: BotCtx,
  conv: Conversation,
  b: PendingBlock,
  notices: Send[],
): Promise<Reply[]> {
  if (b.whole) await c.store.setClosed(c.doctor.id, b.date, true);
  else await c.store.addBlock(c.doctor.id, b.start, b.end);
  await saveState(c.store, conv, "idle");
  const day = fmtDay(atIst(b.date, "12:00"));
  return [
    say(
      `Blocked ${day} — ${b.whole ? "whole day" : fmtRange(b.start, b.end)}.`,
    ),
    ...notices,
  ];
}

const RX_PROMPT = skipPrompt(
  "Or type the medicine names here, one per line (e.g. Augmentin 625), send a photo of the prescription, or tap Skip.",
);

/** Where the prescription page lives (Vercel sets the production host). */
export const appUrl = () =>
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const rxLink = (c: BotCtx, a: Appointment): Out => ({
  kind: "link",
  body: `Write the prescription for ${a.patientName} (${fmtRange(a.startsAt, a.endsAt)}). Tap the button, fill it in and tap Send.`,
  button: "Write prescription",
  url: `${appUrl()}/rx/${signRxToken(a.id, c.now, process.env.WA_APP_SECRET ?? "")}`,
});

async function ownConfirmed(
  c: BotCtx,
  id: string,
): Promise<Appointment | null> {
  const a = await c.store.getAppointment(id);
  return a && a.doctorId === c.doctor.id && a.status === "CONFIRMED" ? a : null;
}

async function markStart(
  c: BotCtx,
  conv: Conversation,
  id: string,
): Promise<Reply[]> {
  const a = await ownConfirmed(c, id);
  if (!a) return todayList(c, conv);
  await saveState(c.store, conv, "rx_input", {
    appointmentId: id,
    patient: a.patientName,
  });
  return [rxLink(c, a), RX_PROMPT];
}

async function markDone(
  c: BotCtx,
  conv: Conversation,
  rx: { rx: Rx } | { mediaId: string; caption?: string } | null,
): Promise<Reply[]> {
  const a = await ownConfirmed(c, conv.ctx.appointmentId as string);
  if (!a) return todayList(c, conv);
  if (!rx) {
    await c.store.updateAppointment(a.id, { status: "COMPLETED" });
    await saveState(c.store, conv, "idle");
    return [say("Marked complete.")];
  }
  let content: RxContent;
  if ("rx" in rx) content = rx;
  else {
    if (!c.media) throw new Error("media downloader missing");
    content = { photo: await c.media(rx.mediaId), caption: rx.caption || null };
  }
  const toPatient = await completeVisit(c.store, c.doctor, a, content, c.now);
  // only now: if anything above throws, the doctor stays in rx_input and can resend
  await saveState(c.store, conv, "idle");
  return toPatient ? [toPatient, say(SAVED_SENT)] : [say(SAVED_CLOSED)];
}

// ---- clinic hours ----
type HoursKey = Period | "lunch" | "slot";
const HOURS_KEYS: HoursKey[] = [
  "morning",
  "afternoon",
  "evening",
  "lunch",
  "slot",
];
const LABEL: Record<HoursKey, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  lunch: "Lunch break",
  slot: "Time per patient",
};

const hmText = (hm: string) => fmtTime(atIst("2026-01-01", hm));
const rangeText = (r: Range | null, none = "Off") =>
  r ? `${hmText(r.start)}–${hmText(r.end)}` : none;

export function hoursSummary(d: Doctor): string {
  return [
    "Clinic hours",
    ...PERIODS.map((p) => `${LABEL[p]}: ${rangeText(periodHours(d, p))}`),
    `Lunch break: ${rangeText(lunchHours(d), "None")}`,
    `Time per patient: ${d.slotMinutes} min`,
  ].join("\n");
}

async function hoursMenu(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  await saveState(c.store, conv, "idle");
  return [
    say(hoursSummary(c.doctor)),
    {
      kind: "list",
      body: "What do you want to change? Existing bookings are always kept.",
      button: "Change",
      rows: [
        ...HOURS_KEYS.map((k) => ({ id: `h:${k}`, title: LABEL[k] })),
        BACK,
      ],
    },
  ];
}

function hoursQuestion(d: Doctor, k: HoursKey, back: boolean): Out {
  if (k === "slot")
    return {
      kind: "list",
      body: `How long is each appointment? Now: ${d.slotMinutes} min.`,
      button: "Choose length",
      rows: [
        ...[15, 30, 45, 60].map((m) => ({
          id: `s:${m}`,
          title: `${m} minutes`,
        })),
        ...(back ? [BACK] : []),
      ],
    };
  const isLunch = k === "lunch";
  const now = isLunch
    ? rangeText(lunchHours(d), "None")
    : rangeText(periodHours(d, k));
  return {
    kind: "buttons",
    body: `${isLunch ? "Lunch break" : `${LABEL[k]} hours`}? Now: ${now}.\nType new hours like "${isLunch ? "1pm-2pm" : "9am-1pm"}", or tap a button.`,
    buttons: [
      { id: "keep", title: "Keep current" },
      { id: "off", title: isLunch ? "No lunch break" : "Off" },
      ...(back ? [BACK] : []),
    ],
  };
}

/** Back exists everywhere except the first question of first-time setup. */
const hasBack = (k: HoursKey, mode: "setup" | "edit") =>
  mode === "edit" || k !== "morning";

async function askHours(
  c: BotCtx,
  conv: Conversation,
  k: HoursKey,
  mode: "setup" | "edit",
): Promise<Reply[]> {
  await saveState(c.store, conv, `hrs_${k}`, { mode });
  return [hoursQuestion(c.doctor, k, hasBack(k, mode))];
}

async function hoursStep(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const k = conv.state.slice(4) as HoursKey;
  const mode = conv.ctx.mode === "edit" ? "edit" : "setup";
  const i = input(c.msg);
  const again = (why?: string): Reply[] => [
    ...(why ? [say(why)] : []),
    hoursQuestion(c.doctor, k, hasBack(k, mode)),
  ];
  if (i === "back" && hasBack(k, mode)) {
    if (mode === "edit") return hoursMenu(c, conv);
    return askHours(c, conv, HOURS_KEYS[HOURS_KEYS.indexOf(k) - 1], mode);
  }
  let patch: HoursPatch = {};

  if (k === "slot") {
    const m = Number(i?.startsWith("s:") ? i.slice(2) : Number.NaN);
    if (![15, 30, 45, 60].includes(m)) return again();
    patch = { slotMinutes: m };
  } else if (i === "keep") {
    patch = {};
  } else if (i === "off") {
    patch = { [`${k}Start`]: null, [`${k}End`]: null };
  } else {
    const range = c.msg.type === "text" ? parseRange(c.msg.text ?? "") : null;
    if (!range)
      return again(
        `Couldn't read that. Type it like "${k === "lunch" ? "1pm-2pm" : "9am-1pm"}", or tap a button.`,
      );
    if (k === "lunch") {
      const hit = PERIODS.find((p) => {
        const ph = periodHours(c.doctor, p);
        return ph && crosses(range, ph);
      });
      if (hit)
        return again(
          `That lunch break (${rangeText(range)}) runs into your ${hit} hours (${rangeText(periodHours(c.doctor, hit))}). Put it inside one period or between periods.`,
        );
    } else {
      const lunch = lunchHours(c.doctor);
      if (lunch && crosses(lunch, range))
        return again(
          `Your lunch break (${rangeText(lunch)}) would run into these hours. Change the lunch break first, or type different hours.`,
        );
    }
    if (k !== "lunch") {
      const clash = PERIODS.filter((p) => p !== k).find((p) => {
        const other = periodHours(c.doctor, p);
        return other && overlapsAny(range, [other]);
      });
      if (clash)
        return again(
          `That overlaps your ${clash} hours (${rangeText(periodHours(c.doctor, clash))}). Type different hours, or tap a button.`,
        );
    }
    patch = { [`${k}Start`]: range.start, [`${k}End`]: range.end };
  }

  const last = k === "slot";
  if (mode === "setup" && last) patch.hoursSet = true;
  if (Object.keys(patch).length) await c.store.updateDoctor(c.doctor.id, patch);
  const d: Doctor = { ...c.doctor, ...patch };

  if (mode === "edit") {
    await saveState(c.store, conv, "idle");
    return [say(`Saved. Existing bookings are kept.\n\n${hoursSummary(d)}`)];
  }
  if (!last) {
    const next = HOURS_KEYS[HOURS_KEYS.indexOf(k) + 1];
    await saveState(c.store, conv, `hrs_${next}`, { mode });
    return [hoursQuestion(d, next, true)];
  }
  return [
    say(
      'Setup saved. Reply "setup" any time to update your registration number or signature, or "hours" to change your clinic hours.',
    ),
    say(hoursSummary(d)),
    ...(await menu({ ...c, doctor: d }, conv)),
  ];
}

// ---- guided prescription ----
type Field = "when" | "food" | "days";
const FIELDS: Field[] = ["when", "food", "days"];
type Q = { i: number; f: Field };
type RxState = {
  appointmentId: string;
  patient: string;
  meds: Med[];
  advice: string[];
  q?: Q;
  hist: Q[];
};

const rxCtx = (conv: Conversation): RxState => ({
  appointmentId: conv.ctx.appointmentId as string,
  patient: (conv.ctx.patient as string) ?? "",
  meds: (conv.ctx.meds as Med[]) ?? [],
  advice: (conv.ctx.advice as string[]) ?? [],
  q: conv.ctx.q as Q | undefined,
  hist: (conv.ctx.hist as Q[]) ?? [],
});

const missing = (m: Med, f: Field) =>
  f === "when"
    ? !m.dose && !m.sos
    : f === "food"
      ? m.food === null
      : m.duration === null;

function firstMissing(meds: Med[]): Q | null {
  for (let i = 0; i < meds.length; i++)
    for (const f of FIELDS) if (missing(meds[i], f)) return { i, f };
  return null;
}

const WHEN_ROWS = [
  { id: "w:1-0-1", title: "Morning + Night", description: "1-0-1" },
  { id: "w:1-0-0", title: "Morning only", description: "1-0-0" },
  { id: "w:0-0-1", title: "Night only", description: "0-0-1" },
  {
    id: "w:1-1-1",
    title: "All three times",
    description: "Morning + Afternoon + Night · 1-1-1",
  },
  { id: "w:1-1-0", title: "Morning + Afternoon", description: "1-1-0" },
  { id: "w:0-1-1", title: "Afternoon + Night", description: "0-1-1" },
  { id: "w:0-1-0", title: "Afternoon only", description: "0-1-0" },
  { id: "w:sos", title: "Only when needed (SOS)" },
];
const DAY_ROWS = [3, 5, 7, 10, 15].map((n) => ({
  id: `d:${n}`,
  title: `${n} days`,
}));

function rxQuestion(x: RxState, q: Q): Out {
  const head = `💊 ${q.i + 1} of ${x.meds.length} · ${x.meds[q.i].name}`;
  if (q.f === "when")
    return {
      kind: "list",
      body: `${head}\nWhen should it be taken?\n(Different amount? Type it like 2-0-2.)`,
      button: "Choose time",
      rows: [...WHEN_ROWS, BACK],
    };
  if (q.f === "food")
    return {
      kind: "buttons",
      body: `${head}\nBefore or after food?\n(Type "back" to go back.)`,
      buttons: [
        { id: "f:after", title: "After food" },
        { id: "f:before", title: "Before food" },
        { id: "f:any", title: "Any time" },
      ],
    };
  return {
    kind: "list",
    body: `${head}\nFor how many days?\n(Or type a number, like 21.)`,
    button: "Choose days",
    rows: [
      ...DAY_ROWS,
      { id: "d:30", title: "1 month" },
      { id: "d:ongoing", title: "Ongoing" },
      BACK,
    ],
  };
}

const ADVICE_Q: Out = {
  kind: "buttons",
  body: "Any advice for the patient? Type it, or tap No advice.",
  buttons: [{ id: "noadvice", title: "No advice" }, BACK],
};

function rxSummary(patient: string, x: RxState): Out {
  const lines = x.meds.map((m, k) => `${k + 1}. ${medSummary(m)}`);
  const adv = x.advice.length ? `\n\nAdvice: ${x.advice.join(" ")}` : "";
  return {
    kind: "buttons",
    body: `Check the prescription for ${patient}:\n\n${lines.join("\n")}${adv}`,
    buttons: [
      { id: "send", title: "Send to patient" },
      { id: "restart", title: "Start over" },
      BACK,
    ],
  };
}

const saveRx = (c: BotCtx, conv: Conversation, state: string, x: RxState) =>
  saveState(c.store, conv, state, { ...x, q: x.q ?? null });

/** Ask the next unanswered question, or move on to advice. */
async function rxNext(
  c: BotCtx,
  conv: Conversation,
  x: RxState,
): Promise<Reply[]> {
  const q = firstMissing(x.meds);
  if (q) {
    await saveRx(c, conv, "rx_q", { ...x, q });
    return [rxQuestion(x, q)];
  }
  return x.advice.length ? rxConfirm(c, conv, x) : rxAskAdvice(c, conv, x);
}

async function rxAskAdvice(
  c: BotCtx,
  conv: Conversation,
  x: RxState,
): Promise<Reply[]> {
  await saveRx(c, conv, "rx_advice", { ...x, q: undefined });
  return [ADVICE_Q];
}

async function rxConfirm(
  c: BotCtx,
  conv: Conversation,
  x: RxState,
): Promise<Reply[]> {
  await saveRx(c, conv, "rx_confirm", { ...x, q: undefined });
  return [rxSummary(x.patient, x)];
}

async function rxNames(
  c: BotCtx,
  conv: Conversation,
  text: string,
): Promise<Reply[]> {
  const parsed = parseRx(text);
  if (!parsed.meds.length) return [RX_PROMPT];
  return rxNext(c, conv, {
    ...rxCtx(conv),
    meds: parsed.meds,
    advice: parsed.advice,
    hist: [],
  });
}

/** Back: the previous question, or the names prompt when there is none. */
async function rxBack(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const x = rxCtx(conv);
  const prev = x.hist.at(-1);
  if (!prev) {
    await saveState(c.store, conv, "rx_input", {
      appointmentId: x.appointmentId,
      patient: x.patient,
    });
    return [RX_PROMPT];
  }
  const y = { ...x, q: prev, hist: x.hist.slice(0, -1) };
  await saveRx(c, conv, "rx_q", y);
  return [rxQuestion(y, prev)];
}

async function rxAnswer(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const x = rxCtx(conv);
  const q = x.q;
  if (!q || !x.meds[q.i]) return rxNext(c, conv, x);
  const i = input(c.msg);
  if (i === "back") return rxBack(c, conv);
  const med = { ...x.meds[q.i] };
  const typed = c.msg.type === "text" ? (c.msg.text ?? "") : "";

  if (q.f === "when") {
    if (i === "w:sos") {
      med.sos = true;
      med.dose = null;
    } else {
      const dose = i?.startsWith("w:")
        ? parseRx(`x ${i.slice(2)}`).meds[0]?.dose
        : parseRx(`x ${typed}`).meds[0]?.dose;
      if (!dose) return [rxQuestion(x, q)];
      med.dose = dose;
      delete med.sos;
    }
  } else if (q.f === "food") {
    const f =
      i === "f:after" || /after/i.test(typed)
        ? "after"
        : i === "f:before" || /before/i.test(typed)
          ? "before"
          : i === "f:any" || /any/i.test(typed)
            ? "any"
            : null;
    if (!f) return [rxQuestion(x, q)];
    med.food = f;
  } else {
    let d: string | null = null;
    if (i === "d:ongoing") d = "Ongoing";
    else if (i === "d:30") d = "1 month";
    else if (i?.startsWith("d:")) d = `${Number(i.slice(2))} days`;
    else if (/^\s*\d+\s*$/.test(typed))
      d = `${Number(typed)} ${Number(typed) === 1 ? "day" : "days"}`;
    else d = parseRx(`x ${typed}`).meds[0]?.duration ?? null;
    if (!d) return [rxQuestion(x, q)];
    med.duration = d;
  }
  const meds = x.meds.map((m, k) => (k === q.i ? med : m));
  return rxNext(c, conv, { ...x, meds, hist: [...x.hist, q], q: undefined });
}
