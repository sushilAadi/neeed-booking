import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { fmtDay } from "@/lib/time";
import { Nav } from "./nav";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { doctor, staff, store, now } = await requireStaff();
  const closed = await store.isClosed(doctor.id, today(now).date);
  return (
    <div className="min-h-dvh md:flex">
      <Nav />
      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="display truncate text-[17px] font-bold">
                {doctor.clinicName}
              </p>
              <p className="truncate text-[13px] text-muted">
                {fmtDay(now)} ·{" "}
                {staff.role === "doctor" ? doctor.name : staff.name}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold ${
                closed ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"
              }`}
            >
              {closed ? "Closed today" : "Open today"}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 pt-5 pb-28 md:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
