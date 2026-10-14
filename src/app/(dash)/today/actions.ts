"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guard";
import { type ClashMode, setClosedToday } from "@/lib/clinic/availability";
import {
  cancelVisits,
  completeWithoutRx,
  ownAppointment,
  setFee,
} from "@/lib/clinic/visits";
import { deliver } from "@/lib/wa/deliver";
import type { Send } from "@/lib/wa/types";

export type ActionResult = { ok: boolean; message: string; clash?: number };

// Web actions have no WhatsApp sender: every message goes through the 24 h window check.
const sendAll = (s: Awaited<ReturnType<typeof requireStaff>>, sends: Send[]) =>
  deliver(s.store, sends, { from: "", to: "" }, s.now);

export async function setClosedAction(
  closed: boolean,
  mode: ClashMode,
): Promise<ActionResult> {
  const s = await requireStaff();
  const r = await setClosedToday(
    s.store,
    s.doctor,
    closed,
    mode,
    s.actor,
    s.now,
  );
  if (r.clash) return { ok: false, message: "", clash: r.clash };
  await sendAll(s, r.notices);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: !closed
      ? "Open for bookings today."
      : mode === "cancel"
        ? `Closed for today. ${r.notices.length} patient(s) notified on WhatsApp.`
        : "Closed for today. No new bookings will be taken.",
  };
}

export async function cancelAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const s = await requireStaff();
  const a = await ownAppointment(s.store, s.doctor.id, id);
  if (a?.status !== "CONFIRMED")
    return { ok: false, message: "This visit can't be cancelled any more." };
  const notices = await cancelVisits(
    s.store,
    s.doctor,
    [a],
    reason.trim().slice(0, 200) || null,
    s.actor,
    s.now,
  );
  await sendAll(s, notices);
  revalidatePath("/today");
  return {
    ok: true,
    message: notices.length
      ? `Cancelled. ${a.patientName} was told on WhatsApp.`
      : `Cancelled. ${a.patientName} couldn't be messaged (24-hour window closed).`,
  };
}

export async function feeAction(
  id: string,
  fee: number,
): Promise<ActionResult> {
  const s = await requireStaff();
  const r = await setFee(s.store, s.doctor, id, fee, s.actor, s.now);
  if (!r.ok) return r;
  revalidatePath("/today");
  return { ok: true, message: "Fee updated." };
}

export async function completeNoRxAction(
  id: string,
  fee: number,
): Promise<ActionResult> {
  const s = await requireStaff();
  const a = await ownAppointment(s.store, s.doctor.id, id);
  if (a?.status !== "CONFIRMED")
    return { ok: false, message: "This visit is already completed." };
  await completeWithoutRx(s.store, s.doctor, a, s.now, {
    fee: Number.isInteger(fee) && fee >= 0 ? fee : undefined,
    actor: s.actor,
  });
  revalidatePath("/today");
  return { ok: true, message: `${a.patientName} marked complete.` };
}
