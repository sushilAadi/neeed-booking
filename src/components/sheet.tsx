"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Bottom sheet on phones, centred card on larger screens; native <dialog> handles focus and Esc. */
export function Sheet(p: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) d.showModal();
    if (!p.open && d.open) d.close();
  }, [p.open]);
  return (
    <dialog
      ref={ref}
      onClose={p.onClose}
      onClick={(e) => e.target === ref.current && p.onClose()}
      aria-label={p.title}
      className="sheet"
    >
      <div className="grid gap-4 p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-xl font-bold">{p.title}</h2>
          <button
            type="button"
            onClick={p.onClose}
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-sunk"
            aria-label="Close"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {p.children}
      </div>
    </dialog>
  );
}
