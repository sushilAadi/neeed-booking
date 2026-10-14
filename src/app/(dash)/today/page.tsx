import type { Metadata } from "next";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return (
    <div className="card grid place-items-center p-10 text-center text-muted">
      Today — coming next.
    </div>
  );
}
