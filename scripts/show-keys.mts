// Admin: print the current login keys of one clinic (doctor + receptionists).
// Keys are always the latest: every "New key" replaces the sealed copy.
// node --env-file=.env.local scripts/show-keys.mts --doctor <doctorId>
//   (or --phone <doctor's WhatsApp number, e.g. 919876543210>)
import { createClient } from "@supabase/supabase-js";
import { openKey } from "../src/lib/auth/keys.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const pepper = process.env.ACCESS_CODE_PEPPER;
if (!pepper || (!arg("doctor") && !arg("phone"))) {
  console.error(
    "Need --doctor <id> or --phone <number>, and ACCESS_CODE_PEPPER in the env.",
  );
  process.exit(1);
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SECRET_KEY as string,
  { auth: { persistSession: false } },
);
let q = db.from("doctors").select("id,name,clinic_name");
q = arg("doctor")
  ? q.eq("id", arg("doctor") as string)
  : q.eq("personal_phone", (arg("phone") as string).replace(/\D/g, ""));
const { data: doc, error } = await q.maybeSingle();
if (error || !doc) throw new Error("No such doctor.");
const { data: rows } = await db
  .from("staff")
  .select("name,role,active,key_enc,last_active_at")
  .eq("doctor_id", doc.id)
  .order("created_at");
console.log(`${doc.clinic_name} — ${doc.name}`);
for (const s of rows ?? []) {
  const key = s.key_enc ? openKey(s.key_enc, pepper) : null;
  console.log(
    `${s.role === "doctor" ? "Doctor   " : "Reception"}  ${s.name.padEnd(20)} ${
      !s.active
        ? "(removed)"
        : (key ?? "(older key — make a New key to see it)")
    }`,
  );
}
