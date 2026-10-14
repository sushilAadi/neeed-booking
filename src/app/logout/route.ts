import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/session";

// A POST (form button) so a stray link or prefetch can't log anyone out.
export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
