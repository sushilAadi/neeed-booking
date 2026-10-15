"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const label = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};

/**
 * Themed calendar for a GET form: keeps the value in a hidden input called `name`
 * and submits the form when a day is picked or cleared.
 */
export function DatePicker(p: { name: string; value: string; max: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(p.value);
  const start = v || p.max;
  const [ym, setYm] = useState(() => {
    const [y, m] = start.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (d: string) => {
    setV(d);
    setOpen(false);
    // let the hidden input update before the form reads it
    requestAnimationFrame(() => input.current?.form?.requestSubmit());
  };
  const first = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay(); // 0 = Sunday
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const step = (n: number) =>
    setYm(({ y, m }) => ({
      y: y + Math.floor((m + n) / 12),
      m: (((m + n) % 12) + 12) % 12,
    }));
  // no paging past the month of `max`
  const atMax = iso(ym.y, ym.m, 1) >= `${p.max.slice(0, 7)}-01`;

  return (
    <div ref={box} className="relative">
      <input ref={input} type="hidden" name={p.name} value={v} />
      <div className="flex items-center">
        <button
          type="button"
          className={`pill ${v ? "pr-10" : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
          {v ? label(v) : "Pick a date"}
        </button>
        {v && (
          <button
            type="button"
            aria-label="Clear date"
            className="-ml-9 grid size-8 place-items-center rounded-full text-muted hover:bg-sunk"
            onClick={() => pick("")}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="card absolute top-full right-0 z-30 mt-2 w-[300px] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="btn-icon size-9"
              aria-label="Previous month"
              onClick={() => step(-1)}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <p className="font-semibold">
              {MONTHS[ym.m]} {ym.y}
            </p>
            <button
              type="button"
              className="btn-icon size-9"
              aria-label="Next month"
              disabled={atMax}
              onClick={() => step(1)}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-muted">
            {"SMTWTFS".split("").map((d, i) => (
              <span key={`${d}${i}`} aria-hidden>
                {d}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = iso(ym.y, ym.m, i + 1);
              const future = d > p.max;
              const on = d === v;
              const today = d === p.max;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  aria-pressed={on}
                  aria-label={label(d)}
                  onClick={() => pick(d)}
                  className={`grid size-9 place-items-center rounded-full text-sm transition-colors ${
                    on
                      ? "bg-accent font-semibold text-accent-ink"
                      : future
                        ? "text-muted opacity-40"
                        : "hover:bg-sunk"
                  } ${today && !on ? "ring-1 ring-ink" : ""}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
