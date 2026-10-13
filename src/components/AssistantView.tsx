"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CalendarCheck,
  Check,
  FileClock,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  UserPlus,
  Users,
  Video,
  X,
  XOctagon,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  type BookingType,
  useAppointments,
} from "@/context/AppointmentContext";

export const AssistantView: React.FC = () => {
  const {
    appointments,
    updateAppointmentStatus,
    datesList,
    bookAppointment,
    doctors,
  } = useAppointments();

  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "online" | "offline">(
    "all",
  );

  // Form states for adding walk-in bookings
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("Male");
  const [doctorName, setDoctorName] = useState(doctors[0].name);
  const [bookingDate, setBookingDate] = useState(datesList[0].dateString);
  const [bookingTime, setBookingTime] = useState("10:30");
  const [bookingType, setBookingType] = useState<BookingType>("offline");
  const [reason, setReason] = useState("");

  // Statistics calculation for the sidebar
  const totalCount = appointments.length;
  const completedCount = appointments.filter(
    (a) => a.status === "completed" || a.status === "accepted",
  ).length;
  const pendingCount = appointments.filter(
    (a) => a.status === "pending",
  ).length;
  const canceledCount = appointments.filter(
    (a) => a.status === "canceled" || a.status === "rejected",
  ).length;

  const sidebarStats = [
    {
      label: "Total Appointments",
      value: totalCount,
      change: "+5.6%",
      isPositive: true,
      icon: Users,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Completed Counselling",
      value: completedCount,
      change: "-1.6%",
      isPositive: false,
      icon: CalendarCheck,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Pending Appointments",
      value: pendingCount,
      change: "+9.7%",
      isPositive: true,
      icon: FileClock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Canceled Appointments",
      value: canceledCount,
      change: "-0.2%",
      isPositive: false,
      icon: XOctagon,
      color: "text-rose-600 bg-rose-50",
    },
  ];

  // Lists
  const pendingRequests = appointments.filter(
    (apt) => apt.status === "pending",
  );
  const acceptedAppointments = appointments.filter(
    (apt) => apt.status === "accepted",
  );

  // Filters and Searches
  const filteredAppointments = acceptedAppointments.filter((apt) => {
    const matchesSearch =
      apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.reason.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" ? true : apt.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();

    // Find category for the chosen doctor
    const doc = doctors.find((d) => d.name === doctorName);
    const category = doc ? doc.specialty : "General";

    bookAppointment({
      patientName,
      patientAge: parseInt(patientAge, 10) || 30,
      patientGender,
      doctorName,
      category,
      date: bookingDate,
      time: bookingTime,
      type: bookingType,
      reason: reason || "Walk-in Registration",
    });

    // Reset fields
    setPatientName("");
    setPatientAge("");
    setReason("");
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 py-6 text-left">
      {/* Left sidebar: Stats + Pending requests list */}
      <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
        {/* Title/Info */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-sans">
            Staff Portal
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Assistant Desk. Handle registrations and validate bookings.
          </p>
        </div>

        {/* Stats Column */}
        <div className="flex flex-col gap-3">
          {sidebarStats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="glass-panel p-5 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md/5 transition-all duration-300"
              >
                <div className={`p-2.5 rounded-xl ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <span className="text-base font-black text-slate-800">
                    {stat.value}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold ${stat.isPositive ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {stat.change}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pending Approval List */}
        <div className="glass-panel border-0 rounded-xl p-5 shadow-sm flex flex-col gap-4 hover:shadow-md/5 transition-all duration-300">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">
            Pending Verification
          </span>
          <div className="flex flex-col gap-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex flex-col gap-2.5"
              >
                <div>
                  <span className="block text-xs font-bold text-slate-800">
                    {req.patientName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {new Date(req.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {req.time}
                  </span>
                  <p className="text-[10px] text-slate-500 italic mt-1 leading-relaxed">
                    "{req.reason}"
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateAppointmentStatus(req.id, "rejected")}
                    className="flex-1 py-1 px-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                  >
                    <X className="w-3 h-3" />
                    Reject
                  </button>
                  <button
                    onClick={() => updateAppointmentStatus(req.id, "accepted")}
                    className="flex-1 py-1 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                  >
                    <Check className="w-3 h-3 text-primary-lime" />
                    Validate
                  </button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && (
              <span className="text-[10px] text-slate-400 font-semibold py-4 text-center bg-slate-50 border border-dashed rounded-xl">
                All requests validated.
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Right panel: Main Appointments card grid */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between glass-panel p-5 rounded-xl shadow-sm hover:shadow-md/5 transition-all duration-300">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm font-bold text-slate-800">
              Appointments
            </span>
            <div className="flex bg-slate-100 p-0.5 rounded-xl border">
              {(["all", "offline", "online"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded-xl text-[10px] font-bold uppercase transition-all ${
                    filterType === type
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-700 w-36 sm:w-48"
              />
            </div>

            <button
              onClick={() => setShowAddForm(true)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-primary-lime" />
              Add Walk-in
            </button>
          </div>
        </div>

        {/* Appointments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAppointments.map((apt) => {
            const dateObj = new Date(apt.date);
            const formattedDate = dateObj.toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
            });

            return (
              <div
                key={apt.id}
                className="glass-panel rounded-xl p-5 shadow-sm flex flex-col gap-4 hover:shadow-md hover:bg-white/95 transition-all duration-300 relative overflow-hidden"
              >
                {/* Header Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1 border ${
                      apt.type === "online"
                        ? "bg-blue-50 border-blue-100 text-blue-700"
                        : "bg-emerald-50 border-emerald-100 text-emerald-700"
                    }`}
                  >
                    {apt.type === "online" ? (
                      <Video className="w-3 h-3" />
                    ) : (
                      <MapPin className="w-3 h-3" />
                    )}
                    {formattedDate}, {apt.time}
                  </span>
                  <button className="text-slate-400 hover:text-slate-700">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Appointment Topic */}
                <p className="text-xs font-bold text-slate-800 leading-relaxed text-left flex-1">
                  {apt.reason}
                </p>

                {/* Patient Profile Footer */}
                <div className="flex items-center gap-3 border-t border-slate-50 pt-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border flex items-center justify-center font-bold text-xs text-slate-700 uppercase">
                    {apt.patientName.substring(0, 2)}
                  </div>
                  <div className="flex-1 text-left">
                    <span className="block text-xs font-extrabold text-slate-800">
                      {apt.patientName}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {apt.patientGender}, Age: {apt.patientAge}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredAppointments.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 font-semibold bg-slate-50 border border-dashed rounded-xl">
              No appointments match the criteria.
            </div>
          )}
        </div>
      </div>

      {/* Add Walk-in Modal Overlay */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md rounded-2xl shadow-2xl p-7 relative overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <UserPlus className="w-4.5 h-4.5 text-slate-900" />
                  Register Walk-in Patient
                </h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Form fields */}
              <form
                onSubmit={handleCreateAppointment}
                className="flex flex-col gap-4 text-left mt-4"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Patient Name
                  </label>
                  <input
                    required
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Age
                    </label>
                    <input
                      required
                      type="number"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      placeholder="e.g. 35"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Gender
                    </label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Doctor
                    </label>
                    <select
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    >
                      {doctors.map((doc) => (
                        <option key={doc.id} value={doc.name}>
                          {doc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Visit Type
                    </label>
                    <select
                      value={bookingType}
                      onChange={(e) =>
                        setBookingType(e.target.value as BookingType)
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    >
                      <option value="offline">Offline Visit</option>
                      <option value="online">Online Call</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Date
                    </label>
                    <select
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    >
                      {datesList.map((d) => (
                        <option key={d.dateString} value={d.dateString}>
                          {d.monthName} {d.dayNum}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Time Slot
                    </label>
                    <select
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    >
                      {[
                        "08:30",
                        "09:30",
                        "10:30",
                        "11:30",
                        "12:30",
                        "13:30",
                        "14:30",
                        "15:30",
                        "16:30",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Reason / Symptoms
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Brief description..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-primary-lime" />
                  Register Booking
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
