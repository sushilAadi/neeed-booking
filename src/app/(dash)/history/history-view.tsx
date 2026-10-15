"use client";

import { Rise } from "cube-motion/react";
import { CalendarPlus, FileText, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Sheet } from "@/components/sheet";
import type { Gender, Source, Status } from "@/lib/db/types";
import { rxUrlAction } from "./actions";

export type Visit = {
  id: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  phoneText: string;
  age: number | null;
  gender: Gender | null;
  area: string | null;
  reason: string | null;
  status: Status;
  fee: number | null;
  source: Source;
  completedBy: string | null;
  hasRx: boolean;
};

const GENDER = { M: "Male", F: "Female", O: "Other" } as const;
const STATUS = {
  CONFIRMED: ["Waiting", "badge-wait"],
  COMPLETED: ["Done", "badge-done"],
  CANCELLED: ["Cancelled", "badge-cancel"],
} as const;

/** Selected patient's details and every visit. Side card on desktop, sheet on phones. */
export function PatientPanel(p: {
  visits: Visit[];
  selectedId: string | null;
  closeHref: string;
}) {
  const router = useRouter();
  const v = p.visits[0];
  const body = v ? <Body visits={p.visits} /> : null;
  return (
    <>
      <aside
        aria-label="Patient"
        className="card card-pad hidden min-h-0 flex-col gap-4 lg:flex"
      >
        {body ?? (
          <div className="grid flex-1 place-items-center gap-3 text-center text-muted">
            <UserRound size={28} strokeWidth={1.75} aria-hidden />
            <p className="max-w-56 text-sm">
              Pick a visit to see the patient's details and every visit.
            </p>
          </div>
        )}
      </aside>
      <div className="lg:hidden">
        <Sheet
          open={!!v}
          onClose={() => router.push(p.closeHref, { scroll: false })}
          title={v?.name ?? "Patient"}
        >
          {body}
        </Sheet>
      </div>
    </>
  );
}

function Body({ visits }: { visits: Visit[] }) {
  const v = visits[0];
  const paid = visits.reduce(
    (n, x) => n + (x.status === "COMPLETED" ? (x.fee ?? 0) : 0),
    0,
  );
  const facts = [
    v.age !== null ? `${v.age} y` : null,
    v.gender ? GENDER[v.gender] : null,
    v.area,
  ].filter(Boolean);
  return (
    <Rise targets="children" className="flex min-h-0 flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-done-soft text-lg font-bold text-done">
          {v.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="display truncate text-[22px] font-medium">{v.name}</p>
          <p className="truncate text-sm text-muted">
            {facts.join(" · ") || "No details"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="inner p-3">
          <p className="text-muted">Visits</p>
          <p className="display text-xl font-medium">{visits.length}</p>
        </div>
        <div className="inner p-3">
          <p className="text-muted">Paid in total</p>
          <p className="display text-xl font-medium">
            ₹{paid.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/add?phone=${v.phone}`} className="btn btn-primary btn-sm">
          <CalendarPlus size={16} strokeWidth={1.75} aria-hidden /> Book again
        </Link>
        <a href={`tel:+${v.phone}`} className="btn btn-ghost btn-sm">
          <Phone size={16} strokeWidth={1.75} aria-hidden /> {v.phoneText}
        </a>
      </div>
      <ol className="scroll-area grid content-start gap-2 lg:flex-1">
        {visits.map((x) => (
          <li key={x.id} className="inner grid gap-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                {x.date} · {x.time}
              </p>
              <span className={`badge ${STATUS[x.status][1]}`}>
                {STATUS[x.status][0]}
              </span>
            </div>
            <p className="text-[13px] text-muted">
              {[
                x.reason,
                x.fee !== null ? `₹${x.fee.toLocaleString("en-IN")}` : null,
                x.completedBy ? `by ${x.completedBy}` : null,
                x.source === "whatsapp" ? "WhatsApp" : "Reception",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {x.hasRx && <RxButton id={x.id} />}
          </li>
        ))}
      </ol>
    </Rise>
  );
}

function RxButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      className="btn btn-ghost btn-sm justify-self-start"
      onClick={() =>
        start(async () => {
          const url = await rxUrlAction(id);
          if (url) window.open(url, "_blank", "noopener");
        })
      }
    >
      <FileText size={16} strokeWidth={1.75} aria-hidden />
      {busy ? "Opening…" : "View prescription PDF"}
    </button>
  );
}
