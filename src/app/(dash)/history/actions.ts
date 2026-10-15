"use server";

import { requirePermission } from "@/lib/auth/guard";
import { ownAppointment } from "@/lib/clinic/visits";

/** A 1-hour link to a visit's prescription PDF — only for this clinic's visits. */
export async function rxUrlAction(
  appointmentId: string,
): Promise<string | null> {
  const s = await requirePermission("history");
  const a = await ownAppointment(s.store, s.doctor.id, appointmentId);
  if (!a?.prescriptionPdfPath) return null;
  return s.store.signedUrl("prescriptions", a.prescriptionPdfPath);
}
