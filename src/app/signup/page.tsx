import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Request access" };

export default function SignupPage() {
  return (
    <AuthSplit>
      <SignupForm />
      <p className="text-center text-sm text-muted">
        Already have a key?{" "}
        <Link
          href="/login"
          className="font-semibold text-ink underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </AuthSplit>
  );
}
