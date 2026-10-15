import { Rise } from "cube-motion/react";
import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { PageHead } from "@/components/page-head";
import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { PERIODS, periodHours } from "@/lib/slots";
import { addDays, atIst, fmtDate, fmtPhone } from "@/lib/time";
import {
  BlockTime,
  ClinicDetails,
  Fee,
  Hours,
  RxSetup,
  StaffList,
} from "./sections";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const { doctor, staff, store, now } = await requireStaff();
  const isDoctor = staff.role === "doctor";
  const first = today(now).date;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(first, i);
    return {
      date,
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : new Intl.DateTimeFormat("en-IN", {
                weekday: "short",
                day: "numeric",
                timeZone: "Asia/Kolkata",
              }).format(atIst(date, "12:00")),
    };
  });
  const people = isDoctor ? await store.listStaff(doctor.id) : [];
  const logoUrl = doctor.logoPath
    ? await store.signedUrl("signatures", doctor.logoPath).catch(() => null)
    : null;
  const sigUrl =
    isDoctor && doctor.signaturePath
      ? await store
          .signedUrl("signatures", doctor.signaturePath)
          .catch(() => null)
      : null;

  return (
    <div className="grid gap-5">
      <PageHead
        eyebrow="Clinic hours, fees, prescription setup and staff"
        title="Settings"
      />
      <Rise targets="children" className="grid gap-4">
        {isDoctor && (
          <ClinicDetails
            clinicName={doctor.clinicName}
            name={doctor.name}
            address={doctor.address ?? ""}
            phone={fmtPhone(doctor.personalPhone)}
            logoUrl={logoUrl}
          />
        )}
        <Hours
          initial={{
            morning: periodHours(doctor, "morning"),
            afternoon: periodHours(doctor, "afternoon"),
            evening: periodHours(doctor, "evening"),
            lunch:
              doctor.lunchStart && doctor.lunchEnd
                ? { start: doctor.lunchStart, end: doctor.lunchEnd }
                : null,
            slotMinutes: doctor.slotMinutes,
          }}
        />
        <div
          className={`grid gap-4 lg:items-start ${isDoctor ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" : ""}`}
        >
          {isDoctor && <Fee initial={doctor.standardFee} />}
          <BlockTime
            days={days}
            off={PERIODS.filter((p) => !periodHours(doctor, p))}
          />
        </div>
        {isDoctor && (
          <>
            <RxSetup reg={doctor.registrationNumber ?? ""} sigUrl={sigUrl} />
            <StaffList
              me={staff.id}
              people={people
                .filter((p) => p.active)
                .map((p) => ({
                  id: p.id,
                  name: p.role === "doctor" ? `${doctor.name} (you)` : p.name,
                  role: p.role,
                  added: fmtDate(p.createdAt),
                  lastActive: p.lastActiveAt
                    ? fmtDate(p.lastActiveAt)
                    : "Never",
                }))}
            />
          </>
        )}
      </Rise>
      <form action="/logout" method="post" className="md:hidden">
        <button type="submit" className="btn btn-ghost w-full">
          <LogOut size={18} aria-hidden /> Log out
        </button>
      </form>
    </div>
  );
}
