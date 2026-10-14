import type { Appointment, Doctor, Store } from "../db/types";
import { formatMed, type Rx } from "../rx/parse";
import { renderPrescription, rxNo } from "../rx/pdf";
import { fmtDate, fmtDay, fmtRange } from "../time";
import { windowOpen } from "../wa/deliver";
import type { Out, Send } from "../wa/types";

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

  const pdf = await visitPdf(store, doctor, a, {
    // A photo's caption is advice; typed or page prescriptions arrive structured.
    rx:
      "rx" in content
        ? content.rx
        : { meds: [], advice: prescriptionText ? [prescriptionText] : [] },
    photo,
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

/** The same PDF the patient gets — used for the final file and for the doctor's preview. */
async function visitPdf(
  store: Store,
  doctor: Doctor,
  a: Appointment,
  body: { rx: Rx; photo?: { bytes: Uint8Array; mime: string } },
): Promise<Uint8Array> {
  const sigPath = doctor.signaturePath as string;
  return renderPrescription({
    clinic: doctor.clinicName,
    doctorName: doctor.name,
    regNo: doctor.registrationNumber ?? "",
    rxNo: rxNo(a.id),
    patientName: a.patientName,
    patientPhone: a.patientPhone,
    date: fmtDate(a.startsAt),
    time: fmtRange(a.startsAt, a.endsAt),
    rx: body.rx,
    photo: body.photo,
    signature: {
      bytes: await store.getFile("signatures", sigPath),
      mime: sigPath.endsWith(".png") ? "image/png" : "image/jpeg",
    },
  });
}

/** Renders the prescription without completing the visit; the doctor checks it before Send. */
export async function previewVisit(
  store: Store,
  doctor: Doctor,
  a: Appointment,
  rx: Rx,
): Promise<Out> {
  const path = `preview/${a.id}.pdf`; // overwritten by each new preview
  await store.putFile(
    "prescriptions",
    path,
    await visitPdf(store, doctor, a, { rx }),
    "application/pdf",
  );
  return {
    kind: "document",
    link: await store.signedUrl("prescriptions", path),
    filename: `Preview-${rxNo(a.id)}.pdf`,
    caption: `Preview: this is exactly what ${a.patientName} will get. Not sent yet.`,
  };
}

export const SAVED_SENT = "Saved and sent to the patient.";
export const SAVED_CLOSED =
  "Saved. The patient's 24-hour window has closed, so they'll get it from \"My Prescriptions\" next time they message.";
