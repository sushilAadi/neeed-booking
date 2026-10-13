"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  BriefcaseMedical,
  Calendar,
  CheckCircle,
  Home as HomeIcon,
  Info,
  LogOut,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { AssistantView } from "@/components/AssistantView";
import { ClientView } from "@/components/ClientView";
import { DoctorView } from "@/components/DoctorView";
import { Header } from "@/components/Header";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AppointmentProvider,
  useAppointments,
} from "@/context/AppointmentContext";

function DashboardContainer() {
  const { role, toasts, removeToast, setRole } = useAppointments();
  const { open } = useSidebar();
  const [activeTab, setActiveTab] = useState("dashboard");

  const toggleRole = () => {
    if (role === "client") setRole("doctor");
    else if (role === "doctor") setRole("assistant");
    else setRole("client");
  };

  const renderActiveView = () => {
    if (activeTab !== "dashboard" && activeTab !== "appointments") {
      return (
        <motion.div
          key="placeholder"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white border rounded-2xl p-8"
        >
          <Info className="w-12 h-12 text-slate-300 mb-4 animate-bounce" />
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider">
            {activeTab.replace("-", " ")} Panel
          </h3>
          <p className="text-xs max-w-sm leading-relaxed text-slate-500 mt-2">
            This module is currently in mock development. The primary features
            are active in the "Dashboard" and "Appointments" tabs.
          </p>
        </motion.div>
      );
    }

    switch (role) {
      case "client":
        return (
          <motion.div
            key="client-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <ClientView />
          </motion.div>
        );
      case "doctor":
        return (
          <motion.div
            key="doctor-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <DoctorView />
          </motion.div>
        );
      case "assistant":
        return (
          <motion.div
            key="assistant-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <AssistantView />
          </motion.div>
        );
      default:
        return null;
    }
  };

  const navItems = [
    { id: "dashboard", icon: HomeIcon, label: "Dashboard" },
    { id: "appointments", icon: Calendar, label: "Appointments" },
    { id: "records", icon: BriefcaseMedical, label: "Medical Records" },
    { id: "health", icon: Activity, label: "Health Stats" },
    { id: "settings", icon: Settings, label: "Settings" },
    { id: "info", icon: Info, label: "Info & Support" },
  ];

  return (
    <div className="flex flex-row min-h-screen bg-slate-50 relative w-full">
      {/* Composable Animated Collapsible Sidebar */}
      <Sidebar>
        <SidebarHeader className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-primary-lime font-black text-sm">
            M.
          </div>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col text-left"
            >
              <span className="font-extrabold text-slate-800 text-xs tracking-tight">
                MedX Clinic
              </span>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none">
                Management
              </span>
            </motion.div>
          )}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Portal Navigation</SidebarGroupLabel>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      active={activeTab === item.id}
                      onClick={() => setActiveTab(item.id)}
                      tooltip={item.label}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      {open && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-xs font-semibold whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleRole}
                tooltip={`Active Role: ${role}. Click to cycle.`}
              >
                <LogOut className="w-5 h-5 rotate-180 shrink-0 text-slate-400" />
                {open && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-semibold whitespace-nowrap"
                  >
                    Role: {role.toUpperCase()}
                  </motion.span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Top Header */}
        <Header />

        {/* Scrollable Dashboard Body */}
        <main className="flex-1 overflow-y-auto px-8 py-2 relative">
          <AnimatePresence mode="wait">{renderActiveView()}</AnimatePresence>
        </main>
      </SidebarInset>

      {/* Floating Animated Real-time Alerts / Toasts List */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === "success";
            const isWarning = toast.type === "warning";
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.15 },
                }}
                className={`p-4 rounded-xl border shadow-xl flex items-start gap-3 pointer-events-auto backdrop-blur-sm ${
                  isSuccess
                    ? "bg-emerald-950/95 text-emerald-50 border-emerald-800"
                    : isWarning
                      ? "bg-rose-950/95 text-rose-50 border-rose-800"
                      : "bg-slate-950/95 text-slate-50 border-slate-800"
                }`}
              >
                <div className="mt-0.5">
                  {isSuccess ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : isWarning ? (
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Bell className="w-4 h-4 text-primary-lime" />
                  )}
                </div>
                <div className="flex-1 flex flex-col text-left">
                  <span className="text-[11px] leading-relaxed font-bold">
                    {toast.message}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AppointmentProvider>
      <SidebarProvider>
        <DashboardContainer />
      </SidebarProvider>
    </AppointmentProvider>
  );
}
