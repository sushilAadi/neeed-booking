import type { Doctor } from "./db/types";
import { atIst, weekday } from "./time";

export type Hours = Pick<
  Doctor,
  | "dayStart"
  | "dayEnd"
  | "slotMinutes"
  | "morningEnd"
  | "afternoonEnd"
  | "workingDays"
>;
export type Slot = { start: Date; end: Date };
export type Period = "morning" | "afternoon" | "evening";

const MIN = 60_000;

export function freeSlots(
  h: Hours,
  date: string,
  busy: Slot[],
  now: Date,
): Slot[] {
  if (!h.workingDays.includes(weekday(date))) return [];
  const out: Slot[] = [];
  const last = atIst(date, h.dayEnd).getTime();
  for (
    let t = atIst(date, h.dayStart).getTime();
    t + h.slotMinutes * MIN <= last;
    t += h.slotMinutes * MIN
  ) {
    const s = { start: new Date(t), end: new Date(t + h.slotMinutes * MIN) };
    if (s.start <= now) continue;
    if (busy.some((b) => b.start < s.end && b.end > s.start)) continue;
    out.push(s);
  }
  return out;
}

export function periodRange(h: Hours, date: string, p: Period | "whole"): Slot {
  const [from, to] = {
    whole: [h.dayStart, h.dayEnd],
    morning: [h.dayStart, h.morningEnd],
    afternoon: [h.morningEnd, h.afternoonEnd],
    evening: [h.afternoonEnd, h.dayEnd],
  }[p];
  return { start: atIst(date, from), end: atIst(date, to) };
}

export function periodOf(h: Hours, s: Slot): Period {
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(s.start);
  if (hm < h.morningEnd) return "morning";
  if (hm < h.afternoonEnd) return "afternoon";
  return "evening";
}

export function byPeriod(h: Hours, slots: Slot[]): Record<Period, Slot[]> {
  const out: Record<Period, Slot[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const s of slots) out[periodOf(h, s)].push(s);
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
