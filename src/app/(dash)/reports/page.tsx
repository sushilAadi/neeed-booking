import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/guard";
import { buildReports } from "@/lib/clinic/reports";
import type { Activity, Appointment } from "@/lib/db/types";
import { fmtDay, fmtTime } from "@/lib/time";
import { Charts } from "./charts";

export const metadata: Metadata = { title: "Reports" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** One plain sentence per activity row. */
function describe(a: Activity, appts: Map<string, Appointment>): string {
  const who = a.appointmentId
    ? appts.get(a.appointmentId)?.patientName
    : undefined;
  const d = a.detail as Record<string, unknown>;
  switch (a.action) {
    case "booked":
      return `Booked ${who ?? "a patient"}`;
    case "completed":
      return `Completed ${who ?? "a visit"}`;
    case "cancelled":
      return `Cancelled ${who ?? "a visit"}${d.reason ? ` — ${d.reason}` : ""}`;
    case "fee_changed":
      return `Changed ${who ?? "a visit"}'s fee ${d.from == null ? "" : `from ${rupees(Number(d.from))} `}to ${rupees(Number(d.to))}`;
    case "closed_today":
      return "Closed bookings for today";
    case "opened_today":
      return "Opened bookings for today";
    case "blocked":
      return d.whole ? `Blocked ${d.date}` : "Blocked some time";
    case "hours_changed":
      return "Changed clinic hours";
    case "fee_default_changed":
      return `Set the standard fee to ${rupees(Number(d.to))}`;
    case "rx_setup_changed":
      return "Updated prescription setup";
    case "staff_added":
      return `Added ${d.name ?? "a receptionist"}`;
    case "staff_removed":
      return `Removed ${d.name ?? "a receptionist"}`;
    case "key_reissued":
      return `Made a new key for ${d.name ?? "someone"}`;
    default:
      return a.action;
  }
}

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const { who } = await searchParams;
  const { store, doctor, now } = await requireStaff();
  const staffId = typeof who === "string" ? who : undefined;
  const [appts, activity, staff] = await Promise.all([
    store.appointmentsBetween(doctor.id, new Date(0), new Date(+now + 864e5)),
    store.activity(doctor.id, { limit: 200, staffId }),
    store.listStaff(doctor.id),
  ]);
  const r = buildReports(appts, now);
  const byId = new Map(appts.map((a) => [a.id, a]));
  return (
    <div className="grid gap-5">
      <h1 className="display text-[26px] font-bold">Reports</h1>
      <section
        aria-label="Collection and patients"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {[
          ["Collected today", rupees(r.today.collection)],
          ["This month", rupees(r.month.collection)],
          ["Seen today", String(r.today.seen)],
          ["Seen this month", String(r.month.seen)],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="eyebrow">{label}</p>
            <p className="display mt-1 text-[26px] leading-none font-bold">
              {value}
            </p>
          </div>
        ))}
      </section>

      <Charts r={r} />

      <section aria-labelledby="act-h" className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="act-h" className="font-bold">
            Activity
          </h2>
          <nav
            aria-label="Filter activity by person"
            className="flex flex-wrap gap-2"
          >
            <Link
              href="/reports"
              className="chip"
              aria-current={!staffId ? "true" : undefined}
              aria-pressed={!staffId}
            >
              Everyone
            </Link>
            {staff.map((s) => (
              <Link
                key={s.id}
                href={`/reports?who=${s.id}`}
                className="chip"
                aria-pressed={staffId === s.id}
              >
                {s.role === "doctor" ? doctor.name : s.name}
              </Link>
            ))}
          </nav>
        </div>
        {!activity.length ? (
          <p className="text-[15px] text-muted">
            Nothing yet. Bookings, visits and changes show up here.
          </p>
        ) : (
          <ol className="grid divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="grid gap-0.5 py-2.5">
                <p className="text-[15px]">{describe(a, byId)}</p>
                <p className="text-[13px] text-muted">
                  {a.actor} · {fmtDay(a.at)}, {fmtTime(a.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
