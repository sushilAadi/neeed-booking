import { completeVisit } from "../bot/complete";
import { platformId, say } from "../bot/ctx";
import type { Store } from "../db/types";
import { fmtDay, fmtRange } from "../time";
import { deliver } from "../wa/deliver";
import type { Send } from "../wa/types";
import { cleanRxPayload, verifyRxToken } from "./link";
import { parseRx } from "./parse";

export type RxPage =
  | {
      state: "ok";
      patient: string;
      visit: string;
      clinic: string;
      doctor: string;
      suggestions: string[];
    }
  | { state: "expired" | "done" | "missing" };

/** What the prescription page shows for a link. */
export async function loadRxPage(
  store: Store,
  token: string,
  now: Date,
  secret: string,
): Promise<RxPage> {
  const id = verifyRxToken(token, now, secret);
  if (!id) return { state: "expired" };
  const a = await store.getAppointment(id);
  if (!a) return { state: "missing" };
  if (a.status !== "CONFIRMED") return { state: "done" };
  const doctor = await store.doctorById(a.doctorId);
  if (!doctor) return { state: "missing" };
  const names = new Set<string>();
  for (const t of await store.prescribedTexts(doctor.id))
    for (const m of parseRx(t).meds) names.add(m.name);
  return {
    state: "ok",
    patient: a.patientName,
    visit: `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`,
    clinic: doctor.clinicName,
    doctor: doctor.name,
    suggestions: [...names].slice(0, 300),
  };
}

export type SubmitResult = { status: number; message: string };

/** Saves the page's prescription, sends the PDF to the patient and a note to the doctor. */
export async function submitRx(
  store: Store,
  token: string,
  body: unknown,
  now: Date,
  secret: string,
  send?: (s: Send) => Promise<void>,
): Promise<SubmitResult> {
  const id = verifyRxToken(token, now, secret);
  if (!id)
    return {
      status: 410,
      message:
        "This link has expired. In WhatsApp, open Today → Mark complete to get a new one.",
    };
  const a = await store.getAppointment(id);
  if (!a) return { status: 404, message: "This visit no longer exists." };
  if (a.status !== "CONFIRMED")
    return { status: 409, message: "This visit is already completed." };
  const doctor = await store.doctorById(a.doctorId);
  if (!doctor?.signaturePath)
    return {
      status: 409,
      message: 'Finish prescription setup in WhatsApp first (send "setup").',
    };
  const rx = cleanRxPayload(body);
  if (!rx) return { status: 400, message: "Add at least one medicine name." };

  const toPatient = await completeVisit(store, doctor, a, { rx }, now);
  const note = toPatient
    ? `Prescription for ${a.patientName} saved and sent to the patient.`
    : `Prescription for ${a.patientName} saved. Their 24-hour window has closed, so they'll get it from "My Prescriptions" next time they message.`;
  const sends: Send[] = [
    ...(toPatient ? [toPatient] : []),
    { from: platformId(), to: doctor.personalPhone, msg: say(note) },
  ];
  // No sender on the web: every message goes through the 24 h window check.
  await deliver(store, sends, { from: "", to: "" }, now, send);
  // Leave the doctor's chat out of the "type the medicines" step.
  const conv = await store.getConversation(platformId(), doctor.personalPhone);
  if (conv.ctx.appointmentId === a.id)
    await store.saveConversation({ ...conv, state: "idle", ctx: {} });
  return {
    status: 200,
    message: toPatient
      ? "Sent to the patient."
      : "Saved. The patient will get it from My Prescriptions next time they message.",
  };
}
