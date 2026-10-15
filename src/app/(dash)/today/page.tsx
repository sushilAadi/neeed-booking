import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guard";
import { can, PERMS } from "@/lib/auth/permissions";
import { today } from "@/lib/bot/ctx";
import { periodOf } from "@/lib/slots";
import { fmtTime } from "@/lib/time";
import { type Card, TodayView } from "./today-view";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const { store, doctor, staff, now } = await requireStaff();
  const t = today(now);
  const [appts, closed] = await Promise.all([
    store.appointmentsBetween(doctor.id, t.from, t.to),
    store.isClosed(doctor.id, t.date),
  ]);
  const cards: Card[] = appts.map((a) => ({
    id: a.id,
    time: fmtTime(a.startsAt),
    end: fmtTime(a.endsAt),
    group: periodOf(doctor, { start: a.startsAt, end: a.endsAt }) ?? "other",
    name: a.patientName,
    age: a.patientAge,
    gender: a.patientGender,
    phone: a.patientPhone,
    source: a.source,
    status: a.status,
    fee: a.fee,
    reason: a.notes,
    createdBy: a.createdBy,
    completedBy: a.completedBy,
    hasRx: !!a.prescriptionPdfPath,
  }));
  const done = cards.filter((c) => c.status === "COMPLETED");
  return (
    <TodayView
      perms={PERMS.map(([k]) => k).filter((k) => can(staff, k))}
      cards={cards}
      closed={closed}
      standardFee={doctor.standardFee}
      stats={{
        waiting: cards.filter((c) => c.status === "CONFIRMED").length,
        done: done.length,
        cancelled: cards.filter((c) => c.status === "CANCELLED").length,
        collection: done.reduce((n, c) => n + (c.fee ?? 0), 0),
      }}
    />
  );
}
