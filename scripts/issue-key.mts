// Create or re-key a dashboard login and print the key ONCE.
// node --env-file=.env.local scripts/issue-key.mts --doctor <doctorId> [--role doctor|reception] [--name "Riya"]
import { createClient } from "@supabase/supabase-js";
import { generateKey, hashKey, normalizeKey } from "../src/lib/auth/keys.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const doctorId = arg("doctor");
const role = (arg("role") ?? "doctor") as "doctor" | "reception";
const pepper = process.env.ACCESS_CODE_PEPPER;
if (!doctorId || !pepper) {
  console.error("Need --doctor <id> and ACCESS_CODE_PEPPER in the env.");
  process.exit(1);
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SECRET_KEY as string,
  { auth: { persistSession: false } },
);
const { data: doc, error: dErr } = await db
  .from("doctors")
  .select("id,name")
  .eq("id", doctorId)
  .single();
if (dErr || !doc) throw new Error(`No doctor ${doctorId}`);
const key = generateKey(role);
const keyHash = hashKey(normalizeKey(key) as string, pepper);
const name = arg("name") ?? (role === "doctor" ? doc.name : "Reception");
const { data: existing } = await db
  .from("staff")
  .select("id,key_version")
  .eq("doctor_id", doctorId)
  .eq("role", "doctor")
  .maybeSingle();
if (role === "doctor" && existing) {
  const { error } = await db
    .from("staff")
    .update({
      key_hash: keyHash,
      key_version: existing.key_version + 1,
      active: true,
    })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
} else {
  const { error } = await db
    .from("staff")
    .insert({ doctor_id: doctorId, role, name, key_hash: keyHash });
  if (error) throw new Error(error.message);
}
console.log(
  `Key for ${name} (${role}) — save it now, it is not shown again:\n${key}`,
);
