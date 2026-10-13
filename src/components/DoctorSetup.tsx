"use client";

import type React from "react";
import { useState } from "react";
import { ALL_SLOTS, useAppointments } from "@/context/AppointmentContext";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DoctorSetup: React.FC = () => {
  const {
    selectedDoctor,
    setDaySlots,
    blockedSlots,
    toggleBlockedSlot,
    appointments,
    datesList,
  } = useAppointments();

  const [day, setDay] = useState("Monday");
  const [blockDate, setBlockDate] = useState(datesList[0].dateString);

  const daySlots = selectedDoctor.weeklySchedule[day]?.slots ?? [];
  const toggleWorking = (t: string) =>
    setDaySlots(
      selectedDoctor.id,
      day,
      daySlots.includes(t)
        ? daySlots.filter((s) => s !== t)
        : ALL_SLOTS.filter((s) => s === t || daySlots.includes(s)),
    );

  const blockDay = DAY_NAMES[new Date(blockDate).getDay()];
  const blockable = selectedDoctor.weeklySchedule[blockDay]?.slots ?? [];
  const isBlocked = (t: string) =>
    blockedSlots.some(
      (b) =>
        b.doctorName === selectedDoctor.name &&
        b.date === blockDate &&
        b.time === t,
    );
  const isBooked = (t: string) =>
    appointments.some(
      (a) =>
        a.doctorName === selectedDoctor.name &&
        a.date === blockDate &&
        a.time === t &&
        (a.status === "accepted" || a.status === "pending"),
    );

  return (
    <div className="glass-panel p-6 rounded-2xl shadow-sm flex flex-col gap-5 text-left">
      <div>
        <span className="text-sm font-bold text-slate-800">Practice Setup</span>
        <p className="text-[10px] text-slate-400 font-semibold">
          Set weekly hours for {selectedDoctor.name}, then block off time for
          specific dates
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Weekly hours
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                day === d
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {ALL_SLOTS.map((t) => (
            <button
              key={t}
              onClick={() => toggleWorking(t)}
              className={`py-1.5 rounded-lg text-xs font-bold border ${
                daySlots.includes(t)
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-400 border-slate-200 line-through"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Block time off (click a slot)
        </span>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {datesList.map((d) => (
            <button
              key={d.dateString}
              onClick={() => setBlockDate(d.dateString)}
              className={`flex flex-col items-center min-w-12 py-1.5 rounded-lg border text-[10px] font-bold ${
                blockDate === d.dateString
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {d.dayName}
              <span className="text-sm font-black">{d.dayNum}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {blockable.map((t) => (
            <button
              key={t}
              disabled={isBooked(t)}
              onClick={() =>
                toggleBlockedSlot(selectedDoctor.name, blockDate, t)
              }
              className={`py-1.5 rounded-lg text-xs font-bold border disabled:cursor-not-allowed ${
                isBooked(t)
                  ? "bg-blue-50 text-blue-500 border-blue-100"
                  : isBlocked(t)
                    ? "bg-rose-50 text-rose-600 border-rose-200"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              {t}
              <span className="block text-[8px] uppercase font-extrabold">
                {isBooked(t) ? "booked" : isBlocked(t) ? "blocked" : "open"}
              </span>
            </button>
          ))}
          {blockable.length === 0 && (
            <div className="col-span-full py-3 text-center text-xs font-semibold text-slate-400 bg-slate-50 border border-dashed rounded-lg">
              No working hours on {blockDay}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
