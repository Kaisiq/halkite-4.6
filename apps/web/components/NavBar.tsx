"use client";

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

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-white">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 h-16 md:px-10">
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
        </div>
      </div>
    </nav>
  );
}
