"use client";

import {
  CalendarCheck,
  CalendarRange,
  Check,
  Clock,
  Eye,
  FilePlus2,
  MapPin,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DoctorSetup } from "@/components/DoctorSetup";
import { History } from "@/components/History";
import { useAppointments } from "@/context/AppointmentContext";

export const DoctorView: React.FC = () => {
  const { appointments, updateAppointmentStatus, datesList, selectedDoctor } =
    useAppointments();

  const [activeDateTab, setActiveDateTab] = useState<string>(
    datesList[0].dateString,
  );

  // Statistics Calculation
  const totalBookings = appointments.length;
  const _completed = appointments.filter(
    (a) => a.status === "completed" || a.status === "accepted",
  ).length;
  const pending = appointments.filter((a) => a.status === "pending").length;
  const canceled = appointments.filter(
    (a) => a.status === "canceled" || a.status === "rejected",
  ).length;

  const todayDateString = datesList[0].dateString;
  const todayBookingsCount = appointments.filter(
    (a) => a.date === todayDateString,
  ).length;

  const stats = [
    {
      label: "Total Counseling",
      value: "2.9K",
      change: "+5.6%",
      isPositive: true,
      icon: Users,
    },
    {
      label: "Overall Booking",
      value: `${totalBookings}`,
      change: "-0.2%",
      isPositive: false,
      icon: CalendarCheck,
    },
    {
      label: "New Appointments",
      value: `${pending}`,
      change: "-4.0%",
      isPositive: false,
      icon: FilePlus2,
    },
    {
      label: "Canceled",
      value: `${canceled}`,
      change: "+2.1%",
      isPositive: true,
      icon: X,
    },
    {
      label: "Total Visitors",
      value: "144.7K",
      change: "+7.5%",
      isPositive: true,
      icon: Eye,
    },
    {
      label: "Appointments Today",
      value: `${todayBookingsCount}`,
      change: "+0.01%",
      isPositive: true,
      icon: Clock,
    },
  ];

  // Mock Age Demographic Data for Patients Overview Chart
  const chartData = [
    { group: "8-15", count: 17 },
    { group: "16-20", count: 45 },
    { group: "21-29", count: 102 },
    { group: "30-45", count: 148 },
    { group: "46-60", count: 58 },
    { group: "61-80", count: 3 },
  ];

  // List of Pending Requests
  const pendingRequests = appointments.filter(
    (apt) => apt.status === "pending",
  );

  // List of Schedule appointments for the selected Date
  const scheduleAppointments = appointments.filter(
    (apt) => apt.date === activeDateTab && apt.status === "accepted",
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 py-6 w-full">
      {/* Main Analytics Panel */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Header */}
        <div className="text-left">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            Doctor Hub
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Monitor clinic analytics, manage schedules, and review appointments.
          </p>
        </div>

        {/* 1. Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="glass-panel p-5 rounded-2xl shadow-sm flex flex-col gap-2 relative overflow-hidden hover:shadow-md/5 transition-all duration-300"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-600">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-slate-800">
                    {stat.value}
                  </span>
                  <span
                    className={`text-[10px] font-bold flex items-center gap-0.5 ${
                      stat.isPositive ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {stat.isPositive ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {stat.change}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2. Demographic Chart Panel */}
        <div className="glass-panel p-6 rounded-2xl shadow-sm flex flex-col gap-4 text-left hover:shadow-md/5 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-800">
                Patients Overview
              </span>
              <p className="text-[10px] text-slate-400 font-semibold">
                Age distribution chart for the current month
              </p>
            </div>
            <select className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">
              <option>This Month</option>
              <option>Last Month</option>
            </select>
          </div>

          {/* Bar Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="group"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    background: "#0f172a",
                    color: "#fff",
                    borderRadius: "8px",
                    fontSize: "11px",
                    border: "none",
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.count === 102 ? "#3b82f6" : "#e2e8f0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Upcoming Schedule Tab List */}
        <div className="glass-panel p-6 rounded-2xl shadow-sm flex flex-col gap-4 text-left hover:shadow-md/5 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-800">
                Schedule List
              </span>
              <p className="text-[10px] text-slate-400 font-semibold">
                Accepted appointments for selected date
              </p>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-200/60 p-1 rounded-xl">
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Select Date</span>
            </div>
          </div>

          {/* Calendar Horiz Row */}
          <div className="flex gap-2 overflow-x-auto pb-2 scroll-smooth border-b border-slate-100">
            {datesList.map((d) => {
              const isSelected = activeDateTab === d.dateString;
              const dayBookings = appointments.filter(
                (a) => a.date === d.dateString && a.status === "accepted",
              );

              return (
                <button
                  key={d.dateString}
                  onClick={() => setActiveDateTab(d.dateString)}
                  className={`flex flex-col items-center justify-center py-2 px-3.5 rounded-xl min-w-14 border transition-all ${
                    isSelected
                      ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {d.dayName}
                  </span>
                  <span className="text-sm font-black mt-0.5">{d.dayNum}</span>
                  {dayBookings.length > 0 && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? "bg-primary-lime" : "bg-blue-500"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Table List of Appointments */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold">
                  <th className="py-3 text-left font-bold">APPOINT FOR</th>
                  <th className="py-3 text-left font-bold">PATIENT NAME</th>
                  <th className="py-3 text-left font-bold">DATE & TIME</th>
                  <th className="py-3 text-center font-bold">TYPE</th>
                  <th className="py-3 text-right font-bold">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scheduleAppointments.map((apt) => (
                  <tr
                    key={apt.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-3 font-semibold text-slate-800 text-left">
                      {apt.reason}
                    </td>
                    <td className="py-3 text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-extrabold text-[10px]">
                          {apt.patientName.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-700">
                          {apt.patientName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 font-medium text-slate-600 text-left">
                      {new Date(apt.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      , {apt.time}
                    </td>
                    <td className="py-3 text-center">
                      <span className="inline-flex p-1 bg-slate-100 border rounded-xl text-slate-600 justify-center">
                        {apt.type === "online" ? (
                          <Video className="w-3.5 h-3.5" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() =>
                          updateAppointmentStatus(apt.id, "canceled")
                        }
                        className="px-2.5 py-1.5 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold transition-all"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
                {scheduleAppointments.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-slate-400 font-semibold bg-slate-50 border border-dashed rounded-xl"
                    >
                      No accepted appointments on this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DoctorSetup />
        <History
          title="Patient & Visit History"
          doctorName={selectedDoctor.name}
        />
      </div>

      {/* Appointment Requests Sidebar */}
      <aside className="w-full lg:w-[350px] shrink-0 flex flex-col gap-6">
        <div className="glass-panel border-0 rounded-2xl p-6 shadow-sm flex flex-col gap-5 text-left h-full hover:shadow-md/5 transition-all duration-300">
          <div>
            <span className="text-sm font-bold text-slate-800">
              Appoint Request
            </span>
            <p className="text-[10px] text-slate-400 font-semibold">
              Incoming booking requests waiting approval
            </p>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-1">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-3 relative overflow-hidden"
              >
                {/* Type Tag */}
                <span
                  className={`absolute top-0 right-0 px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-bl-xl flex items-center gap-1 ${
                    req.type === "online"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {req.type === "online" ? (
                    <Video className="w-2.5 h-2.5" />
                  ) : (
                    <MapPin className="w-2.5 h-2.5" />
                  )}
                  {req.type}
                </span>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-black text-xs text-slate-700">
                    {req.patientName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-800 leading-tight">
                      {req.patientName}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      {req.patientGender}, {req.patientAge} yrs • {req.category}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-[11px] font-medium text-slate-600 bg-white border p-2 rounded-xl">
                  <span className="text-slate-800 font-semibold leading-relaxed">
                    "{req.reason}"
                  </span>
                  <span className="text-blue-600 font-bold mt-1">
                    Date:{" "}
                    {new Date(req.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {req.time}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => updateAppointmentStatus(req.id, "rejected")}
                    className="py-2 px-3 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                  <button
                    onClick={() => updateAppointmentStatus(req.id, "accepted")}
                    className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
                  >
                    <Check className="w-3.5 h-3.5 text-primary-lime" />
                    Accept
                  </button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && (
              <div className="py-8 text-center text-xs font-semibold text-slate-400 bg-slate-50 border border-dashed rounded-xl">
                No new requests.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
