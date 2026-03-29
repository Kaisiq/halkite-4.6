"use client";

import { useState } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavBarProps {
  sessionId: string;
}

const NAV_ITEMS = [
  { label: "Network", path: (id: string) => `/network/${id}` as Route },
  { label: "Simulate", path: (id: string) => `/simulate/${id}` as Route },
  { label: "Report", path: (id: string) => `/report/${id}` as Route },
  { label: "Chat", path: (id: string) => `/chat/${id}` as Route },
] as const;

export default function NavBar({ sessionId }: NavBarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-white">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 h-14 sm:px-6 sm:h-16 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Halkantir"
            width={24}
            height={30}
            className="invert"
            style={{ width: 24, height: "auto" }}
          />
          <span className="text-[15px] font-medium">Halkantir</span>
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          {NAV_ITEMS.map(({ label, path }) => {
            const href = path(sessionId);
            const isActive = pathname.startsWith(href);

            return (
              <Link
                key={label}
                href={href}
                className={`text-[15px] transition-colors ${
                  isActive
                    ? "text-[var(--text)]"
                    : "text-[var(--text-light)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[13px] text-[var(--text-light)] sm:block">
            {sessionId.slice(0, 12)}
          </span>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center md:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-[var(--border)] bg-white px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {NAV_ITEMS.map(({ label, path }) => {
              const href = path(sessionId);
              const isActive = pathname.startsWith(href);

              return (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 text-[15px] transition-colors ${
                    isActive
                      ? "text-[var(--text)] font-medium"
                      : "text-[var(--text-light)]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
