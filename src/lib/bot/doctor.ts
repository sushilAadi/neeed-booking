import type { Appointment, Conversation } from "../db/types";
import { fmtRange } from "../time";
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
  if (i === "setup") return startSetup(c, conv);
  if (!setupDone) {
    await saveState(c.store, conv, "setup_reg");
    return [
      say("Your prescription setup isn't done yet — let's finish that first."),
      say(REG_PROMPT),
    ];
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
  await saveState(c.store, conv, "close_confirm");
  return [clashWarning(appts.length)];
}

async function closeConfirm(
  c: BotCtx,
  conv: Conversation,
  choice: "cn" | "keep",
): Promise<Reply[]> {
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
      rows: appts
        .slice(0, 10)
        .map((a) => ({
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
