import type { NextRequest } from "next/server";
import { createSupabaseStore } from "@/lib/db/supabase-store";
import { submitRx } from "@/lib/rx/web";

// Save the prescription page's form: PDF to the patient, a note to the doctor.
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/rx/[token]">,
) {
  const { token } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { message: "Couldn't read the form. Try again." },
      { status: 400 },
    );
  }
  try {
    const r = await submitRx(
      createSupabaseStore(),
      token,
      body,
      new Date(),
      process.env.WA_APP_SECRET ?? "",
    );
    return Response.json({ message: r.message }, { status: r.status });
  } catch (e) {
    console.error("rx submit failed", e);
    return Response.json(
      { message: "Something went wrong while saving. Try again." },
      { status: 500 },
    );
  }
}
