import { today } from "../bot/ctx";
import type { Appointment, Doctor, Store } from "../db/types";
import {
  crosses,
  lunchHours,
  overlapsAny,
  PERIODS,
  type Period,
  periodHours,
  type Range,
  type Slot,
} from "../slots";
import { addDays, atIst, fmtTime } from "../time";
import type { Send } from "../wa/types";
import { type Actor, record } from "./activity";
import { cancelVisits } from "./visits";

const hmText = (hm: string) => fmtTime(atIst("2026-01-01", hm));
export const rangeText = (r: Range | null, none = "Off") =>
  r ? `${hmText(r.start)}–${hmText(r.end)}` : none;

/** Why these hours can't be saved, or null. Off (null) is always fine. */
export function validateHours(
  d: Doctor,
  key: Period | "lunch",
  range: Range | null,
): string | null {
  if (!range) return null;
  if (key === "lunch") {
    const hit = PERIODS.find((p) => {
      const ph = periodHours(d, p);
      return ph && crosses(range, ph);
    });
    return hit
      ? `That lunch break (${rangeText(range)}) runs into your ${hit} hours (${rangeText(periodHours(d, hit))}). Put it inside one period or between periods.`
      : null;
  }
  const lunch = lunchHours(d);
  if (lunch && crosses(lunch, range))
    return `Your lunch break (${rangeText(lunch)}) would run into these hours. Change the lunch break first, or type different hours.`;
  const clash = PERIODS.filter((p) => p !== key).find((p) => {
    const other = periodHours(d, p);
    return other && overlapsAny(range, [other]);
  });
  return clash
    ? `That overlaps your ${clash} hours (${rangeText(periodHours(d, clash))}). Type different hours, or tap a button.`
    : null;
}

/** null = ask first (return the clash count); "cancel" = cancel & notify; "keep" = keep bookings. */
export type ClashMode = "cancel" | "keep" | null;
export type ClashResult = { clash?: number; notices: Send[] };

const confirmedOn = async (
  store: Store,
  doctorId: string,
  date: string,
): Promise<Appointment[]> =>
  (
    await store.appointmentsBetween(
      doctorId,
      atIst(date, "00:00"),
      atIst(addDays(date, 1), "00:00"),
    )
  ).filter((a) => a.status === "CONFIRMED");

export async function setClosedToday(
  store: Store,
  doctor: Doctor,
  closed: boolean,
  mode: ClashMode,
  actor: Actor,
  now: Date,
): Promise<ClashResult> {
  const { date } = today(now);
  if (!closed) {
    await store.setClosed(doctor.id, date, false);
    await record(store, doctor.id, actor, "opened_today", {}, now);
    return { notices: [] };
  }
  const appts = await confirmedOn(store, doctor.id, date);
  if (appts.length && !mode) return { clash: appts.length, notices: [] };
  await store.setClosed(doctor.id, date, true);
  const notices =
    mode === "cancel"
      ? await cancelVisits(store, doctor, appts, null, actor, now)
      : [];
  await record(
    store,
    doctor.id,
    actor,
    "closed_today",
    { detail: { mode } },
    now,
  );
  return { notices };
}

/** Block a time range ("HH:MM") or a whole day; same clash rule as closing. */
export async function addBlockRange(
  store: Store,
  doctor: Doctor,
  date: string,
  range: Range | "whole",
  mode: ClashMode,
  actor: Actor,
  now: Date,
): Promise<ClashResult> {
  return blockSlot(
    store,
    doctor,
    date,
    range === "whole"
      ? "whole"
      : { start: atIst(date, range.start), end: atIst(date, range.end) },
    mode,
    actor,
    now,
  );
}

export async function blockClashes(
  store: Store,
  doctorId: string,
  date: string,
  slot: Slot | "whole",
): Promise<Appointment[]> {
  const appts = await confirmedOn(store, doctorId, date);
  if (slot === "whole") return appts;
  return appts.filter((a) => a.startsAt < slot.end && a.endsAt > slot.start);
}

export async function blockSlot(
  store: Store,
  doctor: Doctor,
  date: string,
  slot: Slot | "whole",
  mode: ClashMode,
  actor: Actor,
  now: Date,
): Promise<ClashResult> {
  const clashes = await blockClashes(store, doctor.id, date, slot);
  if (clashes.length && !mode) return { clash: clashes.length, notices: [] };
  const notices =
    mode === "cancel"
      ? await cancelVisits(store, doctor, clashes, null, actor, now)
      : [];
  if (slot === "whole") await store.setClosed(doctor.id, date, true);
  else await store.addBlock(doctor.id, slot.start, slot.end);
  await record(
    store,
    doctor.id,
    actor,
    "blocked",
    {
      detail:
        slot === "whole"
          ? { date, whole: true }
          : {
              date,
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
            },
    },
    now,
  );
  return { notices };
}
