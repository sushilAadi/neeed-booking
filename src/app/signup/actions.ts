"use server";

import { headers } from "next/headers";
import { type AccessResult, requestAccess } from "@/lib/clinic/access";
import { createSupabaseStore } from "@/lib/db/supabase-store";
import { deliver } from "@/lib/wa/deliver";

export type SignupState = AccessResult & { values: Record<string, string> };

export async function requestAccessAction(
  _prev: SignupState | null,
  form: FormData,
): Promise<SignupState> {
  const store = createSupabaseStore();
  const now = new Date();
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const from = process.env.WA_PLATFORM_PHONE_NUMBER_ID;
  const to = process.env.NEEED_ADMIN_PHONE?.replace(/\D/g, "");
  const get = (k: string) => String(form.get(k) ?? "");
  const values = Object.fromEntries(
    ["doctorName", "clinicName", "city", "phone", "email"].map((k) => [
      k,
      get(k),
    ]),
  );
  const r = await requestAccess(
    store,
    {
      doctorName: get("doctorName"),
      clinicName: get("clinicName"),
      city: get("city"),
      phone: get("phone"),
      email: get("email"),
      ip,
    },
    now,
    async (body) => {
      // Only reaches the admin if they messaged the platform number in the last 24 h (zero-cost rule).
      if (from && to)
        await deliver(
          store,
          [{ from, to, msg: { kind: "text", body } }],
          { from: "", to: "" },
          now,
        );
    },
  );
  return { ...r, values };
}
