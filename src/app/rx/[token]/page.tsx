import type { Metadata } from "next";
import { createSupabaseStore } from "@/lib/db/supabase-store";
import { loadRxPage } from "@/lib/rx/web";
import { RxForm } from "./rx-form";

export const metadata: Metadata = {
  title: "Write prescription",
  robots: { index: false },
};

export default async function Page({ params }: PageProps<"/rx/[token]">) {
  const { token } = await params;
  const page = await loadRxPage(
    createSupabaseStore(),
    token,
    new Date(),
    process.env.WA_APP_SECRET ?? "",
  );
  if (page.state !== "ok") {
    const text = {
      expired:
        "This link has expired. In WhatsApp, open Today → Mark complete to get a new one.",
      done: "This visit is already completed. The patient has the prescription.",
      missing: "This visit no longer exists.",
    }[page.state];
    return (
      <main className="rx-shell grid min-h-dvh place-items-center px-4">
        <p className="max-w-sm text-center text-[15px] text-[var(--rx-muted)]">
          {text}
        </p>
      </main>
    );
  }
  return <RxForm token={token} {...page} />;
}
