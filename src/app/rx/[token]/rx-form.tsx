"use client";

import { useId, useRef, useState } from "react";

type Food = "after" | "before" | "any";
type Row = {
  key: number;
  name: string;
  slots: [boolean, boolean, boolean];
  qty: number;
  sos: boolean;
  food: Food;
  days: string;
};

const DAYS = [
  "1 day",
  "2 days",
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "15 days",
  "21 days",
  "1 month",
  "2 months",
  "3 months",
  "Ongoing",
];
const SLOTS = ["Morning", "Afternoon", "Night"] as const;
const QTY = [0.5, 1, 2, 3];

let next = 1;
const blank = (): Row => ({
  key: next++,
  name: "",
  slots: [true, false, true],
  qty: 1,
  sos: false,
  food: "after",
  days: "5 days",
});

function SlotIcon({ k }: { k: number }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "-11 -11 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    "aria-hidden": true,
  };
  if (k === 0)
    return (
      <svg {...common} aria-hidden="true">
        <path d="M -7 2 A 7 7 0 0 1 7 2 M -10 4.5 H 10 M 0 -9 V -6 M -7 -6 L -5 -4 M 7 -6 L 5 -4" />
      </svg>
    );
  if (k === 1)
    return (
      <svg {...common} aria-hidden="true">
        <circle r="3.6" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={a}
              x1={Math.cos(a) * 6}
              y1={Math.sin(a) * 6}
              x2={Math.cos(a) * 8.6}
              y2={Math.sin(a) * 8.6}
            />
          );
        })}
      </svg>
    );
  return (
    <svg {...common} fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M 2 -7.5 A 7.5 7.5 0 1 0 7.5 3 A 6 6 0 1 1 2 -7.5 Z" />
    </svg>
  );
}

type Result = { ok: boolean; message: string; url?: string };
type Payload = { meds: unknown[]; advice: string; fee?: number };

/**
 * The prescription form. From WhatsApp it posts to /api/rx/[token]; on the dashboard it
 * calls server actions instead and also asks for the visit's fee.
 */
export function RxForm(p: {
  token?: string;
  patient: string;
  visit: string;
  clinic: string;
  doctor: string;
  suggestions: string[];
  /** Dashboard: the standard fee, editable for this visit. */
  fee?: number;
  submit?: (payload: Payload) => Promise<Result>;
  preview?: (payload: Payload) => Promise<Result>;
  skip?: (fee: number) => Promise<Result>;
  doneHref?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [fee, setFee] = useState(p.fee === undefined ? "" : String(p.fee));
  const listId = useId();
  const nameRefs = useRef(new Map<number, HTMLInputElement>());

  const set = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    // New rows copy the last row's time / food / days, so the doctor only types names.
    const last = rows.at(-1);
    const r = last ? { ...last, key: next++, name: "" } : blank();
    setRows((rs) => [...rs, r]);
    requestAnimationFrame(() => nameRefs.current.get(r.key)?.focus());
  };
  const filled = rows.filter((r) => r.name.trim());

  const payload = (): Payload => ({
    meds: filled.map((r) => ({
      name: r.name.trim(),
      dose: r.sos ? null : (r.slots.map((on) => (on ? r.qty : 0)) as number[]),
      ...(r.sos ? { sos: true } : {}),
      food: r.food,
      duration: r.days,
    })),
    advice,
    ...(p.fee !== undefined ? { fee: Number(fee || 0) } : {}),
  });

  async function previewPdf() {
    setError("");
    if (!filled.length || !p.preview) {
      setError("Add at least one medicine name.");
      return;
    }
    // open the tab now (a click), fill it once the PDF is ready — popup blockers allow this
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const r = await p.preview(payload());
      if (r.ok && r.url && tab) tab.location.href = r.url;
      else {
        tab?.close();
        setError(r.message);
      }
    } catch {
      tab?.close();
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function completeWithout() {
    if (!p.skip) return;
    setBusy(true);
    try {
      const r = await p.skip(Number(fee || 0));
      if (r.ok) setDone(r.message);
      else setError(r.message);
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setError("");
    if (!filled.length) {
      setError("Add at least one medicine name.");
      return;
    }
    setBusy(true);
    if (p.submit) {
      try {
        const r = await p.submit(payload());
        if (r.ok) setDone(r.message);
        else setError(r.message);
      } catch {
        setError("No connection. Check your internet and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const meds = filled.map((r) => ({
        name: r.name.trim(),
        dose: r.sos
          ? null
          : (r.slots.map((on) => (on ? r.qty : 0)) as number[]),
        ...(r.sos ? { sos: true } : {}),
        food: r.food,
        duration: r.days,
      }));
      const res = await fetch(`/api/rx/${p.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meds, advice }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) setError(j.message ?? "Couldn't send. Try again.");
      else setDone(j.message ?? "Sent.");
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <main className="rx-shell grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[var(--rx-green)] text-2xl text-white">
            ✓
          </div>
          <h1 className="rx-display text-2xl">Prescription saved</h1>
          <p className="mt-2 text-[15px] text-[var(--rx-muted)]">{done}</p>
          {p.doneHref ? (
            <a href={p.doneHref} className="rx-send mt-6 inline-flex">
              Back to Today
            </a>
          ) : (
            <p className="mt-6 text-sm text-[var(--rx-muted)]">
              You can close this page and go back to WhatsApp.
            </p>
          )}
        </div>
      </main>
    );

  return (
    <main className="rx-shell min-h-dvh px-4 pb-32 pt-6">
      <div className="mx-auto grid max-w-xl gap-5">
        <header className="grid gap-1">
          {p.doneHref && (
            <a
              href={p.doneHref}
              className="mb-2 text-[14px] font-semibold text-[var(--rx-green)]"
            >
              ← Today
            </a>
          )}
          <p className="rx-label">{p.clinic}</p>
          <h1 className="rx-display text-[26px] leading-tight">
            Prescription for {p.patient}
          </h1>
          <p className="text-[14px] text-[var(--rx-muted)]">
            {p.visit} · {p.doctor}
          </p>
        </header>

        <datalist id={listId}>
          {p.suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <ol className="grid gap-3">
          {rows.map((r, idx) => (
            <li key={r.key} className="rx-card grid gap-3 p-4">
              <div className="flex items-center gap-2">
                <span className="rx-num">{idx + 1}</span>
                <input
                  id={`med-${r.key}`}
                  ref={(el) => {
                    if (el) nameRefs.current.set(r.key, el);
                    else nameRefs.current.delete(r.key);
                  }}
                  list={listId}
                  value={r.name}
                  onChange={(e) => set(r.key, { name: e.target.value })}
                  placeholder="Medicine name, e.g. Augmentin 625"
                  aria-label={`Medicine ${idx + 1} name`}
                  autoComplete="off"
                  maxLength={80}
                  className="rx-input min-w-0 flex-1"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) => rs.filter((x) => x.key !== r.key))
                    }
                    className="rx-icon-btn"
                    aria-label={`Remove medicine ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>

              <fieldset
                className="grid grid-cols-4 gap-2"
                aria-label="When to take it"
              >
                {SLOTS.map((label, k) => {
                  const on = !r.sos && r.slots[k];
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      disabled={r.sos}
                      onClick={() =>
                        set(r.key, {
                          slots: r.slots.map((v, j) =>
                            j === k ? !v : v,
                          ) as Row["slots"],
                        })
                      }
                      className={`rx-slot ${on ? "is-on" : ""}`}
                    >
                      <SlotIcon k={k} />
                      <span>{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={r.sos}
                  onClick={() => set(r.key, { sos: !r.sos })}
                  className={`rx-slot ${r.sos ? "is-sand" : ""}`}
                >
                  <span className="text-[15px] font-bold">SOS</span>
                  <span>When needed</span>
                </button>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                <fieldset className="rx-seg" aria-label="Food">
                  {(["after", "before", "any"] as Food[]).map((f) => (
                    <label key={f} className={r.food === f ? "is-on" : ""}>
                      <input
                        type="radio"
                        name={`food-${r.key}`}
                        className="sr-only"
                        checked={r.food === f}
                        onChange={() => set(r.key, { food: f })}
                      />
                      {f === "after"
                        ? "After food"
                        : f === "before"
                          ? "Before food"
                          : "Any time"}
                    </label>
                  ))}
                </fieldset>
                <label className="rx-select">
                  <span className="sr-only">Days</span>
                  <select
                    value={r.days}
                    onChange={(e) => set(r.key, { days: e.target.value })}
                  >
                    {DAYS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                {!r.sos && (
                  <label className="rx-select">
                    <span className="sr-only">Tablets each time</span>
                    <select
                      value={r.qty}
                      onChange={(e) =>
                        set(r.key, { qty: Number(e.target.value) })
                      }
                    >
                      {QTY.map((q) => (
                        <option key={q} value={q}>
                          {q === 0.5 ? "½" : q} tab
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ol>

        <button type="button" onClick={add} className="rx-add">
          + Add medicine
        </button>

        <label className="grid gap-1.5">
          <span className="rx-label">Advice (optional)</span>
          <textarea
            id="advice"
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Drink plenty of water. Review after 5 days."
            className="rx-input resize-y"
          />
        </label>

        {p.fee !== undefined && (
          <label className="grid gap-1.5">
            <span className="rx-label">Fee for this visit (₹)</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={fee}
              onChange={(e) =>
                setFee(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="rx-input"
              aria-describedby="fee-help"
            />
            <span id="fee-help" className="text-[13px] text-[var(--rx-muted)]">
              Your standard fee is filled in. Change it for this visit only,
              e.g. 0 for a free follow-up.
            </span>
          </label>
        )}

        {(p.preview || p.skip) && (
          <div className="flex flex-wrap gap-2">
            {p.preview && (
              <button
                type="button"
                onClick={previewPdf}
                disabled={busy}
                className="rx-add"
              >
                Preview PDF
              </button>
            )}
            {p.skip && (
              <button
                type="button"
                onClick={completeWithout}
                disabled={busy}
                className="rx-add"
              >
                Complete without prescription
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rx-bar">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <output className="block min-w-0 flex-1 text-[13px] leading-snug text-[var(--rx-muted)]">
            {error ? (
              <span className="text-[var(--rx-warn)]">{error}</span>
            ) : (
              `${filled.length} ${filled.length === 1 ? "medicine" : "medicines"}`
            )}
          </output>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="rx-send"
          >
            {busy ? "Sending…" : "Send to patient"}
          </button>
        </div>
      </div>
    </main>
  );
}
