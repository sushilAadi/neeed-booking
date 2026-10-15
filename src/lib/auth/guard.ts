import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "../clinic/activity";
import { createSupabaseStore } from "../db/supabase-store";
import type { Doctor, Staff, Store } from "../db/types";
import { actorLabel, currentStaff } from "./login";
import { can, type Perm } from "./permissions";
import { SESSION_COOKIE } from "./session";

export type Session = {
  staff: Staff;
  doctor: Doctor;
  actor: Actor;
  store: Store;
  now: Date;
};

/** The logged-in person for a dashboard page or action; otherwise off to /login. */
export async function requireStaff(): Promise<Session> {
  const store = createSupabaseStore();
  const now = new Date();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const who = await currentStaff(
    store,
    token,
    now,
    process.env.SESSION_SECRET ?? "",
  );
  if (!who) redirect("/login");
  return {
    ...who,
    store,
    now,
    actor: { label: actorLabel(who.staff, who.doctor), staffId: who.staff.id },
  };
}

/** Staff keys and the doctor's own key: doctor only. */
export async function requireDoctorRole(): Promise<Session> {
  const s = await requireStaff();
  if (s.staff.role !== "doctor") redirect("/today");
  return s;
}

/** A receptionist without this box ticked is sent back to Today (pages and actions alike). */
export async function requirePermission(p: Perm): Promise<Session> {
  const s = await requireStaff();
  if (!can(s.staff, p)) redirect("/today");
  return s;
}
