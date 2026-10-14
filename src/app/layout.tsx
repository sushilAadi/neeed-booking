import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neeed",
  description: "WhatsApp booking and prescriptions for your clinic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
