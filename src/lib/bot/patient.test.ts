import { expect, test } from "vitest";
import { createMemoryStore } from "../db/memory-store";
import { atIst } from "../time";
import { handlePatient } from "./patient";
import { bodies, DOC, ids, NOW, reply, sticker, text } from "./test-kit";

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
