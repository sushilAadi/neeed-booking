"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { bookToday, freeToday, validatePatient } from "@/lib/clinic/booking";
import { lastPatientDetails, normalizePhone } from "@/lib/clinic/patient";
import { byPeriod } from "@/lib/slots";
import { fmtTime } from "@/lib/time";
import { deliver } from "@/lib/wa/deliver";

export type SlotGroups = {
  period: string;
  slots: { iso: string; label: string }[];
}[];
export type AddResult =
  | { ok: true; message: string; slots: SlotGroups }
  | {
      ok: false;
      message: string;
      errors?: Record<string, string>;
      slots?: SlotGroups;
    };

const TITLES = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
} as const;

/** Today's free times, grouped like WhatsApp. */
export async function freeSlotGroups(): Promise<SlotGroups> {
  const { store, doctor, now } = await requirePermission("add");
  const by = byPeriod(doctor, await freeToday(store, doctor, now));
  return (Object.keys(TITLES) as (keyof typeof TITLES)[])
    .filter((p) => by[p].length)
    .map((p) => ({
      period: TITLES[p],
      slots: by[p].map((s) => ({
        iso: s.start.toISOString(),
        label: fmtTime(s.start),
      })),
    }));
}

export async function lookupPatient(phone: string) {
  const { store, doctor } = await requirePermission("add");
  const p = normalizePhone(phone);
  return p ? lastPatientDetails(store, doctor.id, p) : null;
}

export async function addPatient(
  raw: Record<string, string>,
): Promise<AddResult> {
  const s = await requirePermission("add");
  const v = validatePatient(raw);
  const startsAt = new Date(raw.slot ?? "");
  if (!v.ok || Number.isNaN(+startsAt))
    return {
      ok: false,
      message: "Check the highlighted fields.",
      errors: {
        ...(v.ok ? {} : v.errors),
        ...(Number.isNaN(+startsAt) ? { slot: "Pick a time" } : {}),
      },
    };
  const r = await bookToday(
    s.store,
    s.doctor,
    { ...v.value, startsAt, source: "reception" },
    s.actor,
    s.now,
  );
  if (!r.ok)
    return { ok: false, message: r.message, slots: await freeSlotGroups() };
  await deliver(s.store, r.notices, { from: "", to: "" }, s.now);
  revalidatePath("/today");
  return {
    ok: true,
    message: `Booked ${r.appointment.patientName} at ${fmtTime(r.appointment.startsAt)}.`,
    slots: await freeSlotGroups(),
  };
}
