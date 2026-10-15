import { Rise } from "cube-motion/react";
import { Clock, FileSignature, IndianRupee, LogOut, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { PERIODS, periodHours } from "@/lib/slots";
import { addDays, atIst, fmtDate } from "@/lib/time";
import { BlockTime, Fee, Hours, RxSetup, StaffList } from "./sections";

export const metadata: Metadata = { title: "Settings" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
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

  const TABS = [
    ["hours", "Clinic hours", Clock],
    ["fees", "Fee and block time", IndianRupee],
    ...(isDoctor
      ? ([
          ["rx", "Prescription", FileSignature],
          ["staff", "Staff", Users],
        ] as const)
      : []),
  ] as const;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "hours";

  return (
    <div className="grid gap-5">
      <PageHead
        eyebrow="Clinic hours, fees, prescriptions and staff"
        title="Settings"
      />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {TABS.map(([k, label, Icon]) => (
          <Link
            key={k}
            href={`/settings?tab=${k}`}
            className="pill"
            aria-current={tab === k ? "page" : undefined}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
      <Rise
        key={tab}
        targets="children"
        className={`grid gap-4 ${tab === "staff" ? "max-w-5xl" : "max-w-3xl"}`}
      >
        {tab === "hours" && (
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
        )}
        {tab === "fees" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
            <Fee initial={doctor.standardFee} />
            <BlockTime
              days={days}
              off={PERIODS.filter((p) => !periodHours(doctor, p))}
            />
          </div>
        )}
        {tab === "rx" && isDoctor && (
          <RxSetup reg={doctor.registrationNumber ?? ""} sigUrl={sigUrl} />
        )}
        {tab === "staff" && isDoctor && (
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
