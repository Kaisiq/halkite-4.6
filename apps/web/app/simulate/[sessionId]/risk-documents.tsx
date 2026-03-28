"use client";

import { type ReactNode, useMemo, useState } from "react";
import type {
  GraphData,
  GraphNode,
  Recommendation,
  Scenario,
} from "@/lib/types";

interface RiskDocumentsPanelProps {
  graph: GraphData | null;
  scenarios: Scenario[];
  recommendations: Recommendation[];
}

interface TeamBucket {
  id: string;
  name: string;
  nodes: GraphNode[];
  layerCounts: Map<string, number>;
}

interface TeamScenarioEntry {
  scenario: Scenario;
  affectedNodes: GraphNode[];
  directlyTargeted: boolean;
  impactShare: number;
  triggerSummary: string;
  businessEffect: string;
}

interface MitigationTrack {
  horizon: string;
  title: string;
  detail: string;
}

interface TeamRiskDocument {
  id: string;
  teamName: string;
  primaryLayer: string;
  riskScore: number;
  scenarioCount: number;
  directlyTargetedCount: number;
  worstHealth: number;
  totalRecoveryCost: number;
  exposedNodes: GraphNode[];
  relevantRecommendations: Recommendation[];
  executiveSummary: string;
  impactStatement: string;
  scenarioEntries: TeamScenarioEntry[];
  mitigationTracks: MitigationTrack[];
  monitoringSignals: string[];
  governanceNotes: string[];
  markdown: string;
}

const STANDARDS = [
  "ISO 31000 risk framing",
  "NIST SP 800-30 impact review",
  "ISO 22301 continuity planning",
  "DORA-style scenario testing",
];

export function RiskDocumentsPanel({
  graph,
  scenarios,
  recommendations,
}: RiskDocumentsPanelProps) {
  const documents = useMemo(
    () => buildTeamRiskDocuments(graph, scenarios, recommendations),
    [graph, recommendations, scenarios],
  );
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);

  const activeDocument =
    documents.find((doc) => doc.id === activeDocumentId) ??
    documents[0] ??
    null;

  const handleCopy = async () => {
    if (!activeDocument) return;
    try {
      await navigator.clipboard.writeText(activeDocument.markdown);
      setCopyState("Copied dossier");
      window.setTimeout(() => setCopyState(null), 1800);
    } catch {
      setCopyState("Clipboard unavailable");
      window.setTimeout(() => setCopyState(null), 1800);
    }
  };

  const handleDownload = () => {
    if (!activeDocument) return;
    const blob = new Blob([activeDocument.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${slugify(activeDocument.teamName)}-risk-dossier.md`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section
      className="mx-6 mb-6 rounded-2xl border p-6"
      style={{
        background: "var(--panel)",
        borderColor: "rgba(156, 176, 197, 0.10)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.24em]"
            style={{ color: "var(--accent)" }}
          >
            Team Risk Dossiers
          </p>
          <h2
            className="mt-2 text-2xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Scenario documents for what can fail, where it lands, and how to
            treat it
          </h2>
          <p
            className="mt-2 max-w-2xl text-sm leading-6"
            style={{ color: "var(--muted)" }}
          >
            These dossiers reorganize the explored worst-case scenarios into
            team-focused review packs so risk, continuity, and operational
            resilience teams can assess exposure, ownership, and mitigation work
            without rewriting the math.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {STANDARDS.map((standard) => (
            <span
              key={standard}
              className="rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
              style={{
                borderColor: "rgba(110, 231, 200, 0.18)",
                background: "rgba(110, 231, 200, 0.08)",
                color: "var(--accent)",
              }}
            >
              {standard}
            </span>
          ))}
        </div>
      </div>

      {documents.length === 0 ? (
        <div
          className="mt-6 rounded-2xl border p-6 text-sm leading-6"
          style={{
            borderColor: "rgba(156, 176, 197, 0.10)",
            background: "rgba(255, 255, 255, 0.02)",
            color: "var(--muted)",
          }}
        >
          Run exploration first. The dossiers are generated from the
          deterministic scenario set, impacted nodes, and treatment
          recommendations returned by the backend.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            {documents.map((doc) => {
              const active = doc.id === activeDocument?.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveDocumentId(doc.id)}
                  className="w-full rounded-2xl border p-4 text-left transition-all"
                  style={{
                    borderColor: active
                      ? "rgba(110, 231, 200, 0.28)"
                      : "rgba(156, 176, 197, 0.10)",
                    background: active
                      ? "rgba(110, 231, 200, 0.08)"
                      : "rgba(156, 176, 197, 0.03)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {doc.teamName}
                      </p>
                      <p
                        className="mt-1 text-[0.72rem] uppercase tracking-[0.18em]"
                        style={{ color: "var(--muted)" }}
                      >
                        {doc.primaryLayer}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                      style={{
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#fca5a5",
                      }}
                    >
                      {doc.riskScore.toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <MetricPill
                      label="Scenarios"
                      value={String(doc.scenarioCount)}
                    />
                    <MetricPill
                      label="Worst H"
                      value={doc.worstHealth.toFixed(2)}
                      tone={healthTone(doc.worstHealth)}
                    />
                    <MetricPill
                      label="Direct hits"
                      value={String(doc.directlyTargetedCount)}
                    />
                    <MetricPill
                      label="Recovery"
                      value={formatCompactNumber(doc.totalRecoveryCost)}
                    />
                  </div>
                </button>
              );
            })}
          </aside>

          {activeDocument && (
            <div className="space-y-4">
              <div
                className="rounded-2xl border p-5"
                style={{
                  borderColor: "rgba(156, 176, 197, 0.10)",
                  background: "rgba(255, 255, 255, 0.025)",
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <p
                      className="text-xs font-semibold uppercase tracking-[0.22em]"
                      style={{ color: "var(--muted)" }}
                    >
                      Extensive scenario document
                    </p>
                    <h3
                      className="mt-2 text-2xl font-semibold"
                      style={{ color: "var(--foreground)" }}
                    >
                      {activeDocument.teamName} risk dossier
                    </h3>
                    <p
                      className="mt-2 text-sm leading-6"
                      style={{ color: "var(--muted)" }}
                    >
                      {activeDocument.executiveSummary}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded-lg border px-4 py-2 text-sm font-semibold transition-all hover:bg-white/[0.04]"
                      style={{
                        borderColor: "rgba(156, 176, 197, 0.14)",
                        color: "var(--foreground)",
                      }}
                    >
                      Copy Markdown
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="rounded-lg border px-4 py-2 text-sm font-semibold transition-all hover:bg-[rgba(110,231,200,0.10)]"
                      style={{
                        borderColor: "rgba(110, 231, 200, 0.30)",
                        color: "var(--accent)",
                      }}
                    >
                      Download .md
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <MetricPill
                    label="Primary layer"
                    value={activeDocument.primaryLayer}
                  />
                  <MetricPill
                    label="Scenario count"
                    value={String(activeDocument.scenarioCount)}
                  />
                  <MetricPill
                    label="Worst health"
                    value={activeDocument.worstHealth.toFixed(2)}
                    tone={healthTone(activeDocument.worstHealth)}
                  />
                  <MetricPill
                    label="Nodes exposed"
                    value={String(activeDocument.exposedNodes.length)}
                  />
                </div>

                {copyState && (
                  <p
                    className="mt-3 text-xs"
                    style={{ color: "var(--accent)" }}
                  >
                    {copyState}
                  </p>
                )}
              </div>

              <DocumentSection title="Impact Statement">
                <p
                  className="text-sm leading-7"
                  style={{ color: "var(--foreground)" }}
                >
                  {activeDocument.impactStatement}
                </p>
              </DocumentSection>

              <DocumentSection title="Exposed Dependencies">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeDocument.exposedNodes.slice(0, 9).map((node) => (
                    <div
                      key={node.id}
                      className="rounded-xl border px-4 py-3"
                      style={{
                        borderColor: "rgba(156, 176, 197, 0.08)",
                        background: "rgba(156, 176, 197, 0.04)",
                      }}
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {node.name}
                      </p>
                      <p
                        className="mt-1 text-xs uppercase tracking-[0.18em]"
                        style={{ color: "var(--muted)" }}
                      >
                        {node.layer}
                      </p>
                      <p
                        className="mt-2 text-xs leading-6"
                        style={{ color: "var(--muted)" }}
                      >
                        {describeNodeExposure(node)}
                      </p>
                    </div>
                  ))}
                </div>
              </DocumentSection>

              <DocumentSection title="Scenario Register">
                <div className="space-y-3">
                  {activeDocument.scenarioEntries.map((entry) => (
                    <div
                      key={`${activeDocument.id}-${entry.scenario.rank}`}
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: "rgba(156, 176, 197, 0.08)",
                        background: "rgba(255, 255, 255, 0.02)",
                      }}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-3xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                              style={{
                                background: "rgba(245, 158, 11, 0.12)",
                                color: "#fcd34d",
                              }}
                            >
                              Scenario {entry.scenario.rank}
                            </span>
                            <span
                              className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                              style={{
                                background: "rgba(239, 68, 68, 0.12)",
                                color: "#fca5a5",
                              }}
                            >
                              {entry.scenario.severity_label}
                            </span>
                            {entry.directlyTargeted && (
                              <span
                                className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                                style={{
                                  background: "rgba(110, 231, 200, 0.12)",
                                  color: "var(--accent)",
                                }}
                              >
                                Directly targeted
                              </span>
                            )}
                          </div>

                          <h4
                            className="mt-3 text-lg font-semibold"
                            style={{ color: "var(--foreground)" }}
                          >
                            {entry.scenario.title}
                          </h4>
                          <p
                            className="mt-2 text-sm leading-7"
                            style={{ color: "var(--muted)" }}
                          >
                            {entry.businessEffect}
                          </p>
                          <p
                            className="mt-2 text-sm leading-7"
                            style={{ color: "var(--foreground)" }}
                          >
                            Trigger chain: {entry.triggerSummary}
                          </p>
                        </div>

                        <div className="grid min-w-[240px] grid-cols-2 gap-2 text-xs">
                          <MetricPill
                            label="Remaining H"
                            value={entry.scenario.health_remaining.toFixed(2)}
                          />
                          <MetricPill
                            label="Affected nodes"
                            value={String(entry.affectedNodes.length)}
                          />
                          <MetricPill
                            label="Impact share"
                            value={`${Math.round(entry.impactShare * 100)}%`}
                          />
                          <MetricPill
                            label="Recovery"
                            value={formatCompactNumber(
                              entry.scenario.recovery_cost,
                            )}
                          />
                        </div>
                      </div>

                      {entry.affectedNodes.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.affectedNodes.map((node) => (
                            <span
                              key={node.id}
                              className="rounded-full border px-3 py-1 text-xs"
                              style={{
                                borderColor: "rgba(156, 176, 197, 0.12)",
                                color: "var(--foreground)",
                              }}
                            >
                              {node.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </DocumentSection>

              <DocumentSection title="Mitigation Programme">
                <div className="space-y-3">
                  {activeDocument.mitigationTracks.map((track) => (
                    <div
                      key={`${track.horizon}-${track.title}`}
                      className="rounded-xl border px-4 py-3"
                      style={{
                        borderColor: "rgba(110, 231, 200, 0.12)",
                        background: "rgba(110, 231, 200, 0.05)",
                      }}
                    >
                      <p
                        className="text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--accent)" }}
                      >
                        {track.horizon}
                      </p>
                      <p
                        className="mt-2 text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {track.title}
                      </p>
                      <p
                        className="mt-2 text-sm leading-7"
                        style={{ color: "var(--muted)" }}
                      >
                        {track.detail}
                      </p>
                    </div>
                  ))}
                </div>

                {activeDocument.relevantRecommendations.length > 0 && (
                  <div
                    className="mt-4 rounded-xl border p-4"
                    style={{ borderColor: "rgba(156, 176, 197, 0.08)" }}
                  >
                    <p
                      className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "var(--muted)" }}
                    >
                      Linked deterministic recommendations
                    </p>
                    <div className="mt-3 space-y-3">
                      {activeDocument.relevantRecommendations.map((rec) => (
                        <div
                          key={`${rec.priority}-${rec.target}-${rec.action}`}
                        >
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--foreground)" }}
                          >
                            P{rec.priority} {rec.action}
                          </p>
                          <p
                            className="mt-1 text-sm leading-7"
                            style={{ color: "var(--muted)" }}
                          >
                            {rec.reason} Expected resilience gain:{" "}
                            {rec.estimated_resilience_gain}. Scenarios
                            prevented: {rec.scenarios_prevented}.
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </DocumentSection>

              <div className="grid gap-4 xl:grid-cols-2">
                <DocumentSection title="Monitoring Signals">
                  <ul className="space-y-3">
                    {activeDocument.monitoringSignals.map((signal) => (
                      <li
                        key={signal}
                        className="text-sm leading-7"
                        style={{ color: "var(--foreground)" }}
                      >
                        {signal}
                      </li>
                    ))}
                  </ul>
                </DocumentSection>

                <DocumentSection title="Governance Notes">
                  <ul className="space-y-3">
                    {activeDocument.governanceNotes.map((note) => (
                      <li
                        key={note}
                        className="text-sm leading-7"
                        style={{ color: "var(--foreground)" }}
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                </DocumentSection>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function buildTeamRiskDocuments(
  graph: GraphData | null,
  scenarios: Scenario[],
  recommendations: Recommendation[],
): TeamRiskDocument[] {
  if (!graph || scenarios.length === 0) return [];

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const teamBuckets = collectTeamBuckets(graph.nodes);
  const documents: TeamRiskDocument[] = [];

  for (const bucket of teamBuckets) {
    const teamNodeIds = new Set(bucket.nodes.map((node) => node.id));
    const scenarioEntries = scenarios
      .map((scenario) =>
        buildScenarioEntry(scenario, teamNodeIds, nodeById, bucket.name),
      )
      .filter((entry): entry is TeamScenarioEntry => entry !== null);

    if (scenarioEntries.length === 0) continue;

    const exposedNodeMap = new Map<string, GraphNode>();
    for (const entry of scenarioEntries) {
      for (const node of entry.affectedNodes) {
        exposedNodeMap.set(node.id, node);
      }
    }
    const exposedNodes = [...exposedNodeMap.values()].sort(
      (a, b) => b.theta - a.theta,
    );
    const primaryLayer = dominantLayer(bucket.layerCounts);
    const directlyTargetedCount = scenarioEntries.filter(
      (entry) => entry.directlyTargeted,
    ).length;
    const worstHealth = Math.min(
      ...scenarioEntries.map((entry) => entry.scenario.health_remaining),
    );
    const totalRecoveryCost = scenarioEntries.reduce(
      (sum, entry) => sum + entry.scenario.recovery_cost,
      0,
    );
    const riskScore = scenarioEntries.reduce(
      (sum, entry) =>
        sum +
        entry.scenario.severity *
          entry.impactShare *
          (entry.directlyTargeted ? 1.2 : 1),
      0,
    );
    const relevantRecommendations = recommendations
      .filter((rec) =>
        isRecommendationRelevant(
          rec,
          bucket,
          primaryLayer,
          teamNodeIds,
          nodeById,
        ),
      )
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4);

    const executiveSummary = buildExecutiveSummary(
      bucket.name,
      primaryLayer,
      scenarioEntries,
      exposedNodes,
      worstHealth,
    );
    const impactStatement = buildImpactStatement(
      bucket.name,
      primaryLayer,
      scenarioEntries,
      exposedNodes,
      totalRecoveryCost,
    );
    const mitigationTracks = buildMitigationTracks(
      bucket.name,
      primaryLayer,
      scenarioEntries,
      exposedNodes,
      relevantRecommendations,
    );
    const monitoringSignals = buildMonitoringSignals(
      bucket.name,
      primaryLayer,
      scenarioEntries,
      exposedNodes,
    );
    const governanceNotes = buildGovernanceNotes(bucket.name, primaryLayer);

    const documentBase = {
      id: bucket.id,
      teamName: bucket.name,
      primaryLayer,
      riskScore,
      scenarioCount: scenarioEntries.length,
      directlyTargetedCount,
      worstHealth,
      totalRecoveryCost,
      exposedNodes,
      relevantRecommendations,
      executiveSummary,
      impactStatement,
      scenarioEntries,
      mitigationTracks,
      monitoringSignals,
      governanceNotes,
      markdown: "",
    };

    documents.push({
      ...documentBase,
      markdown: buildMarkdownDocument(documentBase),
    });
  }

  return documents.sort((a, b) => b.riskScore - a.riskScore);
}

function collectTeamBuckets(nodes: GraphNode[]): TeamBucket[] {
  const buckets = new Map<string, TeamBucket>();

  for (const node of nodes) {
    const name = resolveTeamName(node);
    const id = slugify(name);
    const existing = buckets.get(id);
    if (existing) {
      existing.nodes.push(node);
      existing.layerCounts.set(
        node.layer,
        (existing.layerCounts.get(node.layer) ?? 0) + 1,
      );
      continue;
    }
    buckets.set(id, {
      id,
      name,
      nodes: [node],
      layerCounts: new Map([[node.layer, 1]]),
    });
  }

  return [...buckets.values()];
}

function buildScenarioEntry(
  scenario: Scenario,
  teamNodeIds: Set<string>,
  nodeById: Map<string, GraphNode>,
  teamName: string,
): TeamScenarioEntry | null {
  const affectedNodes = scenario.failed_nodes
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is GraphNode => {
      if (!node) return false;
      return teamNodeIds.has(node.id);
    });

  const directlyTargeted = scenario.path.some((step) => {
    const target = step.event?.target;
    return typeof target === "string" && teamNodeIds.has(target);
  });

  if (affectedNodes.length === 0 && !directlyTargeted) {
    return null;
  }

  const impactShare = Math.max(
    affectedNodes.length / Math.max(1, scenario.failed_nodes.length),
    directlyTargeted ? 0.35 : 0,
  );
  const firstNamedStep = scenario.path.find((step) => step.event?.target);
  const triggerSummary = firstNamedStep?.event
    ? `${firstNamedStep.event.action} ${describeEventTarget(firstNamedStep.event.target, nodeById)}`
    : scenario.summary;

  const affectedNames = affectedNodes.map((node) => node.name);
  const businessEffect = [
    directlyTargeted
      ? `${teamName} is on the initial attack path for this scenario.`
      : `${teamName} is hit as the cascade spreads into dependent work.`,
    affectedNames.length > 0
      ? `The documented failures inside the team are ${affectedNames.join(", ")}.`
      : "The team is exposed through targeted pressure even before named internal failures are recorded.",
    `Network health settles at H ${scenario.health_remaining.toFixed(2)} with ${scenario.failed_nodes.length} failed nodes overall.`,
  ].join(" ");

  return {
    scenario,
    affectedNodes,
    directlyTargeted,
    impactShare,
    triggerSummary,
    businessEffect,
  };
}

function buildExecutiveSummary(
  teamName: string,
  primaryLayer: string,
  scenarioEntries: TeamScenarioEntry[],
  exposedNodes: GraphNode[],
  worstHealth: number,
): string {
  const worstScenario = [...scenarioEntries].sort(
    (a, b) => a.scenario.health_remaining - b.scenario.health_remaining,
  )[0];
  const topNodes = exposedNodes
    .slice(0, 3)
    .map((node) => node.name)
    .join(", ");
  return `${teamName} sits in the ${primaryLayer} layer and appears in ${scenarioEntries.length} of the explored worst-case scenarios. The most severe branch leaves the wider network at H ${worstHealth.toFixed(2)}. The main dependencies that need active treatment are ${topNodes || "the mapped team assets"}; these are the points where local failure becomes organizational damage. ${
    worstScenario?.directlyTargeted
      ? "At least one top scenario begins by targeting this team directly, so resilience cannot rely on downstream containment alone."
      : "The exposure is largely cascade-driven, which means upstream dependency governance matters as much as local controls."
  }`;
}

function buildImpactStatement(
  teamName: string,
  primaryLayer: string,
  scenarioEntries: TeamScenarioEntry[],
  exposedNodes: GraphNode[],
  totalRecoveryCost: number,
): string {
  const directHits = scenarioEntries.filter(
    (entry) => entry.directlyTargeted,
  ).length;
  const topNodeText = exposedNodes
    .slice(0, 4)
    .map((node) => `${node.name} (${node.layer})`)
    .join(", ");
  return `${teamName} carries a material resilience burden because failures in ${topNodeText || "its mapped assets"} recur across the explored scenario set. Across the scenarios attached to this dossier, cumulative modeled recovery cost reaches ${totalRecoveryCost.toLocaleString()}. ${directHits > 0 ? `There are ${directHits} scenarios where the team is on the direct trigger path, which indicates a need for pre-defined containment and fallback decisions owned by the team itself.` : "The team is not usually the first point of attack, but it repeatedly becomes part of the terminal failure set, which points to inadequate buffers against upstream disruption."} For risk management review, this dossier should be read as a treatment plan for continuity in the ${primaryLayer} layer, not only as a post-incident narrative.`;
}

function buildMitigationTracks(
  teamName: string,
  primaryLayer: string,
  scenarioEntries: TeamScenarioEntry[],
  exposedNodes: GraphNode[],
  recommendations: Recommendation[],
): MitigationTrack[] {
  const tracks: MitigationTrack[] = recommendations
    .slice(0, 3)
    .map((rec, index) => ({
      horizon:
        index === 0 ? "0-30 days" : index === 1 ? "30-90 days" : "90-180 days",
      title: rec.action,
      detail: `${rec.reason} Track this as an owned treatment item with evidence of execution and a post-change simulation rerun. Expected resilience gain: ${rec.estimated_resilience_gain}.`,
    }));

  const topNodeNames = exposedNodes
    .slice(0, 3)
    .map((node) => node.name)
    .join(", ");

  if (tracks.length < 3) {
    tracks.push(
      ...defaultMitigationTracks(
        teamName,
        primaryLayer,
        topNodeNames,
        scenarioEntries,
      ),
    );
  }

  return tracks.slice(0, 4);
}

function defaultMitigationTracks(
  teamName: string,
  primaryLayer: string,
  topNodeNames: string,
  scenarioEntries: TeamScenarioEntry[],
): MitigationTrack[] {
  const directHits = scenarioEntries.filter(
    (entry) => entry.directlyTargeted,
  ).length;
  const commonPrefix =
    directHits > 0
      ? `${teamName} needs direct-response playbooks because top scenarios start at the team boundary.`
      : `${teamName} needs better absorption capacity because damage arrives through dependency chains.`;

  switch (primaryLayer) {
    case "People":
      return [
        {
          horizon: "0-30 days",
          title: "Assign deputies and cross-train critical roles",
          detail: `${commonPrefix} Create named deputies, decision authorities, and handoff runbooks for ${topNodeNames || "the highest-risk roles"} so a single absence does not force a wider leadership or execution gap.`,
        },
        {
          horizon: "30-90 days",
          title: "Reduce key-person fragility",
          detail:
            "Document tacit knowledge, approval paths, and external contacts. Test whether the team can continue operating for one business cycle with the primary role unavailable.",
        },
        {
          horizon: "90-180 days",
          title: "Bake continuity checks into workforce planning",
          detail:
            "Link hiring, succession, leave coverage, and contractor decisions to scenario reruns so personnel changes are assessed before they become structural failure points.",
        },
      ];
    case "Technology":
      return [
        {
          horizon: "0-30 days",
          title: "Validate failover and restore paths",
          detail: `${commonPrefix} Test backup access, restore procedures, and manual workarounds for ${topNodeNames || "the highest-risk services"} under timed exercise conditions.`,
        },
        {
          horizon: "30-90 days",
          title: "Shorten mean time to recover for critical services",
          detail:
            "Convert tribal recovery knowledge into runbooks, automate dependency checks, and remove restore bottlenecks so modeled recovery cost comes down in the next simulation cycle.",
        },
        {
          horizon: "90-180 days",
          title: "Add architectural bypasses",
          detail:
            "Reduce single-route dependency by introducing alternate paths, segmented responsibilities, or substitute services where the graph shows concentrated blast radius.",
        },
      ];
    case "Supply":
      return [
        {
          horizon: "0-30 days",
          title: "Qualify alternates for single-source dependencies",
          detail: `${commonPrefix} Build shortlists and commercial fallbacks for ${topNodeNames || "critical suppliers"} so procurement can switch before the operational layer stalls.`,
        },
        {
          horizon: "30-90 days",
          title: "Set trigger-based inventory and escalation thresholds",
          detail:
            "Define when order delays, quality issues, or contractual breaches move from vendor management to resilience response and executive escalation.",
        },
        {
          horizon: "90-180 days",
          title: "Diversify supplier concentration",
          detail:
            "Use scenario frequency as input to sourcing strategy so recurrent supply-chain failure paths are not left to case-by-case mitigation.",
        },
      ];
    default:
      return [
        {
          horizon: "0-30 days",
          title: "Create a named continuity owner for the team",
          detail: `${commonPrefix} Assign one owner to coordinate fallback actions for ${topNodeNames || "the mapped assets"} and maintain evidence for risk review.`,
        },
        {
          horizon: "30-90 days",
          title: "Document minimum viable operation",
          detail:
            "Write the smallest operating mode the team can sustain under dependency loss, including manual workarounds, decision rights, and recovery prerequisites.",
        },
        {
          horizon: "90-180 days",
          title: "Re-test after structural change",
          detail:
            "Any reorg, vendor change, major system release, or control redesign should trigger another stress-test run so residual risk is re-measured rather than assumed.",
        },
      ];
  }
}

function buildMonitoringSignals(
  teamName: string,
  primaryLayer: string,
  scenarioEntries: TeamScenarioEntry[],
  exposedNodes: GraphNode[],
): string[] {
  const signals = [
    `Track the health and ownership status of ${
      exposedNodes
        .slice(0, 3)
        .map((node) => node.name)
        .join(", ") || "the team's highest-risk nodes"
    } as leading indicators for ${teamName}.`,
    "Escalate any material dependency change, unresolved outage, or control exception into a fresh scenario review instead of handling it as a local ticket only.",
    "Maintain an evidence trail for control testing, recovery exercises, and unresolved assumptions so the dossier stays auditable.",
  ];

  if (primaryLayer === "People") {
    signals.push(
      "Watch for overload, concentrated approvals, extended absence, and handoff delays around key roles because those conditions often precede hard personnel failure in continuity events.",
    );
  } else if (primaryLayer === "Technology") {
    signals.push(
      "Monitor restore failures, elevated change failure rate, dependency drift, and missing runbook validation because those conditions amplify cross-layer cascades.",
    );
  } else if (primaryLayer === "Supply") {
    signals.push(
      "Monitor supplier lead-time deviation, service-level breaches, and concentration of orders with single providers because those are early warnings of structural supply fragility.",
    );
  }

  const directHits = scenarioEntries.filter(
    (entry) => entry.directlyTargeted,
  ).length;
  if (directHits > 0) {
    signals.push(
      `Because ${teamName} is directly targeted in ${directHits} of the top scenarios, any degradation in local readiness should trigger executive awareness before a wider cascade forms.`,
    );
  }

  return signals.slice(0, 5);
}

function buildGovernanceNotes(
  teamName: string,
  primaryLayer: string,
): string[] {
  return [
    `${teamName} should have a named treatment owner, target date, and validation method for every mitigation item in this dossier.`,
    `Use this dossier as scenario-based evidence for ${primaryLayer} continuity planning, but keep the underlying deterministic outputs as the source of truth for severity and recovery math.`,
    "Review the dossier after material organizational change, after each major incident, and at a fixed quarterly cadence even if no incident occurred.",
    "Residual risk should be explicitly recorded after controls are implemented; do not assume that a mitigation closes the scenario until the graph is rerun.",
  ];
}

function buildMarkdownDocument(
  doc: Omit<TeamRiskDocument, "markdown">,
): string {
  const lines = [
    `# ${doc.teamName} Risk Dossier`,
    "",
    `- Primary layer: ${doc.primaryLayer}`,
    `- Scenario count: ${doc.scenarioCount}`,
    `- Directly targeted scenarios: ${doc.directlyTargetedCount}`,
    `- Worst network health: ${doc.worstHealth.toFixed(2)}`,
    `- Aggregated recovery cost: ${doc.totalRecoveryCost.toLocaleString()}`,
    "",
    "## Executive Summary",
    doc.executiveSummary,
    "",
    "## Impact Statement",
    doc.impactStatement,
    "",
    "## Exposed Dependencies",
    ...doc.exposedNodes
      .slice(0, 10)
      .map(
        (node) =>
          `- ${node.name} (${node.layer}): ${describeNodeExposure(node)}`,
      ),
    "",
    "## Scenario Register",
    ...doc.scenarioEntries.flatMap((entry) => [
      `### Scenario ${entry.scenario.rank}: ${entry.scenario.title}`,
      `- Severity: ${entry.scenario.severity_label}`,
      `- Remaining health: ${entry.scenario.health_remaining.toFixed(2)}`,
      `- Trigger chain: ${entry.triggerSummary}`,
      `- Business effect: ${entry.businessEffect}`,
      `- Affected nodes: ${entry.affectedNodes.map((node) => node.name).join(", ") || "Direct targeting only"}`,
      "",
    ]),
    "## Mitigation Programme",
    ...doc.mitigationTracks.flatMap((track) => [
      `### ${track.horizon} - ${track.title}`,
      track.detail,
      "",
    ]),
    ...(doc.relevantRecommendations.length > 0
      ? [
          "## Linked Deterministic Recommendations",
          ...doc.relevantRecommendations.flatMap((rec) => [
            `- P${rec.priority} ${rec.action}: ${rec.reason} Expected resilience gain: ${rec.estimated_resilience_gain}. Scenarios prevented: ${rec.scenarios_prevented}.`,
          ]),
          "",
        ]
      : []),
    "## Monitoring Signals",
    ...doc.monitoringSignals.map((signal) => `- ${signal}`),
    "",
    "## Governance Notes",
    ...doc.governanceNotes.map((note) => `- ${note}`),
    "",
    "_Generated from Halkantir simulation outputs. Narrative organization is deterministic; underlying health, severity, and recovery values are unchanged._",
  ];

  return lines.join("\n");
}

function isRecommendationRelevant(
  recommendation: Recommendation,
  bucket: TeamBucket,
  primaryLayer: string,
  teamNodeIds: Set<string>,
  nodeById: Map<string, GraphNode>,
): boolean {
  if (teamNodeIds.has(recommendation.target)) return true;
  if (recommendation.target === primaryLayer) return true;

  const node = nodeById.get(recommendation.target);
  if (node) {
    return teamNodeIds.has(node.id);
  }

  const haystack =
    `${recommendation.action} ${recommendation.reason}`.toLowerCase();
  return (
    haystack.includes(bucket.name.toLowerCase()) ||
    bucket.nodes.some((teamNode) =>
      haystack.includes(teamNode.name.toLowerCase()),
    )
  );
}

function resolveTeamName(node: GraphNode): string {
  const owner = readMetaString(node.meta, [
    "owner",
    "team",
    "department",
    "business_unit",
    "unit",
  ]);
  if (owner) return startCase(owner);

  const metaType = readMetaString(node.meta, ["type"]);
  if (metaType?.toLowerCase() === "team") {
    return node.name;
  }

  const fn = readMetaString(node.meta, ["function"]);
  if (fn) return startCase(fn);

  if (node.layer === "People") return "People Leadership & Roles";
  return node.layer;
}

function dominantLayer(layerCounts: Map<string, number>): string {
  return (
    [...layerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Operations"
  );
}

function readMetaString(
  meta: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function describeEventTarget(
  target: string,
  nodeById: Map<string, GraphNode>,
): string {
  return nodeById.get(target)?.name ?? startCase(target);
}

function describeNodeExposure(node: GraphNode): string {
  const functionName = readMetaString(node.meta, ["function"]);
  const owner = readMetaString(node.meta, ["owner"]);
  const spof =
    node.meta.single_point_of_failure === true
      ? " Flagged as a single point of failure."
      : "";
  return `${functionName ? `${startCase(functionName)} function.` : "Mapped organizational dependency."} Theta ${node.theta.toFixed(2)}, recovery ${formatCompactNumber(node.r)}.${owner ? ` Owned by ${owner}.` : ""}${spof}`;
}

function startCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCompactNumber(value: number): string {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function healthTone(health: number): string {
  if (health <= 0.3) return "#fca5a5";
  if (health <= 0.7) return "#fcd34d";
  return "var(--accent)";
}

function DocumentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-5"
      style={{
        borderColor: "rgba(156, 176, 197, 0.10)",
        background: "rgba(255, 255, 255, 0.025)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: "rgba(156, 176, 197, 0.10)",
        background: "rgba(156, 176, 197, 0.05)",
      }}
    >
      <p
        className="text-[0.62rem] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-sm font-semibold"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
