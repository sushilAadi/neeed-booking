import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guard";
import { ownAppointment } from "@/lib/clinic/visits";
import { parseRx } from "@/lib/rx/parse";
import { fmtDay, fmtRange } from "@/lib/time";
import { completeNoRxAction } from "../../(dash)/today/actions";
import { RxForm } from "../../rx/[token]/rx-form";
import { previewVisitPdf, submitVisit } from "./actions";

export const metadata: Metadata = { title: "Mark complete" };

export default async function VisitPage({ params }: PageProps<"/visit/[id]">) {
  const { id } = await params;
  const { store, doctor } = await requireStaff();
  const a = await ownAppointment(store, doctor.id, id);
  if (!a) notFound();
  if (a.status !== "CONFIRMED") redirect("/today");
  const names = new Set<string>();
  for (const t of await store.prescribedTexts(doctor.id))
    for (const m of parseRx(t).meds) names.add(m.name);
  return (
    <RxForm
      patient={a.patientName}
      visit={`${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`}
      clinic={doctor.clinicName}
      doctor={doctor.name}
      suggestions={[...names].slice(0, 300)}
      fee={doctor.standardFee}
      submit={submitVisit.bind(null, a.id)}
      preview={previewVisitPdf.bind(null, a.id)}
      skip={completeNoRxAction.bind(null, a.id)}
      doneHref="/today"
    />
  );
}
