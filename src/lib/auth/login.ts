import type { Doctor, Staff, Store } from "../db/types";
import { hashKey, normalizeKey } from "./keys";
import { signSession, verifySession } from "./session";

const WINDOW = 15 * 60_000;
const MAX_FAILS = 10;
const HOUR = 3600_000;

export type LoginResult =
  | { ok: true; token: string; staff: Staff }
  | { ok: false; message: string };

/** Key → signed session, with at most 10 failed tries per IP per 15 minutes. */
export async function login(
  store: Store,
  input: { key: string; ip: string },
  now: Date,
  env: { pepper: string; secret: string },
): Promise<LoginResult> {
  if (
    (await store.loginFailures(input.ip, new Date(+now - WINDOW))) >= MAX_FAILS
  )
    return { ok: false, message: "Too many tries, wait 15 minutes." };
  const k = normalizeKey(input.key);
  const staff = k ? await store.staffByKeyHash(hashKey(k, env.pepper)) : null;
  if (!staff?.active || !(await store.doctorById(staff.doctorId))) {
    await store.addLoginFailure(input.ip, now);
    return {
      ok: false,
      message: "That key didn't work. Check it and try again.",
    };
  }
  const token = signSession(
    { staffId: staff.id, keyVersion: staff.keyVersion },
    now,
    env.secret,
  );
  return { ok: true, token, staff };
}

/** The logged-in person, or null (no/bad/expired cookie, removed, or given a new key). */
export async function currentStaff(
  store: Store,
  token: string | undefined,
  now: Date,
  secret: string,
): Promise<{ staff: Staff; doctor: Doctor } | null> {
  const s = token ? verifySession(token, now, secret) : null;
  if (!s) return null;
  const staff = await store.staffById(s.staffId);
  if (!staff?.active || staff.keyVersion !== s.keyVersion) return null;
  const doctor = await store.doctorById(staff.doctorId);
  if (!doctor) return null;
  if (!staff.lastActiveAt || +now - +staff.lastActiveAt >= HOUR) {
    await store.updateStaff(staff.id, { lastActiveAt: now });
    staff.lastActiveAt = now;
  }
  return { staff, doctor };
}

/** Who did it, as shown on cards and in Activity. Doctor names already include "Dr.". */
export const actorLabel = (staff: Staff, doctor: Doctor) =>
  staff.role === "doctor" ? doctor.name : `${staff.name} (Reception)`;
