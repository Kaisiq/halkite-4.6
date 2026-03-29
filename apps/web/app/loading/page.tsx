"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { useNexusStore } from "@/lib/store";

// ---------------------------------------------------------------------------
// Fun facts — rotated every few seconds while the user waits
// ---------------------------------------------------------------------------

const FUN_FACTS = [
  "The average Fortune 500 company loses $1.55 billion per year due to unplanned downtime.",
  "93% of companies without a disaster recovery plan who suffer a major data disaster are out of business within one year.",
  "Only 35% of organizations have mapped their critical dependency chains.",
  "A single point of failure in a supply chain can cascade to affect 87% of connected operations.",
  "The average time to detect a critical organizational vulnerability is 197 days.",
  "Organizations that conduct regular stress tests are 4.6x more likely to survive market disruptions.",
  "70% of organizational failures stem from interdependencies that weren't visible in siloed reporting.",
  "The most resilient organizations maintain at least 3 independent paths between any two critical functions.",
  "Companies with documented resilience plans recover from disruptions 2.5x faster than those without.",
  "60% of small businesses close within 6 months of a major operational disruption.",
  "Cross-functional dependency mapping reduces incident response time by an average of 40%.",
  "The cost of preventing a failure is typically 10x less than the cost of recovering from one.",
];

const FACT_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoadingPage() {
  const router = useRouter();
  const hasNavigated = useRef(false);
  const pendingFactSwapRef = useRef<number | null>(null);

  const uploading = useNexusStore((s) => s.uploading);
  const uploadError = useNexusStore((s) => s.uploadError);
  const uploadProgress = useNexusStore((s) => s.uploadProgress);
  const uploadProgressValue = useNexusStore((s) => s.uploadProgressValue);
  const uploadStepIndex = useNexusStore((s) => s.uploadStepIndex);
  const uploadTotalSteps = useNexusStore((s) => s.uploadTotalSteps);
  const sessionId = useNexusStore((s) => s.sessionId);

  const [factIndex, setFactIndex] = useState(() =>
    Math.floor(Math.random() * FUN_FACTS.length),
  );
  const [factVisible, setFactVisible] = useState(true);

  // Rotate fun facts with a crossfade
  useEffect(() => {
    const interval = setInterval(() => {
      setFactVisible(false);
      pendingFactSwapRef.current = window.setTimeout(() => {
        setFactIndex((prev) => (prev + 1) % FUN_FACTS.length);
        setFactVisible(true);
      }, 400);
    }, FACT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (pendingFactSwapRef.current !== null) {
        window.clearTimeout(pendingFactSwapRef.current);
      }
    };
  }, []);

  // Navigate when upload completes (or fails)
  useEffect(() => {
    // Still uploading — wait
    if (uploading) return;
    // Already navigated — don't double-push
    if (hasNavigated.current) return;

    // Error → back to home
    if (uploadError) {
      hasNavigated.current = true;
      router.replace("/" as Route);
      return;
    }

    // Upload succeeded — always go to the network view
    if (sessionId) {
      hasNavigated.current = true;
      router.replace(`/network/${sessionId}` as Route);
      return;
    }

    // Direct visits or page refreshes lose the in-memory upload state.
    hasNavigated.current = true;
    router.replace("/" as Route);
  }, [uploading, uploadError, sessionId, router]);

  const stepPercent =
    uploadTotalSteps > 0
      ? Math.round(((uploadStepIndex + 1) / uploadTotalSteps) * 100)
      : 0;
  const actualPercent = Math.round(uploadProgressValue * 100);
  const progressPercent = uploading
    ? Math.min(Math.max(actualPercent, stepPercent), 95)
    : 100;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6">
      {/* Logo */}
      <div className="mb-16 opacity-40">
        <Image
          src="/logo.svg"
          alt="Halkantir"
          width={40}
          height={48}
          className="invert"
          style={{ width: 40, height: "auto" }}
        />
      </div>

      {/* Fun fact */}
      <div className="mx-auto mb-12 h-[72px] max-w-xl text-center">
        <p
          className="text-sm leading-relaxed text-[var(--text-muted)] transition-opacity duration-400"
          style={{ opacity: factVisible ? 1 : 0 }}
        >
          &ldquo;{FUN_FACTS[factIndex]}&rdquo;
        </p>
      </div>

      {/* Divider + progress bar */}
      <div className="mx-auto w-full max-w-md">
        <div className="relative h-[2px] w-full bg-[var(--border)]">
          <div
            className="loading-bar-fill absolute left-0 top-0 h-full bg-[var(--text)] transition-[width] duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Pulsing dot */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="loading-pulse-dot inline-block h-2 w-2 rounded-full bg-[var(--text)]" />
          <span className="mono-label text-[11px]">
            {uploadProgress ?? "Preparing..."}
          </span>
        </div>

        {/* Step counter */}
        <p className="mt-3 text-center font-mono text-[10px] tracking-widest text-[var(--text-light)]">
          Step {uploadStepIndex + 1} of {uploadTotalSteps}
        </p>
      </div>
    </main>
  );
}
