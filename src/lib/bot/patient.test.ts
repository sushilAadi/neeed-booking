import { expect, test } from "vitest";
import { createMemoryStore } from "../db/memory-store";
import { atIst } from "../time";
import { handlePatient } from "./patient";
import {
  bodies,
  DOC,
  ids,
  NOW,
  reply,
  sticker,
  text,
  titles,
} from "./test-kit";

const P = "919111111111";
const LANG_IDS = ["lang:en", "lang:hi", "lang:as"];
const PERIODS_Q =
  'Which part of today works for you?\n\nType "back" to change the name.';
const raw = (
  s: ReturnType<typeof createMemoryStore>,
  msg: Parameters<typeof handlePatient>[0]["msg"],
  now = NOW,
  doctor = DOC,
) => handlePatient({ store: s, doctor, msg, now });
/**
 * Like production (inbound time recorded after each message), for a patient who
 * already picked English in this conversation. The language tests use `raw`.
 */
const run = async (
  s: ReturnType<typeof createMemoryStore>,
  msg: Parameters<typeof handlePatient>[0]["msg"],
  now = NOW,
  doctor = DOC,
) => {
  const conv = await s.getConversation("DOCPN", msg.from);
  if (!conv.ctx.lang && conv.state !== "chat")
    await s.saveConversation({ ...conv, ctx: { ...conv.ctx, lang: "en" } });
  if (!conv.lastInboundAt)
    await s.touchInbound("DOCPN", msg.from, new Date(+now - 60_000));
  const out = await raw(s, msg, now, doctor);
  await s.touchInbound("DOCPN", msg.from, now);
  return out;
};

test("first hi shows only Book, Normal chat and Change language", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [m] = await run(s, text(P, "hi"));
  expect(m.msg.kind).toBe("list");
  expect(m).toMatchObject({ from: "DOCPN", to: P });
  expect(bodies([m])[0]).toBe(
    "👋 Welcome to Sunrise Family Clinic. What would you like to do?",
  );
  expect(ids(m)).toEqual(["book", "chat", "language"]);
});

test("menu shows mine + cancel when the patient has a confirmed appointment today", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: P,
    patientName: "Raj",
    startsAt: atIst("2026-07-30", "14:30"),
    endsAt: atIst("2026-07-30", "15:00"),
    notes: null,
  });
  const [m] = await run(s, text(P, "hello"));
  expect(ids(m)).toEqual(["book", "mine", "cancel", "chat", "language"]);
});

test("Normal chat goes silent; a keyword wakes it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, reply(P, "chat")))).toEqual([
    "Okay, the bot will stay quiet. Chat as usual. Type /book any time to book an appointment.",
  ]);
  await s.touchInbound("DOCPN", P, NOW);
  expect(await run(s, text(P, "how are you"))).toEqual([]);
  // Normal chat ended the conversation: the keyword asks the language, then books
  expect(ids((await run(s, text(P, "/book")))[0])).toEqual(LANG_IDS);
  expect(bodies(await run(s, reply(P, "lang:en")))).toEqual([
    "Sure! What's the patient's full name?",
  ]);
});

test("chat mode asks the language again after a 24h gap, then shows the menu", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "chat"));
  await s.touchInbound("DOCPN", P, new Date(+NOW - 25 * 3600_000));
  expect(ids((await run(s, text(P, "hello")))[0])).toEqual(LANG_IDS);
  const [m] = await run(s, reply(P, "lang:en"));
  expect(m.msg.kind).toBe("list");
});

test("My Appointments lists today", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: P,
    patientName: "Raj",
    startsAt: atIst("2026-07-30", "14:30"),
    endsAt: atIst("2026-07-30", "15:00"),
    notes: null,
  });
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: P,
    patientName: "Old",
    startsAt: atIst("2026-07-29", "14:30"),
    endsAt: atIst("2026-07-29", "15:00"),
    notes: null,
  });
  expect(bodies(await run(s, reply(P, "mine")))).toEqual([
    "Today:\n📅 2:30 PM–3:00 PM — Raj (Confirmed)",
  ]);
});

test("My Appointments with none today", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, reply(P, "mine")))).toEqual([
    "No appointments today.",
  ]);
});

test("sticker mid-flow re-sends the current prompt", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const first = await run(s, reply(P, "book"));
  expect(bodies(first)).toEqual(["Sure! What's the patient's full name?"]);
  expect(await run(s, sticker(P))).toEqual(first);
});

test("today is IST: a message at 00:30 IST sees that day's appointments", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: P,
    patientName: "Raj",
    startsAt: atIst("2026-07-30", "14:30"),
    endsAt: atIst("2026-07-30", "15:00"),
    notes: null,
  });
  expect(
    bodies(await run(s, reply(P, "mine"), atIst("2026-07-30", "00:30")))[0],
  ).toContain("Raj");
});

// ---- Task 6: booking, cancel, prescriptions ----
const at = (hm: string) => atIst("2026-07-30", hm);
const toTimes = async (
  s: ReturnType<typeof createMemoryStore>,
  period = "afternoon",
  doctor = DOC,
) => {
  const h = (msg: Parameters<typeof handlePatient>[0]["msg"], now = NOW) =>
    run(s, msg, now, doctor);
  await h(reply(P, "book"));
  await h(text(P, "Raj"));
  return h(reply(P, `p:${period}`));
};

test("full booking: name → period → time → skip → confirmed + doctor alert", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  const periods = await run(s, text(P, "Raj"));
  expect(bodies(periods)).toEqual([PERIODS_Q]);
  expect(titles(periods[0])).toEqual([
    "Morning (8)",
    "Afternoon (8)",
    "Evening (8)",
  ]);
  const times = await run(s, reply(P, "p:afternoon"));
  expect(times[0].msg).toMatchObject({ kind: "list", button: "Choose a time" });
  expect(titles(times[0])[0]).toBe("2:00 PM–2:30 PM");
  expect(ids(times[0])).toHaveLength(9); // 8 slots + Back
  expect(
    bodies(await run(s, reply(P, `t:${at("14:30").toISOString()}`))),
  ).toEqual([
    "Got it. Any specific concern or reason for the visit? (optional — type it, or tap Skip)",
  ]);
  const done = await run(s, reply(P, "skip"));
  expect(done[0]).toMatchObject({ from: "DOCPN", to: P });
  expect(bodies(done)[0]).toBe(
    'You\'re confirmed with Dr. Mehta at Sunrise Family Clinic.\n\n📅 Thu, Jul 30, 2:30 PM–3:00 PM\n\nReply "cancel" any time to cancel this appointment.',
  );
  expect(done[1]).toMatchObject({ from: "PLATFORM", to: DOC.personalPhone });
  expect(bodies(done)[1]).toBe(
    "New appointment booked ✅\n\nPatient: Raj\nPhone: +919111111111\n📅 Thu, Jul 30, 2:30 PM–3:00 PM\nReason: —",
  );
  expect(s.appointments).toHaveLength(1);
  expect(s.appointments[0]).toMatchObject({
    status: "CONFIRMED",
    patientName: "Raj",
    notes: null,
  });
});

test("typed reason keeps its case", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  const done = await run(s, text(P, "  Fever since Monday "));
  expect(s.appointments[0].notes).toBe("Fever since Monday");
  expect(bodies(done)[1]).toContain("Reason: Fever since Monday");
});

test("closed today → the closed message, no name prompt", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.setClosed(DOC.id, "2026-07-30", true);
  expect(bodies(await run(s, reply(P, "book")))).toEqual([
    "Sorry, Dr. Mehta isn't taking bookings today. Please try again tomorrow.",
  ]);
});

test("not a working day → the closed message", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const off = { ...DOC, workingDays: [1] };
  const r = await run(s, reply(P, "book"), NOW, off);
  expect(bodies(r)[0]).toContain("isn't taking bookings today");
});

test("returning patient gets a 'Yes, Raj' button and reply yesname uses it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: P,
    patientName: "Raj Kumar",
    startsAt: atIst("2026-07-20", "14:30"),
    endsAt: atIst("2026-07-20", "15:00"),
    notes: null,
  });
  const [m] = await run(s, reply(P, "book"));
  expect(ids(m)).toEqual(["yesname"]);
  expect(titles(m)).toEqual(["Yes, Raj Kumar"]);
  expect(bodies(await run(s, reply(P, "yesname")))).toEqual([PERIODS_Q]);
  await run(s, reply(P, "p:evening"));
  await run(s, reply(P, `t:${at("18:00").toISOString()}`));
  await run(s, reply(P, "skip"));
  expect(
    s.appointments.find((a) => a.status === "CONFIRMED")?.patientName,
  ).toBe("Raj Kumar");
});

test("period buttons hide empty periods and show counts", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.addBlock(DOC.id, at("10:00"), at("14:00"));
  await run(s, reply(P, "book"));
  expect(titles((await run(s, text(P, "Raj")))[0])).toEqual([
    "Afternoon (8)",
    "Evening (8)",
    "◀ Back",
  ]);
});

test("no slots left today", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  expect(bodies(await run(s, text(P, "Raj"), at("21:45")))).toEqual([
    "Sorry, no slots are left today.",
  ]);
});

test("more than 9 free slots in a period → 8 rows + Later times + Back; more → the next page", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const D15 = { ...DOC, slotMinutes: 15 };
  const [list] = await toTimes(s, "morning", D15);
  expect(ids(list)).toHaveLength(10);
  expect(ids(list).slice(8)).toEqual(["more", "back"]);
  expect(titles(list)[8]).toBe("Later times");
  const [next] = await run(s, reply(P, "more"), NOW, D15);
  expect(ids(next)).toHaveLength(9);
  expect(titles(next)[0]).toBe("12:00 PM–12:15 PM");
  expect(ids(next)[8]).toBe("back");
});

test("stale slot tap: slot booked by someone else meanwhile → 'just taken' + period buttons again", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919222",
    patientName: "X",
    startsAt: at("14:30"),
    endsAt: at("15:00"),
    notes: null,
  });
  const r = await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  expect(bodies(r)).toEqual([
    "Sorry, that time was just taken. Please pick another.",
    PERIODS_Q,
  ]);
  expect(titles(r[1])).toEqual(["Morning (8)", "Afternoon (7)", "Evening (8)"]);
});

test("race: slot taken between the reason prompt and the insert → 'just taken'", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919222",
    patientName: "X",
    startsAt: at("14:30"),
    endsAt: at("15:00"),
    notes: null,
  });
  const r = await run(s, reply(P, "skip"));
  expect(bodies(r)[0]).toBe(
    "Sorry, that time was just taken. Please pick another.",
  );
  expect(s.appointments.filter((a) => a.patientPhone === P)).toHaveLength(0);
});

test("stale slot tap: a slot id that's now in the past → the period buttons again, no booking", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s, "morning");
  const r = await run(
    s,
    reply(P, `t:${at("10:00").toISOString()}`),
    at("10:15"),
  );
  expect(bodies(r)).toEqual([PERIODS_Q]);
  expect(s.appointments).toHaveLength(0);
});

test("garbage slot id re-shows the periods", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  expect(bodies(await run(s, reply(P, "t:not-a-date")))).toEqual([PERIODS_Q]);
});

const seedToday = (s: ReturnType<typeof createMemoryStore>, phone = P) =>
  s.createAppointment({
    doctorId: DOC.id,
    patientPhone: phone,
    patientName: "Raj",
    startsAt: at("14:30"),
    endsAt: at("15:00"),
    notes: null,
  });

test("cancel: pick → reason → cancelled; status CANCELLED, cancelledBy patient; alert to the doctor", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = (await seedToday(s)) as { id: string };
  const [list] = await run(s, text(P, "Cancel"));
  expect(list.msg).toMatchObject({
    kind: "list",
    button: "Select appointment",
  });
  expect(ids(list)).toEqual([`c:${a.id}`, "back"]);
  expect(titles(list)).toEqual(["2:30 PM–3:00 PM", "◀ Back"]);
  expect(bodies(await run(s, reply(P, `c:${a.id}`)))).toEqual([
    "Got it. Any reason for cancelling? (optional — type it, or tap Skip)",
  ]);
  const r = await run(s, text(P, "Feeling better"));
  expect(bodies(r)[0]).toBe("Your appointment has been cancelled.");
  expect(ids(r[0])).toEqual(["book", "menu"]);
  expect(r[1]).toMatchObject({ from: "PLATFORM", to: DOC.personalPhone });
  expect(bodies(r)[1]).toBe(
    "Appointment cancelled by patient ❌\n\nPatient: Raj\nPhone: +919111111111\n📅 Thu, Jul 30, 2:30 PM–3:00 PM\nReason: Feeling better",
  );
  expect(s.appointments[0]).toMatchObject({
    status: "CANCELLED",
    cancelledBy: "patient",
    cancelReason: "Feeling better",
  });
});

test("cancel with an id from another patient's appointment is ignored and the list re-shown", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const mineA = (await seedToday(s)) as { id: string };
  const other = (await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919333",
    patientName: "Z",
    startsAt: at("16:00"),
    endsAt: at("16:30"),
    notes: null,
  })) as { id: string };
  await run(s, reply(P, "cancel"));
  const r = await run(s, reply(P, `c:${other.id}`));
  expect(ids(r[0])).toEqual([`c:${mineA.id}`, "back"]);
  expect(s.appointments.find((x) => x.id === other.id)?.status).toBe(
    "CONFIRMED",
  );
});

test("cancel with nothing to cancel", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, text(P, "cancel")))).toEqual([
    "You have no confirmed appointments today.",
  ]);
});

test("My Prescriptions sends the document with the signed link", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = (await seedToday(s)) as { id: string };
  await s.updateAppointment(a.id, {
    status: "COMPLETED",
    prescriptionPdfPath: `${a.id}.pdf`,
  });
  const [list] = await run(s, reply(P, "rx"));
  expect(ids(list)).toEqual([`rx:${a.id}`, "back"]);
  expect(titles(list)).toEqual(["Thu, Jul 30", "◀ Back"]);
  const [d] = await run(s, reply(P, `rx:${a.id}`));
  expect(d.msg).toEqual({
    kind: "document",
    link: `mem://prescriptions/${a.id}.pdf`,
    filename: `Prescription-RX-${a.id.slice(0, 8).toUpperCase()}.pdf`,
    caption:
      "Prescription from your visit on Thu, Jul 30, 2:30 PM–3:00 PM with Dr. Mehta.",
  });
});

test("rx id of another patient sends nothing but the menu", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = (await seedToday(s, "919333")) as { id: string };
  await s.updateAppointment(a.id, { prescriptionPdfPath: "x.pdf" });
  const r = await run(s, reply(P, `rx:${a.id}`));
  expect(r[0].msg.kind).toBe("list");
  expect(ids(r[0])).not.toContain(`rx:${a.id}`);
});

// ---- review fixes ----
test("doctor closes today while a patient is mid-booking → no booking", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  await s.setClosed(DOC.id, "2026-07-30", true);
  const r = await run(s, reply(P, "skip"));
  expect(s.appointments).toHaveLength(0);
  expect(bodies(r)).not.toContain(expect.stringContaining("You're confirmed"));
});
test("closed mid-booking: a period tap shows no slots", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  await run(s, text(P, "Raj"));
  await s.setClosed(DOC.id, "2026-07-30", true);
  expect(bodies(await run(s, reply(P, "p:afternoon")))).toEqual([
    "Sorry, no slots are left today.",
  ]);
});

// ---- back ----
test("time list → Back → period choice", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [list] = await toTimes(s);
  expect(ids(list).at(-1)).toBe("back");
  expect(titles(list).at(-1)).toBe("◀ Back");
  expect(bodies(await run(s, reply(P, "back")))[0]).toContain(
    "Which part of today works for you?",
  );
});

test("typed 'back' works too", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  expect(bodies(await run(s, text(P, "Back")))[0]).toContain(
    "Which part of today works for you?",
  );
});

test("period choice with 3 periods says to type back; with fewer it has a Back button; back → name", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  const three = await run(s, text(P, "Raj"));
  expect(bodies(three)[0]).toBe(
    'Which part of today works for you?\n\nType "back" to change the name.',
  );
  expect(ids(three[0])).toEqual(["p:morning", "p:afternoon", "p:evening"]);
  const s2 = createMemoryStore({
    doctors: [{ ...DOC, eveningStart: null, eveningEnd: null }],
  });
  const noEve = { ...DOC, eveningStart: null, eveningEnd: null };
  await run(s2, reply(P, "book"), NOW, noEve);
  const two = await run(s2, text(P, "Raj"), NOW, noEve);
  expect(ids(two[0])).toEqual(["p:morning", "p:afternoon", "back"]);
  expect(bodies(await run(s, text(P, "back")))).toEqual([
    "Sure! What's the patient's full name?",
  ]);
});

test("reason step: Back → the same time list", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  const reason = await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  expect(ids(reason[0])).toEqual(["skip", "back"]);
  const [list] = await run(s, reply(P, "back"));
  expect(list.msg).toMatchObject({ kind: "list", button: "Choose a time" });
  expect(titles(list)[0]).toBe("2:00 PM–2:30 PM");
  expect(s.appointments).toHaveLength(0);
});

test("cancel: list Back → menu; reason Back → list", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = (await seedToday(s)) as { id: string };
  const [list] = await run(s, reply(P, "cancel"));
  expect(ids(list)).toEqual([`c:${a.id}`, "back"]);
  await run(s, reply(P, `c:${a.id}`));
  expect(ids((await run(s, reply(P, "back")))[0])).toEqual([
    `c:${a.id}`,
    "back",
  ]);
  expect((await run(s, reply(P, "back")))[0].msg).toMatchObject({
    kind: "list",
    button: "Choose an option",
  });
  expect(s.appointments[0].status).toBe("CONFIRMED");
});

// ---- language: asked at the start of every conversation, never saved ----
test("the first message asks the language; Hindi then shows the Hindi menu", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [pick] = await raw(s, text(P, "hi"));
  expect(bodies([pick])[0]).toBe(
    "🙏 Sunrise Family Clinic\n\nChoose your language\nभाषा चुनें\nভাষা বাছক",
  );
  expect(ids(pick)).toEqual(LANG_IDS);
  expect(titles(pick)).toEqual(["English", "हिन्दी", "অসমীয়া"]);
  const [m] = await raw(s, reply(P, "lang:hi"));
  expect(bodies([m])[0]).toBe(
    "👋 Sunrise Family Clinic में आपका स्वागत है। आप क्या करना चाहेंगे?",
  );
  expect(titles(m)).toEqual(["अपॉइंटमेंट बुक करें", "सामान्य बातचीत", "भाषा बदलें"]);
});

test("a first /book keeps its intent: pick Assamese → straight to the name question", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(ids((await raw(s, text(P, "/book")))[0])).toEqual(LANG_IDS);
  expect(bodies(await raw(s, reply(P, "lang:as")))).toEqual([
    "নিশ্চয়! ৰোগীৰ সম্পূৰ্ণ নাম কি?",
  ]);
});

test("typing in the picker works: Devanagari → Hindi, '3' → Assamese, junk → asked again", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await raw(s, text(P, "hello"));
  expect(ids((await raw(s, text(P, "xyz")))[0])).toEqual(LANG_IDS);
  expect(bodies(await raw(s, text(P, "नमस्ते")))[0]).toContain("स्वागत");
  const s2 = createMemoryStore({ doctors: [DOC] });
  await raw(s2, text(P, "hello"));
  expect(bodies(await raw(s2, text(P, "3")))[0]).toContain("স্বাগতম");
});

test("Hindi booking: questions and options translated, times stay as they are; next visit asks again", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, text(P, "hi"));
  await run(s, reply(P, "lang:hi"));
  expect(bodies(await run(s, text(P, "बुक")))).toEqual([
    "ज़रूर! मरीज़ का पूरा नाम क्या है?",
  ]);
  const periods = await run(s, text(P, "राम"));
  expect(titles(periods[0])).toEqual(["सुबह (8)", "दोपहर (8)", "शाम (8)"]);
  const times = await run(s, reply(P, "p:afternoon"));
  expect(titles(times[0])[0]).toBe("2:00 PM–2:30 PM");
  expect(titles(times[0]).at(-1)).toBe("◀ वापस");
  await run(s, reply(P, `t:${at("14:30").toISOString()}`));
  const done = await run(s, reply(P, "skip"));
  expect(bodies(done)[0]).toBe(
    'Sunrise Family Clinic में Dr. Mehta के साथ आपकी अपॉइंटमेंट पक्की हो गई है।\n\n📅 Thu, Jul 30, 2:30 PM–3:00 PM\n\nरद्द करने के लिए कभी भी "cancel" लिखें।',
  );
  expect(bodies(done)[1]).toContain("New appointment booked"); // the doctor's alert stays English
  // the booking ended the conversation: nothing saved, so the language is asked again
  expect(ids((await raw(s, text(P, "hi")))[0])).toEqual(LANG_IDS);
});

test("Change language from the menu, mid-conversation", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, text(P, "hi"));
  expect(ids((await run(s, reply(P, "language")))[0])).toEqual(LANG_IDS);
  expect(bodies(await run(s, reply(P, "lang:as")))[0]).toContain("স্বাগতম");
});
