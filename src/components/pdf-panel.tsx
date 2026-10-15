"use client";

import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Slides in from the right: half the screen on desktop, full screen on phones. */
export function PdfPanel(p: {
  url: string | null;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Rendered into <body>: a dialog inside a hidden parent (e.g. the desktop-only panel) never shows.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dialog only exists once mounted
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.url && !d.open) d.showModal();
    if (!p.url && d.open) d.close();
  }, [p.url, mounted]);
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
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 pt-[calc(12px+env(safe-area-inset-top))]">
          <h2 className="display truncate text-lg font-medium">{p.title}</h2>
          <div className="flex shrink-0 gap-2">
            {p.url && (
              <a
                href={p.url}
                target="_blank"
                rel="noopener"
                download
                className="btn-icon"
                aria-label="Download PDF"
              >
                <Download size={18} strokeWidth={1.75} aria-hidden />
              </a>
            )}
            <button
              type="button"
              onClick={p.onClose}
              className="btn-icon"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
        {p.url && (
          <iframe
            src={`${p.url}#toolbar=0&view=FitH`}
            title={p.title}
            className="min-h-0 w-full flex-1 bg-sunk"
          />
        )}
      </div>
    </dialog>,
    document.body,
  );
}
