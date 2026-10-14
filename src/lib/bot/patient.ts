import type { Conversation } from "../db/types";
import { fmtRange } from "../time";
import type { Out, Send } from "../wa/types";
import { type BotCtx, input, saveState, say, today } from "./ctx";

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
    default:
      return prompt(c, conv);
  }
}

/** Re-send the current step's prompt. */
async function prompt(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  switch (conv.state) {
    case "book_name":
      return [namePrompt(conv.ctx.lastName as string | undefined)];
    default:
      return menu(c, conv);
  }
}

async function menu(c: BotCtx, conv: Conversation): Promise<Reply[]> {
  const { store, doctor, msg, now } = c;
  const t = today(now);
  const all = await store.patientAppointments(doctor.id, msg.from);
  const todays = all.filter((a) => a.startsAt >= t.from && a.startsAt < t.to);
  const rows = [{ id: "book", title: "Book" }];
  if (todays.length) rows.push({ id: "mine", title: "My Appointments" });
  if (todays.some((a) => a.status === "CONFIRMED"))
    rows.push({ id: "cancel", title: "Cancel" });
  if (all.some((a) => a.prescriptionPdfPath))
    rows.push({ id: "rx", title: "My Prescriptions" });
  rows.push({ id: "chat", title: "Normal chat" });
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
  const past = await c.store.patientAppointments(c.doctor.id, c.msg.from);
  const lastName = past[0]?.patientName;
  await saveState(c.store, conv, "book_name", lastName ? { lastName } : {});
  return [namePrompt(lastName)];
}
