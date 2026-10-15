"use client";

import { Copy, Download, KeyRound, UserMinus, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import type { ClashMode, HoursForm, HoursKey } from "@/lib/clinic/availability";
import type { Period, Range } from "@/lib/slots";
import {
  addReceptionistAction,
  blockAction,
  type KeyResult,
  newKeyAction,
  type Result,
  removeStaffAction,
  saveFeeAction,
  saveHoursAction,
  saveRxSetupAction,
} from "./actions";

/** Shared: run an action in a transition and show its message as a toast. */
function useRun() {
  const [busy, start] = useTransition();
  const [toast, setToast] = useState("");
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  };
  const toastEl = (
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
  );
  return { busy, start, say, toastEl };
}

function Section(p: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card grid gap-4 p-5">
      <div>
        <h2 className="display text-lg font-bold">{p.title}</h2>
        {p.hint && <p className="text-sm text-muted">{p.hint}</p>}
      </div>
      {p.children}
    </section>
  );
}

const Err = ({ id, text }: { id: string; text?: string }) =>
  text ? (
    <p id={id} className="text-sm font-semibold text-danger">
      {text}
    </p>
  ) : null;

// ── Clinic hours ────────────────────────────────────────────────────────────

const ROWS: [HoursKey, string][] = [
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["evening", "Evening"],
  ["lunch", "Lunch break"],
];

export function Hours(p: { initial: HoursForm }) {
  const [f, setF] = useState<HoursForm>(p.initial);
  const [errors, setErrors] = useState<Partial<Record<HoursKey, string>>>({});
  const { busy, start, say, toastEl } = useRun();
  const setRow = (k: HoursKey, r: Range | null) => setF({ ...f, [k]: r });

  return (
    <Section
      title="Clinic hours"
      hint="Existing bookings are kept when you change hours."
    >
      {ROWS.map(([k, label]) => {
        const r = f[k];
        return (
          <fieldset key={k} className="grid gap-2">
            <legend className="mb-1 flex w-full items-center justify-between text-sm font-semibold">
              {label}
              <label className="flex items-center gap-2 font-normal text-muted">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  checked={!r}
                  onChange={(e) =>
                    setRow(
                      k,
                      e.target.checked
                        ? null
                        : (p.initial[k] ??
                            (k === "lunch"
                              ? { start: "13:00", end: "14:00" }
                              : { start: "09:00", end: "12:00" })),
                    )
                  }
                />
                Off
              </label>
            </legend>
            {r && (
              <div className="grid grid-cols-2 gap-3">
                {(["start", "end"] as const).map((side) => (
                  <label key={side} className="grid gap-1">
                    <span className="text-xs text-muted">
                      {side === "start" ? "From" : "To"}
                    </span>
                    <input
                      type="time"
                      step={900}
                      className="field"
                      value={r[side]}
                      aria-invalid={!!errors[k] || undefined}
                      aria-describedby={`h-${k}-err`}
                      onChange={(e) =>
                        setRow(k, { ...r, [side]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <Err id={`h-${k}-err`} text={errors[k]} />
          </fieldset>
        );
      })}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Time per patient</legend>
        <div className="grid grid-cols-4 gap-2">
          {[15, 30, 45, 60].map((m) => (
            <label key={m} className="chip cursor-pointer px-1 whitespace-nowrap">
              <input
                type="radio"
                name="slot"
                className="sr-only"
                checked={f.slotMinutes === m}
                onChange={() => setF({ ...f, slotMinutes: m })}
              />
              {m} min
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await saveHoursAction(f);
            if (r.ok) {
              setErrors({});
              say(r.message);
            } else setErrors(r.errors);
          })
        }
      >
        {busy ? "Saving…" : "Save hours"}
      </button>
      {toastEl}
    </Section>
  );
}

// ── Standard fee ────────────────────────────────────────────────────────────

export function Fee(p: { initial: number }) {
  const [fee, setFee] = useState(String(p.initial));
  const { busy, start, say, toastEl } = useRun();
  return (
    <Section
      title="Standard fee"
      hint="Filled in when a visit is completed. You can change it per visit."
    >
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold">Fee (₹)</span>
        <input
          className="field display text-lg"
          inputMode="numeric"
          pattern="[0-9]*"
          value={fee}
          onChange={(e) =>
            setFee(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || fee === "" || Number(fee) === p.initial}
        onClick={() =>
          start(async () => say((await saveFeeAction(Number(fee))).message))
        }
      >
        {busy ? "Saving…" : "Save fee"}
      </button>
      {toastEl}
    </Section>
  );
}

// ── Block time ──────────────────────────────────────────────────────────────

type What = "whole" | Period | "custom";
const WHATS: [What, string][] = [
  ["whole", "Whole day"],
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["evening", "Evening"],
  ["custom", "Custom"],
];

export function BlockTime(p: {
  days: { date: string; label: string }[];
  off: Period[];
}) {
  const [date, setDate] = useState(p.days[0].date);
  const [what, setWhat] = useState<What>("whole");
  const [custom, setCustom] = useState<Range>({ start: "10:00", end: "11:00" });
  const [clash, setClash] = useState(0);
  const { busy, start, say, toastEl } = useRun();

  const go = (mode: ClashMode) =>
    start(async () => {
      const r: Result = await blockAction(
        date,
        what === "custom" ? custom : what,
        mode,
      );
      if (r.clash) return setClash(r.clash);
      setClash(0);
      say(r.message);
    });

  return (
    <Section title="Block time" hint="Stop bookings for a day or part of one.">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Day</legend>
        <div className="flex flex-wrap gap-2">
          {p.days.map((d) => (
            <label key={d.date} className="chip cursor-pointer">
              <input
                type="radio"
                name="block-day"
                className="sr-only"
                checked={date === d.date}
                onChange={() => setDate(d.date)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">What to block</legend>
        <div className="flex flex-wrap gap-2">
          {WHATS.filter(([w]) => !p.off.includes(w as Period)).map(
            ([w, label]) => (
              <label key={w} className="chip cursor-pointer">
                <input
                  type="radio"
                  name="block-what"
                  className="sr-only"
                  checked={what === w}
                  onChange={() => setWhat(w)}
                />
                {label}
              </label>
            ),
          )}
        </div>
      </fieldset>
      {what === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          {(["start", "end"] as const).map((side) => (
            <label key={side} className="grid gap-1">
              <span className="text-xs text-muted">
                {side === "start" ? "From" : "To"}
              </span>
              <input
                type="time"
                step={900}
                className="field"
                value={custom[side]}
                onChange={(e) =>
                  setCustom({ ...custom, [side]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => go(null)}
      >
        {busy ? "Blocking…" : "Block"}
      </button>
      <Sheet
        open={clash > 0}
        onClose={() => setClash(0)}
        title="Bookings in that time"
      >
        <p className="text-[15px] text-muted">
          {clash} confirmed booking(s) fall in that time. What should happen to
          them?
        </p>
        <div className="grid gap-2">
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => go("cancel")}
          >
            Cancel them & tell patients
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => go("keep")}
          >
            Keep them, stop new bookings
          </button>
        </div>
      </Sheet>
      {toastEl}
    </Section>
  );
}

// ── Prescription setup (doctor only) ────────────────────────────────────────

export function RxSetup(p: { reg: string; sigUrl: string | null }) {
  const [preview, setPreview] = useState(p.sigUrl);
  const [error, setError] = useState("");
  const { busy, start, say, toastEl } = useRun();
  return (
    <Section
      title="Prescription setup"
      hint="Printed on every prescription PDF."
    >
      <form
        className="grid gap-4"
        action={(form) =>
          start(async () => {
            const r = await saveRxSetupAction(form);
            setError(r.ok ? "" : r.message);
            if (r.ok) say(r.message);
          })
        }
      >
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Registration number</span>
          <input
            name="reg"
            className="field"
            defaultValue={p.reg}
            maxLength={60}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">
            Signature{" "}
            <span className="font-normal text-muted">
              (PNG or JPG, up to 2 MB)
            </span>
          </span>
          <input
            name="signature"
            type="file"
            accept="image/png,image/jpeg"
            className="text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-[var(--line)] file:bg-[var(--surface)] file:px-3 file:font-semibold"
            aria-describedby="sig-err"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setError(
                f && f.size > 2 * 1024 * 1024
                  ? "That image is over 2 MB. Pick a smaller one."
                  : "",
              );
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
        </label>
        {preview && (
          <img
            src={preview}
            alt="Your signature"
            className="max-h-28 w-auto justify-self-start rounded-xl border bg-white p-2"
          />
        )}
        <Err id="sig-err" text={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save prescription setup"}
        </button>
      </form>
      {toastEl}
    </Section>
  );
}

// ── Staff (doctor only) ─────────────────────────────────────────────────────

type Person = {
  id: string;
  name: string;
  role: "doctor" | "reception";
  added: string;
  lastActive: string;
};

export function StaffList(p: { me: string; people: Person[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [shown, setShown] = useState<{ key: string; name: string } | null>(
    null,
  );
  const [removing, setRemoving] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const { busy, start, say, toastEl } = useRun();

  const gotKey = (r: KeyResult) => {
    if (!r.ok) return setError(r.message);
    setError("");
    setAdding(false);
    setName("");
    setShown({ key: r.key, name: r.name });
  };

  return (
    <Section
      title="Staff"
      hint="Each person logs in with their own key. Only you can see this."
    >
      <ul className="grid divide-y divide-[var(--line)]">
        {p.people.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">{s.name}</p>
              <p className="text-[13px] text-muted">
                {s.role === "doctor" ? "Doctor" : "Reception"} · added {s.added}{" "}
                · last active {s.lastActive}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  window.confirm(
                    s.id === p.me
                      ? "Make a new key for you? Your other devices will be logged out."
                      : `Make a new key for ${s.name}? Their old key stops working.`,
                  ) && start(async () => gotKey(await newKeyAction(s.id)))
                }
              >
                <KeyRound size={16} aria-hidden /> New key
              </button>
              {s.role !== "doctor" && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => setRemoving(s)}
                >
                  <UserMinus size={16} aria-hidden /> Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Err id="staff-err" text={!adding ? error : undefined} />
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setAdding(true)}
      >
        <UserPlus size={18} aria-hidden /> Add receptionist
      </button>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add receptionist"
      >
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Their name</span>
          <input
            className="field"
            value={name}
            maxLength={40}
            placeholder="e.g. Riya"
            aria-describedby="add-err"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Err id="add-err" text={adding ? error : undefined} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            start(async () => gotKey(await addReceptionistAction(name)))
          }
        >
          {busy ? "Adding…" : "Add and make a key"}
        </button>
      </Sheet>

      <Sheet
        open={!!shown}
        onClose={() => setShown(null)}
        title={`Key for ${shown?.name ?? ""}`}
      >
        <p className="text-[15px] font-semibold text-danger">
          Save this now. It won't be shown again.
        </p>
        <p className="display select-all rounded-2xl border bg-sunk p-4 text-center text-xl font-bold tracking-wider">
          {shown?.key}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              shown &&
              navigator.clipboard.writeText(shown.key).then(
                () => say("Key copied."),
                () => say("Couldn't copy. Select the key and copy it."),
              )
            }
          >
            <Copy size={18} aria-hidden /> Copy
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (!shown) return;
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob(
                  [`Neeed login key for ${shown.name}\n${shown.key}\n`],
                  {
                    type: "text/plain",
                  },
                ),
              );
              a.download = `neeed-key-${shown.name.replace(/\W+/g, "-").toLowerCase()}.txt`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download size={18} aria-hidden /> Download
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShown(null)}
        >
          I've saved it
        </button>
      </Sheet>

      <Sheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
      >
        <p className="text-[15px] text-muted">
          Their devices are logged out at once. Their past actions keep their
          name.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() =>
            removing &&
            start(async () => {
              const r = await removeStaffAction(removing.id);
              setRemoving(null);
              say(r.message);
            })
          }
        >
          {busy ? "Removing…" : "Remove"}
        </button>
      </Sheet>
      {toastEl}
    </Section>
  );
}
