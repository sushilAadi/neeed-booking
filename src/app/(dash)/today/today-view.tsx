"use client";

import { Morph, Rise } from "cube-motion/react";
import {
  Ban,
  CheckCircle2,
  Clock,
  IndianRupee,
  Stethoscope,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { type Column, DataTable } from "@/components/data-table";
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
  /** What this person may do (doctor: everything). */
  perms: string[];
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
  const allow = (x: string) => p.perms.includes(x);
  const [pending, setPending] = useState<Pending>(null);
  const [toast, setToast] = useState("");
  const [busy, start] = useTransition();

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
  const listed = p.cards.filter((c) => period === "all" || c.group === period);
  const next = p.cards.find((c) => c.status === "CONFIRMED");
  // Morning, afternoon and evening always show; "Other times" only when used.
  const periods = GROUPS.filter(
    ([g]) => g !== "other" || p.cards.some((c) => c.group === g),
  );

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-148px)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      <PageHead eyebrow="Your clinic desk for today" title="Today">
        {allow("close") && (
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
        )}
        {allow("add") && (
          <Link href="/add" className="btn btn-primary btn-sm">
            <UserPlus size={18} strokeWidth={1.75} aria-hidden /> Add patient
          </Link>
        )}
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
            {p.cards.length > 0 && (
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
            <DataTable
              label="Today's queue"
              rows={listed}
              rowKey={(c) => c.id}
              className="lg:flex-1"
              columns={queueColumns(
                (c) => setPending({ kind: "cancel", card: c }),
                (c) => setPending({ kind: "fee", card: c }),
                allow,
              )}
            />
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
                {allow("complete") && (
                  <Link href={`/visit/${next.id}`} className="btn btn-primary">
                    <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />{" "}
                    Mark complete
                  </Link>
                )}
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

const STATUS_TEXT = {
  CONFIRMED: "Waiting",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
} as const;

function queueColumns(
  onCancel: (c: Card) => void,
  onFee: (c: Card) => void,
  allow: (p: string) => boolean,
): Column<Card>[] {
  return [
    {
      key: "time",
      label: "Time",
      text: (c) => c.time,
      className: "whitespace-nowrap font-semibold",
    },
    {
      key: "name",
      label: "Patient",
      text: (c) => c.name,
      filter: "text",
      className: "whitespace-nowrap font-semibold",
      render: (c) => (
        <span
          className={c.status === "CANCELLED" ? "text-muted line-through" : ""}
        >
          {c.name}
        </span>
      ),
    },
    {
      key: "facts",
      label: "Age / sex",
      text: (c) => facts(c),
      className: "whitespace-nowrap text-muted",
    },
    {
      key: "phone",
      label: "Phone",
      text: (c) => phoneText(c.phone),
      filter: "text",
      className: "whitespace-nowrap",
      render: (c) => (
        <a
          href={`tel:+${c.phone}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {phoneText(c.phone)}
        </a>
      ),
    },
    {
      key: "reason",
      label: "Reason",
      text: (c) => c.reason ?? "",
      filter: "text",
    },
    {
      key: "src",
      label: "Booked via",
      text: (c) => (c.source === "whatsapp" ? "WhatsApp" : "Reception"),
      filter: "select",
    },
    {
      key: "status",
      label: "Status",
      text: (c) => STATUS_TEXT[c.status],
      filter: "select",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "act",
      label: "Fee / action",
      text: () => "",
      className: "text-right whitespace-nowrap",
      render: (c) =>
        c.status === "CONFIRMED" ? (
          <span className="inline-flex gap-2">
            {allow("complete") && (
              <Link
                href={`/visit/${c.id}`}
                className="btn-icon bg-accent text-accent-ink"
                aria-label={`Mark ${c.name}'s visit complete`}
                title="Mark complete"
              >
                <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />
              </Link>
            )}
            {allow("cancel") && (
              <button
                type="button"
                onClick={() => onCancel(c)}
                className="btn-icon"
                aria-label={`Cancel ${c.name}'s visit`}
              >
                <Ban size={18} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </span>
        ) : c.status === "COMPLETED" && allow("fee") ? (
          <button
            type="button"
            onClick={() => onFee(c)}
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
            aria-label={`${c.fee === null ? "Add fee" : rupees(c.fee)}, edit fee for ${c.name}`}
          >
            {c.fee === null ? "Add fee" : rupees(c.fee)}
            <IndianRupee size={14} aria-hidden />
          </button>
        ) : c.status === "COMPLETED" && c.fee !== null ? (
          rupees(c.fee)
        ) : null,
    },
  ];
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
