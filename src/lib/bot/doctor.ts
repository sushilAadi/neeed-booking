import type {
  Appointment,
  Conversation,
  Doctor,
  HoursPatch,
} from "../db/types";
import { renderPrescription, rxNo } from "../rx/pdf";
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
import { type BotCtx, input, platformId, saveState, say, today } from "./ctx";

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
      if (i === "cn" || i === "keep") return closeConfirm(c, conv, i);
      return prompt(c, conv);
    case "dcancel_pick":
      if (i?.startsWith("dc:")) return dcancelPick(c, conv, i.slice(3));
      return prompt(c, conv);
    case "dcancel_reason":
      if (i === "skip") return dcancelDone(c, conv, null);
      if (c.msg.type === "text" && clean(c.msg.text))
        return dcancelDone(c, conv, clean(c.msg.text));
      return prompt(c, conv);
    case "rx_input":
      if (i === "skip") return markDone(c, conv, null);
      if (c.msg.type === "text" && c.msg.text?.trim())
        return markDone(c, conv, { text: c.msg.text.trim() });
      if (c.msg.type === "image" && c.msg.mediaId)
        return markDone(c, conv, {
          mediaId: c.msg.mediaId,
          caption: c.msg.caption?.trim(),
        });
      return prompt(c, conv);
    case "block_date":
      if (i?.startsWith("d:")) return blockRanges(c, conv, i.slice(2));
      return prompt(c, conv);
    case "block_range":
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
  buttons: [{ id: "skip", title: "Skip" }],
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
      rows: open.map((a) => ({
        id: `done:${a.id}`,
        title: a.patientName,
        description: fmtRange(a.startsAt, a.endsAt),
      })),
    });
  return out;
}

const clashWarning = (n: number): Out => ({
  kind: "buttons",
  body: `You have ${n} confirmed appointment(s) today. What should happen to them?`,
  buttons: [
    { id: "cn", title: "Cancel & notify" },
    { id: "keep", title: "Keep bookings" },
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
      rows: appts.slice(0, 10).map((a) => ({
        id: `dc:${a.id}`,
        title: fmtRange(a.startsAt, a.endsAt),
        description: a.patientName,
      })),
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
const CUSTOM_PROMPT = `What time range? ${CUSTOM_HINT}`;

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
      rows: nextDates(c).map((d) => ({
        id: `d:${d}`,
        title: fmtDay(atIst(d, "12:00")),
      })),
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
  "Marking that visit complete. Type the prescription/notes, send a photo of it (caption optional), or tap Skip to finish with no prescription attached.",
);

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
  if (!(await ownConfirmed(c, id))) return todayList(c, conv);
  await saveState(c.store, conv, "rx_input", { appointmentId: id });
  return [RX_PROMPT];
}

async function markDone(
  c: BotCtx,
  conv: Conversation,
  rx: { text: string } | { mediaId: string; caption?: string } | null,
): Promise<Reply[]> {
  const a = await ownConfirmed(c, conv.ctx.appointmentId as string);
  if (!a) return todayList(c, conv);
  if (!rx) {
    await c.store.updateAppointment(a.id, { status: "COMPLETED" });
    await saveState(c.store, conv, "idle");
    return [say("Marked complete.")];
  }

  const visit = `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`;
  let prescriptionText: string | null = null;
  let prescriptionImagePath: string | null = null;
  let photo: { bytes: Uint8Array; mime: string } | undefined;
  if ("text" in rx) prescriptionText = rx.text;
  else {
    if (!c.media) throw new Error("media downloader missing");
    photo = await c.media(rx.mediaId);
    const png = photo.mime === "image/png";
    prescriptionImagePath = `${a.id}.${png ? "png" : "jpg"}`;
    await c.store.putFile(
      "prescriptions",
      prescriptionImagePath,
      photo.bytes,
      png ? "image/png" : "image/jpeg",
    );
    prescriptionText = rx.caption || null;
  }

  const sigPath = c.doctor.signaturePath as string;
  const pdf = await renderPrescription({
    clinic: c.doctor.clinicName,
    doctorName: c.doctor.name,
    regNo: c.doctor.registrationNumber ?? "",
    rxNo: rxNo(a.id),
    patientName: a.patientName,
    patientPhone: a.patientPhone,
    visit,
    lines: (prescriptionText ?? "").split("\n").filter((l) => l.trim()),
    photo,
    signature: {
      bytes: await c.store.getFile("signatures", sigPath),
      mime: sigPath.endsWith(".png") ? "image/png" : "image/jpeg",
    },
  });
  const prescriptionPdfPath = `${a.id}.pdf`;
  await c.store.putFile(
    "prescriptions",
    prescriptionPdfPath,
    pdf,
    "application/pdf",
  );
  await c.store.updateAppointment(a.id, {
    status: "COMPLETED",
    prescriptionText,
    prescriptionImagePath,
    prescriptionPdfPath,
  });
  // only now: if anything above throws, the doctor stays in rx_input and can resend
  await saveState(c.store, conv, "idle");

  if (
    !(await windowOpen(
      c.store,
      c.doctor.businessPhoneNumberId,
      a.patientPhone,
      c.now,
    ))
  )
    return [
      say(
        "Saved. The patient's 24-hour window has closed, so they'll get it from \"My Prescriptions\" next time they message.",
      ),
    ];
  return [
    {
      from: c.doctor.businessPhoneNumberId,
      to: a.patientPhone,
      msg: {
        kind: "document",
        link: await c.store.signedUrl("prescriptions", prescriptionPdfPath),
        filename: `Prescription-${rxNo(a.id)}.pdf`,
        caption: `Prescription from your visit on ${visit} with ${c.doctor.name}.`,
      },
    },
    say("Saved and sent to the patient."),
  ];
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
      rows: HOURS_KEYS.map((k) => ({ id: `h:${k}`, title: LABEL[k] })),
    },
  ];
}

function hoursQuestion(d: Doctor, k: HoursKey): Out {
  if (k === "slot")
    return {
      kind: "list",
      body: `How long is each appointment? Now: ${d.slotMinutes} min.`,
      button: "Choose length",
      rows: [15, 30, 45, 60].map((m) => ({
        id: `s:${m}`,
        title: `${m} minutes`,
      })),
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
    ],
  };
}

async function askHours(
  c: BotCtx,
  conv: Conversation,
  k: HoursKey,
  mode: "setup" | "edit",
): Promise<Reply[]> {
  await saveState(c.store, conv, `hrs_${k}`, { mode });
  return [hoursQuestion(c.doctor, k)];
}

async function hoursStep(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const k = conv.state.slice(4) as HoursKey;
  const mode = conv.ctx.mode === "edit" ? "edit" : "setup";
  const i = input(c.msg);
  const again = (why?: string): Reply[] => [
    ...(why ? [say(why)] : []),
    hoursQuestion(c.doctor, k),
  ];
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
    return [hoursQuestion(d, next)];
  }
  return [
    say(
      'Setup saved. Reply "setup" any time to update your registration number or signature, or "hours" to change your clinic hours.',
    ),
    say(hoursSummary(d)),
    ...(await menu({ ...c, doctor: d }, conv)),
  ];
}
