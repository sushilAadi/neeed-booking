import type { Metadata, Viewport } from "next";
import { Manrope, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const body = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});
const heading = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: { default: "Neeed", template: "%s · Neeed" },
  description: "WhatsApp booking and prescriptions for your clinic.",
  robots: { index: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1311" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${heading.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
