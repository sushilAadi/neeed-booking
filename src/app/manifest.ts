import type { MetadataRoute } from "next";

/** Installable app: opens straight into the clinic desk, full screen, no browser bar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neeed — Clinic desk",
    short_name: "Neeed",
    description: "WhatsApp booking and prescriptions for your clinic.",
    id: "/today",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f3f1",
    theme_color: "#f5f3f1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
