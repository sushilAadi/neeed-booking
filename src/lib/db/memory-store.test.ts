import { expect, test } from "vitest";
import { atIst } from "../time";
import { createMemoryStore } from "./memory-store";
import type { Appointment, Doctor, NewAppointment } from "./types";

const doc: Doctor = {
  id: "d1",
  name: "Dr. A",
  clinicName: "Clinic",
  businessPhoneNumberId: "PN",
  personalPhone: "919000000001",
  registrationNumber: null,
  signaturePath: null,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  morningStart: "10:00",
  morningEnd: "14:00",
  afternoonStart: "14:00",
  afternoonEnd: "18:00",
  eveningStart: "18:00",
  eveningEnd: "22:00",
  lunchStart: null,
  lunchEnd: null,
  slotMinutes: 30,
  hoursSet: true,
  standardFee: 0,
  address: null,
};
const newApt: NewAppointment = {
  doctorId: "d1",
  patientPhone: "910000000001",
  patientName: "Raj",
  startsAt: atIst("2026-07-30", "14:30"),
  endsAt: atIst("2026-07-30", "15:00"),
  notes: null,
};

test("second CONFIRMED booking on the same slot is slot_taken; a cancelled one frees it", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  const a = await s.createAppointment(newApt);
  expect(
    await s.createAppointment({ ...newApt, patientPhone: "910000000002" }),
  ).toBe("slot_taken");
  await s.updateAppointment((a as Appointment).id, { status: "CANCELLED" });
  expect(
    await s.createAppointment({ ...newApt, patientPhone: "910000000002" }),
  ).not.toBe("slot_taken");
});
test("markProcessed is true once, then false", async () => {
  const s = createMemoryStore();
  expect(await s.markProcessed("wamid.1")).toBe(true);
  expect(await s.markProcessed("wamid.1")).toBe(false);
});
test("conversation defaults, save keeps lastInboundAt, touchInbound sets it", async () => {
  const s = createMemoryStore();
  expect(await s.getConversation("PN", "u")).toEqual({
    phoneNumberId: "PN",
    waUser: "u",
    state: "idle",
    ctx: {},
    lastInboundAt: null,
  });
  const at = new Date("2026-07-30T00:00:00Z");
  await s.touchInbound("PN", "u", at);
  await s.saveConversation({
    phoneNumberId: "PN",
    waUser: "u",
    state: "chat",
    ctx: { a: 1 },
    lastInboundAt: null,
  });
  expect(await s.getConversation("PN", "u")).toMatchObject({
    state: "chat",
    ctx: { a: 1 },
    lastInboundAt: at,
  });
});

test("staff: create, find by key hash, deactivate", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  const st = await s.createStaff({
    doctorId: "d1",
    role: "reception",
    name: "Riya",
    keyHash: "h1",
  });
  expect(st).toMatchObject({ role: "reception", keyVersion: 1, active: true });
  expect((await s.staffByKeyHash("h1"))?.id).toBe(st.id);
  expect(await s.staffByKeyHash("nope")).toBe(null);
  await s.updateStaff(st.id, { active: false, keyVersion: 2 });
  expect(await s.staffById(st.id)).toMatchObject({
    active: false,
    keyVersion: 2,
  });
  expect((await s.listStaff("d1")).map((x) => x.name)).toEqual(["Riya"]);
});

test("activity is newest first and filters by staff", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  const base = { doctorId: "d1", appointmentId: null, detail: {} };
  await s.logActivity(
    { ...base, actor: "A", staffId: "s1", action: "booked" },
    new Date(1000),
  );
  await s.logActivity(
    { ...base, actor: "B", staffId: "s2", action: "cancelled" },
    new Date(2000),
  );
  expect((await s.activity("d1", { limit: 10 })).map((a) => a.actor)).toEqual([
    "B",
    "A",
  ]);
  expect(
    (await s.activity("d1", { limit: 10, staffId: "s1" })).map((a) => a.action),
  ).toEqual(["booked"]);
  expect(await s.activity("d1", { limit: 1 })).toHaveLength(1);
});

test("login failures count only since the given time", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  await s.addLoginFailure("1.2.3.4", new Date(1000));
  await s.addLoginFailure("1.2.3.4", new Date(5000));
  await s.addLoginFailure("9.9.9.9", new Date(5000));
  expect(await s.loginFailures("1.2.3.4", new Date(2000))).toBe(1);
});

test("new appointment fields are stored; source defaults to whatsapp", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  const a = await s.createAppointment(newApt);
  expect(a).toMatchObject({
    source: "whatsapp",
    patientAge: null,
    fee: null,
    createdBy: null,
  });
  const b = await s.createAppointment({
    ...newApt,
    startsAt: atIst("2026-07-30", "15:00"),
    patientAge: 45,
    patientGender: "M",
    patientArea: "Tezpur",
    source: "reception",
    createdBy: "Riya (Reception)",
  });
  expect(b).toMatchObject({
    patientAge: 45,
    patientGender: "M",
    patientArea: "Tezpur",
    source: "reception",
    createdBy: "Riya (Reception)",
  });
});
