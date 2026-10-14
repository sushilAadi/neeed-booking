"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Reports } from "@/lib/clinic/reports";

const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const mon = (m: string) => MON[Number(m.slice(5, 7)) - 1];
const axis = { fontSize: 12, fill: "var(--muted)" };
const tip = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    color: "var(--ink)",
    fontSize: 13,
  },
  cursor: { fill: "var(--sunk)" },
};

function Panel(p: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-3 p-4" aria-label={p.title}>
      <div>
        <h2 className="font-bold">{p.title}</h2>
        {p.note && <p className="text-[13px] text-muted">{p.note}</p>}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          {p.children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function Charts({ r }: { r: Reports }) {
  const months = (rows: { month: string }[]) =>
    rows.map((x) => ({ ...x, label: mon(x.month) }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Collection by month" note="Fees of completed visits">
        <BarChart
          data={months(r.collectionByMonth)}
          margin={{ left: -12, right: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            {...tip}
            formatter={(v) => [
              `₹${Number(v).toLocaleString("en-IN")}`,
              "Collected",
            ]}
          />
          <Bar dataKey="amount" fill="var(--accent)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </Panel>
      <Panel title="Patients per day" note="Last 30 days, completed visits">
        <LineChart
          data={r.patientsByDay.map((d) => ({ ...d, label: d.date.slice(8) }))}
          margin={{ left: -24, right: 8 }}
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip {...tip} formatter={(v) => [v, "Patients"]} />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </Panel>
      <Panel title="New vs returning" note="By each patient's first visit">
        <BarChart
          data={months(r.newVsReturning)}
          margin={{ left: -24, right: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip {...tip} />
          <Bar dataKey="new" name="New" stackId="a" fill="var(--accent)" />
          <Bar
            dataKey="returning"
            name="Returning"
            stackId="a"
            fill="var(--wait)"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </Panel>
      <Panel title="WhatsApp vs reception" note="Where bookings came from">
        <BarChart data={months(r.bySource)} margin={{ left: -24, right: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip {...tip} />
          <Bar
            dataKey="whatsapp"
            name="WhatsApp"
            stackId="a"
            fill="var(--accent)"
          />
          <Bar
            dataKey="reception"
            name="Reception"
            stackId="a"
            fill="var(--muted)"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </Panel>
      <Panel title="Cancellations" note="Who cancelled">
        <BarChart
          data={months(r.cancellations)}
          margin={{ left: -24, right: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip {...tip} />
          <Bar
            dataKey="patient"
            name="Patient"
            stackId="a"
            fill="var(--wait)"
          />
          <Bar
            dataKey="doctor"
            name="Clinic"
            stackId="a"
            fill="var(--danger)"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </Panel>
    </div>
  );
}
