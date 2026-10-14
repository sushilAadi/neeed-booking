"use client";

import { Check, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import {
  type AddResult,
  addPatient,
  lookupPatient,
  type SlotGroups,
} from "./actions";

const EMPTY = {
  phone: "",
  name: "",
  age: "",
  gender: "",
  area: "",
  reason: "",
  slot: "",
};
const GENDERS = [
  ["M", "Male"],
  ["F", "Female"],
  ["O", "Other"],
] as const;

export function AddForm({ initialSlots }: { initialSlots: SlotGroups }) {
  const [f, setF] = useState(EMPTY);
  const [slots, setSlots] = useState(initialSlots);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [filled, setFilled] = useState(false);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const prefill = () =>
    start(async () => {
      const last = await lookupPatient(f.phone);
      if (!last) return setFilled(false);
      setF((x) => ({
        ...x,
        name: x.name || last.name,
        age: x.age || (last.age === null ? "" : String(last.age)),
        gender: x.gender || last.gender || "",
        area: x.area || last.area || "",
      }));
      setFilled(true);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    start(async () => {
      const r: AddResult = await addPatient(f);
      if (r.slots) setSlots(r.slots);
      if (r.ok) {
        setF(EMPTY);
        setFilled(false);
        setErrors({});
        setNote({ ok: true, text: r.message });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors(r.errors ?? {});
        if (r.slots) set("slot", "");
        setNote({ ok: false, text: r.message });
      }
    });
  };

  const err = (k: string) =>
    errors[k] ? (
      <span id={`${k}-err`} className="text-sm font-semibold text-danger">
        {errors[k]}
      </span>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {note && (
        <output
          className={`block rounded-2xl px-4 py-3 text-[15px] font-semibold ${
            note.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
          }`}
        >
          {note.ok && <Check size={18} className="mr-1 inline" aria-hidden />}
          {note.text}
        </output>
      )}

      <section className="card grid gap-4 p-5">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">WhatsApp mobile no.</span>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="98765 43210"
            aria-label="WhatsApp mobile no."
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            onBlur={() => f.phone.trim() && prefill()}
            aria-invalid={!!errors.phone || undefined}
            aria-describedby="phone-help phone-err"
          />
          <span id="phone-help" className="text-[13px] text-muted">
            Enter the patient's WhatsApp number. They can then download their
            prescription anytime from WhatsApp → My prescriptions.
          </span>
          {err("phone")}
          {filled && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
              <Sparkles size={14} aria-hidden /> Filled from last visit — check
              and edit if needed.
            </span>
          )}
        </label>

        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Name</span>
            <input
              className="field"
              autoComplete="off"
              value={f.name}
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name || undefined}
              aria-label="Name"
              aria-describedby="name-err"
            />
            {err("name")}
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Age</span>
            <input
              className="field"
              inputMode="numeric"
              pattern="[0-9]*"
              value={f.age}
              onChange={(e) =>
                set("age", e.target.value.replace(/\D/g, "").slice(0, 3))
              }
              aria-invalid={!!errors.age || undefined}
              aria-label="Age"
              aria-describedby="age-err"
            />
            {err("age")}
          </label>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Gender</legend>
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map(([v, label]) => (
              <label key={v} className="chip cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value={v}
                  className="sr-only"
                  checked={f.gender === v}
                  onChange={() => set("gender", v)}
                />
                {label}
              </label>
            ))}
          </div>
          {err("gender")}
        </fieldset>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">
            Area <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            className="field"
            value={f.area}
            maxLength={80}
            placeholder="e.g. Tezpur"
            onChange={(e) => set("area", e.target.value)}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">
            Reason <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            className="field"
            value={f.reason}
            maxLength={200}
            placeholder="e.g. Fever for 3 days"
            onChange={(e) => set("reason", e.target.value)}
          />
        </label>
      </section>

      <section className="card grid gap-4 p-5" aria-labelledby="time-h">
        <div className="flex items-baseline justify-between">
          <h2 id="time-h" className="font-bold">
            Time today
          </h2>
          {err("slot")}
        </div>
        {!slots.length ? (
          <p className="text-[15px] text-muted">No free times left today.</p>
        ) : (
          slots.map((g) => (
            <div key={g.period} className="grid gap-2">
              <p className="eyebrow">{g.period}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.slots.map((s) => (
                  <label key={s.iso} className="chip display cursor-pointer">
                    <input
                      type="radio"
                      name="slot"
                      value={s.iso}
                      className="sr-only"
                      checked={f.slot === s.iso}
                      onChange={() => set("slot", s.iso)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <button
        type="submit"
        className="btn btn-primary sticky bottom-24 md:bottom-6"
        disabled={busy}
      >
        {busy ? "Booking…" : "Book appointment"}
      </button>
    </form>
  );
}
