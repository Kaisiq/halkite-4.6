"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { useAchillesStore } from "@/lib/store";
import { getGraph, getReport } from "@/lib/api";
import type { Scenario, Recommendation, ScenarioPath } from "@/lib/types";

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ label }: { label: string }) {
  return (
    <span className="inline-block border border-[var(--border)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recommendation type badge
// ---------------------------------------------------------------------------

function RecTypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, " ");
  return (
    <span className="inline-block border border-[var(--border)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider">
      {label}
    </span>
  );
}

function formatEventTarget(
  target: ScenarioPath["event"] extends infer E
    ? E extends { target: infer T }
      ? T
      : never
    : never,
): string {
  if (!target) return "";
  if (typeof target === "string") return target;
  return `${target.from} -> ${target.to}`;
}

function extractNarrativeText(narrative: Scenario["narrative"]): string {
  if (!narrative) return "";
  if (typeof narrative === "string") return narrative;
  return narrative.narrative ?? "";
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
      className={`border transition-colors ${
        isExpanded
          ? "border-[var(--border-strong)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-start gap-6 p-6 text-left"
      >
        {/* Rank */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="mono-label text-[8px]">Rank</span>
          <span className="flex h-10 w-10 items-center justify-center border border-[var(--border)] text-lg font-medium">
            {scenario.rank}
          </span>
        </div>

        {/* Title + badges */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-base font-medium tracking-tight">
              {scenario.title}
            </h3>
            <SeverityBadge label={scenario.severity_label} />
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <span className="mono-label text-[8px]">Health</span>
              <div className="font-mono text-xs flex items-center gap-2">
                <span>1.00</span>
                <span className="text-[var(--text-light)]">&rarr;</span>
                <span className="text-[var(--danger)]">
                  {scenario.health_remaining.toFixed(2)}
                </span>
              </div>
            </div>
            <div>
              <span className="mono-label text-[8px]">Failures</span>
              <div className="font-mono text-xs">
                {scenario.failed_nodes.length}/{totalNodes}
              </div>
            </div>
            <div>
              <span className="mono-label text-[8px]">Recovery</span>
              <div className="font-mono text-xs">
                ${(scenario.recovery_cost / 1000).toFixed(0)}K
              </div>
            </div>
          </div>
        </div>

        {/* Chevron */}
        <div
          className={`mt-2 flex h-8 w-8 items-center justify-center border border-[var(--border)] transition-transform duration-300 ${
            isExpanded ? "rotate-180" : ""
          }`}
        >
          <svg
            className="h-4 w-4 text-[var(--text-muted)]"
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
        </div>
      </button>

      {/* Expanded */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] p-6 space-y-8 fade-rise">
          {/* Cascade steps */}
          {scenario.path.length > 0 && (
            <div>
              <p className="mono-label text-[9px] mb-4">Propagation</p>
              <div className="relative space-y-3 pl-4 ml-1">
                <div className="absolute left-0 top-1 bottom-1 w-px bg-[var(--border)]" />
                {scenario.path.map((step: ScenarioPath) => (
                  <div key={step.step} className="relative flex flex-col gap-1">
                    <div className="absolute -left-4 top-1.5 h-2 w-2 border border-[var(--border)] bg-white" />
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-[var(--text-light)]">
                          {String(step.step).padStart(2, "0")}
                        </span>
                        {step.event && (
                          <span className="text-xs font-medium">
                            {step.event.action}{" "}
                            {formatEventTarget(step.event.target)}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-[var(--danger)]">
                        -{(step.H_before - step.H_after).toFixed(2)}
                      </span>
                    </div>
                    {step.new_failures.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-6">
                        {step.new_failures.map((f) => (
                          <span
                            key={f}
                            className="border border-[var(--border)] px-2 py-0.5 font-mono text-[9px]"
                          >
                            {f}
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
          {extractNarrativeText(scenario.narrative) && (
            <div className="border border-[var(--border)] p-5">
              <p className="mono-label text-[9px] mb-3">Summary</p>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {extractNarrativeText(scenario.narrative)}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
            <span className="font-mono text-[10px] text-[var(--text-light)]">
              Agent: {scenario.agent}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/network/${sessionId}` as Route)}
              className="border border-[var(--border)] px-5 py-2 text-xs font-medium transition-colors hover:border-[var(--text)] hover:bg-[var(--bg-alt)]"
            >
              View Topology
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
    <div className="border border-[var(--border)] p-6 flex items-start gap-6">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="mono-label text-[8px]">Priority</span>
        <span className="flex h-10 w-10 items-center justify-center border border-[var(--border)] text-lg font-medium">
          {rec.priority}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <RecTypeBadge type={rec.type} />
          <span className="text-sm font-medium">{rec.action}</span>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-[var(--text-muted)]">
          {rec.reason}
        </p>

        <div className="flex flex-wrap gap-x-8 gap-y-2 pt-4 border-t border-[var(--border)]">
          <div>
            <span className="mono-label text-[8px]">Resilience Gain</span>
            <div className="font-mono text-xs font-medium">
              +{Number.parseFloat(rec.estimated_resilience_gain).toFixed(2)}
            </div>
          </div>
          <div>
            <span className="mono-label text-[8px]">Scenarios Prevented</span>
            <div className="font-mono text-xs font-medium">
              {rec.scenarios_prevented}
            </div>
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
      <svg
        className="mb-8 h-12 w-12 text-[var(--text-light)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
        />
      </svg>
      <h2 className="mb-3 text-2xl font-normal">No intelligence generated.</h2>
      <p className="mb-10 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
        Run a stress-test simulation to discover worst-case scenarios and
        generate mitigation strategies.
      </p>
      <Link
        href={`/simulate/${sessionId}` as Route}
        className="border border-[var(--text)] bg-[var(--text)] px-8 py-3 text-sm font-medium text-white no-underline transition-colors hover:bg-[var(--text-secondary)]"
      >
        Go to Simulation
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

  const scenarios = useAchillesStore((s) => s.scenarios);
  const recommendations = useAchillesStore((s) => s.recommendations);
  const graph = useAchillesStore((s) => s.graph);
  const setGraph = useAchillesStore((s) => s.setGraph);

  useEffect(() => {
    if (scenarios.length === 0 && sessionId) {
      getReport(sessionId)
        .then((report) => {
          useAchillesStore.setState({
            scenarios: report.worst_scenarios ?? [],
            recommendations: report.recommendations ?? [],
          });
        })
        .catch(() => {});
    }
  }, [sessionId, scenarios.length]);

  useEffect(() => {
    if (!sessionId || graph) return;

    getGraph(sessionId)
      .then((data) => setGraph(data.graph))
      .catch(() => {});
  }, [graph, sessionId, setGraph]);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const totalNodes = graph?.nodes.length ?? 0;

  const toggleExpanded = (rank: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

  const hasData = scenarios.length > 0;

  return (
    <div className="min-h-screen bg-white">
      <NavBar sessionId={sessionId} />

      <main className="mx-auto max-w-4xl px-6 py-16">
        {!hasData ? (
          <EmptyState sessionId={sessionId} />
        ) : (
          <div className="flex flex-col gap-20">
            {/* Scenarios */}
            <section>
              <p className="mono-label text-[9px] mb-6">
                Critical Failure Vectors
              </p>
              <div className="flex flex-col gap-3">
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

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <section>
                <p className="mono-label text-[9px] mb-6">
                  Mitigation Advisories
                </p>
                <div className="flex flex-col gap-3">
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
