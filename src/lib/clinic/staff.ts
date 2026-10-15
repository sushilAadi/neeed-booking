import { generateKey, hashKey, normalizeKey, sealKey } from "../auth/keys";
import type { Doctor, Role, Staff, Store } from "../db/types";
import { type Actor, record } from "./activity";

const newKey = (role: Role, pepper: string) => {
  const key = generateKey(role);
  return {
    key,
    keyHash: hashKey(normalizeKey(key) as string, pepper),
    keyEnc: sealKey(key, pepper),
  };
};

/** This clinic's active staff member, or throw (never touch another clinic's rows). */
async function ownStaff(
  store: Store,
  doctor: Doctor,
  staffId: string,
): Promise<Staff> {
  const s = await store.staffById(staffId);
  if (!s || s.doctorId !== doctor.id || !s.active)
    throw new Error("That person isn't on your staff.");
  return s;
}

/** A new receptionist and their RC- key, shown once. */
export async function addReceptionist(
  store: Store,
  doctor: Doctor,
  name: string,
  actor: Actor,
  now: Date,
  pepper: string,
): Promise<{ staff: Staff; key: string }> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Type a name.");
  const { key, keyHash, keyEnc } = newKey("reception", pepper);
  const staff = await store.createStaff({
    doctorId: doctor.id,
    role: "reception",
    name: clean,
    keyHash,
    keyEnc,
  });
  await record(
    store,
    doctor.id,
    actor,
    "staff_added",
    { detail: { name: clean } },
    now,
  );
  return { staff, key };
}

/** Turns a receptionist's key off; their sessions end on the next request. */
export async function removeStaff(
  store: Store,
  doctor: Doctor,
  staffId: string,
  actor: Actor,
  now: Date,
): Promise<void> {
  const s = await ownStaff(store, doctor, staffId);
  if (s.role === "doctor") throw new Error("Can't remove the doctor.");
  await store.updateStaff(s.id, { active: false });
  await record(
    store,
    doctor.id,
    actor,
    "staff_removed",
    { detail: { name: s.name } },
    now,
  );
}

/** A fresh key for one person; bumping keyVersion logs out only their devices. */
export async function reissueKey(
  store: Store,
  doctor: Doctor,
  staffId: string,
  actor: Actor,
  now: Date,
  pepper: string,
): Promise<string> {
  const s = await ownStaff(store, doctor, staffId);
  const { key, keyHash, keyEnc } = newKey(s.role, pepper);
  await store.updateStaff(s.id, {
    keyHash,
    keyEnc,
    keyVersion: s.keyVersion + 1,
  });
  await record(
    store,
    doctor.id,
    actor,
    "key_reissued",
    { detail: { name: s.role === "doctor" ? doctor.name : s.name } },
    now,
  );
  return key;
}
