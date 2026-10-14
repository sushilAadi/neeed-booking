import { expect, test } from "vitest";
import type { Appointment } from "../db/types";
import { atIst } from "../time";
import { buildReports } from "./reports";

const NOW = atIst("2026-10-15", "18:00");
let n = 0;
const visit = (date: string, p: Partial<Appointment> = {}): Appointment => ({
  id: `a${++n}`,
  doctorId: "d1",
  patientPhone: "919000000001",
  patientName: "P",
  startsAt: atIst(date, "10:00"),
  endsAt: atIst(date, "10:30"),
  status: "COMPLETED",
  notes: null,
  cancelReason: null,
  cancelledBy: null,
  prescriptionText: null,
  prescriptionImagePath: null,
  prescriptionPdfPath: null,
  patientAge: null,
  patientGender: null,
  patientArea: null,
  source: "whatsapp",
  fee: 300,
  createdBy: null,
  completedBy: null,
  ...p,
});

test("collection counts only completed fees, today and this IST month", () => {
  const r = buildReports(
    [
      visit("2026-10-15", { fee: 300 }),
      visit("2026-10-15", { fee: null }),
      visit("2026-10-15", { status: "CONFIRMED", fee: 999 }),
      visit("2026-10-02", { fee: 500 }),
      visit("2026-09-30", { fee: 200 }),
    ],
    NOW,
  );
  expect(r.today).toEqual({ collection: 300, seen: 2 });
  expect(r.month).toEqual({ collection: 800, seen: 3 });
  expect(r.collectionByMonth).toHaveLength(12);
  expect(r.collectionByMonth.at(-1)).toEqual({ month: "2026-10", amount: 800 });
  expect(r.collectionByMonth.at(-2)).toEqual({ month: "2026-09", amount: 200 });
  expect(r.collectionByMonth[0]).toEqual({ month: "2025-11", amount: 0 });
});

test("patients per day covers the last 30 days with zeros", () => {
  const r = buildReports(
    [visit("2026-10-15"), visit("2026-10-15"), visit("2026-10-01")],
    NOW,
  );
  expect(r.patientsByDay).toHaveLength(30);
  expect(r.patientsByDay.at(-1)).toEqual({ date: "2026-10-15", count: 2 });
  expect(r.patientsByDay[0]).toEqual({ date: "2026-09-16", count: 0 });
  expect(r.patientsByMonth.at(-1)).toEqual({ month: "2026-10", count: 3 });
});

test("new vs returning by each phone's first-ever appointment", () => {
  const r = buildReports(
    [
      visit("2026-09-10", { patientPhone: "911" }),
      visit("2026-10-03", { patientPhone: "911" }),
      visit("2026-10-04", { patientPhone: "922" }),
      visit("2026-10-05", { patientPhone: "922", status: "CANCELLED" }),
    ],
    NOW,
  );
  expect(r.newVsReturning.at(-1)).toEqual({
    month: "2026-10",
    new: 1,
    returning: 1,
  });
  expect(r.newVsReturning.at(-2)).toEqual({
    month: "2026-09",
    new: 1,
    returning: 0,
  });
});

test("bookings by source and cancellations by who cancelled", () => {
  const r = buildReports(
    [
      visit("2026-10-03", { source: "reception" }),
      visit("2026-10-03", {
        source: "whatsapp",
        status: "CANCELLED",
        cancelledBy: "patient",
      }),
      visit("2026-10-04", { status: "CANCELLED", cancelledBy: "doctor" }),
    ],
    NOW,
  );
  expect(r.bySource.at(-1)).toEqual({
    month: "2026-10",
    whatsapp: 2,
    reception: 1,
  });
  expect(r.cancellations.at(-1)).toEqual({
    month: "2026-10",
    patient: 1,
    doctor: 1,
  });
});
