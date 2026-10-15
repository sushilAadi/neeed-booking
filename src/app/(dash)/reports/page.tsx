import { Rise } from "cube-motion/react";
import { Ban, CheckCircle2, Clock, IndianRupee } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { Ring } from "@/components/ring";
import { requireStaff } from "@/lib/auth/guard";
import {
  buildReports,
  type PeriodKey,
  periodSummary,
} from "@/lib/clinic/reports";
import type { Activity, Appointment } from "@/lib/db/types";
import { fmtDay, fmtTime } from "@/lib/time";
import { CollectionLine } from "./charts";

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

const PERIODS = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
] as const;

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const { who, p: rawP } = await searchParams;
  const p: PeriodKey = PERIODS.some(([k]) => k === rawP)
    ? (rawP as PeriodKey)
    : "month";
  const { store, doctor, now } = await requireStaff();
  const staffId = typeof who === "string" ? who : undefined;
  const [appts, activity, staff] = await Promise.all([
    store.appointmentsBetween(doctor.id, new Date(0), new Date(+now + 864e5)),
    store.activity(doctor.id, { limit: 200, staffId }),
    store.listStaff(doctor.id),
  ]);
  const r = buildReports(appts, now);
  const s = periodSummary(appts, now, p);
  const byId = new Map(appts.map((a) => [a.id, a]));
  const q = (o: Record<string, string>) =>
    `/reports?${new URLSearchParams({ p, ...(staffId ? { who: staffId } : {}), ...o })}`;
  const bars = [
    ["WhatsApp bookings", s.whatsapp, "var(--done-fill)"],
    ["Reception bookings", s.reception, "var(--chart-purple)"],
    ["New patients", s.fresh, "var(--ok)"],
    ["Returning patients", s.returning, "var(--chart-yellow)"],
    ["Cancelled", s.cancelled, "var(--danger)"],
  ] as const;
  const max = Math.max(1, ...bars.map((b) => b[1]));

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-148px)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      <PageHead eyebrow="How the clinic is doing" title="Reports">
        <nav aria-label="Period" className="flex flex-wrap gap-2">
          {PERIODS.map(([k, label]) => (
            <Link
              key={k}
              href={q({ p: k })}
              className="pill"
              aria-current={p === k ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageHead>

      <Rise
        as="section"
        targets="children"
        aria-label="Totals"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {(
          [
            [
              "Collected",
              rupees(s.collection),
              IndianRupee,
              "bg-ok-soft text-ok",
            ],
            [
              "Patients seen",
              String(s.done),
              CheckCircle2,
              "bg-done-soft text-done",
            ],
            ["Waiting", String(s.waiting), Clock, "bg-wait-soft text-wait"],
            [
              "Cancelled",
              String(s.cancelled),
              Ban,
              "bg-danger-soft text-danger",
            ],
          ] as const
        ).map(([label, value, Icon, tone]) => (
          <div
            key={label}
            className="card lift flex items-center gap-4 p-4 md:p-5"
          >
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full ${tone}`}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-muted">{label}</p>
              <p className="display truncate text-[26px] leading-tight font-medium">
                {value}
              </p>
            </div>
          </div>
        ))}
      </Rise>

      <Rise
        targets="children"
        delay={120}
        className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,0.9fr)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <section
          aria-labelledby="status-h"
          className="card card-pad grid content-start gap-3"
        >
          <h2 id="status-h" className="display text-[20px] font-medium">
            Visits
          </h2>
          <Ring waiting={s.waiting} done={s.done} cancelled={s.cancelled} />
        </section>

        <section
          aria-labelledby="money-h"
          className="card card-pad flex min-h-0 flex-col gap-2"
        >
          <div>
            <h2 id="money-h" className="display text-[20px] font-medium">
              Collection
            </h2>
            <p className="text-[13px] text-muted">
              This month {rupees(r.month.collection)} · last 12 months
            </p>
          </div>
          <div className="min-h-44 flex-1">
            <CollectionLine data={r.collectionByMonth} />
          </div>
        </section>

        <section
          aria-labelledby="act-h"
          className="card card-pad flex min-h-0 flex-col gap-3 lg:col-start-3 lg:row-span-2 lg:row-start-1"
        >
          <div>
            <h2 id="act-h" className="display text-[20px] font-medium">
              Activity
            </h2>
            <p className="text-[13px] text-muted">
              Who did what in your clinic, newest first: bookings, completed
              visits, fee changes, closing days and staff changes. Tap a person
              to see only theirs.
            </p>
          </div>
          <nav
            aria-label="Filter activity by person"
            className="flex flex-wrap gap-2"
          >
            <Link
              href={`/reports?p=${p}`}
              className="pill"
              aria-current={!staffId ? "page" : undefined}
            >
              Everyone
            </Link>
            {staff.map((x) => (
              <Link
                key={x.id}
                href={q({ who: x.id })}
                className="pill"
                aria-current={staffId === x.id ? "page" : undefined}
              >
                {x.role === "doctor" ? doctor.name : x.name}
              </Link>
            ))}
          </nav>
          {!activity.length ? (
            <p className="text-[15px] text-muted">
              Nothing yet. Bookings, visits and changes show up here.
            </p>
          ) : (
            <ol className="scroll-area -mx-1 grid content-start gap-2 px-1 lg:flex-1">
              {activity.map((a) => (
                <li key={a.id} className="inner grid gap-0.5 p-3">
                  <p className="text-[14px] font-semibold">
                    {describe(a, byId)}
                  </p>
                  <p className="text-[12px] text-muted">
                    {a.actor} · {fmtDay(a.at)}, {fmtTime(a.at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          aria-labelledby="mix-h"
          className="card card-pad grid content-start gap-3 lg:col-span-2"
        >
          <h2 id="mix-h" className="display text-[20px] font-medium">
            Where patients come from
          </h2>
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {bars.map(([label, n, color]) => (
              <li key={label} className="grid gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-semibold">{n}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n / max) * 100}%`, background: color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </Rise>
    </div>
  );
}
