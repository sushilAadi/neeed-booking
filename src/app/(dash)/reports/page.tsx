import { Rise } from "cube-motion/react";
import { Ban, CheckCircle2, Clock, IndianRupee } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { PageHead } from "@/components/page-head";
import { Ring } from "@/components/ring";
import { requirePermission } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import {
  buildReports,
  type PeriodKey,
  periodSummary,
} from "@/lib/clinic/reports";
import type { Activity, Appointment } from "@/lib/db/types";
import { fmtDay, fmtTime } from "@/lib/time";
import { type ActivityRow, ActivityTable } from "./activity-table";
import { CollectionLine } from "./charts";

export const metadata: Metadata = { title: "Reports" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const KIND: Record<string, [string, string]> = {
  booked: ["Booking", "badge-wait"],
  completed: ["Visit done", "badge-done"],
  cancelled: ["Cancelled", "badge-cancel"],
  fee_changed: ["Fee", "badge-money"],
  fee_default_changed: ["Fee", "badge-money"],
  closed_today: ["Clinic", "badge-cancel"],
  opened_today: ["Clinic", "badge-money"],
  blocked: ["Clinic", "badge-cancel"],
  hours_changed: ["Settings", "badge-done"],
  rx_setup_changed: ["Settings", "badge-done"],
  staff_added: ["Staff", "badge-done"],
  staff_removed: ["Staff", "badge-cancel"],
  key_reissued: ["Staff", "badge-done"],
  clinic_changed: ["Settings", "badge-done"],
  access_changed: ["Staff", "badge-done"],
};

/** One plain sentence per activity row. */
function describe(a: Activity, appts: Map<string, Appointment>): string {
  const who = a.appointmentId
    ? appts.get(a.appointmentId)?.patientName
    : undefined;
  const d = a.detail as Record<string, unknown>;
  switch (a.action) {
    case "booked":
      return `Booked an appointment for ${who ?? "a patient"}`;
    case "completed":
      return `Finished ${who ?? "a patient"}'s visit`;
    case "cancelled":
      return `Cancelled ${who ?? "a patient"}'s appointment${d.reason ? ` (reason: ${d.reason})` : ""}`;
    case "fee_changed":
      return `Changed ${who ?? "a visit"}'s fee ${d.from == null ? "" : `from ${rupees(Number(d.from))} `}to ${rupees(Number(d.to))}`;
    case "closed_today":
      return "Stopped new bookings for today";
    case "opened_today":
      return "Started taking bookings for today again";
    case "blocked":
      return d.whole
        ? `Blocked the whole day ${d.date} (no bookings)`
        : `Blocked some time on ${d.date ?? "a day"} (no bookings)`;
    case "hours_changed":
      return "Changed the clinic hours";
    case "fee_default_changed":
      return `Set the standard fee to ${rupees(Number(d.to))}`;
    case "rx_setup_changed":
      return "Updated the registration number or signature";
    case "staff_added":
      return `Added ${d.name ?? "a receptionist"}`;
    case "staff_removed":
      return `Removed ${d.name ?? "a receptionist"}`;
    case "access_changed":
      return `Changed what ${d.name ?? "a receptionist"} can do`;
    case "clinic_changed":
      return "Changed the clinic name, doctor name or address";
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
  const { who, p: rawP, view, d: rawD } = await searchParams;
  // A picked calendar day overrides the period pills.
  const day =
    typeof rawD === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawD) ? rawD : "";
  const full = view === "activity";
  const p: PeriodKey = PERIODS.some(([k]) => k === rawP)
    ? (rawP as PeriodKey)
    : "month";
  const { store, doctor, now } = await requirePermission("reports");
  const staffId = typeof who === "string" ? who : undefined;
  const [appts, activity] = await Promise.all([
    store.appointmentsBetween(doctor.id, new Date(0), new Date(+now + 864e5)),
    store.activity(doctor.id, { limit: 200, staffId }),
  ]);
  const r = buildReports(appts, now);
  const s = periodSummary(appts, now, day ? { day } : p);
  const byId = new Map(appts.map((a) => [a.id, a]));
  const rows: ActivityRow[] = activity.map((a) => {
    const [kind, cls] = KIND[a.action] ?? ["Other", "badge-done"];
    return {
      id: a.id,
      when: `${fmtDay(a.at)}, ${fmtTime(a.at)}`,
      who: a.actor,
      kind,
      cls,
      what: describe(a, byId),
    };
  });
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

  if (full)
    return (
      <div className="grid gap-5">
        <PageHead eyebrow="Reports" title="Activity">
          <Link href={`/reports?p=${p}`} className="btn btn-ghost btn-sm">
            Back to overview
          </Link>
        </PageHead>
        <section className="card card-pad grid gap-4" aria-labelledby="log-h">
          <div className="grid gap-1">
            <h2 id="log-h" className="display text-[20px] font-medium">
              Who did what, and when
            </h2>
            <p className="max-w-2xl text-sm text-muted">
              Every time someone books, finishes or cancels a visit, changes a
              fee, closes the clinic for a day or changes settings or staff, a
              row is added here, newest first. "Who" is the person who was
              logged in, or "Patient (WhatsApp)" when a patient did it on
              WhatsApp. Use it to check what happened if something looks wrong.
            </p>
          </div>
          <ActivityTable
            rows={rows}
            className="max-h-[calc(100dvh-420px)] min-h-60"
          />
        </section>
      </div>
    );

  return (
    <div className="grid gap-5">
      <PageHead eyebrow="How the clinic is doing" title="Reports">
        <nav aria-label="Period" className="flex flex-wrap items-center gap-2">
          {PERIODS.map(([k, label]) => (
            <Link
              key={k}
              href={q({ p: k })}
              className="pill"
              aria-current={!day && p === k ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <form action="/reports">
            <DatePicker name="d" value={day} max={today(now).date} />
          </form>
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
        className="grid gap-4 lg:grid-cols-3"
      >
        <section
          aria-labelledby="status-h"
          className="card card-pad grid gap-3"
        >
          <h2 id="status-h" className="display text-[20px] font-medium">
            Visits
          </h2>
          <div className="grid flex-1 place-items-center">
            <Ring
              waiting={s.waiting}
              done={s.done}
              cancelled={s.cancelled}
              large
            />
          </div>
        </section>

        <section
          aria-labelledby="money-h"
          className="card card-pad flex flex-col gap-2"
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

        <section aria-labelledby="mix-h" className="card card-pad grid gap-3">
          <h2 id="mix-h" className="display text-[20px] font-medium">
            Where patients come from
          </h2>
          <ul className="grid gap-2.5">
            {bars.map(([label, n, color]) => (
              <li key={label} className="grid gap-1">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-semibold">{n}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n / max) * 100}%`, background: color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="act-h"
          className="card card-pad grid gap-3 lg:col-span-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="act-h" className="display text-[20px] font-medium">
                Activity
              </h2>
              <p className="text-[13px] text-muted">
                Who did what in your clinic, newest first.
              </p>
            </div>
            <Link
              href={q({ view: "activity" })}
              className="btn btn-ghost btn-sm"
            >
              Open full table with filters
            </Link>
          </div>
          <ActivityTable rows={rows} className="max-h-80" />
        </section>
      </Rise>
    </div>
  );
}
