import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthSplit>
      <div className="card grid gap-6 p-6 md:p-8">
        <div className="grid gap-2">
          <p className="eyebrow">Welcome back</p>
          <h1 className="page-title display">Open your clinic desk</h1>
          <p className="text-[15px] text-muted">
            Doctors and receptionists each use their own key. This device stays
            logged in for 30 days.
          </p>
        </div>
        <LoginForm />
      </div>
      <p className="text-center text-sm text-muted">
        New to Neeed?{" "}
        <Link
          href="/signup"
          className="font-semibold text-ink underline underline-offset-4"
        >
          Request access
        </Link>
        <br />
        Lost your key? Ask your doctor for a new one, or contact Neeed.
      </p>
    </AuthSplit>
  );
}
