"use client";

import { Morph, Rise } from "cube-motion/react";
import {
  Ban,
  CheckCircle2,
  Clock,
  IndianRupee,
  Phone,
  Search,
  Stethoscope,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PageHead } from "@/components/page-head";
import { Ring } from "@/components/ring";
import { Sheet } from "@/components/sheet";
import type { Gender, Source, Status } from "@/lib/db/types";
import { cancelAction, feeAction, setClosedAction } from "./actions";

export type Card = {
  id: string;
  time: string;
  end: string;
  group: "morning" | "afternoon" | "evening" | "other";
  name: string;
  age: number | null;
  gender: Gender | null;
  phone: string;
  source: Source;
  status: Status;
  fee: number | null;
  reason: string | null;
  createdBy: string | null;
  completedBy: string | null;
  hasRx: boolean;
};

const GROUPS = [
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["evening", "Evening"],
  ["other", "Other times"],
] as const;
const GENDER = { M: "Male", F: "Female", O: "Other" } as const;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const phoneText = (p: string) =>
  p.startsWith("91") && p.length === 12
    ? `+91 ${p.slice(2, 7)} ${p.slice(7)}`
    : `+${p}`;

type Pending =
  | { kind: "cancel"; card: Card }
  | { kind: "fee"; card: Card }
  | { kind: "close"; clash: number }
  | null;

export function TodayView(p: {
  cards: Card[];
  closed: boolean;
  standardFee: number;
  stats: {
    waiting: number;
    done: number;
    cancelled: number;
    collection: number;
  };
}) {
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [toast, setToast] = useState("");
  const [busy, start] = useTransition();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return p.cards;
    return p.cards.filter(
      (c) =>
        c.name.toLowerCase().replace(/\s+/g, "").includes(s) ||
        c.phone.includes(s.replace(/^\+/, "")),
    );
  }, [q, p.cards]);

  const run = (
    fn: () => Promise<{ ok: boolean; message: string; clash?: number }>,
  ) =>
    start(async () => {
      const r = await fn();
      if (r.clash) {
        setPending({ kind: "close", clash: r.clash });
        return;
      }
      setPending(null);
      setToast(r.message);
      setTimeout(() => setToast(""), 3500);
    });

  const [period, setPeriod] = useState<Card["group"] | "all">("all");
  const listed = shown.filter((c) => period === "all" || c.group === period);
  const next = p.cards.find((c) => c.status === "CONFIRMED");
  const periods = GROUPS.filter(([g]) => p.cards.some((c) => c.group === g));

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-148px)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      <PageHead eyebrow="Your clinic desk for today" title="Today">
        <button
          type="button"
          role="switch"
          aria-checked={!p.closed}
          disabled={busy}
          onClick={() => run(() => setClosedAction(!p.closed, null))}
          className="btn btn-ghost btn-sm gap-3"
        >
          <Morph active={p.closed} off="Taking bookings" on="Closed today" />
          <span
            aria-hidden
            className={`relative h-6 w-10 rounded-full transition-colors ${p.closed ? "bg-sunk" : "bg-accent"}`}
          >
            <span
              className={`absolute top-1 left-1 size-4 rounded-full bg-surface shadow transition-transform ${p.closed ? "" : "translate-x-4"}`}
            />
          </span>
        </button>
        <Link href="/add" className="btn btn-primary btn-sm">
          <UserPlus size={18} strokeWidth={1.75} aria-hidden /> Add patient
        </Link>
      </PageHead>

      <Rise
        as="section"
        targets="children"
        aria-label="Today at a glance"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Stat
          label="Waiting"
          value={String(p.stats.waiting)}
          Icon={Clock}
          tone="wait"
        />
        <Stat
          label="Done"
          value={String(p.stats.done)}
          Icon={CheckCircle2}
          tone="done"
        />
        <Stat
          label="Cancelled"
          value={String(p.stats.cancelled)}
          Icon={Ban}
          tone="cancel"
        />
        <Stat
          label="Collected"
          value={rupees(p.stats.collection)}
          Icon={IndianRupee}
          tone="money"
        />
      </Rise>

      <Rise
        targets="children"
        delay={120}
        className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
      >
        <section
          aria-labelledby="queue-h"
          className="card card-pad flex min-h-0 flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="queue-h" className="display text-[22px] font-medium">
              Queue
              <span className="ml-2 text-[15px] text-muted">
                {p.stats.waiting} waiting · {p.cards.length} total
              </span>
            </h2>
            {periods.length > 1 && (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Part of day</legend>
                {[["all", "All"] as const, ...periods].map(([g, t]) => (
                  <button
                    key={g}
                    type="button"
                    className="pill"
                    aria-pressed={period === g}
                    onClick={() => setPeriod(g)}
                  >
                    {t}
                  </button>
                ))}
              </fieldset>
            )}
          </div>
          <label className="relative block">
            <span className="sr-only">Search by name or number</span>
            <Search
              size={18}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or number"
              className="field pl-11"
            />
          </label>
          {!p.cards.length ? (
            <div className="grid flex-1 place-items-center gap-3 p-8 text-center">
              <Stethoscope className="text-muted" size={28} aria-hidden />
              <p className="font-semibold">No patients yet today</p>
              <p className="max-w-xs text-sm text-muted">
                Add a patient who called, or share your WhatsApp number so
                patients can book themselves.
              </p>
            </div>
          ) : (
            <ol className="scroll-area -mx-2 grid content-start gap-2 px-2 lg:flex-1">
              {listed.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  onCancel={() => setPending({ kind: "cancel", card: c })}
                  onFee={() => setPending({ kind: "fee", card: c })}
                />
              ))}
              {!listed.length && (
                <li className="p-6 text-center text-sm text-muted">
                  No patient matches “{q}”.
                </li>
              )}
            </ol>
          )}
        </section>

        <div className="grid min-h-0 content-start gap-4">
          <section
            aria-labelledby="next-h"
            className="card card-pad grid gap-4"
          >
            <h2 id="next-h" className="eyebrow">
              Next patient
            </h2>
            {next ? (
              <>
                <div className="flex items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-wait-soft text-[17px] font-bold text-wait">
                    {next.time.replace(/ (AM|PM)$/, "")}
                  </span>
                  <div className="min-w-0">
                    <p className="display truncate text-[20px] font-medium">
                      {next.name}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {[facts(next), next.reason].filter(Boolean).join(" · ") ||
                        next.time}
                    </p>
                  </div>
                </div>
                <Link href={`/visit/${next.id}`} className="btn btn-primary">
                  <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden /> Mark
                  complete
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted">Nobody waiting right now.</p>
            )}
          </section>
          <section
            aria-labelledby="ring-h"
            className="card card-pad grid gap-2"
          >
            <h2 id="ring-h" className="eyebrow">
              Today's visits
            </h2>
            <Ring
              waiting={p.stats.waiting}
              done={p.stats.done}
              cancelled={p.stats.cancelled}
            />
          </section>
        </div>
      </Rise>

      <Sheet
        open={pending?.kind === "close"}
        onClose={() => setPending(null)}
        title="Close today?"
      >
        <p className="text-[15px] text-muted">
          {pending?.kind === "close" ? pending.clash : 0} confirmed booking(s)
          today. What should happen to them?
        </p>
        <div className="grid gap-2">
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => run(() => setClosedAction(true, "cancel"))}
          >
            Cancel them and tell patients
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => run(() => setClosedAction(true, "keep"))}
          >
            Keep them, stop new bookings
          </button>
        </div>
      </Sheet>

      <CancelSheet
        key={pending?.kind === "cancel" ? pending.card.id : "cancel"}
        pending={pending}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={(id, reason) => run(() => cancelAction(id, reason))}
      />
      <FeeSheet
        key={pending?.kind === "fee" ? pending.card.id : "fee"}
        pending={pending}
        busy={busy}
        onClose={() => setPending(null)}
        onSave={(id, fee) => run(() => feeAction(id, fee))}
      />

      <Rise
        show={!!toast}
        className="pointer-events-none fixed inset-x-4 bottom-28 z-40 mx-auto max-w-md md:bottom-8"
      >
        <output
          aria-live="polite"
          className="block rounded-full bg-ink px-5 py-3 text-center text-[15px] font-semibold text-bg shadow-lg"
        >
          {toast}
        </output>
      </Rise>
    </div>
  );
}

const facts = (c: Card) =>
  [c.age !== null ? `${c.age} y` : null, c.gender ? GENDER[c.gender] : null]
    .filter(Boolean)
    .join(" · ");

const TONE = {
  wait: "bg-wait-soft text-wait",
  done: "bg-done-soft text-done",
  cancel: "bg-danger-soft text-danger",
  money: "bg-ok-soft text-ok",
} as const;

function Stat(p: {
  label: string;
  value: string;
  Icon: typeof Clock;
  tone: keyof typeof TONE;
}) {
  return (
    <div className="card lift flex items-center gap-4 p-4 md:p-5">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-full ${TONE[p.tone]}`}
      >
        <p.Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-muted">{p.label}</p>
        <p className="display truncate text-[26px] leading-tight font-medium">
          {p.value}
        </p>
      </div>
    </div>
  );
}

function Row(p: { c: Card; onCancel: () => void; onFee: () => void }) {
  const { c } = p;
  const done = c.status === "COMPLETED";
  const off = c.status === "CANCELLED";
  return (
    <li className="inner lift grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
      <div className="text-center">
        <p className="display text-[18px] leading-tight font-medium">
          {c.time.replace(/ (AM|PM)$/, "")}
        </p>
        <p className="text-[12px] font-semibold text-muted">
          {c.time.slice(-2)}
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`truncate font-semibold ${off ? "text-muted line-through" : ""}`}
          >
            {c.name}
          </p>
          <StatusBadge status={c.status} />
        </div>
        <p className="truncate text-[13px] text-muted">
          {[facts(c), c.reason].filter(Boolean).join(" · ") || "No details"}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
          <a
            href={`tel:+${c.phone}`}
            className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline"
          >
            <Phone size={14} aria-hidden /> {phoneText(c.phone)}
          </a>
          <span>{c.source === "whatsapp" ? "WhatsApp" : "Reception"}</span>
          {done && c.completedBy ? (
            <span>Completed by {c.completedBy}</span>
          ) : c.createdBy && c.source === "reception" ? (
            <span>Added by {c.createdBy}</span>
          ) : null}
        </p>
      </div>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
        {c.status === "CONFIRMED" && (
          <>
            <Link href={`/visit/${c.id}`} className="btn btn-primary btn-sm">
              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden /> Complete
            </Link>
            <button
              type="button"
              onClick={p.onCancel}
              className="btn-icon"
              aria-label={`Cancel ${c.name}'s visit`}
            >
              <Ban size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </>
        )}
        {done && (
          <button
            type="button"
            onClick={p.onFee}
            className="btn btn-ghost btn-sm"
            aria-label={`${c.fee === null ? "Add fee" : rupees(c.fee)}, edit fee for ${c.name}`}
          >
            {c.fee === null ? "Add fee" : rupees(c.fee)}
            <IndianRupee size={14} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const [t, cls] = {
    CONFIRMED: ["Waiting", "badge-wait"],
    COMPLETED: ["Done", "badge-done"],
    CANCELLED: ["Cancelled", "badge-cancel"],
  }[status];
  return <span className={`badge shrink-0 ${cls}`}>{t}</span>;
}

function CancelSheet(p: {
  pending: Pending;
  busy: boolean;
  onClose: () => void;
  onConfirm: (id: string, reason: string) => void;
}) {
  const card = p.pending?.kind === "cancel" ? p.pending.card : null;
  const [reason, setReason] = useState("");
  return (
    <Sheet
      open={!!card}
      onClose={p.onClose}
      title={card ? `Cancel ${card.name}'s visit?` : "Cancel visit"}
    >
      <label className="grid gap-2">
        <span className="text-sm font-semibold">Reason (optional)</span>
        <input
          className="field"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Doctor called to an emergency"
        />
      </label>
      <p className="text-sm text-muted">
        The patient is told on WhatsApp if they messaged the clinic in the last
        24 hours.
      </p>
      <button
        type="button"
        className="btn btn-danger"
        disabled={p.busy}
        onClick={() => card && p.onConfirm(card.id, reason)}
      >
        {p.busy ? "Cancelling…" : "Cancel visit"}
      </button>
    </Sheet>
  );
}

function FeeSheet(p: {
  pending: Pending;
  busy: boolean;
  onClose: () => void;
  onSave: (id: string, fee: number) => void;
}) {
  const card = p.pending?.kind === "fee" ? p.pending.card : null;
  const [fee, setFee] = useState(card?.fee == null ? "" : String(card.fee));
  return (
    <Sheet
      open={!!card}
      onClose={p.onClose}
      title={card ? `Fee for ${card.name}` : "Fee"}
    >
      <label className="grid gap-2">
        <span className="text-sm font-semibold">Fee for this visit (₹)</span>
        <input
          className="field display text-lg"
          inputMode="numeric"
          pattern="[0-9]*"
          value={fee}
          placeholder={card?.fee === null ? "0" : String(card?.fee ?? "")}
          onChange={(e) =>
            setFee(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
      </label>
      <p className="text-sm text-muted">
        Only this visit changes. Other visits keep their fee.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={p.busy || fee === ""}
        onClick={() => card && p.onSave(card.id, Number(fee))}
      >
        {p.busy ? "Saving…" : "Save fee"}
      </button>
    </Sheet>
  );
}
