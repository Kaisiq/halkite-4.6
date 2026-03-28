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
  { label: "Report", path: (id: string) => `/report/${id}` as Route },
] as const;

export default function NavBar({ sessionId }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1720px] items-center gap-8 px-6 py-4 md:px-12">
        <Link
          href="/"
          className="group flex items-center gap-4 transition-all hover:opacity-80"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_20px_rgba(110,231,200,0.15)] transition-transform group-hover:scale-105">
            <span className="display-face text-xl font-black tracking-tighter">
              H
            </span>
          </div>
          <div className="flex flex-col">
            <span className="display-face text-lg font-bold tracking-tight text-[var(--foreground)] uppercase leading-none">
              Halkantir
            </span>
            <span className="mono-label !text-[9px] opacity-40">
              HALKANTIR_RESILIENCE_PLATFORM
            </span>
          </div>
        </Link>

        <div className="hidden h-8 w-px bg-white/5 lg:block" />

        <div className="hidden items-center gap-6 lg:flex">
          {NAV_ITEMS.map(({ label, path }) => {
            const href = path(sessionId);
            const isActive = pathname.startsWith(href);

            return (
              <Link
                key={label}
                href={href}
                className={`relative px-2 py-1 transition-all hover:opacity-100 ${
                  isActive ? "opacity-100" : "opacity-40"
                }`}
              >
                <div className="flex flex-col items-center">
                  <span className="mono-label text-[10px]">
                    {label.toUpperCase()}
                  </span>
                  {isActive && (
                    <div className="absolute -bottom-[21px] h-[2px] w-full bg-[var(--accent)] shadow-[0_0_12px_rgba(123,220,198,0.4)]" />
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden flex-col items-end sm:flex">
            <div className="mono-label text-[9px] opacity-40">SESSION_ID</div>
            <div className="font-mono text-[11px] font-bold text-[var(--muted-strong)]">
              {sessionId.slice(0, 12).toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2">
            <span className="status-dot !mr-0 animate-pulse bg-[var(--accent)]" />
            <span className="mono-label !text-[10px] text-[var(--accent-soft)]">
              LIVE_GRAPH
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
