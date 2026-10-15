"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { useEffect } from "react";

/** Friendly screen when the server or database can't be reached (e.g. a network blip). */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card grid max-w-sm justify-items-center gap-4 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-wait-soft text-wait">
          <WifiOff size={26} strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="display text-[22px] font-medium">
          Can't reach the server
        </h1>
        <p className="text-[15px] text-muted">
          This is usually a short internet problem. Check your connection and
          try again.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => retry()}
        >
          <RotateCw size={18} strokeWidth={1.75} aria-hidden /> Try again
        </button>
      </div>
    </main>
  );
}
