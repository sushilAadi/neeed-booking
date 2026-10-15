import type { Metadata } from "next";
import { PageHead } from "@/components/page-head";
import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { fmtPhone, fmtTime } from "@/lib/time";
import { freeSlotGroups } from "./actions";
import { AddForm, type Booked } from "./form";

export const metadata: Metadata = { title: "Add patient" };

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string | string[] }>;
}) {
  const { phone } = await searchParams;
  const { store, doctor, now } = await requireStaff();
  const t = today(now);
  const booked: Booked[] = (
    await store.appointmentsBetween(doctor.id, t.from, t.to)
  ).map((a) => ({
    id: a.id,
    time: fmtTime(a.startsAt),
    name: a.patientName,
    phone: fmtPhone(a.patientPhone),
    status: a.status,
  }));
  return (
    <div className="grid gap-5">
      <PageHead
        eyebrow="For patients who call or walk in · today only"
        title="Add patient"
      />
      <AddForm
        initialSlots={await freeSlotGroups()}
        initialPhone={typeof phone === "string" ? phone.slice(0, 20) : ""}
        bookings={booked}
      />
    </div>
  );
}
