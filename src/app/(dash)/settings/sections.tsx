"use client";

import { Morph, Rise } from "cube-motion/react";
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { DataTable } from "@/components/data-table";
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
  revealKeyAction,
  saveFeeAction,
  saveHoursAction,
  saveRxSetupAction,
} from "./actions";

/** Shared: run an action in a transition and show its message as a toast. */
function useRun() {
  const [busy, start] = useTransition();
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState(false);
  const say = (m: string, ok = true) => {
    setToast(m);
    setSaved(ok);
    setTimeout(() => {
      setToast("");
      setSaved(false);
    }, 3500);
  };
  const toastEl = (
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
  );
  return { busy, start, say, saved, toastEl };
}

function Section(p: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card card-pad grid grid-cols-[minmax(0,1fr)] content-start gap-4">
      <div>
        <h2 className="display text-[20px] font-medium">{p.title}</h2>
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
  const { busy, start, say, saved, toastEl } = useRun();
  const setRow = (k: HoursKey, r: Range | null) => setF({ ...f, [k]: r });

  return (
    <Section
      title="Clinic hours"
      hint="Existing bookings are kept when you change hours."
    >
      <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
        {ROWS.map(([k, label]) => {
          const r = f[k];
          return (
            <fieldset
              key={k}
              className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[68px_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <legend className="sr-only">{label}</legend>
              <span
                aria-hidden
                className="text-sm font-semibold max-sm:order-1"
              >
                {label}
              </span>
              {r ? (
                (["start", "end"] as const).map((side) => (
                  <input
                    key={side}
                    type="time"
                    step={900}
                    className="field min-h-11 min-w-0 px-2 text-[14px] max-sm:order-3"
                    aria-label={`${label} ${side === "start" ? "from" : "to"}`}
                    value={r[side]}
                    aria-invalid={!!errors[k] || undefined}
                    aria-describedby={`h-${k}-err`}
                    onChange={(e) =>
                      setRow(k, { ...r, [side]: e.target.value })
                    }
                  />
                ))
              ) : (
                <span className="col-span-2 text-sm text-muted max-sm:order-3">
                  {k === "lunch" ? "No break" : "Closed"}
                </span>
              )}
              <label className="flex min-h-11 items-center gap-1.5 justify-self-end text-[13px] text-muted max-sm:order-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
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
              <div className="col-span-2 empty:hidden max-sm:order-4 sm:col-span-4">
                <Err id={`h-${k}-err`} text={errors[k]} />
              </div>
            </fieldset>
          );
        })}
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Time per patient</legend>
        <div className="grid grid-cols-4 gap-2">
          {[15, 30, 45, 60].map((m) => (
            <label
              key={m}
              className="chip cursor-pointer px-1 whitespace-nowrap"
            >
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
        {busy ? (
          "Saving…"
        ) : (
          <Morph active={saved} off="Save hours" on="Saved" />
        )}
      </button>
      {toastEl}
    </Section>
  );
}

// ── Standard fee ────────────────────────────────────────────────────────────

export function Fee(p: { initial: number }) {
  const [fee, setFee] = useState(String(p.initial));
  const { busy, start, say, saved, toastEl } = useRun();
  return (
    <Section
      title="Standard fee"
      hint="Used for every visit you complete from now on. Past visits keep the fee they were charged, so changing it from ₹500 to ₹700 never changes old totals. You can still change the fee of a single visit."
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
          start(async () => {
            const r = await saveFeeAction(Number(fee));
            say(r.message, r.ok);
          })
        }
      >
        {busy ? "Saving…" : <Morph active={saved} off="Save fee" on="Saved" />}
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
  const { busy, start, say, saved, toastEl } = useRun();
  return (
    <Section
      title="Prescription setup"
      hint="One-time setup for the prescription PDF your patients get: your medical registration number and your signature are printed on every prescription."
    >
      <form
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
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
          <span className="min-w-0 text-sm font-semibold">
            Signature{" "}
            <span className="font-normal text-muted">
              (PNG or JPG, up to 2 MB)
            </span>
          </span>
          <input
            name="signature"
            type="file"
            accept="image/png,image/jpeg"
            className="w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-[var(--line)] file:bg-[var(--surface)] file:px-3 file:font-semibold"
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
          {busy ? (
            "Saving…"
          ) : (
            <Morph active={saved} off="Save prescription setup" on="Saved" />
          )}
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
      <DataTable
        label="Staff"
        rows={p.people}
        rowKey={(x) => x.id}
        minWidth={680}
        className="max-h-[420px]"
        columns={[
          {
            key: "name",
            label: "Name",
            text: (x) => x.name,
            filter: "text",
            className: "whitespace-nowrap font-semibold",
          },
          {
            key: "role",
            label: "Role",
            text: (x) => (x.role === "doctor" ? "Doctor" : "Reception"),
            filter: "select",
            render: (x) => (
              <span
                className={`badge ${x.role === "doctor" ? "badge-done" : "badge-wait"}`}
              >
                {x.role === "doctor" ? "Doctor" : "Reception"}
              </span>
            ),
          },
          {
            key: "key",
            label: "Login key",
            text: () => "",
            render: (x) => <KeyView id={x.id} />,
          },
          {
            key: "last",
            label: "Last active",
            text: (x) => x.lastActive,
            className: "whitespace-nowrap text-muted",
          },
          {
            key: "added",
            label: "Added",
            text: (x) => x.added,
            className: "whitespace-nowrap text-muted",
          },
          {
            key: "act",
            label: "Actions",
            text: () => "",
            className: "text-right",
            render: (x) => (
              <span className="inline-flex gap-2">
                <button
                  type="button"
                  className="btn-icon"
                  disabled={busy}
                  aria-label={`New key for ${x.name}`}
                  title="New key"
                  onClick={() =>
                    window.confirm(
                      x.id === p.me
                        ? "Make a new key for you? Your other devices will be logged out."
                        : `Make a new key for ${x.name}? Their old key stops working.`,
                    ) && start(async () => gotKey(await newKeyAction(x.id)))
                  }
                >
                  <KeyRound size={16} strokeWidth={1.75} aria-hidden />
                </button>
                {x.role !== "doctor" && (
                  <button
                    type="button"
                    className="btn-icon text-danger"
                    disabled={busy}
                    aria-label={`Remove ${x.name}`}
                    title="Remove"
                    onClick={() => setRemoving(x)}
                  >
                    <UserMinus size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </span>
            ),
          },
        ]}
      />
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
        <p className="select-all rounded-2xl border bg-sunk p-4 text-center text-xl font-bold tracking-wider">
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

const SHOW_SECONDS = 30;

/** A login key, hidden by default; the eye shows it for 30 seconds with a countdown. */
function KeyView({ id }: { id: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [missing, setMissing] = useState(false);
  const [busy, start] = useTransition();
  useEffect(() => {
    if (!key) return;
    if (left <= 0) {
      setKey(null);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [key, left]);
  const show = () =>
    start(async () => {
      const k = await revealKeyAction(id);
      setMissing(!k);
      if (k) {
        setKey(k);
        setLeft(SHOW_SECONDS);
      }
    });
  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mono text-[13px] tracking-wider whitespace-nowrap select-all"
        aria-live="polite"
      >
        {key ?? "••-••••-••••-••••"}
      </span>
      <button
        type="button"
        className="btn-icon"
        disabled={busy}
        aria-label={key ? "Hide key" : "Show key"}
        onClick={() => (key ? setKey(null) : show())}
      >
        {key ? (
          <EyeOff size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <Eye size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {key && (
        <>
          <button
            type="button"
            className="btn-icon"
            aria-label="Copy key"
            onClick={() => navigator.clipboard.writeText(key)}
          >
            <Copy size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <span className="text-[13px] text-muted">Hides in {left}s</span>
        </>
      )}
      {missing && !key && (
        <span className="text-[13px] text-muted">
          Older key. Make a new key to see it.
        </span>
      )}
    </div>
  );
}
