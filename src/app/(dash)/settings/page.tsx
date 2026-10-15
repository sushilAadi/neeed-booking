import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { PERIODS, periodHours } from "@/lib/slots";
import { addDays, atIst, fmtDate } from "@/lib/time";
import { BlockTime, Fee, Hours, RxSetup, StaffList } from "./sections";

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
  const sigUrl =
    isDoctor && doctor.signaturePath
      ? await store
          .signedUrl("signatures", doctor.signaturePath)
          .catch(() => null)
      : null;

  return (
    <div className="grid gap-5">
      <h1 className="display text-[28px] font-bold">Settings</h1>
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
      <Fee initial={doctor.standardFee} />
      <BlockTime
        days={days}
        off={PERIODS.filter((p) => !periodHours(doctor, p))}
      />
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
                lastActive: p.lastActiveAt ? fmtDate(p.lastActiveAt) : "Never",
              }))}
          />
        </>
      )}
      <form action="/logout" method="post">
        <button type="submit" className="btn btn-ghost w-full">
          <LogOut size={18} aria-hidden /> Log out
        </button>
      </form>
    </div>
  );
}
