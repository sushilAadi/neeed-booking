"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Reports } from "@/lib/clinic/reports";

const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const axis = { fontSize: 12, fill: "var(--muted)" };

/** Collection by month as a soft area line (reference "Income vs expense" style). */
export function CollectionLine({
  data,
}: {
  data: Reports["collectionByMonth"];
}) {
  const rows = data.map((x) => ({
    label: MON[Number(x.month.slice(5, 7)) - 1],
    amount: x.amount,
  }));
  return (
    <div className="h-full min-h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="money" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--done-fill)"
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor="var(--done-fill)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              color: "var(--ink)",
              fontSize: 13,
            }}
            formatter={(v) => [
              `₹${Number(v).toLocaleString("en-IN")}`,
              "Collected",
            ]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--done-fill)"
            strokeWidth={2.5}
            fill="url(#money)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
