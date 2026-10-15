import { expect, test } from "vitest";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { atIst } from "../time";
import { searchVisits } from "./history";

const RANGE = {
  from: atIst("2026-07-01", "00:00"),
  to: atIst("2026-08-01", "00:00"),
};
const PAGE = { limit: 50 };

const seed = async () => {
  const s = createMemoryStore({ doctors: [DOC, { ...DOC, id: "other" }] });
  const add = (doctorId: string, phone: string, name: string, day: string) =>
    s.createAppointment({
      doctorId,
      patientPhone: phone,
      patientName: name,
      startsAt: atIst(day, "10:00"),
      endsAt: atIst(day, "10:30"),
      notes: null,
    });
  await add(DOC.id, "919876543210", "Ramesh Kumar", "2026-07-10");
  await add(DOC.id, "919811111111", "Priya Sharma", "2026-07-20");
  await add(DOC.id, "919876543210", "Ramesh Kumar", "2026-07-28");
  await add(DOC.id, "919822222222", "Old Visit", "2026-06-15");
  await add("other", "919876543210", "Someone Else", "2026-07-12");
  return s;
};

test("finds by phone digits in any format", async () => {
  const s = await seed();
  for (const q of ["+91 98765-43210", "98765 43210", "98765", "9876"]) {
    const r = await searchVisits(s, DOC.id, q, RANGE, PAGE);
    expect(r.visits.map((v) => v.patientName)).toEqual([
      "Ramesh Kumar",
      "Ramesh Kumar",
    ]);
  }
});

test("finds by name ignoring case", async () => {
  const s = await seed();
  const r = await searchVisits(s, DOC.id, "  priya ", RANGE, PAGE);
  expect(r.visits.map((v) => v.patientName)).toEqual(["Priya Sharma"]);
});

test("only this doctor's visits", async () => {
  const s = await seed();
  const r = await searchVisits(s, DOC.id, "", RANGE, PAGE);
  expect(r.visits.every((v) => v.doctorId === DOC.id)).toBe(true);
  expect(r.visits.some((v) => v.patientName === "Someone Else")).toBe(false);
});

test("range and newest first", async () => {
  const s = await seed();
  const r = await searchVisits(s, DOC.id, "", RANGE, PAGE);
  expect(r.visits.map((v) => v.startsAt.toISOString().slice(0, 10))).toEqual([
    "2026-07-28",
    "2026-07-20",
    "2026-07-10",
  ]);
  expect(r.more).toBe(false);
});

test("pages with before and reports more", async () => {
  const s = await seed();
  const first = await searchVisits(s, DOC.id, "", RANGE, { limit: 2 });
  expect(first.visits).toHaveLength(2);
  expect(first.more).toBe(true);
  const next = await searchVisits(s, DOC.id, "", RANGE, {
    limit: 2,
    before: first.visits[1].startsAt,
  });
  expect(next.visits.map((v) => v.patientName)).toEqual(["Ramesh Kumar"]);
  expect(next.more).toBe(false);
  expect(NOW).toBeTruthy();
});
