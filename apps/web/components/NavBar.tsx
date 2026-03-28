"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavBarProps {
  sessionId: string;
}

const NAV_ITEMS = [
  { label: "Network", path: (id: string) => `/network/${id}` },
  { label: "Simulate", path: (id: string) => `/simulate/${id}` },
  { label: "Scenarios", path: (id: string) => `/report/${id}` },
  { label: "Report", path: (id: string) => `/report/${id}` },
] as const;

export default function NavBar({ sessionId }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-8 px-6 py-3 border-b"
      style={{
        background: "var(--panel)",
        borderColor: "rgba(156, 176, 197, 0.12)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* ---- Logo ---- */}
      <Link
        href="/"
        className="text-lg font-bold tracking-widest mr-4"
        style={{ color: "var(--accent)" }}
      >
        NEXUS
      </Link>

      {/* ---- Separator ---- */}
      <div
        className="h-5 w-px"
        style={{ background: "rgba(156, 176, 197, 0.2)" }}
      />

      {/* ---- Nav links ---- */}
      {NAV_ITEMS.map(({ label, path }) => {
        const href = path(sessionId);
        const isActive = pathname.startsWith(href);

        return (
          <Link
            key={label}
            href={href}
            className="text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--muted)",
              background: isActive
                ? "rgba(110, 231, 200, 0.08)"
                : "transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
