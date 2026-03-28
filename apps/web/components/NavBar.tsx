"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavBarProps {
  sessionId: string;
}

const NAV_ITEMS = [
  { label: "Network", path: (id: string) => `/network/${id}` as Route },
  { label: "Simulate", path: (id: string) => `/simulate/${id}` as Route },
  { label: "Scenarios", path: (id: string) => `/report/${id}` as Route },
  { label: "Report", path: (id: string) => `/report/${id}` as Route },
] as const;

export default function NavBar({ sessionId }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b hairline bg-[color:rgb(8_15_27_/_0.72)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 min-w-0">
          <div className="eyebrow mb-1">Organizational Stress Testing</div>
          <div className="display-face text-xl font-semibold tracking-[0.18em] text-[var(--foreground)]">
            Halkantir
          </div>
        </Link>

        <div className="hidden h-10 w-px bg-white/10 lg:block" />

        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
          {NAV_ITEMS.map(({ label, path }) => {
            const href = path(sessionId);
            const isActive = pathname.startsWith(href);

            return (
              <Link
                key={label}
                href={href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[color:rgb(123_220_198_/_0.12)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="metric-chip hidden rounded-full px-3 py-2 text-xs font-medium sm:block">
            Session {sessionId.slice(0, 8)}
          </div>
          <div className="rounded-full border border-[color:rgb(123_220_198_/_0.22)] bg-[color:rgb(123_220_198_/_0.08)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-soft)]">
            Live Graph
          </div>
        </div>
      </div>
    </nav>
  );
}
