"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guard";
import { previewVisit } from "@/lib/bot/complete";
import { ownAppointment } from "@/lib/clinic/visits";
import { cleanRxPayload } from "@/lib/rx/link";
import { submitRxFor } from "@/lib/rx/web";

export type Result = { ok: boolean; message: string; url?: string };

export async function submitVisit(
  id: string,
  payload: unknown,
): Promise<Result> {
  const s = await requireStaff();
  const a = await ownAppointment(s.store, s.doctor.id, id);
  if (!a) return { ok: false, message: "This visit no longer exists." };
  const r = await submitRxFor(s.store, s.doctor, a, payload, s.now, {
    actor: s.actor,
    notifyDoctor: false,
  });
  if (r.status === 200) revalidatePath("/today");
  return { ok: r.status === 200, message: r.message };
}

/** The real PDF, not sent to anyone, so the doctor can check it first. */
export async function previewVisitPdf(
  id: string,
  payload: unknown,
): Promise<Result> {
  const s = await requireStaff();
  const a = await ownAppointment(s.store, s.doctor.id, id);
  if (!a) return { ok: false, message: "This visit no longer exists." };
  if (!s.doctor.signaturePath)
    return {
      ok: false,
      message:
        "Add your registration number and signature first (Settings → Prescription setup).",
    };
  const rx = cleanRxPayload(payload);
  if (!rx) return { ok: false, message: "Add at least one medicine name." };
  const doc = await previewVisit(s.store, s.doctor, a, rx);
  return doc.kind === "document"
    ? { ok: true, message: "", url: doc.link }
    : { ok: false, message: "Couldn't make the preview. Try again." };
}
