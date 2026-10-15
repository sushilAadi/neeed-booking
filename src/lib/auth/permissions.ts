import { type Actor, record } from "../clinic/activity";
import type { Doctor, Staff, Store } from "../db/types";

/** What a receptionist may do, ticked by the doctor. The doctor can always do everything. */
export const PERMS = [
  ["add", "Add patients", "Book walk-in and phone patients."],
  [
    "cancel",
    "Cancel visits",
    "Cancel a booking and tell the patient on WhatsApp.",
  ],
  [
    "complete",
    "Complete visits",
    "Mark visits done, write prescriptions and set the fee for that visit.",
  ],
  ["fee", "Edit visit fees", "Change the fee of a visit that's already done."],
  [
    "close",
    "Open / close the clinic",
    "Stop bookings for today and block time.",
  ],
  ["history", "History", "See past visits and prescriptions."],
  ["reports", "Reports", "See money collected, charts and Activity."],
  [
    "hours",
    "Clinic hours",
    "Change morning, afternoon and evening hours and time per patient.",
  ],
] as const;
export type Perm = (typeof PERMS)[number][0];
export const DEFAULT_PERMS: Perm[] = ["add", "cancel", "history"];

export const can = (s: Staff, p: Perm) =>
  s.role === "doctor" || s.permissions.includes(p);

/** Saves a receptionist's ticked boxes (unknown values dropped, canonical order). */
export async function setPermissions(
  store: Store,
  doctor: Doctor,
  staffId: string,
  perms: string[],
  actor: Actor,
  now: Date,
): Promise<void> {
  const s = await store.staffById(staffId);
  if (!s || s.doctorId !== doctor.id || !s.active || s.role !== "reception")
    throw new Error("Only a receptionist's access can be changed.");
  const keep = PERMS.map(([k]) => k).filter((k) => perms.includes(k));
  await store.updateStaff(s.id, { permissions: keep });
  await record(
    store,
    doctor.id,
    actor,
    "access_changed",
    { detail: { name: s.name, perms: keep } },
    now,
  );
}
