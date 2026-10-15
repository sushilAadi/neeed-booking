import type { Doctor, Store } from "../db/types";
import { type Actor, record } from "./activity";

type Field = "clinicName" | "name" | "address";

/**
 * Clinic name, the doctor's printed name and chamber address. The WhatsApp numbers are
 * not editable here: they tie the clinic to its Meta connection.
 */
export async function saveClinicDetails(
  store: Store,
  doctor: Doctor,
  input: { clinicName: string; name: string; address: string },
  actor: Actor,
  now: Date,
): Promise<
  { ok: true } | { ok: false; errors: Partial<Record<Field, string>> }
> {
  const clinicName = input.clinicName.trim().slice(0, 80);
  // Doctor names are stored with "Dr." (bot messages and the PDF use them as is).
  const bare = input.name
    .trim()
    .replace(/^dr\.?\s*/i, "")
    .slice(0, 70);
  const address = input.address.trim().slice(0, 200);
  const errors: Partial<Record<Field, string>> = {};
  if (!clinicName) errors.clinicName = "Type the clinic's name.";
  if (!bare) errors.name = "Type your name.";
  if (Object.keys(errors).length) return { ok: false, errors };
  await store.updateDoctor(doctor.id, {
    clinicName,
    name: `Dr. ${bare}`,
    address: address || null,
  });
  await record(store, doctor.id, actor, "clinic_changed", {}, now);
  return { ok: true };
}
