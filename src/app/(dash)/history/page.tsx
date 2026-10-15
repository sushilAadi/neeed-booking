import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { requireStaff } from "@/lib/auth/guard";
import { today } from "@/lib/bot/ctx";
import { searchVisits } from "@/lib/clinic/history";
import type { Appointment } from "@/lib/db/types";
import { addDays, atIst, fmtDate, fmtPhone, fmtTime } from "@/lib/time";
import { PatientPanel, type Visit } from "./history-view";

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
  const { store, doctor, now } = await requireStaff();
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
    <div className="grid gap-5 lg:h-[calc(100dvh-148px)] lg:grid-rows-[auto_minmax(0,1fr)]">
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

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
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
              <label className="shrink-0">
                <span className="sr-only">Visits on date</span>
                <input
                  type="date"
                  name="d"
                  defaultValue={d}
                  max={t.date}
                  className="field w-[160px] px-3"
                />
              </label>
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
            <ol className="scroll-area -mx-2 grid content-start gap-2 px-2 lg:flex-1">
              {visits.map((a) => (
                <li key={a.id}>
                  <Link
                    href={href({ v: a.id, n: String(n) })}
                    scroll={false}
                    aria-current={a.id === selId ? "true" : undefined}
                    className={`inner lift grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 ${a.id === selId ? "ring-2 ring-ink" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {a.patientName}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {fmtDate(a.startsAt)} · {fmtTime(a.startsAt)} ·{" "}
                        {fmtPhone(a.patientPhone)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {a.fee !== null && (
                        <span className="text-sm font-semibold">
                          ₹{a.fee.toLocaleString("en-IN")}
                        </span>
                      )}
                      <Badge status={a.status} />
                    </span>
                  </Link>
                </li>
              ))}
              {more && (
                <li className="pt-2 text-center">
                  <Link
                    href={href({
                      n: String(n + STEP),
                      ...(selId ? { v: selId } : {}),
                    })}
                    scroll={false}
                    className="btn btn-ghost btn-sm"
                  >
                    Load more
                  </Link>
                </li>
              )}
            </ol>
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

function Badge({ status }: { status: Appointment["status"] }) {
  const [t, c] = {
    CONFIRMED: ["Waiting", "badge-wait"],
    COMPLETED: ["Done", "badge-done"],
    CANCELLED: ["Cancelled", "badge-cancel"],
  }[status];
  return <span className={`badge ${c}`}>{t}</span>;
}
