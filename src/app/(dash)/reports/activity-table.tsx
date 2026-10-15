"use client";

import { type Column, DataTable } from "@/components/data-table";

export type ActivityRow = {
  id: string;
  when: string;
  who: string;
  kind: string;
  cls: string;
  what: string;
};

const COLUMNS: Column<ActivityRow>[] = [
  {
    key: "when",
    label: "When",
    text: (a) => a.when,
    filter: "text",
    className: "whitespace-nowrap text-muted",
  },
  {
    key: "who",
    label: "Who",
    text: (a) => a.who,
    filter: "select",
    className: "whitespace-nowrap font-semibold",
  },
  {
    key: "kind",
    label: "Type",
    text: (a) => a.kind,
    filter: "select",
    render: (a) => <span className={`badge ${a.cls}`}>{a.kind}</span>,
  },
  { key: "what", label: "What happened", text: (a) => a.what, filter: "text" },
];

/** Activity log in the shared table design (same as History). */
export function ActivityTable(p: { rows: ActivityRow[]; className?: string }) {
  return (
    <DataTable
      label="Activity"
      rows={p.rows}
      columns={COLUMNS}
      rowKey={(a) => a.id}
      className={p.className}
      empty="Nothing yet. Bookings, visits and changes show up here."
    />
  );
}
