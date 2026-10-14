import type { Doctor } from "./db/types";
import { atIst, weekday } from "./time";

export type Hours = Pick<
  Doctor,
  | "morningStart"
  | "morningEnd"
  | "afternoonStart"
  | "afternoonEnd"
  | "eveningStart"
  | "eveningEnd"
  | "lunchStart"
  | "lunchEnd"
  | "slotMinutes"
  | "workingDays"
>;
export type Slot = { start: Date; end: Date };
export type Period = "morning" | "afternoon" | "evening";
export const PERIODS: Period[] = ["morning", "afternoon", "evening"];
export type Range = { start: string; end: string };

const MIN = 60_000;

/** The period's "HH:MM" range, or null when it is Off. */
export function periodHours(h: Hours, p: Period): Range | null {
  const start = h[`${p}Start`];
  const end = h[`${p}End`];
  return start && end ? { start, end } : null;
}

export function lunchHours(h: Hours): Range | null {
  return h.lunchStart && h.lunchEnd
    ? { start: h.lunchStart, end: h.lunchEnd }
    : null;
}

/** Ranges overlap when each starts before the other ends ("HH:MM" compares as text). */
export const overlapsAny = (r: Range, others: Range[]) =>
  others.some((o) => r.start < o.end && o.start < r.end);

/** True when `inner` overlaps `outer` without sitting fully inside it (crosses its start or end). */
export const crosses = (inner: Range, outer: Range) =>
  overlapsAny(inner, [outer]) &&
  !(outer.start <= inner.start && inner.end <= outer.end);

function slotsOf(h: Hours, date: string, p: Period): Slot[] {
  const r = periodHours(h, p);
  if (!r) return [];
  const step = h.slotMinutes * MIN;
  const last = atIst(date, r.end).getTime();
  const lunch = lunchHours(h);
  const lunchR = lunch && {
    start: atIst(date, lunch.start),
    end: atIst(date, lunch.end),
  };
  const out: Slot[] = [];
  for (let t = atIst(date, r.start).getTime(); t + step <= last; ) {
    const s = { start: new Date(t), end: new Date(t + step) };
    if (lunchR && s.start < lunchR.end && lunchR.start < s.end) {
      t = Math.max(t + step, lunchR.end.getTime()); // restart the grid after lunch
      continue;
    }
    out.push(s);
    t += step;
  }
  return out;
}

export function freeSlots(
  h: Hours,
  date: string,
  busy: Slot[],
  now: Date,
): Slot[] {
  if (!h.workingDays.includes(weekday(date))) return [];
  return byPeriodAll(h, date)
    .filter((s) => s.start > now)
    .filter((s) => !busy.some((b) => b.start < s.end && b.end > s.start));
}

const byPeriodAll = (h: Hours, date: string) =>
  PERIODS.flatMap((p) => slotsOf(h, date, p));

/** The block range for a period (null when Off); "whole" spans the first to the last open period. */
export function periodRange(
  h: Hours,
  date: string,
  p: Period | "whole",
): Slot | null {
  const ranges = (p === "whole" ? PERIODS : [p])
    .map((x) => periodHours(h, x))
    .filter((r): r is Range => r !== null);
  if (!ranges.length) return null;
  const start = ranges.map((r) => r.start).sort()[0];
  const end = ranges
    .map((r) => r.end)
    .sort()
    .at(-1) as string;
  return { start: atIst(date, start), end: atIst(date, end) };
}

const istHm = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

export function periodOf(h: Hours, s: Slot): Period | null {
  const hm = istHm(s.start);
  return (
    PERIODS.find((p) => {
      const r = periodHours(h, p);
      return r !== null && r.start <= hm && hm < r.end;
    }) ?? null
  );
}

export function byPeriod(h: Hours, slots: Slot[]): Record<Period, Slot[]> {
  const out: Record<Period, Slot[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const s of slots) {
    const p = periodOf(h, s);
    if (p) out[p].push(s);
  }
  return out;
}

const PART = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;

function toMinutes(
  hh: number,
  mm: number,
  ampm: string | undefined,
): number | null {
  if (mm > 59) return null;
  if (ampm) {
    if (hh < 1 || hh > 12) return null;
    hh = (hh % 12) + (ampm === "pm" ? 12 : 0);
  } else if (hh > 23) return null;
  return hh * 60 + mm;
}

const hm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function parseRange(
  input: string,
): { start: string; end: string } | null {
  const halves = input
    .trim()
    .toLowerCase()
    .split(/\s*(?:-|–|to)\s*/);
  if (halves.length !== 2) return null;
  const a = PART.exec(halves[0]);
  const b = PART.exec(halves[1]);
  if (!a || !b) return null;
  const start = toMinutes(Number(a[1]), Number(a[2] ?? 0), a[3] ?? b[3]);
  const end = toMinutes(Number(b[1]), Number(b[2] ?? 0), b[3]);
  if (start === null || end === null || end <= start) return null;
  return { start: hm(start), end: hm(end) };
}
