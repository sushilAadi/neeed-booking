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
  periodOf,
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
  if (i?.startsWith("tg:")) {
    const [, g, page] = i.split(":");
    return todayGroup(c, conv, g as Group, Number(page) || 0);
  }

  switch (conv.state) {
    case "today_group":
      // one part of the day skips the picker, so Back goes to the menu
      if (i === "back")
        return conv.ctx.single ? menu(c, conv) : todayList(c, conv);
      return todayGroup(c, conv, conv.ctx.group as Group, 0);
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
      if (c.msg.type === "image" && c.msg.mediaId)
        return markDone(c, conv, {
          mediaId: c.msg.mediaId,
          caption: c.msg.caption?.trim(),
        });
      if (c.msg.type === "text" && c.msg.text?.trim())
        return rxTyped(c, conv, c.msg.text);
      return prompt(c, conv);
    case "rx_confirm":
      if (i === "back" || i === "restart") {
        await saveState(c.store, conv, "rx_input", {
          appointmentId: conv.ctx.appointmentId,
          patient: conv.ctx.patient,
        });
        return [rxPrompt()];
      }
      if (c.msg.type === "text" && c.msg.text?.trim() && i !== "send")
        return rxTyped(c, conv, c.msg.text); // corrected list replaces the old one
      if (i === "send" && rxReady(rxCtx(conv))) {
        const x = rxCtx(conv);
        return markDone(c, conv, { rx: { meds: x.meds, advice: x.advice } });
      }
      return [rxSummary(rxCtx(conv))];
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
        // WhatsApp limits: title 24 chars, description 72 chars.
        {
          id: "today",
          title: "Today's patients",
          description:
            "See today's bookings, mark a visit complete, send prescription",
        },
        closed
          ? {
              id: "open",
              title: "Open today",
              description: "Start taking bookings for today again",
            }
          : {
              id: "close",
              title: "Close today",
              description: "Stop new bookings for today (holiday, emergency)",
            },
        {
          id: "block",
          title: "Block my time",
          description: "Stop bookings for some hours or a whole day",
        },
        {
          id: "dcancel",
          title: "Cancel appointment",
          description: "Cancel one patient's booking and tell them",
        },
        {
          id: "hours",
          title: "Clinic hours",
          description: "Change opening hours, lunch break, time per patient",
        },
        {
          id: "setup",
          title: "Prescription setup",
          description: "Update registration number or signature",
        },
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

// ---- Today's patients: summary → part of the day → patients (paged) ----
type Group = Period | "other";
const GROUP_TITLE: Record<Group, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  other: "Other times", // booked before clinic hours changed
};
const PAGE = 8; // WhatsApp lists hold 10 rows: 8 patients + More + Back

/** Still-to-see patients grouped by part of the day, in time order. */
function waitingByGroup(c: BotCtx, all: Appointment[]) {
  const by = new Map<Group, Appointment[]>();
  for (const a of all) {
    if (a.status !== "CONFIRMED") continue;
    const g: Group =
      periodOf(c.doctor, { start: a.startsAt, end: a.endsAt }) ?? "other";
    by.set(g, [...(by.get(g) ?? []), a]);
  }
  return ([...PERIODS, "other"] as Group[])
    .filter((g) => by.has(g))
    .map((g) => ({ g, list: by.get(g) as Appointment[] }));
}

function todayCounts(all: Appointment[]): string {
  const n = (st: string) => all.filter((a) => a.status === st).length;
  return [
    `⏳ ${n("CONFIRMED")} waiting`,
    `✅ ${n("COMPLETED")} done`,
    n("CANCELLED") ? `❌ ${n("CANCELLED")} cancelled` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function todayList(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const all = await todays(c);
  await saveState(c.store, conv, "idle");
  if (!all.length) return [say("No appointments today.")];
  const groups = waitingByGroup(c, all);
  const head = `*Today's patients*\n${todayCounts(all)}`;
  if (!groups.length) return [say(`${head}\n\nNo one is waiting. 🎉`)];
  if (groups.length === 1) return todayGroup(c, conv, groups[0].g, 0);
  return [
    {
      kind: "list",
      body: `${head}\n\nPick a part of the day to see who's waiting.`,
      button: "Choose",
      rows: [
        ...groups.map(({ g, list }) => ({
          id: `tg:${g}:0`,
          title: `${GROUP_TITLE[g]} (${list.length})`,
          description: `${list.length} waiting · ${fmtRange(list[0].startsAt, (list.at(-1) as Appointment).endsAt)}`,
        })),
        BACK,
      ],
    },
  ];
}

async function todayGroup(
  c: BotCtx,
  conv: Conversation,
  g: Group,
  page: number,
): Promise<Reply[]> {
  const all = await todays(c);
  const groups = waitingByGroup(c, all);
  const list = groups.find((x) => x.g === g)?.list ?? [];
  if (!list.length) return todayList(c, conv);
  const pages = Math.ceil(list.length / PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const shown = list.slice(p * PAGE, p * PAGE + PAGE);
  await saveState(c.store, conv, "today_group", {
    group: g,
    single: groups.length === 1,
  });
  const range =
    pages > 1
      ? ` (${p * PAGE + 1}–${p * PAGE + shown.length} of ${list.length})`
      : "";
  const next = p + 1 < pages ? p + 1 : 0; // the last page wraps to the first
  return [
    {
      kind: "list",
      body: `*${GROUP_TITLE[g]}* · ${list.length} waiting${range}\n\nTap a patient when their visit is done to mark it complete and write the prescription.`,
      button: "Choose patient",
      rows: [
        ...shown.map((a) => ({
          id: `done:${a.id}`,
          title: a.patientName,
          description: `${fmtRange(a.startsAt, a.endsAt)} · +${a.patientPhone}`,
        })),
        ...(pages > 1
          ? [
              {
                id: `tg:${g}:${next}`,
                title: next ? "More patients" : "Back to first",
                description: next
                  ? `Show ${next * PAGE + 1}–${Math.min((next + 1) * PAGE, list.length)} of ${list.length}`
                  : `Show 1–${PAGE} of ${list.length}`,
              },
            ]
          : []),
        BACK,
      ],
    },
  ];
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
        {
          id: "r:whole",
          title: "Whole day",
          description: "No bookings at all that day",
        },
        {
          id: "r:morning",
          title: "Morning",
          description: "Block your morning clinic hours",
        },
        {
          id: "r:afternoon",
          title: "Afternoon",
          description: "Block your afternoon clinic hours",
        },
        {
          id: "r:custom",
          title: "Particular time",
          description: "You type the start and end time",
        },
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

// The table and its key are in the picture (src/app/rx-guide.png) — no text alignment to break.
const RX_EXAMPLE = "Augmentin 625 1-0-1 AF 5d";
const RX_TEXT = [
  "*Or type it here* — one medicine per line, like the picture.",
  "Example:",
  RX_EXAMPLE,
  "",
  "_You can also send a photo, or tap Skip._",
];
const rxPrompt = (): Out => ({
  kind: "buttons",
  image: `${appUrl()}/rx-guide.png`,
  body: RX_TEXT.join("\n"),
  buttons: [{ id: "skip", title: "Skip" }, BACK],
});
const RX_FIX =
  "✏️ _Mistake? Send the corrected list again: long-press your message → Copy → fix it → send._";

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
  return [rxLink(c, a), rxPrompt()];
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

// ---- typed prescription: one message → check screen → Send ----
type RxState = {
  appointmentId: string;
  patient: string;
  meds: Med[];
  advice: string[];
};

const rxCtx = (conv: Conversation): RxState => ({
  appointmentId: conv.ctx.appointmentId as string,
  patient: (conv.ctx.patient as string) ?? "",
  meds: (conv.ctx.meds as Med[]) ?? [],
  advice: (conv.ctx.advice as string[]) ?? [],
});

const hasTime = (m: Med) => !!m.dose || !!m.sos;
/** A medicine with no time can't go to a patient; missing food or days is only a warning. */
const rxReady = (x: RxState) => x.meds.every(hasTime);

function missing(m: Med): string {
  const gaps = [
    !hasTime(m) && "time",
    m.food === null && "food",
    m.duration === null && "days",
  ].filter(Boolean);
  return gaps.length ? `\n   ⚠️ _No ${gaps.join(", ")} found_` : "";
}

/** Spelled out in words, so a misread line is caught before it reaches the patient. */
function rxSummary(x: RxState): Out {
  // WhatsApp *bold* on each medicine name (medSummary starts with the name).
  const lines = x.meds.map(
    (m, k) =>
      `${k + 1}. *${m.name}*${medSummary(m).slice(m.name.length)}${missing(m)}`,
  );
  const adv = x.advice.length ? `\n\n*Advice:* ${x.advice.join(" ")}` : "";
  const head = `*Check the prescription for ${x.patient}:*\n\n${lines.join("\n")}${adv}`;
  if (!rxReady(x))
    return {
      kind: "buttons",
      body: `${head}\n\n❌ *Every medicine needs a time* like 1-0-1.\n${RX_FIX}`,
      buttons: [BACK],
    };
  return {
    kind: "buttons",
    body: `${head}\n\n${RX_FIX}`,
    buttons: [{ id: "send", title: "Send to patient" }, BACK],
  };
}

async function rxTyped(
  c: BotCtx,
  conv: Conversation,
  text: string,
): Promise<Reply[]> {
  // Long-press copy takes the whole prompt; drop its instruction lines, keep the example rows.
  const skip = new Set(
    RX_TEXT.filter((l) => l !== RX_EXAMPLE).map((l) => l.trim()),
  );
  const parsed = parseRx(
    text
      .split("\n")
      .filter((l) => !skip.has(l.trim()))
      .join("\n"),
  );
  if (!parsed.meds.length) return [rxPrompt()];
  const x = { ...rxCtx(conv), meds: parsed.meds, advice: parsed.advice };
  await saveState(c.store, conv, "rx_confirm", x);
  return [rxSummary(x)];
}
