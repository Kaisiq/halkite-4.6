"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import * as d3 from "d3";
import NavBar from "@/components/NavBar";
import { useNexusStore } from "@/lib/store";
import type { ExploreConfig } from "@/lib/types";

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

interface AgentDef {
  label: string;
  type: string;
  description: string;
}

const AGENTS: AgentDef[] = [
  {
    label: "Critical Node Attacker",
    type: "critical_node_attacker",
    description: "Targets highest-theta nodes",
  },
  {
    label: "Bridge Breaker",
    type: "bridge_breaker",
    description: "Severs inter-cluster bridges",
  },
  {
    label: "Compound Exploiter",
    type: "compound_exploiter",
    description: "Exploits synergy between pairs",
  },
  {
    label: "Layer Assassin",
    type: "layer_assassin",
    description: "Attacks entire layers",
  },
  {
    label: "Cluster Isolator",
    type: "cluster_isolator",
    description: "Fragments clusters from the network",
  },
];

// ---------------------------------------------------------------------------
// D3 tree-node datum
// ---------------------------------------------------------------------------

interface TreeNode {
  id: string;
  H: number;
  delta_H: number;
  agent: string;
  event: string;
  failures: number;
  depth: number;
  parent_id: string | null;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityColor(label: string): string {
  switch (label.toUpperCase()) {
    case "CRITICAL":
      return "#ef4444";
    case "HIGH":
      return "#f59e0b";
    case "MEDIUM":
      return "#eab308";
    default:
      return "#6ee7c8";
  }
}

// ---------------------------------------------------------------------------
// Health color scale (green -> yellow -> red)
// ---------------------------------------------------------------------------

function healthColor(H: number): string {
  if (H > 0.7) return "#22c55e";
  if (H > 0.3) return "#eab308";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SimulatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  // -- Store slices --
  const exploring = useNexusStore((s) => s.exploring);
  const scenarios = useNexusStore((s) => s.scenarios);
  const treeStats = useNexusStore((s) => s.treeStats);
  const vizData = useNexusStore((s) => s.vizData);
  const exploreError = useNexusStore((s) => s.exploreError);
  const runExploration = useNexusStore((s) => s.runExploration);

  // -- Local state --
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(
    () => new Set(AGENTS.map((a) => a.type)),
  );
  const [depth, setDepth] = useState(5);
  const [treeLimit, setTreeLimit] = useState(5000);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: TreeNode;
  } | null>(null);

  // -- Refs --
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // -- Sync sessionId to store --
  const storeSessionId = useNexusStore((s) => s.sessionId);
  const setSessionId = useNexusStore((s) => s.setSessionId);
  useEffect(() => {
    if (sessionId && storeSessionId !== sessionId) {
      // Keep this non-destructive -- just use whatever already exists
      setSessionId(sessionId);
    }
  }, [sessionId, storeSessionId, setSessionId]);

  // -- Toggle agent --
  const toggleAgent = useCallback((agentType: string) => {
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentType)) next.delete(agentType);
      else next.add(agentType);
      return next;
    });
  }, []);

  // -- Run exploration --
  const handleRun = useCallback(() => {
    const config: ExploreConfig = {
      max_depth: depth,
      max_tree_nodes: treeLimit,
      agents: Array.from(enabledAgents),
    };
    runExploration(config);
  }, [depth, treeLimit, enabledAgents, runExploration]);

  // -- Build D3 hierarchy from vizData --
  const treeNodes = useMemo(() => {
    if (!vizData?.state_tree?.nodes?.length) return null;
    return vizData.state_tree.nodes as TreeNode[];
  }, [vizData]);

  // -- Compute worst-path node ids for highlighting --
  const worstPathIds = useMemo<Set<string>>(() => {
    if (!scenarios?.length || !treeNodes?.length) return new Set();
    // Find the worst scenario's path through the tree by tracing the
    // lowest-H leaf back to root.
    const worst = scenarios[0];
    if (!worst) return new Set();

    const nodeMap = new Map(treeNodes.map((n) => [n.id, n]));
    // Find the leaf with the lowest H
    let leaf: TreeNode | undefined;
    let lowestH = Infinity;
    for (const n of treeNodes) {
      if (n.H < lowestH) {
        lowestH = n.H;
        leaf = n;
      }
    }
    if (!leaf) return new Set();

    const ids = new Set<string>();
    let current: TreeNode | undefined = leaf;
    while (current) {
      ids.add(current.id);
      current = current.parent_id ? nodeMap.get(current.parent_id) : undefined;
    }
    return ids;
  }, [scenarios, treeNodes]);

  // -- D3 tree rendering --
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !treeNodes?.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr("width", width).attr("height", height);

    // Build d3 hierarchy from flat list
    const rootNode = treeNodes.find((n) => n.parent_id === null);
    if (!rootNode) return;

    interface HierarchyDatum {
      id: string;
      data: TreeNode;
      children: HierarchyDatum[];
    }

    const childrenMap = new Map<string, TreeNode[]>();
    for (const n of treeNodes) {
      if (n.parent_id) {
        const arr = childrenMap.get(n.parent_id) || [];
        arr.push(n);
        childrenMap.set(n.parent_id, arr);
      }
    }

    function buildHierarchy(node: TreeNode): HierarchyDatum {
      const kids = childrenMap.get(node.id) || [];
      return {
        id: node.id,
        data: node,
        children: kids.map(buildHierarchy),
      };
    }

    const rootHierarchy = buildHierarchy(rootNode);
    const root = d3.hierarchy<HierarchyDatum>(rootHierarchy);

    // Tree layout
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const treeLayout = d3.tree<HierarchyDatum>().size([
      width - margin.left - margin.right,
      height - margin.top - margin.bottom,
    ]);

    treeLayout(root);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // -- Links --
    g.selectAll(".tree-link")
      .data(root.links())
      .join("path")
      .attr("class", "tree-link")
      .attr("fill", "none")
      .attr(
        "stroke",
        (d) =>
          worstPathIds.has(d.source.data.id) &&
          worstPathIds.has(d.target.data.id)
            ? "#ef4444"
            : "rgba(156, 176, 197, 0.25)",
      )
      .attr(
        "stroke-width",
        (d) =>
          worstPathIds.has(d.source.data.id) &&
          worstPathIds.has(d.target.data.id)
            ? 2.5
            : 1.2,
      )
      .attr(
        "d",
        d3
          .linkVertical<
            d3.HierarchyLink<HierarchyDatum>,
            d3.HierarchyPointNode<HierarchyDatum>
          >()
          .x((d) => d.x ?? 0)
          .y((d) => d.y ?? 0) as unknown as (
          d: d3.HierarchyLink<HierarchyDatum>,
        ) => string,
      );

    // -- Nodes --
    const nodeGroups = g
      .selectAll<SVGGElement, d3.HierarchyPointNode<HierarchyDatum>>(
        ".tree-node",
      )
      .data(root.descendants())
      .join("g")
      .attr("class", "tree-node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer");

    // Circle
    nodeGroups
      .append("circle")
      .attr("r", (d) => {
        const failures = d.data.data.failures ?? 0;
        return Math.max(5, Math.min(4 + failures * 1.5, 18));
      })
      .attr("fill", (d) => healthColor(d.data.data.H))
      .attr("stroke", (d) =>
        worstPathIds.has(d.data.id) ? "#ef4444" : "rgba(255,255,255,0.15)",
      )
      .attr("stroke-width", (d) => (worstPathIds.has(d.data.id) ? 2.5 : 1));

    // H label
    nodeGroups
      .append("text")
      .attr("dy", -12)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--muted)")
      .attr("font-size", "10px")
      .text((d) => d.data.data.H.toFixed(2));

    // -- Tooltip on click --
    nodeGroups.on("click", (event, d) => {
      event.stopPropagation();
      setTooltip({
        x: (d.x ?? 0) + margin.left,
        y: (d.y ?? 0) + margin.top,
        node: d.data.data,
      });
    });

    svg.on("click", () => setTooltip(null));

    // -- Zoom --
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);
  }, [treeNodes, worstPathIds]);

  // -- Top 3 worst scenarios --
  const topScenarios = useMemo(
    () => (scenarios ?? []).slice(0, 3),
    [scenarios],
  );

  // -- Agent stats from treeStats --
  const agentStatEntries = useMemo(() => {
    if (!treeStats?.agent_stats) return [];
    return Object.entries(treeStats.agent_stats);
  }, [treeStats]);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      className="app-shell flex min-h-screen flex-col"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ---- Navigation ---- */}
      <NavBar sessionId={sessionId} />

      {/* ---- Agent Controls ---- */}
      <section
        className="mx-6 mt-6 rounded-2xl border p-6"
        style={{
          background: "var(--panel)",
          borderColor: "rgba(156, 176, 197, 0.10)",
          backdropFilter: "blur(16px)",
        }}
      >
        <h2
          className="text-xs font-semibold tracking-widest uppercase mb-5"
          style={{ color: "var(--accent)" }}
        >
          Agent Controls
        </h2>

        {/* Agents row */}
        <div className="flex flex-wrap gap-3 mb-6">
          {AGENTS.map((agent) => {
            const active = enabledAgents.has(agent.type);
            return (
              <button
                key={agent.type}
                type="button"
                onClick={() => toggleAgent(agent.type)}
                className="flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all select-none"
                style={{
                  background: active
                    ? "rgba(110, 231, 200, 0.08)"
                    : "transparent",
                  borderColor: active
                    ? "rgba(110, 231, 200, 0.30)"
                    : "rgba(156, 176, 197, 0.12)",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}
              >
                {/* Checkbox indicator */}
                <span
                  className="flex items-center justify-center w-4 h-4 rounded border text-[10px]"
                  style={{
                    borderColor: active
                      ? "var(--accent)"
                      : "rgba(156, 176, 197, 0.3)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "var(--background)" : "transparent",
                  }}
                >
                  {active ? "\u2713" : ""}
                </span>
                {agent.label}
              </button>
            );
          })}
        </div>

        {/* Sliders row */}
        <div className="flex flex-wrap items-end gap-8 mb-6">
          {/* Depth slider */}
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted)" }}
            >
              Depth&nbsp;
              <span style={{ color: "var(--foreground)" }}>{depth}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full accent-[#6ee7c8]"
            />
            <div
              className="flex justify-between text-[10px]"
              style={{ color: "var(--muted)" }}
            >
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          {/* Tree limit slider */}
          <div className="flex flex-col gap-1.5 min-w-[240px]">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted)" }}
            >
              Tree Limit&nbsp;
              <span style={{ color: "var(--foreground)" }}>
                {treeLimit.toLocaleString()}
              </span>
            </label>
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={treeLimit}
              onChange={(e) => setTreeLimit(Number(e.target.value))}
              className="w-full accent-[#6ee7c8]"
            />
            <div
              className="flex justify-between text-[10px]"
              style={{ color: "var(--muted)" }}
            >
              <span>100</span>
              <span>10,000</span>
            </div>
          </div>
        </div>

        {/* Run button */}
        <button
          type="button"
          onClick={handleRun}
          disabled={exploring || enabledAgents.size === 0}
          className="rounded-lg px-6 py-2.5 text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "var(--background)",
          }}
        >
          {exploring ? "Exploring..." : "Run Exploration"}
        </button>
      </section>

      {/* ---- Bottom: Tree + Results ---- */}
      <div className="flex flex-1 gap-6 mx-6 my-6 min-h-0">
        {/* -- Left: State Tree Visualization -- */}
        <section
          ref={containerRef}
          className="relative flex-1 rounded-2xl border overflow-hidden"
          style={{
            background: "var(--panel)",
            borderColor: "rgba(156, 176, 197, 0.10)",
            backdropFilter: "blur(16px)",
            minHeight: 480,
          }}
        >
          <h3
            className="absolute top-4 left-5 text-xs font-semibold tracking-widest uppercase z-10"
            style={{ color: "var(--accent)" }}
          >
            State Tree
          </h3>

          {/* Empty / loading / error states */}
          {!vizData?.state_tree && !exploring && (
            <div className="flex items-center justify-center h-full">
              <p
                className="text-sm text-center max-w-xs"
                style={{ color: "var(--muted)" }}
              >
                Run an exploration to generate the state tree visualization.
              </p>
            </div>
          )}

          {exploring && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              {/* Spinner */}
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Building state tree...
              </p>
            </div>
          )}

          {/* SVG canvas */}
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{
              display:
                vizData?.state_tree && !exploring ? "block" : "none",
            }}
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-20 rounded-lg border p-3 text-xs pointer-events-none"
              style={{
                left: tooltip.x,
                top: tooltip.y + 20,
                background: "rgba(9, 19, 35, 0.95)",
                borderColor: "rgba(156, 176, 197, 0.2)",
                backdropFilter: "blur(12px)",
                minWidth: 180,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                  H = {tooltip.node.H.toFixed(3)}
                </span>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: healthColor(tooltip.node.H) }}
                />
              </div>
              <div style={{ color: "var(--muted)" }}>
                <p>
                  Delta H:{" "}
                  <span style={{ color: "#ef4444" }}>
                    {tooltip.node.delta_H.toFixed(3)}
                  </span>
                </p>
                <p>Agent: {tooltip.node.agent || "root"}</p>
                <p>Event: {tooltip.node.event || "initial state"}</p>
                <p>Failures: {tooltip.node.failures}</p>
              </div>
            </div>
          )}
        </section>

        {/* -- Right: Progress / Results Panel -- */}
        <section
          className="w-[380px] shrink-0 rounded-2xl border p-5 flex flex-col gap-5 overflow-y-auto"
          style={{
            background: "var(--panel)",
            borderColor: "rgba(156, 176, 197, 0.10)",
            backdropFilter: "blur(16px)",
          }}
        >
          <h3
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--accent)" }}
          >
            {exploring
              ? "Exploring..."
              : treeStats
                ? "Results"
                : "Progress"}
          </h3>

          {/* -- Before exploration -- */}
          {!exploring && !treeStats && !exploreError && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Configure agents and parameters above, then click{" "}
              <span style={{ color: "var(--accent)" }}>Run Exploration</span> to
              begin state-tree analysis.
            </p>
          )}

          {/* -- Error state -- */}
          {exploreError && (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                borderColor: "rgba(239, 68, 68, 0.3)",
                background: "rgba(239, 68, 68, 0.06)",
                color: "#ef4444",
              }}
            >
              {exploreError}
            </div>
          )}

          {/* -- During exploration -- */}
          {exploring && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                  style={{
                    borderColor: "var(--accent)",
                    borderTopColor: "transparent",
                  }}
                />
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  Searching state space...
                </span>
              </div>
              {/* Animated skeleton bars */}
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded-full animate-pulse"
                  style={{
                    background: "rgba(156, 176, 197, 0.08)",
                    width: `${70 - i * 15}%`,
                  }}
                />
              ))}
            </div>
          )}

          {/* -- After exploration (results) -- */}
          {!exploring && treeStats && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Nodes Explored"
                  value={treeStats.total_nodes_explored.toLocaleString()}
                />
                <StatCard
                  label="Max Depth"
                  value={String(treeStats.max_depth_reached)}
                />
                <StatCard
                  label="Compute Time"
                  value={`${(treeStats.computation_time_ms / 1000).toFixed(1)}s`}
                />
                <StatCard
                  label="Scenarios"
                  value={String(scenarios.length)}
                />
              </div>

              {/* Per-agent stats */}
              {agentStatEntries.length > 0 && (
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted)" }}
                  >
                    Agent Breakdown
                  </p>
                  <div className="flex flex-col gap-2">
                    {agentStatEntries.map(([name, stats]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-xs"
                        style={{ background: "rgba(156, 176, 197, 0.05)" }}
                      >
                        <span
                          className="font-medium truncate max-w-[160px]"
                          style={{ color: "var(--foreground)" }}
                        >
                          {formatAgentName(name)}
                        </span>
                        <div className="flex gap-3" style={{ color: "var(--muted)" }}>
                          <span>{stats.nodes_explored} nodes</span>
                          <span style={{ color: healthColor(stats.worst_H_found) }}>
                            H={stats.worst_H_found.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 3 worst scenarios */}
              {topScenarios.length > 0 && (
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted)" }}
                  >
                    Top Worst Scenarios
                  </p>
                  <div className="flex flex-col gap-2">
                    {topScenarios.map((s, i) => (
                      <div
                        key={s.rank ?? i}
                        className="rounded-lg border p-3"
                        style={{
                          borderColor: "rgba(156, 176, 197, 0.10)",
                          background: "rgba(156, 176, 197, 0.03)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              color: severityColor(s.severity_label),
                              background: `${severityColor(s.severity_label)}15`,
                            }}
                          >
                            {s.severity_label}
                          </span>
                          <span
                            className="text-xs font-mono"
                            style={{ color: healthColor(s.health_remaining) }}
                          >
                            H={s.health_remaining.toFixed(2)}
                          </span>
                        </div>
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {s.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View Full Report button */}
              <button
                type="button"
                onClick={() => router.push(`/report/${sessionId}` as Route)}
                className="mt-auto rounded-lg border px-5 py-2.5 text-sm font-semibold transition-all hover:bg-[rgba(110,231,200,0.08)]"
                style={{
                  borderColor: "rgba(110, 231, 200, 0.30)",
                  color: "var(--accent)",
                }}
              >
                View Full Report
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(156, 176, 197, 0.05)" }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p
        className="text-lg font-bold tabular-nums"
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAgentName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
