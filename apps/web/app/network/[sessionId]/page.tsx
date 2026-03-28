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
  People: "#82a8ea",
  Technology: "#79d0c0",
  Supply: "#deac63",
  Financial: "#d5cf77",
  Facilities: "#d9816c",
  Operations: "#7d93d8",
};

const FALLBACK_COLORS = [
  "#9bb4ec",
  "#79d0c0",
  "#d6c16f",
  "#dd9d68",
  "#7c92d7",
  "#c98869",
];

function layerColor(layer: string): string {
  if (LAYER_COLORS[layer]) return LAYER_COLORS[layer];
  // deterministic fallback for custom layers
  let hash = 0;
  for (let i = 0; i < layer.length; i++) {
    hash = layer.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function mixHex(a: string, b: string, ratio: number): string {
  const clampRatio = Math.max(0, Math.min(1, ratio));
  const parse = (hex: string) => Number.parseInt(hex, 16);
  const ar = parse(a.slice(1, 3));
  const ag = parse(a.slice(3, 5));
  const ab = parse(a.slice(5, 7));
  const br = parse(b.slice(1, 3));
  const bg = parse(b.slice(3, 5));
  const bb = parse(b.slice(5, 7));

  const toHex = (value: number) =>
    Math.round(value).toString(16).padStart(2, "0");

  return `#${toHex(ar + (br - ar) * clampRatio)}${toHex(ag + (bg - ag) * clampRatio)}${toHex(ab + (bb - ab) * clampRatio)}`;
}

function impactColor(impact: number, failed: boolean): string {
  if (failed) return "#d14a3e";
  const normalized = Math.max(0, Math.min(1, impact));
  return mixHex("#7b97b9", "#d14a3e", normalized);
}

interface OrbitNode extends GraphNode {
  x3: number;
  y3: number;
  z3: number;
  impact: number;
}

interface OrbitLink {
  source: OrbitNode;
  target: OrbitNode;
  weight: number;
  crossLayer: boolean;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
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
  hiddenLayersRef.current = hiddenLayers;

  const selectedNodeRef = useRef(selectedNodeId);
  selectedNodeRef.current = selectedNodeId;

  const hoveredNodeRef = useRef(hoveredNodeId);
  hoveredNodeRef.current = hoveredNodeId;

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

    glow.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "blur");
    glow
      .append("feMerge")
      .selectAll("feMergeNode")
      .data(["blur", "SourceGraphic"])
      .join("feMergeNode")
      .attr("in", (d) => d);

    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.65, 2.4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const sphereRadius = Math.min(width, height) * 0.3;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
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

    const orbitNodes: OrbitNode[] = graph.nodes.map((node, index) => {
      const total = Math.max(graph.nodes.length - 1, 1);
      const y = 1 - (index / total) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * index;

      return {
        ...node,
        x3: Math.cos(theta) * radiusAtY,
        y3: y,
        z3: Math.sin(theta) * radiusAtY,
        impact: (impactMap.get(node.id) ?? node.theta) / impactMax,
      };
    });

    const nodeMap = new Map(orbitNodes.map((node) => [node.id, node]));
    const orbitLinks: OrbitLink[] = graph.edges
      .filter((edge) => nodeMap.has(edge.from) && nodeMap.has(edge.to))
      .map((edge) => {
        const source = nodeMap.get(edge.from)!;
        const target = nodeMap.get(edge.to)!;
        return {
          source,
          target,
          weight: edge.weight,
          crossLayer: source.layer !== target.layer,
        };
      });

    const projected = new Map<string, ProjectedPoint>();

    const edgeSel = g
      .append("g")
      .selectAll("line")
      .data(orbitLinks)
      .join("line")
      .attr("stroke-linecap", "round");

    const nodeSel = g
      .append("g")
      .selectAll("g")
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

    let angleY = 0;
    let angleX = -0.22;
    let frameId = 0;

    const project = (node: OrbitNode) => {
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const x1 = node.x3 * cosY + node.z3 * sinY;
      const z1 = -node.x3 * sinY + node.z3 * cosY;
      const y1 = node.y3 * cosX - z1 * sinX;
      const z2 = node.y3 * sinX + z1 * cosX;
      const perspective = 2.8;
      const scale = perspective / (perspective - z2 * 1.35);

      return {
        x: width / 2 + x1 * sphereRadius * scale,
        y: height / 2 + y1 * sphereRadius * scale,
        z: z2,
        scale,
        opacity: 0.28 + ((z2 + 1) / 2) * 0.72,
      };
    };

    const render = () => {
      const hovered = hoveredNodeRef.current;
      angleY += hovered ? 0.0012 : 0.0018;

      for (const node of orbitNodes) {
        projected.set(node.id, project(node));
      }

      const hidden = hiddenLayersRef.current;
      const selected = selectedNodeRef.current;

      edgeSel
        .attr("x1", (link) => projected.get(link.source.id)?.x ?? 0)
        .attr("y1", (link) => projected.get(link.source.id)?.y ?? 0)
        .attr("x2", (link) => projected.get(link.target.id)?.x ?? 0)
        .attr("y2", (link) => projected.get(link.target.id)?.y ?? 0)
        .attr("display", (link) =>
          hidden.has(link.source.layer) || hidden.has(link.target.layer)
            ? "none"
            : "inline"
        )
        .attr("stroke", (link) => {
          const connected =
            hovered &&
            (link.source.id === hovered || link.target.id === hovered);
          const selectedLink =
            selected &&
            (link.source.id === selected || link.target.id === selected);
          if (connected) return "rgba(123, 220, 198, 0.92)";
          if (selectedLink) return "rgba(245, 199, 109, 0.78)";
          return link.crossLayer
            ? "rgba(138, 166, 205, 0.28)"
            : "rgba(120, 141, 173, 0.18)";
        })
        .attr("stroke-opacity", (link) => {
          const src = projected.get(link.source.id);
          const tgt = projected.get(link.target.id);
          const depth = ((src?.opacity ?? 0.3) + (tgt?.opacity ?? 0.3)) / 2;
          return depth;
        })
        .attr("stroke-width", (link) => Math.max(1, link.weight * 2.6))
        .attr("stroke-dasharray", (link) => (link.crossLayer ? "5 7" : "none"));

      edgeSel.sort((a, b) => {
        const az =
          ((projected.get(a.source.id)?.z ?? 0) + (projected.get(a.target.id)?.z ?? 0)) / 2;
        const bz =
          ((projected.get(b.source.id)?.z ?? 0) + (projected.get(b.target.id)?.z ?? 0)) / 2;
        return az - bz;
      });

      nodeSel
        .attr("display", (node) => (hidden.has(node.layer) ? "none" : "inline"))
        .attr("transform", (node) => {
          const point = projected.get(node.id)!;
          return `translate(${point.x},${point.y})`;
        })
        .sort(
          (a, b) =>
            (projected.get(a.id)?.z ?? 0) - (projected.get(b.id)?.z ?? 0),
        );

      nodeSel
        .select("circle.node-halo")
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id ? 0.95 : 0
        )
        .attr("fill", (node) =>
          hovered === node.id || selected === node.id
            ? `${impactColor(node.impact, node.phi)}33`
            : "transparent"
        )
        .attr("filter", (node) =>
          hovered === node.id || selected === node.id ? "url(#nodeGlow)" : null
        );

      nodeSel
        .select("circle.node-core")
        .attr("fill", (node) => impactColor(node.impact, node.phi))
        .attr("fill-opacity", (node) => {
          const point = projected.get(node.id)!;
          return Math.min(1, point.opacity * (node.phi ? 1 : 0.94));
        })
        .attr("stroke", (node) => {
          if (node.phi) return "#ffd4c8";
          if (hovered === node.id) return "rgba(255,255,255,0.86)";
          if (selected === node.id) return "rgba(245, 199, 109, 0.95)";
          return "rgba(255,255,255,0.16)";
        })
        .attr("stroke-width", (node) =>
          hovered === node.id || selected === node.id || node.phi ? 2.4 : 1.4
        );

      nodeSel
        .select("text.node-label")
        .attr("y", -16)
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id ? 1 : 0
        );

      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
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
  const selectedNode = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdges =
    graph && selectedNodeId
      ? graph.edges.filter(
          (e) => e.from === selectedNodeId || e.to === selectedNodeId
        )
      : [];

  const topRisks = vulnerabilityReport?.node_rankings.slice(0, 5) ?? [];
  const highestSynergy =
    vulnerabilityReport?.compound_pairs?.[0] ?? null;
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
            LEFT: D3 Graph Canvas (70%)
            ================================================================ */}
        <div
          className="relative flex-[7] min-w-0"
          style={{ background: "var(--background)" }}
        >
          <div className="pointer-events-none absolute left-5 top-5 z-10 rounded-2xl border border-white/8 bg-[color:rgb(7_15_26_/_0.76)] px-4 py-3 backdrop-blur-xl">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
              3D impact field
            </p>
            <p className="mt-1 text-sm text-[var(--foreground)]">
              Uniform node size. Impact drives the shift toward red.
            </p>
            <div className="mt-3 flex items-center gap-3 text-[0.68rem] uppercase tracking-[0.18em] text-[var(--muted)]">
              <span>Low</span>
              <span className="h-2 w-24 rounded-full bg-gradient-to-r from-[#7b97b9] to-[#d14a3e]" />
              <span>High</span>
            </div>
          </div>

          <svg
            ref={svgRef}
            className="block w-full h-full"
            style={{ background: "transparent" }}
          />

          {/* Layer toggles overlay */}
          <div
            className="absolute bottom-4 left-4 flex flex-col gap-1.5 p-3 rounded-xl text-xs"
            style={{
              background: "var(--panel)",
              border: "1px solid rgba(156, 176, 197, 0.1)",
              backdropFilter: "blur(12px)",
            }}
          >
            <span
              className="font-semibold mb-1 text-[10px] uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Layers
            </span>
            {layers.map((layer) => (
              <label
                key={layer}
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{ color: "var(--foreground)" }}
              >
                <input
                  type="checkbox"
                  checked={!hiddenLayers.has(layer)}
                  onChange={() => toggleLayer(layer)}
                  className="accent-[var(--accent)] w-3.5 h-3.5"
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: layerColor(layer) }}
                />
                {layer}
              </label>
            ))}
          </div>
        </div>

        {/* ================================================================
            RIGHT: Analysis Panel (30%)
            ================================================================ */}
        <aside
          className="flex-[3] min-w-0 overflow-y-auto p-5 flex flex-col gap-5 border-l"
          style={{
            background: "var(--panel)",
            borderColor: "rgba(156, 176, 197, 0.1)",
          }}
        >
          {/* ---- Network Health ---- */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--muted)" }}
            >
              Network Health
            </h2>
            <p
              className="text-4xl font-bold tabular-nums"
              style={{ color: "var(--accent)" }}
            >
              H ={" "}
              {vulnerabilityReport
                ? vulnerabilityReport.network_health.toFixed(2)
                : "--"}
            </p>
          </section>

          {/* ---- Layer Health Bars ---- */}
          {vulnerabilityReport && (
            <section>
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Layer Health
              </h3>
              <div className="flex flex-col gap-2">
                {Object.entries(vulnerabilityReport.layer_analysis).map(
                  ([layer, info]) => (
                    <div key={layer}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span style={{ color: layerColor(layer) }}>
                          {layer}
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          {info.layer_health.toFixed(2)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(156, 176, 197, 0.12)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${info.layer_health * 100}%`,
                            background: layerColor(layer),
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {/* ---- Top Risks ---- */}
          {topRisks.length > 0 && (
            <section>
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Top Risks
              </h3>
              <ol className="flex flex-col gap-1.5">
                {topRisks.map((r, i) => {
                  const node = graph.nodes.find((n) => n.id === r.node_id);
                  return (
                    <li
                      key={r.node_id}
                      className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background:
                          selectedNodeId === r.node_id
                            ? "rgba(110, 231, 200, 0.1)"
                            : "transparent",
                      }}
                      onClick={() => setSelectedNode(r.node_id)}
                    >
                      <span>
                        <span style={{ color: "var(--muted)" }}>
                          {i + 1}.{" "}
                        </span>
                        {node?.name ?? r.node_id}
                      </span>
                      <span
                        className="tabular-nums text-xs"
                        style={{ color: "#EF4444" }}
                      >
                        -{r.health_loss.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* ---- Summary stats ---- */}
          {vulnerabilityReport && (
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                label="Bridges"
                value={vulnerabilityReport.bridge_nodes.length}
              />
              <StatCard
                label="Clusters"
                value={vulnerabilityReport.clusters.length}
              />
              {highestSynergy && (
                <div className="col-span-2">
                  <StatCard
                    label="Highest Synergy"
                    value={`${highestSynergy.node_a} + ${highestSynergy.node_b}`}
                    sub={`${highestSynergy.synergy_ratio.toFixed(1)}x`}
                  />
                </div>
              )}
            </section>
          )}

          {/* ---- Actions ---- */}
          <div className="flex flex-col gap-2 mt-auto pt-4">
            <button
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--background)",
              }}
              onClick={() => runAnalysis()}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing..." : "Run Analysis"}
            </button>

            <button
              className="w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors"
              style={{
                borderColor: "var(--accent)",
                color: "var(--accent)",
                background: "transparent",
              }}
              onClick={() =>
                router.push(`/simulate/${sessionId}` as Route)
              }
            >
              Start Simulation
            </button>

            {selectedNodeId && (
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold transition-opacity"
                style={{
                  background: "#DC2626",
                  color: "#fff",
                }}
                onClick={() =>
                  runCascade({
                    target: selectedNodeId,
                    action: "kill",
                  })
                }
              >
                Kill Node: {selectedNode?.name ?? selectedNodeId}
              </button>
            )}
          </div>

          {/* ---- Node Detail Panel ---- */}
          {selectedNode && (
            <section
              className="rounded-xl p-4 mt-2 border"
              style={{
                background: "rgba(9, 19, 35, 0.9)",
                borderColor: "rgba(156, 176, 197, 0.12)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">{selectedNode.name}</h3>
                <button
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: "var(--muted)" }}
                  onClick={() => setSelectedNode(null)}
                >
                  Close
                </button>
              </div>
              <div
                className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3"
                style={{
                  background: layerColor(selectedNode.layer) + "22",
                  color: layerColor(selectedNode.layer),
                }}
              >
                {selectedNode.layer}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <NodeStat
                  label="Impact"
                  value={(impactByNodeId.get(selectedNode.id) ?? selectedNode.theta).toFixed(3)}
                  accentColor={impactColor(
                    impactByNodeId.get(selectedNode.id) ?? selectedNode.theta,
                    selectedNode.phi,
                  )}
                />
                <NodeStat
                  label="Health (h)"
                  value={selectedNode.h.toFixed(3)}
                />
                <NodeStat
                  label="Importance (theta)"
                  value={selectedNode.theta.toFixed(3)}
                />
                <NodeStat
                  label="Recovery (r)"
                  value={selectedNode.r.toLocaleString()}
                />
                <div className="col-span-2">
                  <NodeStat
                    label="Connections"
                    value={String(selectedEdges.length)}
                  />
                </div>
                <div className="col-span-2">
                  <NodeStat
                    label="Failed (phi)"
                    value={selectedNode.phi ? "Yes" : "No"}
                    alert={selectedNode.phi}
                  />
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
    <div
      className="rounded-lg p-3 border"
      style={{
        background: "rgba(9, 19, 35, 0.6)",
        borderColor: "rgba(156, 176, 197, 0.08)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {sub && (
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--accent)" }}
        >
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
  accentColor,
}: {
  label: string;
  value: string;
  alert?: boolean;
  accentColor?: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p
        className="font-semibold tabular-nums"
        style={{ color: alert ? "#EF4444" : accentColor ?? "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
