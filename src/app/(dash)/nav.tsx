"use client";

import {
  BarChart3,
  CalendarDays,
  History,
  LogOut,
  Settings,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ALL_TABS = [
  { href: "/today", label: "Today", Icon: CalendarDays, perm: null },
  { href: "/add", label: "Add patient", Icon: UserPlus, perm: "add" },
  { href: "/history", label: "History", Icon: History, perm: "history" },
  { href: "/reports", label: "Reports", Icon: BarChart3, perm: "reports" },
  { href: "/settings", label: "Settings", Icon: Settings, perm: null },
] as const;

const on = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`);

/** Round icon rail from 768 px; frosted bottom tab bar on phones. */
export function Nav(p: {
  logoUrl: string | null;
  clinic: string;
  /** Pages this person may open (doctor: all). */
  allowed: string[];
}) {
  const path = usePathname();
  const TABS = ALL_TABS.filter((t) => !t.perm || p.allowed.includes(t.perm));
  return (
    <>
      <nav
        aria-label="Main"
        className="sticky top-0 z-40 hidden h-dvh w-[88px] shrink-0 flex-col items-center gap-3 py-6 md:flex"
      >
        <Link
          href="/today"
          className="display mb-4 grid size-12 place-items-center overflow-hidden rounded-2xl text-[22px] font-bold tracking-tight"
          aria-label={`${p.clinic} — Today`}
        >
          {p.logoUrl ? (
            <img
              src={p.logoUrl}
              alt=""
              className="size-full bg-surface object-contain p-1"
            />
          ) : (
            <span>
              n<span className="text-wait">.</span>
            </span>
          )}
        </Link>
        <ul className="flex flex-col gap-3">
          {TABS.map(({ href, label, Icon }) => (
            <li key={href} className="group relative">
              <Link
                href={href}
                aria-label={label}
                aria-current={on(path, href) ? "page" : undefined}
                className="btn-icon nudge shadow-[var(--shadow)]"
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </Link>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-1/2 left-[56px] z-40 -translate-y-1/2 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-bg opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              >
                {label}
              </span>
            </li>
          ))}
        </ul>
        <form action="/logout" method="post" className="mt-auto">
          <button
            type="submit"
            aria-label="Log out"
            className="btn-icon nudge text-muted"
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </form>
      </nav>

      <nav
        aria-label="Main"
        className="glass fixed inset-x-3 bottom-3 z-30 rounded-[28px] border shadow-[var(--shadow-lift)] md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
          }}
        >
          {TABS.map(({ href, label, Icon }) => {
            const active = on(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-ink" : "text-muted"}`}
                >
                  <span
                    className={`grid size-8 place-items-center rounded-full transition-colors ${active ? "bg-accent text-accent-ink" : ""}`}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  {label === "Add patient" ? "Add" : label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
