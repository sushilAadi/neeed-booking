import type { Metadata } from "next";
import { PageHead } from "@/components/page-head";
import { freeSlotGroups } from "./actions";
import { AddForm } from "./form";

export const metadata: Metadata = { title: "Add patient" };

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string | string[] }>;
}) {
  const { phone } = await searchParams;
  return (
    <div className="grid gap-5">
      <PageHead
        eyebrow="For patients who call or walk in · today only"
        title="Add patient"
      />
      <AddForm
        initialSlots={await freeSlotGroups()}
        initialPhone={typeof phone === "string" ? phone.slice(0, 20) : ""}
      />
    </div>
  );
}
