"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as d3 from "d3";

import NavBar from "@/components/NavBar";
import { useAchillesStore } from "@/lib/store";
import { getGraph } from "@/lib/api";
import type { GraphData, GraphNode, Scenario } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYER_COLORS: Record<string, string> = {
  People: "#2563eb",
  Technology: "#059669",
  Supply: "#d97706",
  Financial: "#ca8a04",
  Facilities: "#dc2626",
  Operations: "#7c3aed",
};

const FALLBACK_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#ca8a04",
  "#dc2626",
  "#7c3aed",
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

function impactColor(layer: string, impact: number, failed: boolean): string {
  if (failed) return "#b91c1c";
  const normalized = Math.max(0, Math.min(1, impact));
  if (normalized > 0.7) return "#b91c1c";
  if (normalized > 0.4) {
    return layerColor(layer);
  }
  return "#f8fafc";
}

function outerNodeRadius(theta: number): number {
  return 9 + theta * 10;
}

function innerNodeRadius(theta: number): number {
  return Math.max(4.5, outerNodeRadius(theta) - 4);
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

type StoredNodeLayout = {
  x: number;
  y: number;
  fx: number | null;
  fy: number | null;
};

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

function severityColor(label: string): string {
  switch (label.toUpperCase()) {
    case "CRITICAL":
      return "var(--danger)";
    case "HIGH":
      return "#555";
    case "MEDIUM":
      return "#888";
    default:
      return "var(--text-muted)";
  }
}

function humanizeId(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferNodeLabel(nodeId: string, graph: GraphData): string {
  return graph.nodes.find((n) => n.id === nodeId)?.name ?? humanizeId(nodeId);
}

function formatScenarioEvent(
  event:
    | { target: string | { from: string; to: string }; action: string; magnitude: number }
    | null
    | undefined,
  graph: GraphData | null,
): string {
  if (!event) return "Initial state";
  if (!graph) return `${event.action} ${event.target}`;

  if (event.action === "cut_edge") {
    const target = typeof event.target === "string" ? null : event.target;
    const fromLabel = target?.from ? inferNodeLabel(target.from, graph) : String(event.target);
    const toLabel = target?.to ? inferNodeLabel(target.to, graph) : String(event.target);
    return `Dependency between ${fromLabel} and ${toLabel} severed`;
  }

  const targetId = typeof event.target === "string" ? event.target : "";
  const node = graph.nodes.find((n) => n.id === targetId);
  const label = node?.name ?? humanizeId(targetId);
  if (event.action === "kill") return `${label} fails`;
  const pct = Math.round(event.magnitude * 100);
  return `${label} degrades (${pct}%)`;
}

function extractNarrativeText(narrative: Scenario["narrative"]): string {
  if (!narrative) return "";
  if (typeof narrative === "string") return narrative;
  if (typeof narrative.narrative === "string") return narrative.narrative;
  return "";
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
  const graph = useAchillesStore((s) => s.graph);
  const graphBuildState = useAchillesStore((s) => s.graphBuildState);
  const uploadStageMessage = useAchillesStore((s) => s.uploadStageMessage);
  const uploadProgressValue = useAchillesStore((s) => s.uploadProgressValue);
  const uploadError = useAchillesStore((s) => s.uploadError);
  const vulnerabilityReport = useAchillesStore((s) => s.vulnerabilityReport);
  const analyzing = useAchillesStore((s) => s.analyzing);
  const selectedNodeId = useAchillesStore((s) => s.selectedNodeId);
  const setSelectedNode = useAchillesStore((s) => s.setSelectedNode);
  const runAnalysis = useAchillesStore((s) => s.runAnalysis);
  const runExploration = useAchillesStore((s) => s.runExploration);
  const runCascade = useAchillesStore((s) => s.runCascade);
  const scenarios = useAchillesStore((s) => s.scenarios);
  const exploring = useAchillesStore((s) => s.exploring);
  const activeScenarioIndex = useAchillesStore((s) => s.activeScenarioIndex);
  const setActiveScenario = useAchillesStore((s) => s.setActiveScenario);
  const setSessionId = useAchillesStore((s) => s.setSessionId);
  const setGraph = useAchillesStore((s) => s.setGraph);

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
  const layoutRef = useRef<Map<string, StoredNodeLayout>>(new Map());

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
      .attr("markerUnits", "userSpaceOnUse")
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

    const storedLayouts = layoutRef.current;
    const existingLayouts = graph.nodes
      .map((node) => storedLayouts.get(node.id))
      .filter((layout): layout is StoredNodeLayout => layout !== undefined);
    const anchorX =
      existingLayouts.length > 0
        ? existingLayouts.reduce((sum, layout) => sum + layout.x, 0) /
          existingLayouts.length
        : width / 2;
    const anchorY =
      existingLayouts.length > 0
        ? existingLayouts.reduce((sum, layout) => sum + layout.y, 0) /
          existingLayouts.length
        : height / 2;

    const orbitNodes: OrbitNode[] = graph.nodes.map((node) => ({
      ...node,
      x:
        storedLayouts.get(node.id)?.x ??
        (anchorX + (Math.random() - 0.5) * 42),
      y:
        storedLayouts.get(node.id)?.y ??
        (anchorY + (Math.random() - 0.5) * 42),
      fx: storedLayouts.get(node.id)?.fx ?? null,
      fy: storedLayouts.get(node.id)?.fy ?? null,
      impact: node.theta,
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
      .attr("class", "node-layer-ring")
      .attr("r", 8)
      .attr("stroke-width", 1.5);

    nodeSel
      .append("circle")
      .attr("class", "node-core")
      .attr("r", 5);

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

    simulation.alpha(graphBuildState === "building" ? 0.16 : 0.34);
    simulation.alphaDecay(graphBuildState === "building" ? 0.08 : 0.04);

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
              : 0.3 + link.weight * 0.5,
        )
        .attr("stroke-width", (link) =>
          Math.max(0.5, 0.5 + Math.pow(link.weight, 1.5) * 5),
        )
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
        .attr("r", (node) => outerNodeRadius(node.theta) + 6)
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id ? 0.95 : 0,
        )
        .attr("fill", (node) =>
          hovered === node.id || selected === node.id
            ? "rgba(0, 0, 0, 0.06)"
            : "transparent",
        );

      nodeSel
        .select("circle.node-layer-ring")
        .attr("r", (node) => outerNodeRadius(node.theta))
        .attr("fill", (node) => layerColor(node.layer))
        .attr("fill-opacity", (node) => (node.phi ? 0.92 : 0.9))
        .attr("stroke", (node) => {
          if (node.phi) return "#7f1d1d";
          if (hovered === node.id || selected === node.id) return "#000000";
          return "rgba(0, 0, 0, 0.12)";
        })
        .attr("stroke-width", (node) =>
          hovered === node.id || selected === node.id || node.phi ? 2.4 : 1.2,
        );

      nodeSel
        .select("circle.node-core")
        .attr("r", (node) => innerNodeRadius(node.theta))
        .attr("fill", (node) => impactColor(node.layer, node.impact, node.phi))
        .attr("fill-opacity", (node) => (node.phi ? 1 : 0.94))
        .attr("stroke", (node) => {
          if (node.phi) return "#b91c1c";
          if (hovered === node.id) return "#000000";
          if (selected === node.id) return "#000000";
          return "rgba(255, 255, 255, 0.75)";
        })
        .attr("stroke-width", (node) =>
          hovered === node.id || selected === node.id || node.phi ? 1.8 : 1.1,
        );

      nodeSel
        .select("text.node-label")
        .attr("y", (node) => -(outerNodeRadius(node.theta) + 10))
        .attr("opacity", (node) =>
          hovered === node.id || selected === node.id || node.theta > 0.72
            ? 1
            : 0,
        );
    };

    simulation.on("tick", render);
    render();

    return () => {
      layoutRef.current = new Map(
        orbitNodes.map((node) => [
          node.id,
          {
            x: node.x ?? width / 2,
            y: node.y ?? height / 2,
            fx: node.fx ?? null,
            fy: node.fy ?? null,
          },
        ]),
      );
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, [graph, graphBuildState, setSelectedNode, vulnerabilityReport]);

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
  const graphBuilding = graphBuildState === "building";
  const graphBuildFailed = graphBuildState === "failed";
  const waitingForFirstNode = graphBuilding && (graph?.nodes.length ?? 0) === 0;
  const enrichingDraft = graphBuilding && (graph?.nodes.length ?? 0) > 0;
  const selectedEdges =
    graph && selectedNodeId
      ? graph.edges.filter(
          (e) => e.from === selectedNodeId || e.to === selectedNodeId,
        )
      : [];

  const topRisks = vulnerabilityReport?.node_rankings.slice(0, 5) ?? [];
  const highestSynergy = vulnerabilityReport?.compound_pairs?.[0] ?? null;
  const sortedScenarios = scenarios
    .map((scenario, originalIndex) => ({ scenario, originalIndex }))
    .sort(
      (a, b) =>
        b.scenario.severity - a.scenario.severity ||
        a.scenario.rank - b.scenario.rank,
    );
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
      {graphBuilding && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-alt)] px-6 py-4">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="mono-label mb-1 text-[10px]">Graph Build In Progress</p>
              <p className="text-sm font-medium">
                {uploadStageMessage || "Building dependency graph"}
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-black/8">
                <div
                  className="h-full bg-[var(--text)] transition-all duration-300"
                  style={{ width: `${Math.round(uploadProgressValue * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-right font-mono text-[10px] text-[var(--text-light)]">
                {Math.round(uploadProgressValue * 100)}% synced
              </p>
            </div>
          </div>
        </div>
      )}
      {graphBuildFailed && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-4 text-sm text-[var(--danger)]">
          {uploadError || "Graph build failed before completion."}
        </div>
      )}

      <div className="flex flex-1 flex-col min-h-0 md:flex-row">
        {/* D3 Graph Canvas */}
        <div className="relative h-[50vh] min-h-[280px] min-w-0 border-b border-[var(--border)] md:h-auto md:flex-[7] md:border-b-0 md:border-r">
          {waitingForFirstNode && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/92 backdrop-blur-sm">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin border-2 border-[var(--border)] border-t-[var(--text)]" />
                <p className="text-sm font-medium">
                  {uploadStageMessage || "Building dependency graph"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Waiting for the first nodes to appear.
                </p>
              </div>
            </div>
          )}
          {enrichingDraft && (
            <div className="pointer-events-none absolute right-6 top-6 z-20">
              <div className="w-[320px] border border-[var(--border)] bg-white/94 p-4 shadow-sm backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text)]" />
                  <div>
                    <p className="mono-label text-[10px]">Draft Visible</p>
                    <p className="text-sm font-medium">
                      {uploadStageMessage || "Enriching graph with dependencies"}
                    </p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/8">
                  <div
                    className="h-full bg-[var(--text)] transition-all duration-300"
                    style={{ width: `${Math.round(uploadProgressValue * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  The draft graph is on screen. Achilles is still enriching it
                  with evidence, missing relationships, and deterministic scores.
                </p>
              </div>
            </div>
          )}
          {/* Legend */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-6 sm:top-6">
            <div className="border border-[var(--border)] bg-white p-2.5 sm:p-4">
              <p className="mono-label text-[9px] mb-1.5 sm:mb-2">Legend</p>
              <p className="hidden text-xs text-[var(--text-muted)] leading-relaxed sm:block">
                Node size = impact weight.
                <br />
                Edge thickness = dependency strength.
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3 sm:gap-3">
                <span className="font-mono text-[8px] text-[var(--text-light)] sm:text-[9px]">
                  Stable
                </span>
                <div className="h-1 w-12 bg-gradient-to-r from-[#999999] to-[#b91c1c] sm:flex-1" />
                <span className="font-mono text-[8px] text-[var(--text-light)] sm:text-[9px]">
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
          <div className="absolute bottom-3 left-3 border border-[var(--border)] bg-white p-2.5 sm:bottom-6 sm:left-6 sm:p-4">
            <p className="mono-label text-[9px] mb-2 sm:mb-3">Layers</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 sm:grid sm:gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {layers.map((layer) => (
                <label
                  key={layer}
                  className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] sm:gap-2 sm:text-xs"
                  style={{ opacity: hiddenLayers.has(layer) ? 0.3 : 1 }}
                >
                  <div className="relative flex h-3 w-3 items-center justify-center border border-[var(--border)] sm:h-3.5 sm:w-3.5">
                    {!hiddenLayers.has(layer) && (
                      <div
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2"
                        style={{ backgroundColor: layerColor(layer) }}
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={!hiddenLayers.has(layer)}
                      onChange={() => toggleLayer(layer)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span
                    className="font-medium"
                    style={{ color: layerColor(layer) }}
                  >
                    {layer}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <aside className="flex-1 min-w-0 overflow-y-auto p-4 flex flex-col gap-4 bg-white sm:p-6 sm:gap-6 md:flex-[3]">
          {/* Network Health */}
          <section>
            <p className="mono-label text-[9px] mb-3">Network Health</p>
            <div className="border border-[var(--border)] p-4 text-center sm:p-6">
              <p className="display-face text-3xl font-normal tracking-tight tabular-nums sm:text-5xl">
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
                          {node?.name ?? humanizeId(r.node_id)}
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
                    value={`${graph.nodes.find((n) => n.id === highestSynergy.node_a)?.name ?? humanizeId(highestSynergy.node_a)} + ${graph.nodes.find((n) => n.id === highestSynergy.node_b)?.name ?? humanizeId(highestSynergy.node_b)}`}
                    sub={`${highestSynergy.synergy_ratio.toFixed(1)}x amplification`}
                  />
                </div>
              )}
            </section>
          )}

          {/* Scenarios */}
          {sortedScenarios.length > 0 && (
            <section>
              <p className="mono-label text-[9px] mb-3">
                Attack Scenarios
                <span className="ml-2 text-[var(--text-muted)]">
                  {sortedScenarios.length}
                </span>
              </p>
              <div className="divide-y divide-[var(--border)] border border-[var(--border)]">
                {sortedScenarios.map(({ scenario, originalIndex }, i) => (
                  <button
                    key={`${scenario.rank}-${scenario.title}`}
                    className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-alt)] ${
                      activeScenarioIndex === originalIndex
                        ? "bg-[var(--bg-alt)]"
                        : ""
                    }`}
                    onClick={() =>
                      setActiveScenario(
                        activeScenarioIndex === originalIndex
                          ? null
                          : originalIndex,
                      )
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] text-[var(--text-light)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="font-mono text-[9px] px-1.5 py-0.5 border"
                        style={{
                          borderColor:
                            scenario.severity > 0.7
                              ? "var(--danger)"
                              : scenario.severity > 0.4
                                ? "var(--text-muted)"
                                : "var(--border)",
                          color:
                            scenario.severity > 0.7
                              ? "var(--danger)"
                              : "var(--text-muted)",
                        }}
                      >
                        {scenario.severity_label}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug">
                      {scenario.title}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
                      {scenario.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="font-mono text-[9px] text-[var(--text-light)]">
                        H={scenario.health_remaining.toFixed(2)}
                      </span>
                      <span className="font-mono text-[9px] text-[var(--text-light)]">
                        {scenario.failed_nodes.length} failed
                      </span>
                      <span className="font-mono text-[9px] text-[var(--text-light)]">
                        ${(scenario.recovery_cost / 1000).toFixed(0)}K
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {activeScenarioIndex === originalIndex && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-col gap-3">
                        {/* Severity + metrics */}
                        <div className="flex items-center justify-between">
                          <span
                            className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                            style={{
                              color: severityColor(scenario.severity_label),
                              background: `${severityColor(scenario.severity_label)}18`,
                              border: `1px solid ${severityColor(scenario.severity_label)}33`,
                            }}
                          >
                            {scenario.severity_label}
                          </span>
                          <div className="flex gap-3">
                            <span className="font-mono text-[9px] text-[var(--danger)]">
                              -{(1 - scenario.health_remaining).toFixed(2)} H
                            </span>
                            <span className="font-mono text-[9px] text-[var(--text-muted)]">
                              depth {scenario.depth}
                            </span>
                          </div>
                        </div>

                        {/* Narrative */}
                        {extractNarrativeText(scenario.narrative) && (
                          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                            {extractNarrativeText(scenario.narrative)}
                          </p>
                        )}

                        {/* Propagation sequence */}
                        {scenario.path.length > 0 && (
                          <div>
                            <p className="mono-label text-[8px] mb-1.5">
                              Propagation Sequence
                            </p>
                            <div className="flex flex-col gap-1">
                              {scenario.path.map((step, si) => (
                                <div
                                  key={si}
                                  className="flex items-center justify-between border border-[var(--border)] px-2.5 py-1.5"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono text-[8px] text-[var(--text-light)] shrink-0">
                                      {String(step.step).padStart(2, "0")}
                                    </span>
                                    <span className="text-[10px] font-medium text-[var(--text)] truncate">
                                      {formatScenarioEvent(step.event, graph)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-[9px] text-[var(--danger)]">
                                      -{(step.H_before - step.H_after).toFixed(2)}
                                    </span>
                                    {step.new_failures.length > 0 && (
                                      <span className="font-mono text-[8px] text-[var(--text-light)]">
                                        +{step.new_failures.length} fail
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Failed nodes */}
                        <div>
                          <p className="mono-label text-[8px] mb-1.5">
                            Failed Nodes
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {scenario.failed_nodes.map((nodeId) => {
                              const node = graph?.nodes.find(
                                (n) => n.id === nodeId,
                              );
                              return (
                                <span
                                  key={nodeId}
                                  className="border border-[var(--danger)] text-[var(--danger)] px-1.5 py-0.5 font-mono text-[9px] cursor-pointer hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedNode(nodeId);
                                  }}
                                >
                                  {node?.name ?? humanizeId(nodeId)}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Recommendations */}
                        {scenario.recommendations.length > 0 && (
                          <div>
                            <p className="mono-label text-[8px] mb-1.5">
                              Countermeasures
                            </p>
                            <div className="flex flex-col gap-1">
                              {scenario.recommendations.map((rec, ri) => (
                                <div
                                  key={ri}
                                  className="border border-[var(--border)] bg-[var(--bg-alt)] px-2.5 py-1.5"
                                >
                                  <p className="text-[10px] font-medium text-[var(--text)]">
                                    {rec.action}
                                  </p>
                                  <p className="text-[9px] text-[var(--text-muted)] leading-relaxed mt-0.5">
                                    {rec.reason}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[var(--border)] sm:pt-6">
            <button
              className="w-full border border-[var(--text)] bg-[var(--text)] py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text-secondary)] disabled:opacity-30"
              onClick={async () => {
                await runAnalysis();
                runExploration();
              }}
              disabled={
                analyzing || exploring || graphBuilding || graphBuildFailed
              }
            >
              {graphBuilding
                ? "Graph Still Building"
                : analyzing
                  ? "Analyzing..."
                  : exploring
                    ? "Exploring scenarios..."
                  : "Run Analysis"}
            </button>

            <button
              className="w-full border border-[var(--border)] py-3 text-sm font-medium transition-colors hover:border-[var(--text)] hover:bg-[var(--bg-alt)] disabled:opacity-30"
              onClick={() => router.push(`/simulate/${sessionId}` as Route)}
              disabled={graphBuilding || graphBuildFailed}
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
                Terminate: {selectedNode?.name ?? humanizeId(selectedNodeId)}
              </button>
            )}
          </div>

          {/* Node Detail Panel */}
          {selectedNode && (
            <section className="border border-[var(--border)] bg-white p-4 shadow-lg fade-rise sm:p-6 md:absolute md:bottom-6 md:right-6 md:z-20 md:w-[340px]">
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
                          {otherNode?.name ?? humanizeId(otherId)}
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
