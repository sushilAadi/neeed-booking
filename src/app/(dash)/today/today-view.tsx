"use client";

import {
  Ban,
  CheckCircle2,
  IndianRupee,
  Phone,
  Search,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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

  return (
    <div className="grid gap-5">
      <section
        aria-label="Today at a glance"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Stat label="Waiting" value={String(p.stats.waiting)} tone="wait" />
        <Stat label="Done" value={String(p.stats.done)} tone="ok" />
        <Stat
          label="Cancelled"
          value={String(p.stats.cancelled)}
          tone="muted"
        />
        <Stat label="Collected" value={rupees(p.stats.collection)} tone="ink" />
      </section>

      <div className="card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="font-bold">
            {p.closed ? "Closed today" : "Taking bookings today"}
          </p>
          <p className="text-sm text-muted">
            {p.closed
              ? "WhatsApp tells patients you're not booking today."
              : "Patients can book free times on WhatsApp."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!p.closed}
          aria-label="Taking bookings today"
          disabled={busy}
          onClick={() => run(() => setClosedAction(!p.closed, null))}
          className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
            p.closed ? "border-line bg-sunk" : "border-accent bg-accent"
          }`}
        >
          <span
            className={`absolute top-1 size-6 rounded-full bg-surface shadow transition-transform ${
              p.closed ? "left-1" : "left-1 translate-x-6"
            }`}
          />
        </button>
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
        <div className="card grid place-items-center gap-3 p-10 text-center">
          <Stethoscope className="text-accent" size={28} aria-hidden />
          <p className="font-bold">No patients yet today</p>
          <p className="max-w-xs text-sm text-muted">
            Add a patient who called, or share your WhatsApp number so patients
            can book themselves.
          </p>
          <Link href="/add" className="btn btn-primary mt-2">
            Add patient
          </Link>
        </div>
      ) : (
        GROUPS.map(([g, title]) => {
          const list = shown.filter((c) => c.group === g);
          if (!list.length) return null;
          const waiting = list.filter((c) => c.status === "CONFIRMED").length;
          return (
            <section key={g} aria-labelledby={`g-${g}`} className="grid gap-3">
              <h2
                id={`g-${g}`}
                className="eyebrow flex items-baseline justify-between"
              >
                <span>{title}</span>
                <span className="normal-case tracking-normal">
                  {waiting} waiting · {list.length} total
                </span>
              </h2>
              <ol className="grid gap-3">
                {list.map((c) => (
                  <PatientCard
                    key={c.id}
                    c={c}
                    onCancel={() => setPending({ kind: "cancel", card: c })}
                    onFee={() => setPending({ kind: "fee", card: c })}
                  />
                ))}
              </ol>
            </section>
          );
        })
      )}
      {p.cards.length > 0 && !shown.length && (
        <p className="text-center text-sm text-muted">
          No patient matches “{q}”.
        </p>
      )}

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
            Cancel them & tell patients
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

      <output
        aria-live="polite"
        className={`fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-center text-[15px] font-semibold text-bg shadow-lg transition-all md:bottom-8 ${
          toast
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        {toast}
      </output>
    </div>
  );
}

function Stat(p: {
  label: string;
  value: string;
  tone: "wait" | "ok" | "muted" | "ink";
}) {
  const color = {
    wait: "text-wait",
    ok: "text-ok",
    muted: "text-muted",
    ink: "text-ink",
  }[p.tone];
  return (
    <div className="card px-4 py-3">
      <p className="eyebrow">{p.label}</p>
      <p className={`display mt-1 text-[28px] leading-none font-bold ${color}`}>
        {p.value}
      </p>
    </div>
  );
}

function PatientCard(p: { c: Card; onCancel: () => void; onFee: () => void }) {
  const { c } = p;
  const done = c.status === "COMPLETED";
  const off = c.status === "CANCELLED";
  const facts = [
    c.age !== null ? `${c.age} y` : null,
    c.gender ? GENDER[c.gender] : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="card token overflow-visible">
      <div className="token-stub">
        <p className="display text-[19px] leading-tight font-bold">
          {c.time.replace(/ (AM|PM)$/, "")}
        </p>
        <p className="text-[12px] font-semibold text-muted">
          {c.time.slice(-2)}
        </p>
      </div>
      <div className="grid min-w-0 gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`truncate text-[17px] font-bold ${off ? "text-muted line-through" : ""}`}
            >
              {c.name}
            </p>
            <p className="truncate text-sm text-muted">
              {[facts, c.reason].filter(Boolean).join(" · ") || "No details"}
            </p>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <a
            href={`tel:+${c.phone}`}
            className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline"
          >
            <Phone size={14} aria-hidden /> {phoneText(c.phone)}
          </a>
          <span>
            {c.source === "whatsapp" ? "📱 WhatsApp" : "🏥 Reception"}
          </span>
          {done && c.completedBy ? (
            <span>Completed by {c.completedBy}</span>
          ) : c.createdBy && c.source === "reception" ? (
            <span>Added by {c.createdBy}</span>
          ) : null}
        </div>
        {c.status === "CONFIRMED" && (
          <div className="mt-1 flex gap-2">
            <Link
              href={`/visit/${c.id}`}
              className="btn btn-primary btn-sm flex-1"
            >
              <CheckCircle2 size={18} aria-hidden /> Mark complete
            </Link>
            <button
              type="button"
              onClick={p.onCancel}
              className="btn btn-ghost btn-sm"
              aria-label={`Cancel ${c.name}'s visit`}
            >
              <Ban size={18} aria-hidden />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </div>
        )}
        {done && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-sm">
              Fee{" "}
              <span className="display text-base font-bold">
                {c.fee === null ? "—" : rupees(c.fee)}
              </span>
              {c.hasRx ? (
                <span className="text-muted"> · prescription sent</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={p.onFee}
              className="btn btn-ghost btn-sm"
            >
              <IndianRupee size={16} aria-hidden /> Edit fee
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const s = {
    CONFIRMED: ["Waiting", "bg-wait-soft text-wait"],
    COMPLETED: ["Done", "bg-ok-soft text-ok"],
    CANCELLED: ["Cancelled", "bg-danger-soft text-danger"],
  }[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${s[1]}`}
    >
      {s[0]}
    </span>
  );
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
          placeholder="e.g. Doctor called to an emergency"
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
