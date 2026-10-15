import type { Store } from "../db/types";

/** Who did something: a person on the dashboard, the doctor bot, or a patient. */
export type Actor = { label: string; staffId: string | null };

export const PATIENT_WA: Actor = { label: "Patient (WhatsApp)", staffId: null };
export const doctorWa = (doctorName: string): Actor => ({
  label: `${doctorName} (WhatsApp)`,
  staffId: null,
});

export type Action =
  | "booked"
  | "completed"
  | "cancelled"
  | "fee_changed"
  | "closed_today"
  | "opened_today"
  | "blocked"
  | "hours_changed"
  | "fee_default_changed"
  | "rx_setup_changed"
  | "staff_added"
  | "staff_removed"
  | "key_reissued"
  | "clinic_changed"
  | "access_changed";

export function record(
  store: Store,
  doctorId: string,
  actor: Actor,
  action: Action,
  extra: { appointmentId?: string; detail?: Record<string, unknown> },
  now: Date,
): Promise<void> {
  return store.logActivity(
    {
      doctorId,
      actor: actor.label,
      staffId: actor.staffId,
      action,
      appointmentId: extra.appointmentId ?? null,
      detail: extra.detail ?? {},
    },
    now,
  );
}
