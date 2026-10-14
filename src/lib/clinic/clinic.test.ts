import { expect, test } from "vitest";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { atIst } from "../time";
import { addBlockRange, setClosedToday, validateHours } from "./availability";
import { bookToday, validatePatient } from "./booking";
import { lastPatientDetails, normalizePhone } from "./patient";
import {
  cancelVisits,
  completeWithoutRx,
  ownAppointment,
  setFee,
} from "./visits";

const RIYA = { label: "Riya (Reception)", staffId: "s-riya" };
const at = (hm: string) => atIst("2026-07-30", hm); // NOW's IST date
const input = {
  phone: "919876543210",
  name: "Ramesh Kumar",
  age: 45,
  gender: "M" as const,
  area: "Tezpur",
};

test("normalizePhone accepts the usual Indian formats", () => {
  for (const raw of [
    "98765 43210",
    "+91 98765-43210",
    "09876543210",
    "919876543210",
    "9876543210",
  ])
    expect(normalizePhone(raw)).toBe("919876543210");
  for (const bad of ["abc", "12345", "98765432101234", "5876543210"])
    expect(normalizePhone(bad)).toBe(null);
});

test("validatePatient: field errors with plain messages", () => {
  expect(
    validatePatient({ phone: "12345", name: "", age: "121", gender: "" }),
  ).toEqual({
    ok: false,
    errors: {
      phone: "Enter a 10-digit mobile number",
      name: "Enter the patient's name",
      age: "Age must be 0–120",
      gender: "Choose a gender",
    },
  });
  expect(
    validatePatient({
      phone: "98765 43210",
      name: " Ramesh ",
      age: "45",
      gender: "F",
      area: " ",
      reason: "Fever",
    }),
  ).toEqual({
    ok: true,
    value: {
      phone: "919876543210",
      name: "Ramesh",
      age: 45,
      gender: "F",
      reason: "Fever",
    },
  });
});

test("bookToday: reception booking is saved with source, actor and activity", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const r = await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  expect(r.ok).toBe(true);
  expect(s.appointments[0]).toMatchObject({
    patientPhone: "919876543210",
    patientAge: 45,
    patientGender: "M",
    patientArea: "Tezpur",
    source: "reception",
    createdBy: "Riya (Reception)",
    status: "CONFIRMED",
  });
  expect((await s.activity(DOC.id, { limit: 5 }))[0]).toMatchObject({
    actor: "Riya (Reception)",
    action: "booked",
    staffId: "s-riya",
  });
  if (r.ok) expect(r.notices).toEqual([]); // patient never messaged: nothing sent
});

test("bookToday: a taken, past or other-day slot is refused", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "whatsapp" },
    { label: "Patient (WhatsApp)", staffId: null },
    NOW,
  );
  const taken = {
    ok: false,
    message: "That time was just taken. Pick another.",
  };
  expect(
    await bookToday(
      s,
      DOC,
      {
        ...input,
        phone: "919111111111",
        startsAt: at("14:30"),
        source: "reception",
      },
      RIYA,
      NOW,
    ),
  ).toEqual(taken);
  expect(
    await bookToday(
      s,
      DOC,
      { ...input, startsAt: at("14:40"), source: "reception" },
      RIYA,
      NOW,
    ),
  ).toEqual(taken); // not a slot
  expect(
    await bookToday(
      s,
      DOC,
      { ...input, startsAt: at("10:00"), source: "reception" },
      RIYA,
      new Date(+at("11:00")),
    ),
  ).toEqual(taken); // already past
  expect(
    await bookToday(
      s,
      DOC,
      { ...input, startsAt: atIst("2026-07-31", "14:30"), source: "reception" },
      RIYA,
      NOW,
    ),
  ).toEqual(taken);
  expect(s.appointments).toHaveLength(1);
});

test("bookToday: a patient whose window is open gets a short confirmation", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.touchInbound(DOC.businessPhoneNumberId, "919876543210", NOW);
  const r = await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("15:00"), source: "reception" },
    RIYA,
    NOW,
  );
  if (!r.ok) throw new Error(r.message);
  expect(r.notices).toEqual([
    {
      from: DOC.businessPhoneNumberId,
      to: "919876543210",
      msg: {
        kind: "text",
        body: "You're booked with Dr. Mehta at Sunrise Family Clinic today, 3:00 PM–3:30 PM.",
      },
    },
  ]);
});

test("lastPatientDetails prefills from the newest visit", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(await lastPatientDetails(s, DOC.id, "919876543210")).toBe(null);
  await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  expect(await lastPatientDetails(s, DOC.id, "919876543210")).toEqual({
    name: "Ramesh Kumar",
    age: 45,
    gender: "M",
    area: "Tezpur",
  });
});

test("ownAppointment hides other clinics' visits", async () => {
  const other = {
    ...DOC,
    id: "d2",
    businessPhoneNumberId: "PN2",
    personalPhone: "919000000099",
  };
  const s = createMemoryStore({ doctors: [DOC, other] });
  await bookToday(
    s,
    other,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  const id = s.appointments[0].id;
  expect(await ownAppointment(s, DOC.id, id)).toBe(null);
  expect((await ownAppointment(s, "d2", id))?.id).toBe(id);
});

test("cancelVisits cancels as the doctor, notifies open windows only, logs each", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  await bookToday(
    s,
    DOC,
    {
      ...input,
      phone: "919111111111",
      startsAt: at("15:00"),
      source: "reception",
    },
    RIYA,
    NOW,
  );
  await s.touchInbound(DOC.businessPhoneNumberId, "919111111111", NOW);
  const notices = await cancelVisits(
    s,
    DOC,
    [...s.appointments],
    "Doctor away",
    RIYA,
    NOW,
  );
  expect(notices.map((n) => n.to)).toEqual(["919111111111"]);
  expect(
    s.appointments.map((a) => [a.status, a.cancelledBy, a.cancelReason]),
  ).toEqual([
    ["CANCELLED", "doctor", "Doctor away"],
    ["CANCELLED", "doctor", "Doctor away"],
  ]);
  expect(
    (await s.activity(DOC.id, { limit: 10 })).filter(
      (a) => a.action === "cancelled",
    ),
  ).toHaveLength(2);
});

test("setClosedToday: clash count first, then cancel or keep", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  await bookToday(
    s,
    DOC,
    {
      ...input,
      phone: "919111111111",
      startsAt: at("15:00"),
      source: "reception",
    },
    RIYA,
    NOW,
  );
  expect(await setClosedToday(s, DOC, true, null, RIYA, NOW)).toEqual({
    clash: 2,
    notices: [],
  });
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(false);
  await setClosedToday(s, DOC, true, "cancel", RIYA, NOW);
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(true);
  expect(s.appointments.every((a) => a.status === "CANCELLED")).toBe(true);
  await setClosedToday(s, DOC, false, null, RIYA, NOW);
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(false);
  expect(
    (await s.activity(DOC.id, { limit: 10 })).map((a) => a.action).slice(0, 2),
  ).toEqual(["opened_today", "closed_today"]);
});

test("addBlockRange: clash count first; keep blocks without cancelling", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await bookToday(
    s,
    DOC,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  const r = { start: "14:00", end: "16:00" };
  expect(await addBlockRange(s, DOC, "2026-07-30", r, null, RIYA, NOW)).toEqual(
    { clash: 1, notices: [] },
  );
  await addBlockRange(s, DOC, "2026-07-30", r, "keep", RIYA, NOW);
  expect(s.appointments[0].status).toBe("CONFIRMED");
  expect(await s.blocksBetween(DOC.id, at("14:00"), at("16:00"))).toHaveLength(
    1,
  );
  await addBlockRange(s, DOC, "2026-07-31", "whole", null, RIYA, NOW);
  expect(await s.isClosed(DOC.id, "2026-07-31")).toBe(true);
});

test("validateHours uses the bot's messages", () => {
  const withLunch = { ...DOC, lunchStart: "13:00", lunchEnd: "14:00" };
  expect(
    validateHours(withLunch, "afternoon", { start: "13:30", end: "17:00" }),
  ).toBe(
    "Your lunch break (1:00 PM–2:00 PM) would run into these hours. Change the lunch break first, or type different hours.",
  );
  expect(validateHours(DOC, "lunch", { start: "13:30", end: "14:30" })).toBe(
    "That lunch break (1:30 PM–2:30 PM) runs into your morning hours (10:00 AM–2:00 PM). Put it inside one period or between periods.",
  );
  expect(validateHours(DOC, "morning", { start: "09:00", end: "15:00" })).toBe(
    "That overlaps your afternoon hours (2:00 PM–6:00 PM). Type different hours, or tap a button.",
  );
  expect(validateHours(DOC, "morning", { start: "09:00", end: "13:00" })).toBe(
    null,
  );
  expect(validateHours(DOC, "evening", null)).toBe(null); // Off is always fine
});

// ---- fee per visit ----
test("the fee is saved on each visit at completion; a later fee change never touches old visits", async () => {
  const s = createMemoryStore({ doctors: [{ ...DOC, standardFee: 300 }] });
  const d300 = { ...DOC, standardFee: 300 };
  await bookToday(
    s,
    d300,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  await bookToday(
    s,
    d300,
    {
      ...input,
      phone: "919111111111",
      startsAt: at("15:00"),
      source: "reception",
    },
    RIYA,
    NOW,
  );
  const [a, b] = s.appointments;
  await completeWithoutRx(s, d300, a, NOW, { actor: RIYA });
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    fee: 300,
    completedBy: "Riya (Reception)",
  });
  await s.updateDoctor(DOC.id, { standardFee: 500 });
  await completeWithoutRx(s, { ...DOC, standardFee: 500 }, b, NOW, {
    actor: RIYA,
  });
  expect(s.appointments.map((x) => x.fee)).toEqual([300, 500]);
  expect((await s.activity(DOC.id, { limit: 1 }))[0]).toMatchObject({
    action: "completed",
  });
});

test("a fee typed for one visit overrides the standard fee (e.g. free follow-up)", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const d = { ...DOC, standardFee: 300 };
  await bookToday(
    s,
    d,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  await completeWithoutRx(s, d, s.appointments[0], NOW, {
    fee: 0,
    actor: RIYA,
  });
  expect(s.appointments[0].fee).toBe(0);
});

test("setFee edits a completed visit only, never negative, and logs it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const d = { ...DOC, standardFee: 300 };
  await bookToday(
    s,
    d,
    { ...input, startsAt: at("14:30"), source: "reception" },
    RIYA,
    NOW,
  );
  const id = s.appointments[0].id;
  expect(await setFee(s, d, id, 200, RIYA, NOW)).toEqual({
    ok: false,
    message: "Complete the visit first.",
  });
  await completeWithoutRx(s, d, s.appointments[0], NOW, { actor: RIYA });
  expect(await setFee(s, d, id, -5, RIYA, NOW)).toEqual({
    ok: false,
    message: "Fee must be 0 or more.",
  });
  expect(await setFee(s, d, id, 200, RIYA, NOW)).toEqual({ ok: true });
  expect(s.appointments[0].fee).toBe(200);
  expect((await s.activity(DOC.id, { limit: 1 }))[0]).toMatchObject({
    action: "fee_changed",
    detail: { from: 300, to: 200 },
  });
  const other = { ...DOC, id: "d2" };
  expect(await setFee(s, other, id, 100, RIYA, NOW)).toEqual({
    ok: false,
    message: "This visit no longer exists.",
  });
});
