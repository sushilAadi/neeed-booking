"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Right-hand panel: half the screen on desktop, full screen on phones. */
export function Drawer(p: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dialog only exists once mounted
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) d.showModal();
    if (!p.open && d.open) d.close();
  }, [p.open, mounted]);
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={ref}
      onClose={p.onClose}
      onClick={(e) => e.target === ref.current && p.onClose()}
      aria-label={p.title}
      className="drawer"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 pt-[calc(16px+env(safe-area-inset-top))]">
          <h2 className="display truncate text-xl font-medium">{p.title}</h2>
          <button
            type="button"
            onClick={p.onClose}
            className="btn-icon"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 p-5">{p.children}</div>
      </div>
    </dialog>,
    document.body,
  );
}
