import type { NextConfig } from "next";

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
