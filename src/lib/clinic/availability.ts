import { today } from "../bot/ctx";
import type { Appointment, Doctor, HoursPatch, Store } from "../db/types";
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

export type HoursKey = Period | "lunch";
export type HoursForm = Record<HoursKey, Range | null> & {
  slotMinutes: number;
};

/** Saves the whole hours form (web Settings) once every period fits the others. Existing bookings are kept. */
export async function saveHours(
  store: Store,
  doctor: Doctor,
  f: HoursForm,
  actor: Actor,
  now: Date,
): Promise<
  { ok: true } | { ok: false; errors: Partial<Record<HoursKey, string>> }
> {
  const patch: HoursPatch = {
    slotMinutes: [15, 30, 45, 60].includes(f.slotMinutes)
      ? f.slotMinutes
      : doctor.slotMinutes,
    hoursSet: true,
  };
  for (const k of [...PERIODS, "lunch"] as const) {
    patch[`${k}Start`] = f[k]?.start ?? null;
    patch[`${k}End`] = f[k]?.end ?? null;
  }
  const draft = { ...doctor, ...patch };
  const errors: Partial<Record<HoursKey, string>> = {};
  for (const k of [...PERIODS, "lunch"] as const) {
    const r = f[k];
    if (r && r.end <= r.start)
      errors[k] = "The end time must be after the start.";
    else {
      const why = validateHours(draft, k, r);
      // The bot's "tap a button" hint has no button on the web form.
      if (why) errors[k] = why.replace(", or tap a button.", ".");
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  await store.updateDoctor(doctor.id, patch);
  await record(store, doctor.id, actor, "hours_changed", {}, now);
  return { ok: true };
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
