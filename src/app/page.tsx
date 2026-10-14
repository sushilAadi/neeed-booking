import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-sm gap-6 text-center">
        <p className="text-3xl font-bold tracking-tight">Neeed</p>
        <p className="text-[15px] text-[var(--muted)]">
          WhatsApp booking &amp; prescriptions for your clinic
        </p>
        <div className="grid gap-3">
          <Link href="/login" className="btn btn-primary">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-ghost">
            Sign up
          </Link>
        </div>
      </div>
    </main>
  );
}
