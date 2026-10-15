import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi open the dev server (e.g. http://192.168.0.109:3000).
  allowedDevOrigins: ["192.168.*.*"],
  // Signature uploads are up to 2 MB, plus multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // The prescription PDF reads its fonts from disk at runtime; ship them with the webhook function.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./src/lib/rx/fonts/**/*"],
    "/api/rx/*": ["./src/lib/rx/fonts/**/*"],
  },
};

export default nextConfig;
