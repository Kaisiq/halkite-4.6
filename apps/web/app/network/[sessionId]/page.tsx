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

function nodeRadius(d: GraphNode): number {
  return 5 + d.theta * 25;
}

function nodeOpacity(d: GraphNode): number {
  return 0.2 + d.h * 0.8;
}

// ---------------------------------------------------------------------------
// Simulation node type (D3 augments the data object)
// ---------------------------------------------------------------------------

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
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
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  // Keep a ref to hiddenLayers so D3 callbacks can read latest value
  const hiddenLayersRef = useRef(hiddenLayers);
  hiddenLayersRef.current = hiddenLayers;

  const selectedNodeRef = useRef(selectedNodeId);
  selectedNodeRef.current = selectedNodeId;

  const hoveredRef = useRef(hoveredNodeId);
  hoveredRef.current = hoveredNodeId;

  // ---- Build / rebuild D3 ----
  useEffect(() => {
    if (!graph || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr("width", width).attr("height", height);

    // Arrow marker
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 20)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", "#4B5563");

    // Prepare data copies for D3 mutation
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = graph.edges
      .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
      .map((e) => {
        const sourceNode = nodeMap.get(e.from)!;
        const targetNode = nodeMap.get(e.to)!;
        return {
          source: sourceNode,
          target: targetNode,
          weight: e.weight,
          crossLayer: sourceNode.layer !== targetNode.layer,
        };
      });

    // Zoom
    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    // Edges
    const linkSel = g
      .append("g")
      .attr("class", "links")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#4B5563")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => Math.max(1, d.weight * 4))
      .attr("stroke-dasharray", (d) => (d.crossLayer ? "5,4" : "none"))
      .attr("marker-end", "url(#arrow)");

    // Node groups
    const nodeSel = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer");

    // Circles
    nodeSel
      .append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => layerColor(d.layer))
      .attr("fill-opacity", (d) => nodeOpacity(d))
      .attr("stroke", (d) => (d.phi ? "#DC2626" : "#374151"))
      .attr("stroke-width", (d) => (d.phi ? 3 : 1));

    // Labels
    nodeSel
      .append("text")
      .text((d) => d.name)
      .attr("x", 0)
      .attr("y", (d) => -nodeRadius(d) - 4)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--foreground)")
      .attr("font-size", "11px")
      .attr("pointer-events", "none")
      .attr("opacity", (d) => (d.theta > 0.5 ? 1 : 0));

    // ---- Interactions ----

    // Hover: show label + highlight edges
    nodeSel
      .on("mouseenter", function (_event, d) {
        setHoveredNodeId(d.id);
        d3.select(this).select("text").attr("opacity", 1);
        linkSel
          .attr("stroke", (l) => {
            const src = l.source as SimNode;
            const tgt = l.target as SimNode;
            return src.id === d.id || tgt.id === d.id
              ? "var(--accent)"
              : "#4B5563";
          })
          .attr("stroke-opacity", (l) => {
            const src = l.source as SimNode;
            const tgt = l.target as SimNode;
            return src.id === d.id || tgt.id === d.id ? 1 : 0.25;
          });
      })
      .on("mouseleave", function (_event, d) {
        setHoveredNodeId(null);
        d3.select(this)
          .select("text")
          .attr("opacity", d.theta > 0.5 ? 1 : 0);
        linkSel.attr("stroke", "#4B5563").attr("stroke-opacity", 0.6);
      });

    // Click: select node
    nodeSel.on("click", (_event, d) => {
      setSelectedNode(selectedNodeRef.current === d.id ? null : d.id);
    });

    // Drag
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    nodeSel.call(drag);

    // ---- Simulation ----
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => 100 / Math.max(d.weight, 0.1))
      )
      .force(
        "charge",
        d3
          .forceManyBody<SimNode>()
          .strength((d) => -100 * Math.max(d.theta, 0.1))
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 2)
      )
      .on("tick", () => {
        const hidden = hiddenLayersRef.current;

        linkSel
          .attr("x1", (d) => (d.source as SimNode).x ?? 0)
          .attr("y1", (d) => (d.source as SimNode).y ?? 0)
          .attr("x2", (d) => (d.target as SimNode).x ?? 0)
          .attr("y2", (d) => (d.target as SimNode).y ?? 0)
          .attr("display", (d) => {
            const src = (d.source as SimNode).layer;
            const tgt = (d.target as SimNode).layer;
            return hidden.has(src) || hidden.has(tgt) ? "none" : "inline";
          });

        nodeSel
          .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
          .attr("display", (d) =>
            hidden.has(d.layer) ? "none" : "inline"
          );
      });

    simRef.current = simulation;

    // Cleanup
    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
    // We intentionally only rebuild when graph identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Re-apply hidden layers without full rebuild
  useEffect(() => {
    if (!svgRef.current || !simRef.current) return;
    simRef.current.alpha(0.05).restart();
  }, [hiddenLayers]);

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
                <NodeStat
                  label="Failed (phi)"
                  value={selectedNode.phi ? "Yes" : "No"}
                  alert={selectedNode.phi}
                />
                <div className="col-span-2">
                  <NodeStat
                    label="Connections"
                    value={String(selectedEdges.length)}
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
}: {
  label: string;
  value: string;
  alert?: boolean;
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
        style={{ color: alert ? "#EF4444" : "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
