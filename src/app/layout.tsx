import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

// Same fonts as the Uranium Fitness site.
const body = localFont({
  src: "./fonts/matangi-latin.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-body",
});
const heading = localFont({
  src: "./fonts/gurvaco-regular.woff2",
  weight: "400",
  display: "swap",
  // Only for text 50px and up (.display-xl); not downloaded until used.
  preload: false,
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: { default: "Neeed", template: "%s · Neeed" },
  description: "WhatsApp booking and prescriptions for your clinic.",
  robots: { index: false },
  appleWebApp: { capable: true, title: "Neeed", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f5f3f1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // Light by default; the dark tokens stay for a later theme switch.
      data-theme="light"
      className={`${body.variable} ${heading.variable} h-full antialiased`}
      // Browser extensions (ColorZilla, security add-ons…) add attributes here before React loads.
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
