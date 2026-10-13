"use client";

import { Bell, MessageSquare, Search } from "lucide-react";
import type React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { type RoleType, useAppointments } from "@/context/AppointmentContext";

export const Header: React.FC = () => {
  const { role, setRole, toasts } = useAppointments();

  return (
    <header className="h-20 bg-white/70 backdrop-blur-md border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40">
      {/* Left side: Trigger + Search */}
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="relative w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            placeholder="Search doctors, services..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100/80 border border-slate-200 rounded-full text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-lime-hover focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Role Switcher Controls */}
      <div className="flex items-center bg-slate-100 border border-slate-200/80 p-1 rounded-full shadow-sm">
        {(["client", "doctor", "assistant"] as RoleType[]).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all uppercase tracking-wider ${
              role === r
                ? "bg-slate-900 text-primary-lime shadow-md scale-102"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            }`}
          >
            {r === "client"
              ? "Patient App"
              : r === "doctor"
                ? "Doctor Hub"
                : "Assistant Panel"}
          </button>
        ))}
      </div>

      {/* Actions (Notifications & Profile) */}
      <div className="flex items-center gap-4">
        {/* Messages */}
        <button className="relative p-2.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-full transition-all text-slate-600">
          <MessageSquare className="w-4.5 h-4.5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
        </button>

        {/* Notifications */}
        <button className="relative p-2.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-full transition-all text-slate-600">
          <Bell className="w-4.5 h-4.5" />
          {toasts.length > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-bounce" />
          )}
        </button>

        {/* Active Role Badge */}
        <div className="flex items-center gap-2 border-l pl-4 border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 border border-primary-lime/30 flex items-center justify-center text-primary-lime font-black text-xs">
            {role.substring(0, 2).toUpperCase()}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-800">
              {role === "client"
                ? "Patient Access"
                : role === "doctor"
                  ? "Dr. Liza Martin"
                  : "Assistant Access"}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase">
              {role === "client"
                ? "Visitor"
                : role === "doctor"
                  ? "Chief Cardiologist"
                  : "Staff"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
