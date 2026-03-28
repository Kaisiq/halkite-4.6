"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { useNexusStore } from "@/lib/store";
import { getReport } from "@/lib/api";
import type { Scenario, Recommendation, ScenarioPath } from "@/lib/types";

// ---------------------------------------------------------------------------
// Severity badge helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  CRITICAL: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  HIGH: {
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  MEDIUM: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
  },
  LOW: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
  },
};

function SeverityBadge({ label }: { label: string }) {
  const key = label.toUpperCase();
  const style = SEVERITY_STYLES[key] ?? SEVERITY_STYLES.MEDIUM;
  return (
    <span
      className={`inline-block rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${style.bg} ${style.text} ${style.border}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recommendation type badge helpers
// ---------------------------------------------------------------------------

const REC_TYPE_STYLES: Record<string, string> = {
  add_redundancy: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  add_bypass: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  reduce_recovery_time: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  increase_layer_autonomy:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

function RecTypeBadge({ type }: { type: string }) {
  const classes =
    REC_TYPE_STYLES[type] ?? "bg-white/5 text-[var(--muted)] border-white/10";
  const label = type.replace(/_/g, " ");
  return (
    <span
      className={`inline-block rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${classes}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scenario card
// ---------------------------------------------------------------------------

function ScenarioCard({
  scenario,
  totalNodes,
  isExpanded,
  onToggle,
  sessionId,
}: {
  scenario: Scenario;
  totalNodes: number;
  isExpanded: boolean;
  onToggle: () => void;
  sessionId: string;
}) {
  const router = useRouter();

  return (
    <div
      className={`group rounded-3xl border transition-all ${
        isExpanded
          ? "border-white/10 bg-white/[0.03]"
          : "border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.01]"
      }`}
    >
      {/* ---- Header (always visible) ---- */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-start gap-6 p-6 text-left sm:p-8"
      >
        {/* Rank */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="mono-label !text-[8px] opacity-40">RANK</div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 text-lg font-bold text-[var(--accent)] shadow-[0_0_12px_rgba(123,220,198,0.1)]">
            {scenario.rank}
          </span>
        </div>

        {/* Title + badges row */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="display-face text-lg font-bold tracking-tight text-[var(--foreground)] uppercase">
              {scenario.title}
            </h3>
            <SeverityBadge label={scenario.severity_label} />
          </div>

          {/* Metrics row */}
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex flex-col gap-0.5">
              <span className="mono-label !text-[8px] opacity-40">
                HEALTH_TRANSITION
              </span>
              <div className="font-mono text-xs font-bold flex items-center gap-2">
                <span className="text-[var(--healthy)]">1.00</span>
                <span className="text-white/20">→</span>
                <span className="text-[var(--danger)]">
                  {scenario.health_remaining.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="mono-label !text-[8px] opacity-40">
                ENTITY_LOSS
              </span>
              <span className="font-mono text-xs font-bold text-[var(--foreground)]">
                {scenario.failed_nodes.length}/{totalNodes}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="mono-label !text-[8px] opacity-40">
                RECOVERY_INDEX
              </span>
              <span className="font-mono text-xs font-bold text-[var(--foreground)]">
                ${(scenario.recovery_cost / 1000).toFixed(0)}K
              </span>
            </div>
          </div>
        </div>

        {/* Chevron */}
        <div
          className={`mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/5 bg-white/5 transition-transform duration-300 ${
            isExpanded ? "rotate-180 bg-white/10" : ""
          }`}
        >
          <svg
            className="h-4 w-4 text-[var(--muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* ---- Expanded detail ---- */}
      {isExpanded && (
        <div className="border-t border-white/5 p-6 sm:p-8 space-y-8 fade-rise">
          {/* Cascade steps */}
          {scenario.path.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-1 w-4 bg-[var(--accent)]" />
                <h4 className="mono-label text-[9px] text-[var(--accent-soft)]">
                  PROPAGATION_CHRONOLOGY
                </h4>
              </div>
              <div className="relative space-y-4 pl-4 ml-1">
                <div className="absolute left-0 top-2 bottom-2 w-px bg-white/5" />
                {scenario.path.map((step: ScenarioPath) => (
                  <div key={step.step} className="relative flex flex-col gap-2">
                    <div className="absolute -left-4 top-1.5 h-2 w-2 rounded-full border border-black bg-[var(--accent)]" />
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="mono-label !text-[9px] opacity-40">
                          STEP_{String(step.step).padStart(2, "0")}
                        </span>
                        {step.event && (
                          <span className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-tight">
                            {step.event.action} {step.event.target}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs font-bold text-[var(--danger)]">
                        -{(step.H_before - step.H_after).toFixed(2)}H
                      </span>
                    </div>
                    {step.new_failures.length > 0 && (
                      <div className="flex flex-wrap gap-2 ml-4">
                        <span className="mono-label !text-[8px] opacity-30 mt-1">
                          NEW_FAILURES:
                        </span>
                        {step.new_failures.map((f) => (
                          <span
                            key={f}
                            className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 font-mono text-[9px] opacity-60"
                          >
                            {f.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Narrative */}
          {scenario.narrative && (
            <div className="bracket-box rounded-2xl border-white/5 bg-white/[0.02] p-6">
              <div className="mb-4 mono-label text-[9px] opacity-40">
                INTELLIGENCE_SUMMARY
              </div>
              <p className="text-sm leading-relaxed text-[var(--muted-strong)]">
                {scenario.narrative}
              </p>
            </div>
          )}

          {/* View on Network button */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2">
              <span className="mono-label !text-[8px] opacity-30">
                DETECTION_ENGINE:
              </span>
              <span className="font-mono text-[10px] text-[var(--accent-soft)] opacity-60 uppercase">
                {scenario.agent}
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/network/${sessionId}` as Route)}
              className="ghost-button rounded-full px-6 py-3 text-[10px] font-bold uppercase tracking-widest"
            >
              VISUALIZE_TOPOLOGY →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation row
// ---------------------------------------------------------------------------

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <div className="bracket-box flex items-start gap-6 rounded-3xl border-white/5 bg-black/20 p-6 sm:p-8">
      {/* Priority number */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="mono-label !text-[8px] opacity-40">PRIORITY</div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 text-lg font-bold text-[var(--accent)] shadow-[0_0_12px_rgba(123,220,198,0.1)]">
          {rec.priority}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {/* Type badge + action */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <RecTypeBadge type={rec.type} />
          <span className="display-face text-sm font-bold text-[var(--foreground)] uppercase tracking-tight">
            {rec.action}
          </span>
        </div>

        {/* Reason */}
        <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
          {rec.reason}
        </p>

        {/* Metrics */}
        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4 border-t border-white/5">
          <div className="flex flex-col gap-0.5">
            <span className="mono-label !text-[8px] opacity-40">
              RESILIENCE_GAIN
            </span>
            <span className="font-mono text-xs font-bold text-[var(--accent)]">
              +{Number.parseFloat(rec.estimated_resilience_gain).toFixed(2)}H
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="mono-label !text-[8px] opacity-40">
              VECTORS_PREVENTED
            </span>
            <span className="font-mono text-xs font-bold text-[var(--foreground)]">
              {rec.scenarios_prevented}_SCENARIOS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
        <svg
          className="h-10 w-10 text-[var(--accent-soft)] opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
          />
        </svg>
      </div>
      <h2 className="display-face mb-3 text-2xl font-bold text-[var(--foreground)] uppercase tracking-tight">
        No intelligence generated.
      </h2>
      <p className="mb-10 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
        Initialize a stress-test simulation to discover worst-case scenarios and
        generate automated mitigation strategies.
      </p>
      <Link
        href={`/simulate/${sessionId}` as Route}
        className="accent-button no-underline rounded-full px-8 py-4 text-xs font-bold uppercase tracking-[0.2em]"
      >
        GO_TO_SIMULATION →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report page
// ---------------------------------------------------------------------------

export default function ReportPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const scenarios = useNexusStore((s) => s.scenarios);
  const recommendations = useNexusStore((s) => s.recommendations);
  const graph = useNexusStore((s) => s.graph);

  // Hydrate from backend if the store is empty (e.g. direct URL navigation).
  useEffect(() => {
    if (scenarios.length === 0 && sessionId) {
      getReport(sessionId)
        .then((report) => {
          useNexusStore.setState({
            scenarios: report.worst_scenarios ?? [],
            recommendations: report.recommendations ?? [],
          });
        })
        .catch(() => {
          // Report not available yet — user will see the empty state.
        });
    }
  }, [sessionId, scenarios.length]);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const totalNodes = graph?.nodes.length ?? 0;

  const toggleExpanded = (rank: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  };

  const hasData = scenarios.length > 0;

  return (
    <div className="app-shell min-h-screen">
      <NavBar sessionId={sessionId} />

      <main className="mx-auto max-w-5xl px-8 py-16 sm:px-12">
        {!hasData ? (
          <EmptyState sessionId={sessionId} />
        ) : (
          <div className="flex flex-col gap-24">
            {/* ============================================================ */}
            {/* Section 1: WORST-CASE SCENARIOS                               */}
            {/* ============================================================ */}
            <section className="flex flex-col gap-10">
              <div className="flex items-center gap-4">
                <div className="h-1 w-8 bg-[var(--danger)]" />
                <h2 className="mono-label text-[11px] text-[var(--danger)]">
                  CRITICAL_FAILURE_VECTORS
                </h2>
              </div>

              <div className="flex flex-col gap-4">
                {scenarios.map((scenario) => (
                  <ScenarioCard
                    key={scenario.rank}
                    scenario={scenario}
                    totalNodes={totalNodes}
                    isExpanded={expandedIds.has(scenario.rank)}
                    onToggle={() => toggleExpanded(scenario.rank)}
                    sessionId={sessionId}
                  />
                ))}
              </div>
            </section>

            {/* ============================================================ */}
            {/* Section 2: RECOMMENDATIONS                                    */}
            {/* ============================================================ */}
            {recommendations.length > 0 && (
              <section className="flex flex-col gap-10">
                <div className="flex items-center gap-4">
                  <div className="h-1 w-8 bg-[var(--accent)]" />
                  <h2 className="mono-label text-[11px] text-[var(--accent-soft)]">
                    MITIGATION_ADVISORIES
                  </h2>
                </div>

                <div className="flex flex-col gap-4">
                  {recommendations.map((rec) => (
                    <RecommendationRow key={rec.priority} rec={rec} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
