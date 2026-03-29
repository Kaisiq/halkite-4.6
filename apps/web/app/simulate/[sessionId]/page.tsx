"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getGraph } from "@/lib/api";
import { useAchillesStore } from "@/lib/store";
import type { Scenario } from "@/lib/types";

interface TreeNode {
  id: string;
  H: number;
  delta_H: number;
  agent: string;
  event_key: string;
  event_summary: string;
  scenario_title?: string;
  expected_outcome?: string;
  failed_count: number;
  depth: number;
  parent_id: string | null;
}

interface TreeEdge {
  from: string;
  to: string;
}

function severityColor(label: string): string {
  switch (label.toUpperCase()) {
    case "CRITICAL":
      return "var(--danger)";
    case "HIGH":
      return "#5b6470";
    case "MEDIUM":
      return "#7f8794";
    default:
      return "var(--text-muted)";
  }
}

function healthTone(H: number): string {
  if (H <= 0.2) return "var(--danger)";
  if (H <= 0.45) return "#8b5e3c";
  if (H <= 0.7) return "#53606d";
  return "var(--healthy)";
}

function humanizeId(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

function inferNodeLabel(nodeId: string, graph: { nodes: Array<{ id: string; name: string }> } | null): string {
  return graph?.nodes.find((node) => node.id === nodeId)?.name ?? humanizeId(nodeId);
}

function formatScenarioEvent(
  event: Scenario["path"][number]["event"] | null | undefined,
  graph: { nodes: Array<{ id: string; name: string; layer: string }> } | null,
): string {
  if (!event) return "Initial state";
  if (event.action === "cut_edge" && typeof event.target !== "string") {
    return `${inferNodeLabel(event.target.from, graph)} -> ${inferNodeLabel(event.target.to, graph)} is cut`;
  }
  const targetId = typeof event.target === "string" ? event.target : Array.isArray(event.target) ? event.target.join(", ") : "unknown";
  return `${event.action} ${inferNodeLabel(targetId, graph)}`;
}

function formatTreeEventSummary(
  summary: string | undefined,
  graph: { nodes: Array<{ id: string; name: string }> } | null,
): string {
  if (!summary || summary === "root") return "Initial state";
  const match = summary.match(/^(kill|damage|cut_edge)\s+(.+)$/);
  if (!match || !graph) return summary;
  const [, action, rawTarget] = match;
  if (action === "cut_edge") {
    const edgeMatch = rawTarget.match(/from['"]?:?\s*['"]([^'"]+)['"].*to['"]?:?\s*['"]([^'"]+)['"]/);
    if (!edgeMatch) return summary;
    return `${inferNodeLabel(edgeMatch[1], graph)} -> ${inferNodeLabel(edgeMatch[2], graph)} is cut`;
  }
  return `${action} ${inferNodeLabel(rawTarget, graph)}`;
}

function resolveScenarioFocusNode(
  scenario: Scenario | null | undefined,
  rootTreeNode: TreeNode | null,
  childrenByNodeId: Map<string, TreeNode[]>,
  graph: { nodes: Array<{ id: string; name: string; layer: string }> } | null,
): TreeNode | null {
  if (!scenario || !rootTreeNode) return null;

  let current = rootTreeNode;
  for (const step of scenario.path) {
    const eventKey = formatScenarioEvent(step.event, graph);
    const nextCandidates = (childrenByNodeId.get(current.id) ?? []).filter(
      (node) => node.event_key === eventKey,
    );
    if (!nextCandidates.length) return current;
    current = nextCandidates.reduce((best, candidate) =>
      Math.abs(candidate.H - step.H_after) < Math.abs(best.H - step.H_after)
        ? candidate
        : best,
    );
  }

  return current;
}

function TreeBranch({
  node,
  childrenByNodeId,
  collapsedIds,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: TreeNode;
  childrenByNodeId: Map<string, TreeNode[]>;
  collapsedIds: Set<string>;
  onToggle: (_id: string) => void;
  onSelect: (_id: string) => void;
  selectedId: string | null;
}) {
  const children = childrenByNodeId.get(node.id) ?? [];
  const isCollapsed = collapsedIds.has(node.id);
  const selected = selectedId === node.id;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-[18px] border p-3 transition-all ${
          selected
            ? "border-[rgba(15,23,42,0.16)] bg-[linear-gradient(180deg,#ffffff,#f3f6f9)] shadow-sm"
            : "border-[rgba(15,23,42,0.08)] bg-white"
        }`}
      >
        <div className="flex items-start gap-3">
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--text-muted)]"
            >
              {isCollapsed ? "+" : "-"}
            </button>
          ) : (
            <div className="mt-0.5 h-6 w-6 rounded-full border border-[var(--border)] bg-[var(--bg-alt)]" />
          )}
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex-1 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)]">
                  {node.depth === 0 ? "Initial organization state" : node.event_summary}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {node.expected_outcome || node.scenario_title || "Dependency pressure continues through this branch."}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-semibold" style={{ color: healthTone(node.H) }}>
                  H {node.H.toFixed(2)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-light)]">{node.failed_count} failed</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {!isCollapsed && children.length > 0 && (
        <div className="ml-5 border-l border-[rgba(15,23,42,0.08)] pl-4">
          <div className="flex flex-col gap-3">
            {children.map((child) => (
              <TreeBranch
                key={child.id}
                node={child}
                childrenByNodeId={childrenByNodeId}
                collapsedIds={collapsedIds}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SimulatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const graph = useAchillesStore((s) => s.graph);
  const exploring = useAchillesStore((s) => s.exploring);
  const exploreError = useAchillesStore((s) => s.exploreError);
  const scenarios = useAchillesStore((s) => s.scenarios);
  const treeStats = useAchillesStore((s) => s.treeStats);
  const vizData = useAchillesStore((s) => s.vizData);
  const activeScenarioIndex = useAchillesStore((s) => s.activeScenarioIndex);
  const setActiveScenario = useAchillesStore((s) => s.setActiveScenario);
  const runExploration = useAchillesStore((s) => s.runExploration);
  const setGraph = useAchillesStore((s) => s.setGraph);
  const setSessionId = useAchillesStore((s) => s.setSessionId);
  const storeSessionId = useAchillesStore((s) => s.sessionId);

  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (sessionId && storeSessionId !== sessionId) {
      setSessionId(sessionId);
    }
  }, [sessionId, setSessionId, storeSessionId]);

  useEffect(() => {
    if (!sessionId || graph) return;
    getGraph(sessionId)
      .then((data) => setGraph(data.graph))
      .catch((error) => console.error("[simulate] graph fetch error:", error));
  }, [graph, sessionId, setGraph]);

  useEffect(() => {
    if (!graph || exploring || vizData?.state_tree?.nodes?.length) return;
    void runExploration();
  }, [exploring, graph, runExploration, vizData?.state_tree?.nodes?.length]);

  const treeData = useMemo(() => {
    if (!vizData?.state_tree?.nodes?.length) return null;

    const edges = (vizData.state_tree.edges ?? []) as TreeEdge[];
    const parentByNodeId = new Map(edges.map((edge) => [edge.to, edge.from]));
    const rawNodes = vizData.state_tree.nodes as Array<{
      id: string;
      H: number;
      depth: number;
      agent: string;
      event_summary?: string;
      failed_count?: number;
      scenario_title?: string;
      expected_outcome?: string;
    }>;

    const provisional = rawNodes.map((node) => ({
      id: node.id,
      H: node.H,
      depth: node.depth,
      agent: node.agent,
      event_key: formatTreeEventSummary(node.event_summary, graph),
      event_summary: formatTreeEventSummary(node.event_summary, graph),
      scenario_title: node.scenario_title,
      expected_outcome: node.expected_outcome,
      failed_count: node.failed_count ?? 0,
      parent_id: parentByNodeId.get(node.id) ?? null,
      delta_H: 0,
    }));

    const byId = new Map(provisional.map((node) => [node.id, node]));
    for (const node of provisional) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      node.delta_H = parent ? Math.max(0, parent.H - node.H) : 0;
    }

    return { nodes: provisional, edges };
  }, [graph, vizData]);

  const treeNodes = useMemo(() => treeData?.nodes ?? [], [treeData]);
  const rootTreeNode = useMemo(
    () => treeNodes.find((node) => node.parent_id === null) ?? null,
    [treeNodes],
  );

  const treeNodeMap = useMemo(
    () => new Map(treeNodes.map((node) => [node.id, node])),
    [treeNodes],
  );

  const childrenByNodeId = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const node of treeNodes) {
      if (!node.parent_id) continue;
      const bucket = map.get(node.parent_id) ?? [];
      bucket.push(node);
      map.set(node.parent_id, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.H - b.H);
    }
    return map;
  }, [treeNodes]);

  useEffect(() => {
    if (scenarios.length > 0 && (activeScenarioIndex === null || activeScenarioIndex >= scenarios.length)) {
      setActiveScenario(0);
    }
  }, [activeScenarioIndex, scenarios.length, setActiveScenario]);

  const selectedScenario =
    activeScenarioIndex !== null && scenarios[activeScenarioIndex]
      ? scenarios[activeScenarioIndex]
      : scenarios[0] ?? null;

  const scenarioNodes = useMemo(
    () =>
      scenarios.map((scenario, index) => ({
        index,
        scenario,
        node: resolveScenarioFocusNode(scenario, rootTreeNode, childrenByNodeId, graph),
      })),
    [childrenByNodeId, graph, rootTreeNode, scenarios],
  );

  const selectedScenarioNode = useMemo(
    () =>
      resolveScenarioFocusNode(
        selectedScenario,
        rootTreeNode,
        childrenByNodeId,
        graph,
      ),
    [childrenByNodeId, graph, rootTreeNode, selectedScenario],
  );

  const focusedNode = focusedNodeId
    ? treeNodeMap.get(focusedNodeId) ?? selectedScenarioNode ?? rootTreeNode
    : selectedScenarioNode ?? rootTreeNode;

  useEffect(() => {
    if (!focusedNode) return;
    const matchingScenario = scenarioNodes.find((entry) => entry.node?.id === focusedNode.id);
    if (matchingScenario && matchingScenario.index !== activeScenarioIndex) {
      setActiveScenario(matchingScenario.index);
    }
  }, [activeScenarioIndex, focusedNode, scenarioNodes, setActiveScenario]);

  const focusedPath = useMemo(() => {
    if (!focusedNode) return [] as TreeNode[];
    const path: TreeNode[] = [];
    let current: TreeNode | null = focusedNode;
    while (current) {
      path.push(current);
      current = current.parent_id ? treeNodeMap.get(current.parent_id) ?? null : null;
    }
    return path.reverse();
  }, [focusedNode, treeNodeMap]);

  const summaryScenario = useMemo(() => {
    if (selectedScenario) return selectedScenario;
    const matchingScenario = scenarioNodes.find((entry) => entry.node?.id === focusedNode?.id);
    return matchingScenario?.scenario ?? null;
  }, [focusedNode?.id, scenarioNodes, selectedScenario]);

  const toggleCollapse = (nodeId: string) => {
    setCollapsedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const selectNode = (nodeId: string) => {
    setFocusedNodeId(nodeId);
    setCollapsedIds((previous) => {
      const next = new Set(previous);
      next.delete(nodeId);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfbfc_0%,#f1f4f6_100%)] text-[var(--text)]">
      <NavBar sessionId={sessionId} />

      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
        <section className="min-h-[70vh] flex-1 rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:p-6">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div>
              <p className="mono-label text-[10px] text-[var(--text-light)]">State tree</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Scenario branches</h1>
            </div>
            <div className="text-right text-sm text-[var(--text-muted)]">
              {exploring ? (
                <span>Generating scenarios...</span>
              ) : treeStats ? (
                <span>{treeStats.total_nodes_explored} nodes explored</span>
              ) : (
                <span>Waiting for graph</span>
              )}
            </div>
          </div>

          {!graph ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--bg-alt)] p-8 text-center text-sm text-[var(--text-muted)]">
              Loading the graph first.
            </div>
          ) : exploring && treeNodes.length === 0 ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--bg-alt)] p-8 text-center text-sm text-[var(--text-muted)]">
              Building the state tree from your graph automatically.
            </div>
          ) : exploreError ? (
            <div className="rounded-[22px] border border-[rgba(185,28,28,0.18)] bg-[rgba(185,28,28,0.05)] p-5 text-sm text-[var(--danger)]">
              {exploreError}
            </div>
          ) : rootTreeNode ? (
            <div className="custom-scrollbar max-h-[72vh] overflow-auto pr-2">
              <TreeBranch
                node={rootTreeNode}
                childrenByNodeId={childrenByNodeId}
                collapsedIds={collapsedIds}
                onToggle={toggleCollapse}
                onSelect={selectNode}
                selectedId={focusedNode?.id ?? null}
              />
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--bg-alt)] p-8 text-center text-sm text-[var(--text-muted)]">
              No state tree data yet.
            </div>
          )}
        </section>

        <aside className="w-full rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/92 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:sticky lg:top-24 lg:h-fit lg:w-[360px] lg:p-6">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <p className="mono-label text-[10px] text-[var(--text-light)]">Selected scenario</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)]">
              {summaryScenario?.title || focusedNode?.scenario_title || "Focused branch"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {summaryScenario?.summary || focusedNode?.expected_outcome || "Pick a branch on the left to read what happens and where it leads."}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricCard label="Health" value={focusedNode ? focusedNode.H.toFixed(2) : "-"} tone={focusedNode ? healthTone(focusedNode.H) : "var(--text)"} />
            <MetricCard label="Failed" value={String(summaryScenario?.failed_nodes.length ?? focusedNode?.failed_count ?? 0)} tone="var(--text)" />
            <MetricCard label="Depth" value={String(summaryScenario?.depth ?? focusedNode?.depth ?? 0)} tone="var(--text)" />
            <MetricCard label="Recovery" value={summaryScenario ? formatCompactCurrency(summaryScenario.recovery_cost) : "-"} tone="var(--text)" />
          </div>

          {summaryScenario && (
            <div className="mt-5 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#fcfcfd,#f5f7f9)] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--text)]">Outcome</span>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    color: severityColor(summaryScenario.severity_label),
                    background: `${severityColor(summaryScenario.severity_label)}15`,
                  }}
                >
                  {summaryScenario.severity_label}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {summaryScenario.intended_outcome || "This branch drives the organization toward a concrete operating failure."}
              </p>
            </div>
          )}

          <div className="mt-5">
            <p className="mono-label text-[9px] text-[var(--text-light)]">What happens</p>
            <div className="mt-3 flex flex-col gap-3">
              {(summaryScenario?.path ?? []).length > 0 ? (
                summaryScenario?.path.map((step, index) => (
                  <div key={`${index}-${step.H_after}`} className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-light)]">
                      Step {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text)]">
                      {step.step_description || formatScenarioEvent(step.event, graph)}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                      {step.expected_outcome || "The branch keeps pushing pressure into the next dependency."}
                    </p>
                  </div>
                ))
              ) : focusedPath.length > 0 ? (
                focusedPath.map((node, index) => (
                  <div key={node.id} className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-light)]">
                      Step {index}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text)]">{node.event_summary}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                      {node.expected_outcome || "This branch remains part of the currently focused path."}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white p-4 text-sm text-[var(--text-muted)]">
                  Select a branch to inspect it.
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <p className="mono-label text-[8px] text-[var(--text-light)]">{label}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}
