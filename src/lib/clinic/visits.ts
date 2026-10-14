import { say } from "../bot/ctx";
import type { Appointment, Doctor, Store } from "../db/types";
import { fmtRange } from "../time";
import { windowOpen } from "../wa/deliver";
import type { Send } from "../wa/types";
import { type Actor, record } from "./activity";

/** A visit of this doctor's clinic, or null (unknown id or another clinic's). */
export async function ownAppointment(
  store: Store,
  doctorId: string,
  id: string,
): Promise<Appointment | null> {
  const a = await store.getAppointment(id);
  return a?.doctorId === doctorId ? a : null;
}

/** Cancel as the doctor; returns a notice for each patient whose 24 h window is open. */
export async function cancelVisits(
  store: Store,
  doctor: Doctor,
  appts: Appointment[],
  reason: string | null,
  actor: Actor,
  now: Date,
): Promise<Send[]> {
  const out: Send[] = [];
  for (const a of appts) {
    await store.updateAppointment(a.id, {
      status: "CANCELLED",
      cancelledBy: "doctor",
      cancelReason: reason,
    });
    await record(
      store,
      doctor.id,
      actor,
      "cancelled",
      { appointmentId: a.id, detail: { reason } },
      now,
    );
    if (
      await windowOpen(store, doctor.businessPhoneNumberId, a.patientPhone, now)
    )
      out.push({
        from: doctor.businessPhoneNumberId,
        to: a.patientPhone,
        msg: say(
          `Sorry, ${doctor.name} has cancelled your appointment today (${fmtRange(a.startsAt, a.endsAt)}). Reason: ${reason ?? "doctor unavailable"}. Reply /book to pick another time if available.`,
        ),
      });
  }
  return out;
}

/** The fee for this visit: typed for this visit, else the doctor's standard fee at this moment. */
const feeFor = (doctor: Doctor, fee?: number) =>
  fee !== undefined && fee >= 0 ? Math.round(fee) : doctor.standardFee;

/** Mark a visit done with no prescription; the fee is saved now and never recomputed. */
export async function completeWithoutRx(
  store: Store,
  doctor: Doctor,
  a: Appointment,
  now: Date,
  opts: { fee?: number; actor: Actor },
): Promise<void> {
  await store.updateAppointment(a.id, {
    status: "COMPLETED",
    fee: feeFor(doctor, opts.fee),
    completedBy: opts.actor.label,
  });
  await record(
    store,
    doctor.id,
    opts.actor,
    "completed",
    { appointmentId: a.id },
    now,
  );
}

export async function setFee(
  store: Store,
  doctor: Doctor,
  id: string,
  fee: number,
  actor: Actor,
  now: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const a = await ownAppointment(store, doctor.id, id);
  if (!a) return { ok: false, message: "This visit no longer exists." };
  if (a.status !== "COMPLETED")
    return { ok: false, message: "Complete the visit first." };
  if (!Number.isInteger(fee) || fee < 0)
    return { ok: false, message: "Fee must be 0 or more." };
  await store.updateAppointment(a.id, { fee });
  await record(
    store,
    doctor.id,
    actor,
    "fee_changed",
    { appointmentId: a.id, detail: { from: a.fee, to: fee } },
    now,
  );
  return { ok: true };
}

export { feeFor };
