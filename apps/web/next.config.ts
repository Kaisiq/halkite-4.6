import type { NextConfig } from "next";

const requiredEnvVars = ["NEXT_PUBLIC_GOOGLE_CLIENT_ID"] as const;
const missingEnvVars = requiredEnvVars.filter(
  (key) => !(process.env[key] ?? "").trim(),
);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required web environment variables: ${missingEnvVars.join(", ")}. Set them before starting the web app.`,
  );
}

const apiInternalBaseUrl =
  process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalBaseUrl}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${apiInternalBaseUrl}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
