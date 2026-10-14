"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/lib/auth/login";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { createSupabaseStore } from "@/lib/db/supabase-store";

export type LoginState = { message: string };

export async function signIn(
  _prev: LoginState,
  form: FormData,
): Promise<LoginState> {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const r = await login(
    createSupabaseStore(),
    { key: String(form.get("key") ?? ""), ip },
    new Date(),
    {
      pepper: process.env.ACCESS_CODE_PEPPER ?? "",
      secret: process.env.SESSION_SECRET ?? "",
    },
  );
  if (!r.ok) return { message: r.message };
  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/today");
}
