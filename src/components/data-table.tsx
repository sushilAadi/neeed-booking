"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  label: string;
  /** Text used for filtering and default display. */
  text: (row: T) => string;
  render?: (row: T) => React.ReactNode;
  /** "text" = type to filter, "select" = pick one of the values, none = no filter. */
  filter?: "text" | "select";
  className?: string;
};

/** Compact table: fixed header with a filter per column, only the body scrolls. */
export function DataTable<T>(p: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  href?: (row: T) => string;
  selected?: string | null;
  empty?: string;
  className?: string;
  label: string;
  /** Table min width before it scrolls sideways. */
  minWidth?: number;
}) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>({});
  const shown = useMemo(
    () =>
      p.rows.filter((r) =>
        p.columns.every((c) => {
          const v = f[c.key]?.trim().toLowerCase();
          if (!v) return true;
          const t = c.text(r).toLowerCase();
          return c.filter === "select"
            ? t === v
            : t.replace(/\s/g, "").includes(v.replace(/\s/g, ""));
        }),
      ),
    [p.rows, p.columns, f],
  );
  const options = (c: Column<T>) =>
    [...new Set(p.rows.map(c.text))].filter(Boolean).sort();

  return (
    <div className={`scroll-area inner overflow-x-auto ${p.className ?? ""}`}>
      <table
        style={{ minWidth: p.minWidth ?? 620 }}
        className="w-full border-separate border-spacing-0 text-left text-sm"
      >
        <caption className="sr-only">{p.label}</caption>
        <thead className="sticky top-0 z-10 bg-sunk text-[12px] text-muted">
          <tr>
            {p.columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 pt-2.5 pb-1 font-semibold ${c.className ?? ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
          <tr>
            {p.columns.map((c) => (
              <th
                key={c.key}
                className="border-b border-line px-2 pb-2 font-normal"
              >
                {c.filter === "text" && (
                  <input
                    className="w-full min-w-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink"
                    placeholder="Filter"
                    aria-label={`Filter by ${c.label}`}
                    value={f[c.key] ?? ""}
                    onChange={(e) => setF({ ...f, [c.key]: e.target.value })}
                  />
                )}
                {c.filter === "select" && (
                  <select
                    className="w-full min-w-0 rounded-full border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
                    aria-label={`Filter by ${c.label}`}
                    value={f[c.key] ?? ""}
                    onChange={(e) => setF({ ...f, [c.key]: e.target.value })}
                  >
                    <option value="">All</option>
                    {options(c).map((o) => (
                      <option key={o} value={o.toLowerCase()}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = p.rowKey(r);
            const on = p.selected === k;
            return (
              <tr
                key={k}
                aria-current={on ? "true" : undefined}
                // The whole row opens it; the link in the first cell keeps it keyboard-reachable.
                onClick={
                  p.href
                    ? (e) => {
                        if (
                          !(e.target as HTMLElement).closest(
                            "a,button,input,select",
                          )
                        )
                          router.push((p.href as (r: T) => string)(r), {
                            scroll: false,
                          });
                      }
                    : undefined
                }
                className={`group ${p.href ? "cursor-pointer" : ""} ${on ? "bg-done-soft" : "hover:bg-sunk"}`}
              >
                {p.columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border-b border-line px-3 py-2.5 ${c.className ?? ""}`}
                  >
                    {p.href && i === 0 ? (
                      <Link
                        href={p.href(r)}
                        scroll={false}
                        className="font-semibold underline-offset-2 group-hover:underline"
                      >
                        {c.render ? c.render(r) : c.text(r)}
                      </Link>
                    ) : c.render ? (
                      c.render(r)
                    ) : (
                      c.text(r)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
          {!shown.length && (
            <tr>
              <td
                colSpan={p.columns.length}
                className="px-3 py-8 text-center text-muted"
              >
                {p.empty ?? "Nothing matches these filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
