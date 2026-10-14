import { say, today } from "../bot/ctx";
import type { Appointment, Doctor, Gender, Source, Store } from "../db/types";
import { freeSlots, type Slot } from "../slots";
import { fmtRange } from "../time";
import { windowOpen } from "../wa/deliver";
import type { Send } from "../wa/types";
import { type Actor, record } from "./activity";
import { normalizePhone } from "./patient";

export type PatientInput = {
  phone: string;
  name: string;
  age: number;
  gender: Gender;
  area?: string;
  reason?: string;
};
type Errors = Partial<Record<keyof PatientInput, string>>;

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** The Add patient form, checked field by field. */
export function validatePatient(
  raw: Record<string, unknown>,
): { ok: true; value: PatientInput } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const phone = normalizePhone(text(raw.phone, 30));
  if (!phone) errors.phone = "Enter a 10-digit mobile number";
  const name = text(raw.name, 80);
  if (!name) errors.name = "Enter the patient's name";
  const ageText = text(raw.age, 5);
  const age = /^\d{1,3}$/.test(ageText) ? Number(ageText) : Number.NaN;
  if (!(age >= 0 && age <= 120)) errors.age = "Age must be 0–120";
  const gender = text(raw.gender, 1);
  if (!["M", "F", "O"].includes(gender)) errors.gender = "Choose a gender";
  if (Object.keys(errors).length) return { ok: false, errors };
  const area = text(raw.area, 80);
  const reason = text(raw.reason, 200);
  return {
    ok: true,
    value: {
      phone: phone as string,
      name,
      age,
      gender: gender as Gender,
      ...(area ? { area } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

/** Today's bookable slots: clinic hours minus bookings, blocks, a closed day and the past. */
export async function freeToday(
  store: Store,
  doctor: Doctor,
  now: Date,
): Promise<Slot[]> {
  const t = today(now);
  if (await store.isClosed(doctor.id, t.date)) return [];
  const appts = await store.appointmentsBetween(doctor.id, t.from, t.to);
  const blocks = await store.blocksBetween(doctor.id, t.from, t.to);
  const busy = [
    ...appts
      .filter((a) => a.status === "CONFIRMED")
      .map((a) => ({ start: a.startsAt, end: a.endsAt })),
    ...blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];
  return freeSlots(doctor, t.date, busy, now);
}

export const JUST_TAKEN = "That time was just taken. Pick another.";

/** Same-day booking from any channel; the DB unique index settles races. */
export async function bookToday(
  store: Store,
  doctor: Doctor,
  input: {
    phone: string;
    name: string;
    age?: number | null;
    gender?: Gender | null;
    area?: string | null;
    reason?: string | null;
    startsAt: Date;
    source: Source;
  },
  actor: Actor,
  now: Date,
): Promise<
  | { ok: true; appointment: Appointment; notices: Send[] }
  | { ok: false; message: string }
> {
  const free = await freeToday(store, doctor, now);
  const res = free.some((s) => +s.start === +input.startsAt)
    ? await store.createAppointment({
        doctorId: doctor.id,
        patientPhone: input.phone,
        patientName: input.name,
        startsAt: input.startsAt,
        endsAt: new Date(+input.startsAt + doctor.slotMinutes * 60_000),
        notes: input.reason ?? null,
        patientAge: input.age ?? null,
        patientGender: input.gender ?? null,
        patientArea: input.area ?? null,
        source: input.source,
        createdBy: actor.label,
      })
    : "slot_taken";
  if (res === "slot_taken") return { ok: false, message: JUST_TAKEN };
  await record(
    store,
    doctor.id,
    actor,
    "booked",
    { appointmentId: res.id },
    now,
  );
  // The bot answers its own patient; a reception booking only messages an open window.
  const notices: Send[] =
    input.source === "reception" &&
    (await windowOpen(
      store,
      doctor.businessPhoneNumberId,
      res.patientPhone,
      now,
    ))
      ? [
          {
            from: doctor.businessPhoneNumberId,
            to: res.patientPhone,
            msg: say(
              `You're booked with ${doctor.name} at ${doctor.clinicName} today, ${fmtRange(res.startsAt, res.endsAt)}.`,
            ),
          },
        ]
      : [];
  return { ok: true, appointment: res, notices };
}
