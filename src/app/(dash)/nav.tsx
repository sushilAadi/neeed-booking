"use client";

import { BarChart3, CalendarDays, Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today", Icon: CalendarDays },
  { href: "/add", label: "Add patient", Icon: UserPlus },
  { href: "/reports", label: "Reports", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

/** Bottom tab bar on phones, side menu from 768 px. */
export function Nav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:w-60 md:border-t-0 md:border-r md:pb-0"
    >
      <p className="display hidden px-6 pt-6 pb-8 text-xl font-bold md:block">
        Neeed
      </p>
      <ul className="mx-auto grid max-w-xl grid-cols-4 md:max-w-none md:grid-cols-1 md:gap-1 md:px-3">
        {TABS.map(({ href, label, Icon }) => {
          const on = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold transition-colors md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-[15px] ${
                  on
                    ? "text-accent md:bg-accent-soft"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={22} strokeWidth={on ? 2.4 : 1.9} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
