"use client";

import { AnimatePresence, type HTMLMotionProps, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [open, setOpen] = useState(true);

  const toggleSidebar = () => setOpen((prev) => !prev);

  // Automatically collapse sidebar on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setOpen(false);
      } else {
        setOpen(true);
      }
    };

    // Set initial
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar }}>
      <div className="flex min-h-screen w-full bg-slate-50 text-slate-900 font-sans">
        {children}
      </div>
    </SidebarContext.Provider>
  );
};

interface SidebarProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  children,
  className = "",
  ...props
}) => {
  const { open } = useSidebar();

  return (
    <motion.div
      animate={{ width: open ? 260 : 72 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1.0] }}
      className={`h-screen sticky top-0 bg-white border-r border-slate-200 text-slate-500 flex flex-col justify-between shrink-0 overflow-hidden select-none z-50 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const SidebarHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`h-20 px-4 shrink-0 flex items-center border-b border-slate-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const SidebarGroupLabel: React.FC<HTMLMotionProps<"span">> = ({
  children,
  className = "",
  ...props
}) => {
  const { open } = useSidebar();

  return (
    <AnimatePresence>
      {open && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`text-[9px] font-black text-slate-500 uppercase tracking-widest px-3 text-left ${className}`}
          {...props}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
};

export const SidebarMenu: React.FC<React.HTMLAttributes<HTMLUListElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <ul
      className={`flex flex-col gap-1 w-full list-none p-0 m-0 ${className}`}
      {...props}
    >
      {children}
    </ul>
  );
};

export const SidebarMenuItem: React.FC<
  React.LiHTMLAttributes<HTMLLIElement>
> = ({ children, className = "", ...props }) => {
  return (
    <li className={`w-full ${className}`} {...props}>
      {children}
    </li>
  );
};

interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}

export const SidebarMenuButton: React.FC<SidebarMenuButtonProps> = ({
  children,
  active = false,
  tooltip = "",
  className = "",
  ...props
}) => {
  const { open } = useSidebar();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-center rounded-xl transition-all duration-300 relative group ${
        open
          ? "w-full gap-3.5 px-3 py-2.5 justify-start text-left"
          : "w-12 h-12 justify-center mx-auto"
      } ${
        active
          ? "bg-primary-lime text-slate-900 shadow-lg shadow-primary-lime/10 font-bold"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      } ${className}`}
      {...props}
    >
      {children}

      {/* Collapsed Tooltip */}
      {!open && tooltip && hovered && (
        <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-slate-950 text-slate-50 text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap z-50">
          {tooltip}
        </div>
      )}
    </button>
  );
};

export const SidebarFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`px-4 py-4 shrink-0 border-t border-slate-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarRail: React.FC = () => {
  const { toggleSidebar } = useSidebar();
  return (
    <div
      onClick={toggleSidebar}
      className="absolute top-0 right-0 w-1 h-full hover:bg-primary-lime/20 cursor-col-resize transition-all"
    />
  );
};

export const SidebarTrigger: React.FC = () => {
  const { open, toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg transition-all"
      title={open ? "Collapse Sidebar" : "Expand Sidebar"}
    >
      {open ? (
        <ChevronLeft className="w-4 h-4" />
      ) : (
        <ChevronRight className="w-4 h-4" />
      )}
    </button>
  );
};

export const SidebarInset: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`flex-1 flex flex-col min-w-0 h-screen overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
