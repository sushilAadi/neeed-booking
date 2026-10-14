import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The prescription PDF reads its fonts from disk at runtime; ship them with the webhook function.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./src/lib/rx/fonts/**/*"],
    "/api/rx/*": ["./src/lib/rx/fonts/**/*"],
  },
};

export default nextConfig;
