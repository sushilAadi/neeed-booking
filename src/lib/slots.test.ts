import { expect, test } from "vitest";
import { byPeriod, freeSlots, parseRange, periodRange } from "./slots";
import { atIst } from "./time";

const H = { dayStart: "10:00", dayEnd: "22:00", slotMinutes: 30, morningEnd: "14:00", afternoonEnd: "18:00", workingDays: [0, 1, 2, 3, 4, 5, 6] };
const early = new Date("2026-07-30T00:00:00Z");

test("24 slots in a full open day", () => expect(freeSlots(H, "2026-07-30", [], early)).toHaveLength(24));
test("block 13:00-16:30 removes 7 slots", () => {
  const busy = [{ start: atIst("2026-07-30", "13:00"), end: atIst("2026-07-30", "16:30") }];
  expect(freeSlots(H, "2026-07-30", busy, early)).toHaveLength(17);
});
test("past slots excluded", () => {
  expect(freeSlots(H, "2026-07-30", [], atIst("2026-07-30", "21:10"))).toHaveLength(1); // 21:30 only
});
test("non-working day is empty", () => expect(freeSlots({ ...H, workingDays: [1] }, "2026-07-30", [], early)).toEqual([]));
test("periods split 8/8/8", () => {
  const p = byPeriod(H, freeSlots(H, "2026-07-30", [], early));
  expect([p.morning.length, p.afternoon.length, p.evening.length]).toEqual([8, 8, 8]);
});
test("periodRange", () => {
  expect(periodRange(H, "2026-07-30", "afternoon")).toEqual({ start: atIst("2026-07-30", "14:00"), end: atIst("2026-07-30", "18:00") });
  expect(periodRange(H, "2026-07-30", "whole")).toEqual({ start: atIst("2026-07-30", "10:00"), end: atIst("2026-07-30", "22:00") });
});
test.each([
  ["2pm-5pm", { start: "14:00", end: "17:00" }],
  ["14:00-17:00", { start: "14:00", end: "17:00" }],
  ["1 pm - 4:30pm", { start: "13:00", end: "16:30" }],
  ["9-11am", { start: "09:00", end: "11:00" }],
  ["12pm-1pm", { start: "12:00", end: "13:00" }],
])("parseRange %s", (i, o) => expect(parseRange(i)).toEqual(o));
test.each(["5pm-2pm", "lunch", "25:00-26:00", ""])("parseRange rejects %s", (i) => expect(parseRange(i)).toBeNull());
