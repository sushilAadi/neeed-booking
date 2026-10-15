import { requireStaff } from "@/lib/auth/guard";
import { can, PERMS } from "@/lib/auth/permissions";
import { today } from "@/lib/bot/ctx";
import { fmtDay } from "@/lib/time";
import { Nav } from "./nav";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { doctor, staff, store, now } = await requireStaff();
  const [closed, logoUrl] = await Promise.all([
    store.isClosed(doctor.id, today(now).date),
    doctor.logoPath
      ? store.signedUrl("signatures", doctor.logoPath).catch(() => null)
      : null,
  ]);
  const who = staff.role === "doctor" ? doctor.name : staff.name;
  const initials = who
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="min-h-dvh md:flex">
      <Nav
        logoUrl={logoUrl}
        clinic={doctor.clinicName}
        allowed={PERMS.map(([k]) => k).filter((k) => can(staff, k))}
      />
      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-20 border-b border-line pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-xl border border-line bg-surface object-contain p-0.5 md:hidden"
                />
              )}
              <div className="min-w-0">
                <p className="display truncate text-[17px] font-bold md:text-[19px]">
                  {doctor.clinicName}
                </p>
                <p className="truncate text-[13px] text-muted">{fmtDay(now)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <span className="badge badge-done py-2 sm:hidden">
                {staff.role === "doctor" ? "Doctor" : "Reception"}
              </span>
              <span
                className={`badge ${closed ? "badge-cancel" : "badge-money"} py-2`}
              >
                {closed ? "Closed today" : "Open today"}
              </span>
              <div className="hidden items-center gap-3 rounded-full border border-line bg-surface py-1.5 pr-4 pl-1.5 shadow-[var(--shadow)] sm:flex">
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-full bg-wait-soft text-[13px] font-bold text-wait"
                >
                  {initials}
                </span>
                <span className="leading-tight">
                  <span className="block text-[14px] font-semibold">{who}</span>
                  <span className="block text-[12px] text-muted">
                    Logged in as{" "}
                    {staff.role === "doctor" ? "doctor" : "receptionist"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="px-4 pt-4 pb-32 md:px-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
