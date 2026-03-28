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
  if (failed) return "var(--danger)";
  const normalized = Math.max(0, Math.min(1, impact));
  return `color-mix(in oklch, var(--danger) ${Math.round(normalized * 100)}%, var(--muted-strong))`;
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

  // Seed session id into store on mount
  useEffect(() => {
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  // Fetch graph if not already loaded
  useEffect(() => {
    if (graph) return;
    getGraph(sessionId)
      .then((data) => setGraph(data.graph))
      .catch((err) => console.error("[network] graph fetch error:", err));
  }, [graph, sessionId, setGraph]);

  // ---- D3 ----
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Keep a ref to hiddenLayers so D3 callbacks can read latest value
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
    const glow = defs
      .append("filter")
      .attr("id", "nodeGlow")
      .attr("x", "-120%")
      .attr("y", "-120%")
      .attr("width", "340%")
      .attr("height", "340%");

    glow
      .append("feGaussianBlur")
      .attr("stdDeviation", 6)
      .attr("result", "blur");
    glow
      .append("feMerge")
      .selectAll("feMergeNode")
      .data(["blur", "SourceGraphic"])
      .join("feMergeNode")
      .attr("in", (d) => d);

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
      .attr("fill", "rgba(138, 166, 205, 0.42)");

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
      .attr("fill", "rgba(122, 178, 235, 0.05)")
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
      .attr("fill", "var(--foreground)")
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
        .attr("x1", (link) => ((link.source as OrbitNode).x ?? 0))
        .attr("y1", (link) => ((link.source as OrbitNode).y ?? 0))
        .attr("x2", (link) => ((link.target as OrbitNode).x ?? 0))
        .attr("y2", (link) => ((link.target as OrbitNode).y ?? 0))
        .attr("display", (link) =>
          hidden.has((link.source as OrbitNode).layer) ||
          hidden.has((link.target as OrbitNode).layer)
            ? "none"
            : "inline",
        )
        .attr("stroke", (link) => {
          const connected = hovered && (link.fromId === hovered || link.toId === hovered);
          const selectedLink = selected && (link.fromId === selected || link.toId === selected);
          if (connected) return "rgba(123, 220, 198, 0.92)";
          if (selectedLink) return "rgba(245, 199, 109, 0.78)";
          return link.crossLayer
            ? "rgba(138, 166, 205, 0.28)"
            : "rgba(120, 141, 173, 0.18)";
        })
        .attr("stroke-opacity", (link) =>
          hovered && (link.fromId === hovered || link.toId === hovered)
            ? 1
            : selected && (link.fromId === selected || link.toId === selected)
              ? 0.92
              : 0.72,
        )
        .attr("stroke-width", (link) => Math.max(1, link.weight * 2.6))
        .attr("stroke-dasharray", (link) => (link.crossLayer ? "5 7" : "none"));

      nodeSel
        .attr("display", (node) => (hidden.has(node.layer) ? "none" : "inline"))
        .attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`)
        .sort((a, b) => (a.impact ?? 0) - (b.impact ?? 0));

      nodeSel
        .select("circle.node-halo")
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id ? 0.95 : 0,
        )
        .attr("fill", (node) =>
          hovered === node.id || selected === node.id
            ? `${impactColor(node.impact, node.phi)}33`
            : "transparent",
        )
        .attr("filter", (node) =>
          hovered === node.id || selected === node.id ? "url(#nodeGlow)" : null,
        );

      nodeSel
        .select("circle.node-core")
        .attr("r", (node) => 8 + node.theta * 10)
        .attr("fill", (node) => impactColor(node.impact, node.phi))
        .attr("fill-opacity", (node) => (node.phi ? 1 : 0.94))
        .attr("stroke", (node) => {
          if (node.phi) return "var(--danger)";
          if (hovered === node.id) return "rgba(255,255,255,0.86)";
          if (selected === node.id) return "var(--selected)";
          return "rgba(255,255,255,0.16)";
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
      <div className="app-shell flex min-h-screen flex-col">
        <NavBar sessionId={sessionId} />
        <div className="flex-1 grid place-items-center">
          <div className="text-center">
            <div
              className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4"
              style={{
                borderColor: "var(--muted)",
                borderTopColor: "var(--accent)",
              }}
            />
            <p style={{ color: "var(--muted)" }}>Loading network graph...</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden">
      <NavBar sessionId={sessionId} />

      <div className="flex flex-1 min-h-0">
        {/* ================================================================
            LEFT: D3 Graph Canvas (70.8%)
            ================================================================ */}
        <div className="relative flex-[7.08] min-w-0">
          <div className="pointer-events-none absolute left-8 top-8 z-10 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <div className="mono-label text-[10px] text-[var(--accent-soft)]">
                TOPOLOGY_MONITOR_ACTIVE
              </div>
            </div>
            <div className="bracket-box rounded-2xl border-white/5 bg-black/40 backdrop-blur-xl p-5">
              <p className="mono-label text-[9px] mb-2 opacity-50">
                RESILIENCE_FIELD_INDEX
              </p>
              <p className="text-sm font-medium text-[var(--foreground)] leading-tight">
                Node radius reflects theta and modeled impact.
                <br />
                Edge thickness shows dependency weight between nodes.
              </p>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="mono-label text-[8px]">STABLE</span>
                <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[var(--healthy)] via-[var(--warn)] to-[var(--danger)] opacity-60" />
                <span className="mono-label text-[8px]">CRITICAL</span>
              </div>
            </div>
          </div>

          <svg
            ref={svgRef}
            className="block w-full h-full"
            style={{ background: "transparent" }}
            role="img"
            aria-label="3D Organizational Resilience Graph"
          >
            <title>
              Interactive 3D graph showing organizational dependencies and their
              relative risk levels.
            </title>
          </svg>

          {/* Layer toggles overlay */}
          <div className="absolute bottom-8 left-8 flex flex-col gap-4 p-6 rounded-3xl border border-white/5 bg-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="h-1 w-4 bg-white/20" />
              <span className="mono-label text-[10px]">LAYER_FILTER</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {layers.map((layer) => (
                <label
                  key={layer}
                  className="group flex items-center gap-3 cursor-pointer select-none py-1 transition-opacity hover:opacity-100"
                  style={{ opacity: hiddenLayers.has(layer) ? 0.3 : 1 }}
                >
                  <div className="relative flex h-4 w-4 items-center justify-center rounded border border-white/20 transition-all group-hover:border-[var(--accent-soft)]">
                    {!hiddenLayers.has(layer) && (
                      <div className="h-2 w-2 rounded-[1px] bg-[var(--accent)]" />
                    )}
                    <input
                      type="checkbox"
                      checked={!hiddenLayers.has(layer)}
                      onChange={() => toggleLayer(layer)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: layerColor(layer) }}
                  />
                  <span className="mono-label text-[9px] text-[var(--foreground)]">
                    {layer.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================================
            RIGHT: Analysis Panel (29.2%)
            ================================================================ */}
        <aside className="flex-[2.92] min-w-0 overflow-y-auto p-8 flex flex-col gap-8 border-l border-white/5 bg-black/20 backdrop-blur-md">
          {/* ---- Network Health ---- */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-1 w-6 bg-[var(--accent)]" />
              <div className="mono-label text-[10px]">SYSTEM_INTEGRITY</div>
            </div>
            <div className="bracket-box rounded-[32px] border-white/5 bg-white/[0.02] p-8">
              <div className="mono-label text-[9px] mb-2 opacity-40 text-center">
                NETWORK_HEALTH_QUOTIENT
              </div>
              <div className="display-face text-6xl font-bold tracking-tighter text-center tabular-nums text-[var(--accent)]">
                {vulnerabilityReport
                  ? vulnerabilityReport.network_health.toFixed(2)
                  : "0.00"}
                <span className="text-xl opacity-20 ml-1">_H</span>
              </div>
            </div>
          </section>

          {/* ---- Layer Health Bars ---- */}
          {vulnerabilityReport && (
            <section className="flex flex-col gap-6">
              <div className="mono-label text-[10px] text-[var(--accent-soft)]">
                LAYER_DIAGNOSTICS
              </div>
              <div className="grid gap-4">
                {Object.entries(vulnerabilityReport.layer_analysis).map(
                  ([layer, info]) => (
                    <div key={layer} className="flex flex-col gap-2">
                      <div className="flex justify-between items-end px-1">
                        <span
                          className="mono-label text-[9px] font-bold"
                          style={{ color: layerColor(layer) }}
                        >
                          {layer.toUpperCase()}
                        </span>
                        <span className="font-mono text-[10px] opacity-60">
                          {Math.round(info.layer_health * 100)}%_INTEGRITY
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${info.layer_health * 100}%`,
                            background: layerColor(layer),
                            boxShadow: `0 0 8px ${layerColor(layer)}44`,
                          }}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* ---- Top Risks ---- */}
          {topRisks.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="mono-label text-[10px] text-[var(--danger)]">
                CRITICAL_CHOKEPOINTS
              </div>
              <div className="flex flex-col gap-2">
                {topRisks.map((r, i) => {
                  const node = graph.nodes.find((n) => n.id === r.node_id);
                  return (
                    <button
                      key={r.node_id}
                      className={`group flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                        selectedNodeId === r.node_id
                          ? "border-[var(--danger)]/40 bg-[var(--danger)]/10"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                      onClick={() => setSelectedNode(r.node_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="mono-label text-[9px] opacity-30">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-bold tracking-tight text-[var(--foreground)] uppercase">
                          {node?.name ?? r.node_id}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="mono-label text-[8px] text-[var(--danger)]">
                          IMPACT_LOSS
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--danger)]">
                          -{r.health_loss.toFixed(3)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- Summary stats ---- */}
          {vulnerabilityReport && (
            <section className="grid grid-cols-2 gap-4">
              <StatCard
                label="BRIDGE_NODES"
                value={vulnerabilityReport.bridge_nodes.length}
              />
              <StatCard
                label="CLUSTERS_DETECTED"
                value={vulnerabilityReport.clusters.length}
              />
              {highestSynergy && (
                <div className="col-span-2">
                  <StatCard
                    label="MAX_SYNERGY_COLLAPSE"
                    value={`${highestSynergy.node_a.toUpperCase()} + ${highestSynergy.node_b.toUpperCase()}`}
                    sub={`${highestSynergy.synergy_ratio.toFixed(1)}x AMPLIFICATION`}
                    accent="var(--danger)"
                  />
                </div>
              )}
            </section>
          )}

          {/* ---- Actions ---- */}
          <div className="flex flex-col gap-3 mt-auto pt-6 border-t border-white/5">
            <button
              className="accent-button w-full py-5 rounded-full text-xs font-bold uppercase tracking-[0.2em]"
              onClick={() => runAnalysis()}
              disabled={analyzing}
            >
              {analyzing ? "CALCULATING..." : "RUN ANALYSIS"}
            </button>

            <button
              className="ghost-button w-full py-5 rounded-full text-xs font-bold uppercase tracking-[0.2em]"
              onClick={() => router.push(`/simulate/${sessionId}` as Route)}
            >
              START SIMULATION →
            </button>

            {selectedNodeId && (
              <button
                className="w-full py-4 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all bg-[var(--danger)] text-white hover:brightness-110 shadow-[0_0_24px_rgba(239,68,68,0.2)]"
                onClick={() =>
                  runCascade({
                    target: selectedNodeId,
                    action: "kill",
                  })
                }
              >
                TERMINATE_NODE:{" "}
                {selectedNode?.name?.toUpperCase() ??
                  selectedNodeId.toUpperCase()}
              </button>
            )}
          </div>

          {/* ---- Node Detail Panel ---- */}
          {selectedNode && (
            <section className="control-surface-strong absolute bottom-8 right-8 z-20 w-[360px] overflow-hidden rounded-[32px] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.5)] fade-rise">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="mono-label text-[9px] text-[var(--accent-soft)]">
                    NODE_PROPERTIES
                  </div>
                  <h3 className="display-face text-2xl font-bold tracking-tight text-[var(--foreground)] uppercase">
                    {selectedNode.name}
                  </h3>
                </div>
                <button
                  className="mono-label !text-[9px] opacity-40 hover:opacity-100"
                  onClick={() => setSelectedNode(null)}
                >
                  [ CLOSE ]
                </button>
              </div>

              <div
                className="inline-block text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg mb-6"
                style={{
                  background: layerColor(selectedNode.layer) + "15",
                  color: layerColor(selectedNode.layer),
                  border: `1px solid ${layerColor(selectedNode.layer)}33`,
                }}
              >
                LAYER: {selectedNode.layer.toUpperCase()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <NodeStat
                  label="IMPACT_WEIGHT"
                  value={(
                    impactByNodeId.get(selectedNode.id) ?? selectedNode.theta
                  ).toFixed(3)}
                  accentColor={impactColor(
                    impactByNodeId.get(selectedNode.id) ?? selectedNode.theta,
                    selectedNode.phi,
                  )}
                />
                <NodeStat
                  label="HEALTH_STATE"
                  value={selectedNode.h.toFixed(3)}
                  accentColor={
                    selectedNode.phi ? "var(--danger)" : "var(--healthy)"
                  }
                />
                <NodeStat
                  label="LOCAL_THETA"
                  value={selectedNode.theta.toFixed(3)}
                />
                <NodeStat
                  label="RECOVERY_COST"
                  value={`$${(selectedNode.r / 1000).toFixed(0)}K`}
                />
                <div className="col-span-2 pt-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="mono-label text-[8px] opacity-30">
                      CONNECTIONS
                    </span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEdges.map((e, i) => {
                      const otherId =
                        e.from === selectedNode.id ? e.to : e.from;
                      const otherNode = graph.nodes.find(
                        (n) => n.id === otherId,
                      );
                      return (
                        <div
                          key={i}
                          className="rounded-md border border-white/5 bg-white/5 px-2 py-1 font-mono text-[9px] opacity-60"
                        >
                          {otherNode?.name?.toUpperCase() ??
                            otherId.toUpperCase()}
                        </div>
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
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bracket-box flex flex-col gap-2 rounded-2xl border-white/5 bg-white/[0.02] p-4">
      <p className="mono-label !text-[8px] opacity-40">{label}</p>
      <p
        className="text-sm font-bold tracking-tight uppercase"
        style={{ color: accent }}
      >
        {value}
      </p>
      {sub && <p className="mono-label !text-[8px] opacity-60">{sub}</p>}
    </div>
  );
}

function NodeStat({
  label,
  value,
  alert,
  accentColor,
}: {
  label: string;
  value: string;
  alert?: boolean;
  accentColor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="mono-label !text-[8px] opacity-40">{label}</p>
      <p
        className="font-mono text-sm font-bold tabular-nums"
        style={{
          color: alert ? "var(--danger)" : (accentColor ?? "var(--foreground)"),
        }}
      >
        {value}
      </p>
    </div>
  );
}
