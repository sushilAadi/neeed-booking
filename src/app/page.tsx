import { redirect } from "next/navigation";

// The marketing site is neeed.in; this app starts at the desk login.
export default function Home() {
  redirect("/login");
}
