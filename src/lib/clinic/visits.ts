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
