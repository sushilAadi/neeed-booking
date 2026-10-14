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
const run = (
  s: ReturnType<typeof createMemoryStore>,
  msg: Parameters<typeof handlePatient>[0]["msg"],
  now = NOW,
) => handlePatient({ store: s, doctor: DOC, msg, now });

test("first hi shows only Book and Normal chat", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [m] = await run(s, text(P, "hi"));
  expect(m.msg.kind).toBe("list");
  expect(m).toMatchObject({ from: "DOCPN", to: P });
  expect(bodies([m])[0]).toBe(
    "👋 Welcome to Sunrise Family Clinic. What would you like to do?",
  );
  expect(ids(m)).toEqual(["book", "chat"]);
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
  expect(ids(m)).toEqual(["book", "mine", "cancel", "chat"]);
});

test("Normal chat goes silent; a keyword wakes it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, reply(P, "chat")))).toEqual([
    "Sure — Dr. Mehta will reply here personally. Type /book any time to book an appointment.",
  ]);
  await s.touchInbound("DOCPN", P, NOW);
  expect(await run(s, text(P, "how are you"))).toEqual([]);
  expect(bodies(await run(s, text(P, "/book")))).toEqual([
    "Sure! What's the patient's full name?",
  ]);
});

test("chat mode shows the menu again after a 24h gap", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "chat"));
  await s.touchInbound("DOCPN", P, new Date(+NOW - 25 * 3600_000));
  const [m] = await run(s, text(P, "hello"));
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
    "Today:\n📅 2:30 PM–3:00 PM — Raj (CONFIRMED)",
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
    handlePatient({ store: s, doctor, msg, now });
  await h(reply(P, "book"));
  await h(text(P, "Raj"));
  return h(reply(P, `p:${period}`));
};

test("full booking: name → period → time → skip → confirmed + doctor alert", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  const periods = await run(s, text(P, "Raj"));
  expect(bodies(periods)).toEqual(["Which part of today works for you?"]);
  expect(titles(periods[0])).toEqual([
    "Morning (8)",
    "Afternoon (8)",
    "Evening (8)",
  ]);
  const times = await run(s, reply(P, "p:afternoon"));
  expect(times[0].msg).toMatchObject({ kind: "list", button: "Choose a time" });
  expect(titles(times[0])[0]).toBe("2:00 PM–2:30 PM");
  expect(ids(times[0])).toHaveLength(8);
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
  const r = await handlePatient({
    store: s,
    doctor: off,
    msg: reply(P, "book"),
    now: NOW,
  });
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
  expect(bodies(await run(s, reply(P, "yesname")))).toEqual([
    "Which part of today works for you?",
  ]);
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
  ]);
});

test("no slots left today", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, reply(P, "book"));
  expect(bodies(await run(s, text(P, "Raj"), at("21:45")))).toEqual([
    "Sorry, no slots are left today.",
  ]);
});

test("more than 10 free slots in a period → 9 rows + Later times; more → the next page", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const D15 = { ...DOC, slotMinutes: 15 };
  const [list] = await toTimes(s, "morning", D15);
  expect(ids(list)).toHaveLength(10);
  expect(ids(list)[9]).toBe("more");
  expect(titles(list)[9]).toBe("Later times");
  const [next] = await handlePatient({
    store: s,
    doctor: D15,
    msg: reply(P, "more"),
    now: NOW,
  });
  expect(ids(next)).toHaveLength(7);
  expect(titles(next)[0]).toBe("12:15 PM–12:30 PM");
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
    "Which part of today works for you?",
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
  expect(bodies(r)).toEqual(["Which part of today works for you?"]);
  expect(s.appointments).toHaveLength(0);
});

test("garbage slot id re-shows the periods", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await toTimes(s);
  expect(bodies(await run(s, reply(P, "t:not-a-date")))).toEqual([
    "Which part of today works for you?",
  ]);
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
  expect(ids(list)).toEqual([`c:${a.id}`]);
  expect(titles(list)).toEqual(["2:30 PM–3:00 PM"]);
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
  expect(ids(r[0])).toEqual([`c:${mineA.id}`]);
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
  expect(ids(list)).toEqual([`rx:${a.id}`]);
  expect(titles(list)).toEqual(["Thu, Jul 30"]);
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
