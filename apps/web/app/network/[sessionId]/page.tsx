"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as d3 from "d3";

import NavBar from "@/components/NavBar";
import { useNexusStore } from "@/lib/store";
import { getGraph } from "@/lib/api";
import type { GraphNode } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYER_COLORS: Record<string, string> = {
  People: "var(--layer-people)",
  Technology: "var(--layer-tech)",
  Supply: "var(--layer-supply)",
  Financial: "var(--layer-financial)",
  Facilities: "var(--layer-facilities)",
  Operations: "var(--layer-ops)",
};

const FALLBACK_COLORS = [
  "var(--layer-people)",
  "var(--layer-tech)",
  "var(--layer-supply)",
  "var(--layer-financial)",
  "var(--layer-facilities)",
  "var(--layer-ops)",
];

function layerColor(layer: string): string {
  const direct = LAYER_COLORS[layer];
  if (direct) return direct;

  let hash = 0;
  for (const char of layer) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }

  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function impactColor(impact: number, failed: boolean): string {
  if (failed) return "#b91c1c";
  const normalized = Math.max(0, Math.min(1, impact));
  if (normalized > 0.7) return "#b91c1c";
  if (normalized > 0.4) return "#666666";
  return "#999999";
}

interface OrbitNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  impact: number;
}

interface OrbitLink {
  source: string | OrbitNode;
  target: string | OrbitNode;
  fromId: string;
  toId: string;
  weight: number;
  crossLayer: boolean;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function NetworkPage({ params }: PageProps) {
  const { sessionId } = use(params);
  const router = useRouter();

  // ---- Store selectors ----
  const graph = useNexusStore((s) => s.graph);
  const vulnerabilityReport = useNexusStore((s) => s.vulnerabilityReport);
  const analyzing = useNexusStore((s) => s.analyzing);
  const selectedNodeId = useNexusStore((s) => s.selectedNodeId);
  const setSelectedNode = useNexusStore((s) => s.setSelectedNode);
  const runAnalysis = useNexusStore((s) => s.runAnalysis);
  const runCascade = useNexusStore((s) => s.runCascade);
  const setSessionId = useNexusStore((s) => s.setSessionId);
  const setGraph = useNexusStore((s) => s.setGraph);

  // ---- Local state ----
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  useEffect(() => {
    if (graph) return;
    getGraph(sessionId)
      .then((data) => setGraph(data.graph))
      .catch((err) => console.error("[network] graph fetch error:", err));
  }, [graph, sessionId, setGraph]);

  // ---- D3 ----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hiddenLayersRef = useRef(hiddenLayers);
  const selectedNodeRef = useRef(selectedNodeId);
  const hoveredNodeRef = useRef(hoveredNodeId);

  useEffect(() => {
    hiddenLayersRef.current = hiddenLayers;
  }, [hiddenLayers]);

  useEffect(() => {
    selectedNodeRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    hoveredNodeRef.current = hoveredNodeId;
  }, [hoveredNodeId]);

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr("width", width).attr("height", height);

    const defs = svg.append("defs");

    defs
      .append("marker")
      .attr("id", "networkArrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L10,0L0,4")
      .attr("fill", "rgba(0, 0, 0, 0.2)");

    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.65, 2.4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const impactMap = new Map(
      (vulnerabilityReport?.node_rankings ?? []).map((entry) => [
        entry.node_id,
        entry.health_loss,
      ]),
    );
    const impactMax = Math.max(
      ...graph.nodes.map((node) => impactMap.get(node.id) ?? node.theta),
      1,
    );

    const orbitNodes: OrbitNode[] = graph.nodes.map((node) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 160,
      y: height / 2 + (Math.random() - 0.5) * 120,
      impact: (impactMap.get(node.id) ?? node.theta) / impactMax,
    }));

    const nodeMap = new Map(orbitNodes.map((node) => [node.id, node]));
    const orbitLinks: OrbitLink[] = graph.edges
      .filter((edge) => nodeMap.has(edge.from) && nodeMap.has(edge.to))
      .map((edge) => {
        const source = nodeMap.get(edge.from)!;
        const target = nodeMap.get(edge.to)!;
        return {
          source: source.id,
          target: target.id,
          fromId: source.id,
          toId: target.id,
          weight: edge.weight,
          crossLayer: source.layer !== target.layer,
        };
      });

    const edgeSel = g
      .append("g")
      .selectAll("line")
      .data(orbitLinks)
      .join("line")
      .attr("stroke-linecap", "round")
      .attr("marker-end", "url(#networkArrow)");

    const nodeSel = g
      .append("g")
      .selectAll<SVGGElement, OrbitNode>("g")
      .data(orbitNodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer");

    nodeSel
      .append("circle")
      .attr("class", "node-halo")
      .attr("r", 18)
      .attr("fill", "rgba(0, 0, 0, 0.04)")
      .attr("opacity", 0);

    nodeSel
      .append("circle")
      .attr("class", "node-core")
      .attr("r", 8)
      .attr("stroke-width", 1.5);

    nodeSel
      .append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#000000")
      .attr("font-weight", 600)
      .attr("pointer-events", "none")
      .text((d) => d.name);

    nodeSel
      .on("mouseenter", (_event, d) => {
        setHoveredNodeId(d.id);
      })
      .on("mouseleave", () => {
        setHoveredNodeId(null);
      })
      .on("click", (_event, d) => {
        setSelectedNode(selectedNodeRef.current === d.id ? null : d.id);
      });

    const simulation = d3
      .forceSimulation(orbitNodes)
      .force(
        "link",
        d3
          .forceLink<OrbitNode, OrbitLink>(orbitLinks)
          .id((node) => node.id)
          .distance((link) => 90 + (1 - link.weight) * 140)
          .strength((link) => 0.24 + link.weight * 0.5),
      )
      .force("charge", d3.forceManyBody<OrbitNode>().strength(-340))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<OrbitNode>().radius((node) => 16 + node.theta * 20),
      )
      .force("x", d3.forceX<OrbitNode>(width / 2).strength(0.03))
      .force("y", d3.forceY<OrbitNode>(height / 2).strength(0.03));

    const drag = d3
      .drag<SVGGElement, OrbitNode>()
      .on("start", (event, node) => {
        if (!event.active) simulation.alphaTarget(0.22).restart();
        node.fx = node.x ?? 0;
        node.fy = node.y ?? 0;
      })
      .on("drag", (event, node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on("end", (event, node) => {
        if (!event.active) simulation.alphaTarget(0);
        node.fx = null;
        node.fy = null;
      });

    nodeSel.call(drag);

    const render = () => {
      const hovered = hoveredNodeRef.current;
      const hidden = hiddenLayersRef.current;
      const selected = selectedNodeRef.current;

      edgeSel
        .attr("x1", (link) => (link.source as OrbitNode).x ?? 0)
        .attr("y1", (link) => (link.source as OrbitNode).y ?? 0)
        .attr("x2", (link) => (link.target as OrbitNode).x ?? 0)
        .attr("y2", (link) => (link.target as OrbitNode).y ?? 0)
        .attr("display", (link) =>
          hidden.has((link.source as OrbitNode).layer) ||
          hidden.has((link.target as OrbitNode).layer)
            ? "none"
            : "inline",
        )
        .attr("stroke", (link) => {
          const connected =
            hovered && (link.fromId === hovered || link.toId === hovered);
          const selectedLink =
            selected && (link.fromId === selected || link.toId === selected);
          if (connected) return "#000000";
          if (selectedLink) return "#333333";
          return link.crossLayer
            ? "rgba(0, 0, 0, 0.18)"
            : "rgba(0, 0, 0, 0.1)";
        })
        .attr("stroke-opacity", (link) =>
          hovered && (link.fromId === hovered || link.toId === hovered)
            ? 1
            : selected && (link.fromId === selected || link.toId === selected)
              ? 0.8
              : 0.6,
        )
        .attr("stroke-width", (link) => Math.max(1, link.weight * 2.6))
        .attr("stroke-dasharray", (link) =>
          link.crossLayer ? "5 7" : "none",
        );

      nodeSel
        .attr("display", (node) =>
          hidden.has(node.layer) ? "none" : "inline",
        )
        .attr(
          "transform",
          (node) => `translate(${node.x ?? 0},${node.y ?? 0})`,
        )
        .sort((a, b) => (a.impact ?? 0) - (b.impact ?? 0));

      nodeSel
        .select("circle.node-halo")
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id ? 0.95 : 0,
        )
        .attr("fill", (node) =>
          hovered === node.id || selected === node.id
            ? "rgba(0, 0, 0, 0.06)"
            : "transparent",
        );

      nodeSel
        .select("circle.node-core")
        .attr("r", (node) => 8 + node.theta * 10)
        .attr("fill", (node) => impactColor(node.impact, node.phi))
        .attr("fill-opacity", (node) => (node.phi ? 1 : 0.94))
        .attr("stroke", (node) => {
          if (node.phi) return "#b91c1c";
          if (hovered === node.id) return "#000000";
          if (selected === node.id) return "#000000";
          return "rgba(0, 0, 0, 0.15)";
        })
        .attr("stroke-width", (node) =>
          hovered === node.id || selected === node.id || node.phi ? 2.4 : 1.4,
        );

      nodeSel
        .select("text.node-label")
        .attr("y", (node) => -(18 + node.theta * 9))
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id || node.theta > 0.72
            ? 1
            : 0,
        );
    };

    simulation.on("tick", render);
    render();

    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, [graph, setSelectedNode, vulnerabilityReport]);

  // ---- Layer toggle handler ----
  const toggleLayer = useCallback((layer: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // ---- Derived data ----
  const layers = graph?.layers ?? [];
  const selectedNode =
    graph?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdges =
    graph && selectedNodeId
      ? graph.edges.filter(
          (e) => e.from === selectedNodeId || e.to === selectedNodeId,
        )
      : [];

  const topRisks = vulnerabilityReport?.node_rankings.slice(0, 5) ?? [];
  const highestSynergy = vulnerabilityReport?.compound_pairs?.[0] ?? null;
  const impactByNodeId = new Map(
    (vulnerabilityReport?.node_rankings ?? []).map((entry) => [
      entry.node_id,
      entry.health_loss,
    ]),
  );

  // ---- Loading state ----
  if (!graph) {
    return (
      <div className="flex min-h-screen flex-col">
        <NavBar sessionId={sessionId} />
        <div className="flex-1 grid place-items-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin border-2 border-[var(--border)] border-t-[var(--text)]" />
            <p className="text-sm text-[var(--text-muted)]">
              Loading network graph...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <NavBar sessionId={sessionId} />

      <div className="flex flex-1 min-h-0">
        {/* D3 Graph Canvas */}
        <div className="relative flex-[7] min-w-0 border-r border-[var(--border)]">
          {/* Legend */}
          <div className="pointer-events-none absolute left-6 top-6 z-10">
            <div className="border border-[var(--border)] bg-white p-4">
              <p className="mono-label text-[9px] mb-2">Legend</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Node size = impact weight.
                <br />
                Edge thickness = dependency strength.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] text-[var(--text-light)]">
                  Stable
                </span>
                <div className="h-1 flex-1 bg-gradient-to-r from-[#999999] to-[#b91c1c]" />
                <span className="font-mono text-[9px] text-[var(--text-light)]">
                  Critical
                </span>
              </div>
            </div>
          </div>

          <svg
            ref={svgRef}
            className="block w-full h-full"
            style={{ background: "#fafafa" }}
            role="img"
            aria-label="Organizational Dependency Graph"
          >
            <title>
              Interactive graph showing organizational dependencies and risk
              levels.
            </title>
          </svg>

          {/* Layer toggles */}
          <div className="absolute bottom-6 left-6 border border-[var(--border)] bg-white p-4">
            <p className="mono-label text-[9px] mb-3">Layers</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {layers.map((layer) => (
                <label
                  key={layer}
                  className="flex items-center gap-2 cursor-pointer select-none text-xs"
                  style={{ opacity: hiddenLayers.has(layer) ? 0.3 : 1 }}
                >
                  <div className="relative flex h-3.5 w-3.5 items-center justify-center border border-[var(--border)]">
                    {!hiddenLayers.has(layer) && (
                      <div className="h-2 w-2 bg-[var(--text)]" />
                    )}
                    <input
                      type="checkbox"
                      checked={!hiddenLayers.has(layer)}
                      onChange={() => toggleLayer(layer)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[var(--text-secondary)]">{layer}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <aside className="flex-[3] min-w-0 overflow-y-auto p-6 flex flex-col gap-6 bg-white">
          {/* Network Health */}
          <section>
            <p className="mono-label text-[9px] mb-3">Network Health</p>
            <div className="border border-[var(--border)] p-6 text-center">
              <p className="display-face text-5xl font-normal tracking-tight tabular-nums">
                {vulnerabilityReport
                  ? vulnerabilityReport.network_health.toFixed(2)
                  : "0.00"}
              </p>
            </div>
          </section>

          {/* Layer Health */}
          {vulnerabilityReport && (
            <section>
              <p className="mono-label text-[9px] mb-3">Layer Diagnostics</p>
              <div className="divide-y divide-[var(--border)] border border-[var(--border)]">
                {Object.entries(vulnerabilityReport.layer_analysis).map(
                  ([layer, info]) => (
                    <div
                      key={layer}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-xs font-medium">{layer}</span>
                      <div className="flex items-center gap-3">
                        <div className="h-1 w-16 bg-[var(--border)]">
                          <div
                            className="h-full bg-[var(--text)] transition-all duration-700"
                            style={{ width: `${info.layer_health * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] w-8 text-right">
                          {Math.round(info.layer_health * 100)}%
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Top Risks */}
          {topRisks.length > 0 && (
            <section>
              <p className="mono-label text-[9px] mb-3">Critical Nodes</p>
              <div className="divide-y divide-[var(--border)] border border-[var(--border)]">
                {topRisks.map((r, i) => {
                  const node = graph.nodes.find((n) => n.id === r.node_id);
                  return (
                    <button
                      key={r.node_id}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-alt)] ${
                        selectedNodeId === r.node_id ? "bg-[var(--bg-alt)]" : ""
                      }`}
                      onClick={() => setSelectedNode(r.node_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[9px] text-[var(--text-light)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-medium">
                          {node?.name ?? r.node_id}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-[var(--danger)]">
                        -{r.health_loss.toFixed(3)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Stats */}
          {vulnerabilityReport && (
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                label="Bridge Nodes"
                value={vulnerabilityReport.bridge_nodes.length}
              />
              <StatCard
                label="Clusters"
                value={vulnerabilityReport.clusters.length}
              />
              {highestSynergy && (
                <div className="col-span-2">
                  <StatCard
                    label="Max Synergy"
                    value={`${highestSynergy.node_a} + ${highestSynergy.node_b}`}
                    sub={`${highestSynergy.synergy_ratio.toFixed(1)}x amplification`}
                  />
                </div>
              )}
            </section>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-auto pt-6 border-t border-[var(--border)]">
            <button
              className="w-full border border-[var(--text)] bg-[var(--text)] py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text-secondary)] disabled:opacity-30"
              onClick={() => runAnalysis()}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing..." : "Run Analysis"}
            </button>

            <button
              className="w-full border border-[var(--border)] py-3 text-sm font-medium transition-colors hover:border-[var(--text)] hover:bg-[var(--bg-alt)]"
              onClick={() => router.push(`/simulate/${sessionId}` as Route)}
            >
              Start Simulation
            </button>

            {selectedNodeId && (
              <button
                className="w-full border border-[var(--danger)] py-3 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-red-50"
                onClick={() =>
                  runCascade({
                    target: selectedNodeId,
                    action: "kill",
                  })
                }
              >
                Terminate: {selectedNode?.name ?? selectedNodeId}
              </button>
            )}
          </div>

          {/* Node Detail Panel */}
          {selectedNode && (
            <section className="absolute bottom-6 right-6 z-20 w-[340px] border border-[var(--border)] bg-white p-6 shadow-lg fade-rise">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="mono-label text-[9px] mb-1">Node</p>
                  <h3 className="text-lg font-medium">{selectedNode.name}</h3>
                </div>
                <button
                  className="text-xs text-[var(--text-light)] hover:text-[var(--text)]"
                  onClick={() => setSelectedNode(null)}
                >
                  Close
                </button>
              </div>

              <div className="mb-4 inline-block border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium">
                {selectedNode.layer}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <NodeStat
                  label="Impact"
                  value={(
                    impactByNodeId.get(selectedNode.id) ?? selectedNode.theta
                  ).toFixed(3)}
                />
                <NodeStat
                  label="Health"
                  value={selectedNode.h.toFixed(3)}
                  alert={selectedNode.phi}
                />
                <NodeStat
                  label="Theta"
                  value={selectedNode.theta.toFixed(3)}
                />
                <NodeStat
                  label="Recovery"
                  value={`$${(selectedNode.r / 1000).toFixed(0)}K`}
                />
                <div className="col-span-2 pt-2 border-t border-[var(--border)]">
                  <p className="mono-label text-[8px] mb-2">Connections</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedEdges.map((e, i) => {
                      const otherId =
                        e.from === selectedNode.id ? e.to : e.from;
                      const otherNode = graph.nodes.find(
                        (n) => n.id === otherId,
                      );
                      return (
                        <span
                          key={i}
                          className="border border-[var(--border)] px-2 py-0.5 font-mono text-[9px]"
                        >
                          {otherNode?.name ?? otherId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="border border-[var(--border)] p-3">
      <p className="mono-label text-[8px] mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {sub && (
        <p className="font-mono text-[9px] text-[var(--text-muted)] mt-1">
          {sub}
        </p>
      )}
    </div>
  );
}

function NodeStat({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="mono-label text-[8px] mb-1">{label}</p>
      <p
        className="font-mono text-sm font-medium tabular-nums"
        style={{ color: alert ? "var(--danger)" : undefined }}
      >
        {value}
      </p>
    </div>
  );
}
