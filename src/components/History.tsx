"use client";

import { Search } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  type AppointmentStatus,
  useAppointments,
} from "@/context/AppointmentContext";

const BADGE: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  rejected: "bg-rose-100 text-rose-800",
  canceled: "bg-slate-200 text-slate-600",
};

// With doctorName: the doctor's full log, searchable by patient (patient history).
// Without: a patient looks up their own bookings by name.
export const History: React.FC<{ title: string; doctorName?: string }> = ({
  title,
  doctorName,
}) => {
  const { appointments } = useAppointments();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rows = appointments
    .filter((a) => (doctorName ? a.doctorName === doctorName : q !== ""))
    .filter((a) => a.patientName.toLowerCase().includes(q))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  return (
    <div className="glass-panel bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm flex flex-col gap-4 text-left">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-sm font-bold text-slate-800">{title}</span>
          <p className="text-[10px] text-slate-400 font-semibold">
            {doctorName
              ? `${rows.length} visits${q ? ` for "${query}"` : " on record"}`
              : "Enter your name to see your past and upcoming visits"}
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={doctorName ? "Search patient" : "Your name"}
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-800"
          />
        </div>
      </div>

      <div className="flex flex-col divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {rows.map((a) => (
          <div key={a.id} className="py-2.5 flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 font-bold text-slate-700">
              {new Date(a.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              , {a.time}
            </span>
            <span className="flex-1 min-w-0 truncate text-slate-600 font-medium">
              {doctorName ? a.patientName : a.doctorName} · {a.reason}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${BADGE[a.status]}`}
            >
              {a.status}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-xs font-semibold text-slate-400">
            {doctorName || q ? "No visits found." : "Nothing to show yet."}
          </div>
        )}
      </div>
    </div>
  );
};
