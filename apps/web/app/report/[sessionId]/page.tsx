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
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${style.bg} ${style.text} ${style.border}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recommendation type badge helpers
// ---------------------------------------------------------------------------

const REC_TYPE_STYLES: Record<string, string> = {
  add_redundancy: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  add_bypass: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  reduce_recovery_time: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  increase_layer_autonomy:
    "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

function RecTypeBadge({ type }: { type: string }) {
  const classes =
    REC_TYPE_STYLES[type] ?? "bg-white/10 text-[var(--muted)] border-white/10";
  const label = type.replace(/_/g, " ");
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${classes}`}
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
      className="group rounded-xl border border-white/[0.06] transition-colors hover:border-white/[0.12]"
      style={{ background: "var(--panel)" }}
    >
      {/* ---- Header (always visible) ---- */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-start gap-4 px-5 py-4 text-left"
      >
        {/* Rank */}
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{
            background: "rgba(110, 231, 200, 0.10)",
            color: "var(--accent)",
          }}
        >
          #{scenario.rank}
        </span>

        {/* Title + badges row */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">
              {scenario.title}
            </h3>
            <SeverityBadge label={scenario.severity_label} />
          </div>

          {/* Metrics row */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              H:{" "}
              <span className="font-mono text-[var(--foreground)]">
                {scenario.path.length > 0
                  ? scenario.path[0].H_before.toFixed(2)
                  : "1.00"}
              </span>{" "}
              <span className="mx-0.5 text-[var(--muted)]">&rarr;</span>{" "}
              <span className="font-mono text-[var(--foreground)]">
                {scenario.health_remaining.toFixed(2)}
              </span>
            </span>
            <span>
              Failed:{" "}
              <span className="font-mono text-[var(--foreground)]">
                {scenario.failed_nodes.length}
              </span>
              /{totalNodes}
            </span>
            <span>
              Recovery:{" "}
              <span className="font-mono text-[var(--foreground)]">
                {scenario.recovery_cost.toLocaleString()}
              </span>
            </span>
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* ---- Expanded detail ---- */}
      {isExpanded && (
        <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
          {/* Cascade steps */}
          {scenario.path.length > 0 && (
            <div className="mb-5">
              <h4 className="mb-3 text-[0.65rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                Cascade Breakdown
              </h4>
              <ol className="relative space-y-3 border-l border-white/[0.08] pl-5">
                {scenario.path.map((step: ScenarioPath) => (
                  <li key={step.step} className="relative">
                    {/* Timeline dot */}
                    <span
                      className="absolute -left-[1.625rem] top-1 h-2.5 w-2.5 rounded-full border-2"
                      style={{
                        borderColor: "var(--accent)",
                        background: "var(--background)",
                      }}
                    />
                    <p className="text-xs leading-relaxed text-[var(--foreground)]">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        Step {step.step}
                      </span>
                      {step.event && (
                        <span className="text-[var(--muted)]">
                          {" "}
                          &mdash; {step.event.action}{" "}
                          <span className="font-mono">{step.event.target}</span>
                          {step.event.magnitude < 1 && (
                            <span> (magnitude {step.event.magnitude})</span>
                          )}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[0.7rem] text-[var(--muted)]">
                      H drops{" "}
                      <span className="font-mono text-[var(--foreground)]">
                        {step.H_before.toFixed(2)}
                      </span>{" "}
                      &rarr;{" "}
                      <span className="font-mono text-[var(--foreground)]">
                        {step.H_after.toFixed(2)}
                      </span>
                      {step.new_failures.length > 0 && (
                        <>
                          {" "}
                          &middot; Failures:{" "}
                          <span className="font-mono text-red-400">
                            {step.new_failures.join(", ")}
                          </span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Agent */}
          {scenario.agent && (
            <p className="mb-3 text-xs text-[var(--muted)]">
              Found by agent:{" "}
              <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[0.7rem] text-[var(--foreground)]">
                {scenario.agent}
              </span>
            </p>
          )}

          {/* Narrative */}
          {scenario.narrative && (
            <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <h4 className="mb-2 text-[0.65rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                AI Narrative
              </h4>
              <p className="text-sm leading-relaxed text-[var(--foreground)]/80">
                {scenario.narrative}
              </p>
            </div>
          )}

          {/* View on Network button */}
          <button
            type="button"
            onClick={() => router.push(`/network/${sessionId}` as Route)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            View on Network
          </button>
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
    <div
      className="flex items-start gap-4 rounded-xl border border-white/[0.06] px-5 py-4 transition-colors hover:border-white/[0.12]"
      style={{ background: "var(--panel)" }}
    >
      {/* Priority number */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
        style={{
          background: "rgba(110, 231, 200, 0.10)",
          color: "var(--accent)",
        }}
      >
        {rec.priority}
      </span>

      <div className="min-w-0 flex-1">
        {/* Type badge + action */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <RecTypeBadge type={rec.type} />
          <span className="text-sm font-medium text-[var(--foreground)]">
            {rec.action}
          </span>
        </div>

        {/* Reason */}
        <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
          {rec.reason}
        </p>

        {/* Metrics */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
          <span>
            Resilience gain:{" "}
            <span className="font-semibold text-[var(--accent)]">
              {rec.estimated_resilience_gain}
            </span>
          </span>
          <span>
            Scenarios prevented:{" "}
            <span className="font-mono text-[var(--foreground)]">
              {rec.scenarios_prevented}
            </span>
          </span>
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
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "rgba(110, 231, 200, 0.08)" }}
      >
        <svg
          className="h-8 w-8 text-[var(--accent)]"
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
      <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
        No scenarios yet
      </h2>
      <p className="mb-6 max-w-sm text-sm text-[var(--muted)]">
        Run a simulation to explore worst-case scenarios and generate
        recommendations for your network.
      </p>
      <Link
        href={`/simulate/${sessionId}` as Route}
        className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-[var(--background)] no-underline transition-colors hover:opacity-90"
        style={{ background: "var(--accent)" }}
      >
        Go to Simulate
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
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
    <div
      className="app-shell min-h-screen"
      style={{ background: "var(--background)" }}
    >
      <NavBar sessionId={sessionId} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {!hasData ? (
          <EmptyState sessionId={sessionId} />
        ) : (
          <>
            {/* ============================================================ */}
            {/* Section 1: WORST-CASE SCENARIOS                               */}
            {/* ============================================================ */}
            <section className="mb-14">
              <div className="mb-6 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: "rgba(156, 176, 197, 0.12)" }}
                />
                <h2
                  className="shrink-0 text-[0.65rem] font-bold uppercase tracking-[0.25em]"
                  style={{ color: "var(--accent)" }}
                >
                  Worst-Case Scenarios
                </h2>
                <div
                  className="h-px flex-1"
                  style={{ background: "rgba(156, 176, 197, 0.12)" }}
                />
              </div>

              <div className="space-y-3">
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
              <section>
                <div className="mb-6 flex items-center gap-3">
                  <div
                    className="h-px flex-1"
                    style={{ background: "rgba(156, 176, 197, 0.12)" }}
                  />
                  <h2
                    className="shrink-0 text-[0.65rem] font-bold uppercase tracking-[0.25em]"
                    style={{ color: "var(--accent)" }}
                  >
                    Recommendations
                  </h2>
                  <div
                    className="h-px flex-1"
                    style={{ background: "rgba(156, 176, 197, 0.12)" }}
                  />
                </div>

                <div className="space-y-3">
                  {recommendations.map((rec) => (
                    <RecommendationRow key={rec.priority} rec={rec} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
