import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { PageHead } from "@/components/page-head";
import { requirePermission } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { searchVisits } from "@/lib/clinic/history";
import type { Appointment } from "@/lib/db/types";
import { addDays, atIst, fmtDate, fmtPhone, fmtTime } from "@/lib/time";
import { PatientPanel, type Visit, VisitTable } from "./history-view";

export const metadata: Metadata = { title: "History" };

const PERIODS = [
  ["week", "This week"],
  ["month", "This month"],
  ["all", "All"],
] as const;
type Period = (typeof PERIODS)[number][0];
const STEP = 50;

const toVisit = (a: Appointment): Visit => ({
  id: a.id,
  date: fmtDate(a.startsAt),
  time: fmtTime(a.startsAt),
  name: a.patientName,
  phone: a.patientPhone,
  phoneText: fmtPhone(a.patientPhone),
  age: a.patientAge,
  gender: a.patientGender,
  area: a.patientArea,
  reason: a.notes,
  status: a.status,
  fee: a.fee,
  source: a.source,
  completedBy: a.completedBy,
  hasRx: !!a.prescriptionPdfPath,
});

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  const q = one("q").slice(0, 80);
  const p: Period = PERIODS.some(([k]) => k === one("p"))
    ? (one("p") as Period)
    : "month";
  const n = Math.min(Math.max(Number(one("n")) || STEP, STEP), 500);
  const { store, doctor, now } = await requirePermission("history");
  const t = today(now);
  // A picked calendar day overrides the period pills.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(one("d")) ? one("d") : "";
  const from = d
    ? atIst(d, "00:00")
    : p === "week"
      ? atIst(addDays(t.date, -6), "00:00")
      : p === "month"
        ? atIst(`${t.date.slice(0, 8)}01`, "00:00")
        : new Date("2020-01-01T00:00:00Z");
  const { visits, more } = await searchVisits(
    store,
    doctor.id,
    q,
    { from, to: d ? atIst(addDays(d, 1), "00:00") : t.to },
    { limit: n },
  );
  const selId = one("v");
  const sel = visits.find((v) => v.id === selId) ?? null;
  const all = sel
    ? (await store.patientAppointments(doctor.id, sel.patientPhone)).map(
        toVisit,
      )
    : [];
  const href = (o: Record<string, string>) =>
    `/history?${new URLSearchParams({ ...(q ? { q } : {}), ...(d ? { d } : { p }), ...o }).toString()}`;

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-100px)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <PageHead eyebrow="Every visit, searchable" title="History">
        <nav aria-label="Period" className="flex flex-wrap gap-2">
          {PERIODS.map(([k, label]) => (
            <Link
              key={k}
              href={`/history?${new URLSearchParams({ ...(q ? { q } : {}), p: k })}`}
              className="pill"
              aria-current={!d && p === k ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageHead>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
        <section
          aria-labelledby="visits-h"
          className="card card-pad flex min-h-0 flex-col gap-4"
        >
          <search>
            <form action="/history" className="flex flex-wrap gap-2">
              {!d && <input type="hidden" name="p" value={p} />}
              <label className="relative min-w-48 flex-1">
                <span className="sr-only">Search by phone number or name</span>
                <Search
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Phone number or name"
                  className="field pl-11"
                />
              </label>
              <DatePicker name="d" value={d} max={t.date} />
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </form>
          </search>
          <h2 id="visits-h" className="text-sm font-semibold text-muted">
            {visits.length}
            {more ? "+" : ""} visit{visits.length === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}
            {d ? ` on ${fmtDate(atIst(d, "12:00"))}` : ""}
          </h2>
          {!visits.length ? (
            <p className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
              No visits found. Try another number or name, or pick All.
            </p>
          ) : (
            <>
              <VisitTable
                rows={visits.map(toVisit)}
                selectedId={selId || null}
                base={href({ n: String(n) })}
              />
              {more && (
                <Link
                  href={href({
                    n: String(n + STEP),
                    ...(selId ? { v: selId } : {}),
                  })}
                  scroll={false}
                  className="btn btn-ghost btn-sm justify-self-center"
                >
                  Load more
                </Link>
              )}
            </>
          )}
        </section>

        <PatientPanel
          visits={all}
          selectedId={sel?.id ?? null}
          closeHref={href({ n: String(n) })}
        />
      </div>
    </div>
  );
}
