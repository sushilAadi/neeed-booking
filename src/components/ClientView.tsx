"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  Calendar,
  Clipboard,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  Star,
  Stethoscope,
  User,
  Video,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { History } from "@/components/History";
import {
  type BookingType,
  useAppointments,
} from "@/context/AppointmentContext";

export const ClientView: React.FC = () => {
  const {
    doctors,
    selectedDoctor,
    setSelectedDoctor,
    selectedCategory,
    setSelectedCategory,
    selectedDate,
    setSelectedDate,
    datesList,
    appointments,
    blockedSlots,
    bookAppointment,
  } = useAppointments();

  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>("offline");
  const [showBookingForm, setShowBookingForm] = useState(false);

  // Patient details form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("Male");
  const [patientPhone, setPatientPhone] = useState("");
  const [reason, setReason] = useState("");

  const categories = [
    "Cardiology",
    "Pediatrics",
    "Psychology",
    "Ophthalmology",
    "Oncology",
    "Traumatology",
  ];

  // Get active doctor's schedule for selected date
  const getActiveSchedule = () => {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dObj = new Date(selectedDate);
    const dayName = days[dObj.getDay()];
    return selectedDoctor.weeklySchedule[dayName] || { slots: [] };
  };

  const currentSchedule = getActiveSchedule();

  // Helper to check if a specific slot is already booked
  const isSlotBooked = (time: string) => {
    const blocked = blockedSlots.some(
      (b) =>
        b.doctorName === selectedDoctor.name &&
        b.date === selectedDate &&
        b.time === time,
    );
    return (
      blocked ||
      appointments.some(
        (apt) =>
          apt.doctorName === selectedDoctor.name &&
          apt.date === selectedDate &&
          apt.time === time &&
          apt.status !== "canceled" &&
          apt.status !== "rejected",
      )
    );
  };

  const handleBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTime) return;

    bookAppointment({
      patientName,
      patientAge: parseInt(patientAge, 10) || 30,
      patientGender,
      patientPhone,
      doctorName: selectedDoctor.name,
      category: selectedDoctor.specialty,
      date: selectedDate,
      time: selectedTime,
      type: bookingType,
      reason: reason || "General Consultation",
    });

    // Reset Form
    setPatientName("");
    setPatientAge("");
    setPatientPhone("");
    setReason("");
    setSelectedTime(null);
    setShowBookingForm(false);
  };

  // Find formatted month name for display
  const activeDateInfo = datesList.find((d) => d.dateString === selectedDate);
  const currentMonthYear = activeDateInfo
    ? `${activeDateInfo.monthName}, ${new Date(selectedDate).getFullYear()}`
    : "Select Date";

  return (
    <div className="flex flex-1 flex-col lg:flex-row gap-8 py-6">
      {/* Left Booking Config */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            Make appointment
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Choose your preferences below to book your appointment slot.
          </p>
        </div>

        {/* 1. Choose Category */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-3">
          <span className="text-sm font-bold text-slate-800">
            Choose category
          </span>
          <div className="flex flex-wrap gap-2.5">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                    isActive
                      ? "bg-slate-900 border-slate-900 text-primary-lime shadow-sm"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Choose Doctor */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">
              Choose doctor
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              Showing specialists for {selectedCategory}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {doctors
              .filter((d) => d.specialty === selectedCategory)
              .map((doc) => {
                const isSelected = selectedDoctor.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoctor(doc);
                      setSelectedTime(null); // Reset time when doctor changes
                    }}
                    className={`relative h-[200px] max-w-[180px] w-full overflow-hidden group cursor-pointer border-4 transition-all duration-500 flex flex-col justify-end ${
                      isSelected
                        ? "border-primary-lime shadow-xl"
                        : "border-transparent hover:border-slate-200/50"
                    }`}
                    style={{ borderRadius: "24px" }}
                  >
                    {/* Portrait Background Image - positioned top to avoid cropping */}
                    <img
                      src={doc.avatar}
                      alt={doc.name}
                      className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-103"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent opacity-70" />

                    {/* Top Rating Chip */}
                    <div
                      className="absolute top-2 left-2 bg-white/95 backdrop-blur-sm px-2 py-0.5 flex items-center gap-1 shadow-sm text-amber-500 font-extrabold text-[9px] z-10"
                      style={{ borderRadius: "6px" }}
                    >
                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                      <span>{doc.rating.toFixed(1)}</span>
                    </div>

                    {/* Bottom Compact Glassmorphic Overlay Panel */}
                    <div
                      className="absolute bottom-2 left-2 right-2 p-2.5 bg-white/75 backdrop-blur-md border border-white/40 shadow-lg flex flex-col gap-1.5 z-10"
                      style={{ borderRadius: "14px" }}
                    >
                      <div className="text-left leading-tight">
                        <span className="block text-xs font-black text-slate-800 tracking-tight truncate">
                          {doc.name}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block truncate">
                          {doc.specialty} Specialist
                        </span>
                      </div>

                      {/* Micro Icons and Circle Button Row */}
                      <div className="flex items-center justify-between mt-0.5">
                        <div className="flex gap-1.5">
                          <div
                            className="w-6 h-6 bg-white/90 border border-slate-200/50 flex items-center justify-center text-slate-600 shadow-sm"
                            style={{ borderRadius: "50%" }}
                          >
                            <Stethoscope className="w-3 h-3" />
                          </div>
                          <div
                            className="w-6 h-6 bg-white/90 border border-slate-200/50 flex items-center justify-center text-slate-600 shadow-sm"
                            style={{ borderRadius: "50%" }}
                          >
                            <Activity className="w-3 h-3" />
                          </div>
                          <div
                            className="w-6 h-6 bg-white/90 border border-slate-200/50 flex items-center justify-center text-slate-600 shadow-sm"
                            style={{ borderRadius: "50%" }}
                          >
                            <Briefcase className="w-3 h-3" />
                          </div>
                        </div>

                        <div
                          className={`w-7 h-7 flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-slate-900 text-primary-lime shadow-md"
                              : "bg-slate-100 text-slate-850 hover:bg-slate-200"
                          }`}
                          style={{ borderRadius: "50%" }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            {doctors.filter((d) => d.specialty === selectedCategory).length ===
              0 && (
              <div className="col-span-full py-12 text-center text-xs font-semibold text-slate-400 bg-white/60 border border-dashed rounded-xl">
                No doctors currently listed for {selectedCategory}. Try another
                category!
              </div>
            )}
          </div>
        </div>

        {/* 3. Choose Date & Time */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">
              Choose date and time
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full border border-slate-200/50">
              <Calendar className="w-3.5 h-3.5" />
              <span>{currentMonthYear}</span>
            </div>
          </div>

          {/* Dates list */}
          <div className="flex gap-2 overflow-x-auto pb-2 scroll-smooth">
            {datesList.map((item) => {
              const isSelected = selectedDate === item.dateString;
              return (
                <button
                  key={item.dateString}
                  onClick={() => {
                    setSelectedDate(item.dateString);
                    setSelectedTime(null); // Reset time when date changes
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl min-w-16 transition-all duration-300 border ${
                    isSelected
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                    {item.dayName}
                  </span>
                  <span className="text-base font-black leading-none mt-1">
                    {item.dayNum}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Time Slots Grid */}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest text-left">
              Available Slots
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {currentSchedule.slots.map((time) => {
                const booked = isSlotBooked(time);
                const active = selectedTime === time;

                return (
                  <button
                    key={time}
                    disabled={booked}
                    onClick={() => setSelectedTime(time)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all relative ${
                      booked
                        ? "bg-slate-100 text-slate-400 border border-slate-200/50 line-through cursor-not-allowed opacity-60"
                        : active
                          ? "bg-primary-lime text-slate-900 border border-slate-900 shadow-sm font-black scale-102"
                          : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {time}
                    {booked && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
                    )}
                  </button>
                );
              })}
              {currentSchedule.slots.length === 0 && (
                <div className="col-span-full py-4 text-center text-xs font-semibold text-slate-400 bg-slate-50 border border-dashed rounded-lg">
                  No availability slots configured for this day. Please pick
                  another date.
                </div>
              )}
            </div>
          </div>

          {/* Appointment Type Toggle */}
          <div className="flex flex-col sm:flex-row items-center gap-4 border-t border-slate-100 pt-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-full sm:w-auto shrink-0 text-left">
              Visit Type:
            </span>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              <button
                type="button"
                onClick={() => setBookingType("offline")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-xs font-bold ${
                  bookingType === "offline"
                    ? "bg-slate-100 border-slate-800 text-slate-800 shadow-sm"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <MapPin className="w-4 h-4 text-slate-600" />
                Offline Visit
              </button>
              <button
                type="button"
                onClick={() => setBookingType("online")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-xs font-bold ${
                  bookingType === "online"
                    ? "bg-slate-100 border-slate-800 text-slate-800 shadow-sm"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Video className="w-4 h-4 text-slate-600" />
                Online Call
              </button>
            </div>
          </div>
        </div>

        {/* Selected Slot Summary & Book Button */}
        {selectedTime && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-4 bg-slate-900 border border-slate-900 rounded-2xl text-white shadow-xl shadow-slate-900/10"
          >
            <div className="text-left">
              <span className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Selected Schedule
              </span>
              <span className="text-sm font-black text-primary-lime mt-1 flex items-center gap-1.5">
                {activeDateInfo?.monthName} {activeDateInfo?.dayNum} at{" "}
                {selectedTime} |{" "}
                {bookingType === "online" ? "Online Call" : "In-Person"}
              </span>
            </div>
            <button
              onClick={() => setShowBookingForm(true)}
              className="px-6 py-2.5 bg-primary-lime text-slate-950 text-xs font-black rounded-xl hover:bg-primary-lime-hover shadow-lg hover:shadow-primary-lime/20 hover:scale-102 transition-all duration-300"
            >
              Book Now
            </button>
          </motion.div>
        )}

        <History title="My Booking History" />
      </div>

      {/* Right Profile Sidebar */}
      <aside className="w-full lg:w-[350px] flex flex-col gap-6 shrink-0">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          {/* Profile Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative">
              <img
                src={selectedDoctor.avatar}
                alt={selectedDoctor.name}
                className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-md"
              />
              <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-tight">
                {selectedDoctor.name}
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {selectedDoctor.specialty} Specialist
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 mt-2">
              <button className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-all">
                <MessageSquare className="w-4 h-4" />
              </button>
              <button className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-all">
                <Phone className="w-4 h-4" />
              </button>
              <button className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-all">
                <Video className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Biography */}
          <div className="text-left border-t border-slate-100 pt-4">
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Biography
            </span>
            <p className="text-xs leading-relaxed text-slate-600">
              {selectedDoctor.biography}
            </p>
          </div>

          {/* Location */}
          <div className="text-left border-t border-slate-100 pt-4 flex flex-col gap-3">
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
              Location
            </span>
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="font-semibold">{selectedDoctor.location}</span>
            </div>
            {/* Mock Inline Map Widget */}
            <div className="relative w-full h-32 rounded-xl bg-sky-100 overflow-hidden border border-slate-200/60 shadow-inner flex items-center justify-center">
              {/* Map grid lines */}
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#0369a1_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute top-1/2 left-1/3 w-32 h-1 bg-slate-400/30 transform -rotate-12" />
              <div className="absolute top-1/4 left-1/2 w-1 h-20 bg-slate-400/30" />

              {/* Map Pin */}
              <div className="relative flex flex-col items-center z-10 animate-bounce">
                <MapPin className="w-6 h-6 text-blue-600 fill-blue-600/30" />
                <div className="w-1.5 h-1.5 bg-blue-900/60 rounded-full blur-[1px] mt-0.5" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Booking Form Modal Overlay */}
      <AnimatePresence>
        {showBookingForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-blue-500" />
                  Patient Information
                </h3>
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Summary Details */}
              <div className="my-4 bg-slate-50 border p-3.5 rounded-xl text-xs text-left text-slate-600 flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Doctor:</span>
                  <span className="font-extrabold text-slate-800">
                    {selectedDoctor.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Specialty:</span>
                  <span className="font-extrabold text-slate-800">
                    {selectedDoctor.specialty}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Time & Date:</span>
                  <span className="font-extrabold text-blue-600">
                    {activeDateInfo?.monthName} {activeDateInfo?.dayNum} at{" "}
                    {selectedTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Visit Type:</span>
                  <span className="font-extrabold text-slate-800 uppercase">
                    {bookingType === "online" ? "Online Call" : "Offline Visit"}
                  </span>
                </div>
              </div>

              {/* Form fields */}
              <form
                onSubmit={handleBookSubmit}
                className="flex flex-col gap-4 text-left"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Patient Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      required
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    WhatsApp Phone Number (with Country Code)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      required
                      type="tel"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      placeholder="e.g. +1234567890"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white transition-all"
                    />
                  </div>
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
                      placeholder="e.g. 28"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Gender
                    </label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white transition-all"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Reason for Visit
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe your symptoms or reason..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4 text-primary-lime" />
                  Confirm Request
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
