import { Rise } from "cube-motion/react";
import { CalendarCheck2, IndianRupee, MessageCircle } from "lucide-react";
import Link from "next/link";

/** Login / sign-up frame: brand panel with live-looking preview cards, form card on the right. */
export function AuthSplit(p: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section
        aria-hidden
        className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col"
      >
        <Link href="/" tabIndex={-1} className="display text-2xl font-bold">
          Neeed<span className="text-wait">.</span>
        </Link>
        <div className="mt-auto max-w-lg">
          <p className="eyebrow">For clinics in India</p>
          <p className="display mt-3 text-[52px] leading-[1.02] font-medium tracking-[-0.04em]">
            Your whole clinic desk, calm and on one screen.
          </p>
          <p className="mt-4 max-w-md text-[17px] text-muted">
            Patients book on WhatsApp. You see the queue, write the prescription
            and track the money — without the paper register.
          </p>
        </div>
        <Rise
          targets="children"
          stagger={120}
          delay={150}
          className="mt-10 grid max-w-xl grid-cols-2 gap-4 pb-4"
        >
          <div className="card col-span-2 flex items-center gap-4 p-5">
            <span className="grid size-12 place-items-center rounded-full bg-wait-soft text-wait">
              <CalendarCheck2 size={22} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Ramesh Kumar · 45 · M</p>
              <p className="text-[13px] text-muted">
                10:30 AM · Fever for 3 days
              </p>
            </div>
            <span className="badge badge-wait">Waiting</span>
          </div>
          <div className="card p-5">
            <span className="grid size-10 place-items-center rounded-full bg-ok-soft text-ok">
              <IndianRupee size={18} strokeWidth={1.75} />
            </span>
            <p className="display mt-4 text-[30px] font-medium">₹3,500</p>
            <p className="text-[13px] text-muted">Collected today</p>
          </div>
          <div className="card p-5">
            <span className="grid size-10 place-items-center rounded-full bg-done-soft text-done">
              <MessageCircle size={18} strokeWidth={1.75} />
            </span>
            <p className="mt-4 font-semibold">New booking</p>
            <p className="text-[13px] text-muted">
              Priya booked 11:00 on WhatsApp
            </p>
          </div>
        </Rise>
      </section>
      <section className="grid place-items-center px-4 py-10 lg:px-12">
        <Rise targets="children" className="grid w-full max-w-md gap-6">
          <Link href="/" className="display text-2xl font-bold lg:hidden">
            Neeed<span className="text-wait">.</span>
          </Link>
          {p.children}
        </Rise>
      </section>
    </main>
  );
}
