import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="display text-2xl font-bold">
          Neeed
        </Link>
        <div className="card mt-6 grid gap-6 p-6">
          <div className="grid gap-1">
            <h1 className="display text-[26px] font-bold leading-tight">
              Open your clinic desk
            </h1>
            <p className="text-[15px] text-muted">
              Doctors and receptionists each use their own key. This device
              stays logged in for 30 days.
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Lost your key? Ask your doctor for a new one, or contact Neeed.
        </p>
      </div>
    </main>
  );
}
