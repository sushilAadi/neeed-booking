import type { Appointment, Doctor, Store } from "../db/types";
import { formatMed, type Rx } from "../rx/parse";
import { renderPrescription, rxNo } from "../rx/pdf";
import { fmtDate, fmtDay, fmtRange } from "../time";
import { windowOpen } from "../wa/deliver";
import type { Send } from "../wa/types";

export type RxContent =
  | { rx: Rx }
  | { photo: { bytes: Uint8Array; mime: string }; caption: string | null };

/**
 * Renders and stores the prescription PDF, marks the visit COMPLETED, and returns the
 * document message for the patient (null when their 24 h window is closed).
 * Shared by the WhatsApp doctor bot and the prescription web page.
 */
export async function completeVisit(
  store: Store,
  doctor: Doctor,
  a: Appointment,
  content: RxContent,
  now: Date,
): Promise<Send | null> {
  let prescriptionText: string | null;
  let prescriptionImagePath: string | null = null;
  let photo: { bytes: Uint8Array; mime: string } | undefined;
  if ("rx" in content) {
    prescriptionText = [
      ...content.rx.meds.map(formatMed),
      ...content.rx.advice.map((x) => `Advice: ${x}`),
    ].join("\n");
  } else {
    photo = content.photo;
    const png = photo.mime === "image/png";
    prescriptionImagePath = `${a.id}.${png ? "png" : "jpg"}`;
    await store.putFile(
      "prescriptions",
      prescriptionImagePath,
      photo.bytes,
      png ? "image/png" : "image/jpeg",
    );
    prescriptionText = content.caption || null;
  }

  const sigPath = doctor.signaturePath as string;
  const pdf = await renderPrescription({
    clinic: doctor.clinicName,
    doctorName: doctor.name,
    regNo: doctor.registrationNumber ?? "",
    rxNo: rxNo(a.id),
    patientName: a.patientName,
    patientPhone: a.patientPhone,
    date: fmtDate(a.startsAt),
    time: fmtRange(a.startsAt, a.endsAt),
    // A photo's caption is advice; typed or page prescriptions arrive structured.
    rx:
      "rx" in content
        ? content.rx
        : { meds: [], advice: prescriptionText ? [prescriptionText] : [] },
    photo,
    signature: {
      bytes: await store.getFile("signatures", sigPath),
      mime: sigPath.endsWith(".png") ? "image/png" : "image/jpeg",
    },
  });
  const prescriptionPdfPath = `${a.id}.pdf`;
  await store.putFile(
    "prescriptions",
    prescriptionPdfPath,
    pdf,
    "application/pdf",
  );
  await store.updateAppointment(a.id, {
    status: "COMPLETED",
    prescriptionText,
    prescriptionImagePath,
    prescriptionPdfPath,
  });

  if (
    !(await windowOpen(
      store,
      doctor.businessPhoneNumberId,
      a.patientPhone,
      now,
    ))
  )
    return null;
  return {
    from: doctor.businessPhoneNumberId,
    to: a.patientPhone,
    msg: {
      kind: "document",
      link: await store.signedUrl("prescriptions", prescriptionPdfPath),
      filename: `Prescription-${rxNo(a.id)}.pdf`,
      caption: `Prescription from your visit on ${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)} with ${doctor.name}.`,
    },
  };
}

export const SAVED_SENT = "Saved and sent to the patient.";
export const SAVED_CLOSED =
  "Saved. The patient's 24-hour window has closed, so they'll get it from \"My Prescriptions\" next time they message.";
