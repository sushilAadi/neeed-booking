import { expect, test } from "vitest";
import { addDays, atIst, fmtDay, fmtRange, fmtTime, istDate, weekday } from "./time";

test("istDate uses IST, not UTC, just after IST midnight", () => {
  expect(istDate(new Date("2026-07-29T19:00:00Z"))).toBe("2026-07-30"); // 00:30 IST
});
test("atIst builds the IST instant", () => {
  expect(atIst("2026-07-30", "14:30").toISOString()).toBe("2026-07-30T09:00:00.000Z");
});
test("formatting", () => {
  const s = atIst("2026-07-30", "14:30");
  const e = atIst("2026-07-30", "15:00");
  expect(fmtDay(s)).toBe("Thu, Jul 30");
  expect(fmtRange(s, e)).toBe("2:30 PM–3:00 PM");
  expect(fmtTime(atIst("2026-07-30", "10:00"))).toBe("10:00 AM");
});
test("addDays crosses months; weekday", () => {
  expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  expect(weekday("2026-08-02")).toBe(0);
});
