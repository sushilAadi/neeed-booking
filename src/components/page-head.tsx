"use client";

import { useEffect, useState } from "react";

/**
 * Page title. Phones: a native-style large title that shrinks into a compact one as you
 * scroll; the small line above it shows on larger screens only.
 */
export function PageHead(p: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div
      className={`chrome sticky top-[calc(72px+env(safe-area-inset-top))] z-20 -mx-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pb-3 transition-[padding] duration-200 md:top-[calc(68px+env(safe-area-inset-top))] md:-mx-8 md:px-8 md:pt-2 md:pb-4 ${compact ? "max-md:pt-1 max-md:pb-2" : "pt-4 md:pt-2"}`}
    >
      <div className="min-w-0">
        <p className="eyebrow max-md:hidden">{p.eyebrow}</p>
        <h1
          className={`page-title display mt-1 origin-left transition-[font-size] duration-200 ${compact ? "max-md:text-[22px]" : ""}`}
        >
          {p.title}
        </h1>
      </div>
      {p.children && (
        <div
          className={`flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-nowrap max-md:[&>*]:flex-1 ${compact ? "max-md:hidden" : ""}`}
        >
          {p.children}
        </div>
      )}
    </div>
  );
}
