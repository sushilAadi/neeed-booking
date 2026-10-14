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
  dayStart: "10:00",
  dayEnd: "22:00",
  slotMinutes: 30,
  morningEnd: "14:00",
  afternoonEnd: "18:00",
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
