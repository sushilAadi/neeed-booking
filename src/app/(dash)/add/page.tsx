import type { Metadata } from "next";
import { freeSlotGroups } from "./actions";
import { AddForm } from "./form";

export const metadata: Metadata = { title: "Add patient" };

export default async function AddPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="display text-[26px] leading-tight font-bold">
          Add patient
        </h1>
        <p className="text-[15px] text-muted">
          For patients who call or walk in. Today only.
        </p>
      </div>
      <AddForm initialSlots={await freeSlotGroups()} />
    </div>
  );
}
