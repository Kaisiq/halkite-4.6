import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

const webDir = process.cwd();
const rootDir = path.resolve(webDir, "../..");
loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(webDir, ".env"));
loadEnvFile(path.join(webDir, ".env.local"));

const apiInternalBaseUrl =
  process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:8000";

// When NEXT_PUBLIC_API_BASE_URL is set, the frontend calls the API
// directly — no rewrites needed. Only proxy in local dev.
const hasDirectApi = !!process.env.NEXT_PUBLIC_API_BASE_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: [],
  async rewrites() {
    if (hasDirectApi) {
      return [];
    }
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
