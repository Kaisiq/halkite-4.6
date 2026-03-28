"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import * as d3 from "d3";
import NavBar from "@/components/NavBar";
import { RiskDocumentsPanel } from "./risk-documents";
import { useNexusStore } from "@/lib/store";
import type { ExploreConfig, Scenario } from "@/lib/types";

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
  event_summary: string;
  failed_count: number;
  depth: number;
  parent_id: string | null;
}

interface TreeEdge {
  from: string;
  to: string;
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
  const graph = useNexusStore((s) => s.graph);
  const scenarios = useNexusStore((s) => s.scenarios);
  const recommendations = useNexusStore((s) => s.recommendations);
  const treeStats = useNexusStore((s) => s.treeStats);
  const vizData = useNexusStore((s) => s.vizData);
  const exploreError = useNexusStore((s) => s.exploreError);
  const runExploration = useNexusStore((s) => s.runExploration);
  const activeScenarioIndex = useNexusStore((s) => s.activeScenarioIndex);
  const setActiveScenario = useNexusStore((s) => s.setActiveScenario);

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
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [, setHoveredTreeNodeId] = useState<string | null>(null);

  // -- Refs --
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomTransformRef = useRef(d3.zoomIdentity);
  const lastCenteredNodeRef = useRef<string | null>(null);

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
  const treeData = useMemo(() => {
    if (!vizData?.state_tree?.nodes?.length) return null;

    const edges = (vizData.state_tree.edges ?? []) as TreeEdge[];
    const parentByNodeId = new Map(edges.map((edge) => [edge.to, edge.from]));
    const rawNodes = (vizData.state_tree.nodes ?? []) as Array<
      Omit<
        TreeNode,
        "delta_H" | "failed_count" | "event_summary" | "parent_id"
      > & {
        event_summary?: string;
        failed_count?: number;
      }
    >;
    const provisional = rawNodes.map((node) => ({
      id: node.id,
      H: node.H,
      depth: node.depth,
      agent: node.agent,
      event_summary: node.event_summary ?? "root",
      failed_count: node.failed_count ?? 0,
      parent_id: parentByNodeId.get(node.id) ?? null,
      delta_H: 0,
    }));
    const byId = new Map(provisional.map((node) => [node.id, node]));

    for (const node of provisional) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      node.delta_H = parent ? Math.max(0, parent.H - node.H) : 0;
    }

    return {
      nodes: provisional,
      edges,
    };
  }, [vizData]);

  const treeNodes = treeData?.nodes ?? null;
  const rootTreeNode = useMemo(
    () => treeNodes?.find((node) => node.parent_id === null) ?? null,
    [treeNodes],
  );
  const treeNodeMap = useMemo(
    () => new Map((treeNodes ?? []).map((node) => [node.id, node])),
    [treeNodes],
  );
  const childrenByNodeId = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const node of treeNodes ?? []) {
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

  const leafNodes = useMemo(() => {
    if (!treeNodes?.length) return [];
    return [...treeNodes]
      .filter((node) => !childrenByNodeId.has(node.id))
      .sort((a, b) => a.H - b.H);
  }, [childrenByNodeId, treeNodes]);

  const scenarioFocusNode = useMemo(() => {
    if (activeScenarioIndex === null || !leafNodes[activeScenarioIndex])
      return null;
    return leafNodes[activeScenarioIndex];
  }, [activeScenarioIndex, leafNodes]);

  const focusTargetId =
    focusedNodeId ?? scenarioFocusNode?.id ?? rootTreeNode?.id ?? null;

  const ancestorIds = useMemo(() => {
    if (!focusTargetId || !treeNodeMap.size) return new Set<string>();
    const ids = new Set<string>();
    let current = treeNodeMap.get(focusTargetId) ?? null;
    while (current) {
      ids.add(current.id);
      current = current.parent_id
        ? (treeNodeMap.get(current.parent_id) ?? null)
        : null;
    }
    return ids;
  }, [focusTargetId, treeNodeMap]);

  const revealedPathIds = useMemo(() => {
    const ids = new Set<string>(ancestorIds);
    if (rootTreeNode) {
      ids.add(rootTreeNode.id);
    }
    return ids;
  }, [ancestorIds, rootTreeNode]);

  const visibleTreeIds = useMemo(() => {
    if (!treeNodes?.length || !rootTreeNode) return new Set<string>();

    const ids = new Set<string>();
    const seedIds = new Set<string>([
      ...revealedPathIds,
      focusTargetId ?? rootTreeNode.id,
    ]);

    for (const seedId of seedIds) {
      const queue: Array<{ id: string; distance: number }> = [
        { id: seedId, distance: 0 },
      ];

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (ids.has(item.id) && item.distance > 0) continue;
        ids.add(item.id);
        if (item.distance >= 1) continue;

        for (const child of childrenByNodeId.get(item.id) ?? []) {
          queue.push({ id: child.id, distance: item.distance + 1 });
        }
      }
    }

    for (const id of ancestorIds) {
      ids.add(id);
      for (const child of childrenByNodeId.get(id) ?? []) {
        ids.add(child.id);
      }
    }

    return ids;
  }, [
    ancestorIds,
    childrenByNodeId,
    focusTargetId,
    revealedPathIds,
    rootTreeNode,
    treeNodes,
  ]);

  const previewTreeIds = useMemo(() => {
    if (!rootTreeNode) return new Set<string>();
    const preview = new Set<string>();
    const seedIds = new Set<string>([
      ...revealedPathIds,
      focusTargetId ?? rootTreeNode.id,
    ]);

    for (const seedId of seedIds) {
      const queue: Array<{ id: string; distance: number }> = [
        { id: seedId, distance: 0 },
      ];

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.distance <= 1) {
          for (const child of childrenByNodeId.get(item.id) ?? []) {
            queue.push({ id: child.id, distance: item.distance + 1 });
          }
          continue;
        }
        if (!visibleTreeIds.has(item.id)) {
          preview.add(item.id);
        }
        if (item.distance >= 3) continue;
        for (const child of childrenByNodeId.get(item.id) ?? []) {
          queue.push({ id: child.id, distance: item.distance + 1 });
        }
      }
    }

    return preview;
  }, [
    childrenByNodeId,
    focusTargetId,
    revealedPathIds,
    rootTreeNode,
    visibleTreeIds,
  ]);

  // -- Compute highlighted path ids for the current focus target --
  const highlightedPathIds = useMemo<Set<string>>(() => {
    if (!treeNodes?.length || !focusTargetId) return new Set();
    const nodeMap = new Map(treeNodes.map((n) => [n.id, n]));
    const ids = new Set<string>();
    let current: TreeNode | undefined = nodeMap.get(focusTargetId);
    while (current) {
      ids.add(current.id);
      current = current.parent_id ? nodeMap.get(current.parent_id) : undefined;
    }
    return ids;
  }, [focusTargetId, treeNodes]);

  useEffect(() => {
    if (
      scenarios.length > 0 &&
      (activeScenarioIndex === null || activeScenarioIndex >= scenarios.length)
    ) {
      setActiveScenario(0);
    }
  }, [activeScenarioIndex, scenarios.length, setActiveScenario]);

  const focusedPathNodes = useMemo(() => {
    if (!focusTargetId || !treeNodeMap.size) return [] as TreeNode[];
    const path: TreeNode[] = [];
    let current = treeNodeMap.get(focusTargetId) ?? null;
    while (current) {
      path.push(current);
      current = current.parent_id
        ? (treeNodeMap.get(current.parent_id) ?? null)
        : null;
    }
    return path.reverse();
  }, [focusTargetId, treeNodeMap]);

  const selectedScenario: Scenario | null =
    activeScenarioIndex !== null && scenarios[activeScenarioIndex]
      ? scenarios[activeScenarioIndex]
      : (scenarios[0] ?? null);

  const nextBranchCandidates = useMemo(() => {
    if (!focusTargetId) return [] as TreeNode[];
    return [...(childrenByNodeId.get(focusTargetId) ?? [])].sort(
      (a, b) => a.H - b.H,
    );
  }, [childrenByNodeId, focusTargetId]);

  const currentPathBriefing = useMemo(() => {
    if (!focusedPathNodes.length) return null;

    const terminalNode = focusedPathNodes[focusedPathNodes.length - 1];
    const failedNodeIds = new Set(selectedScenario?.failed_nodes ?? []);
    const failedNodes =
      graph?.nodes.filter((node) => failedNodeIds.has(node.id)) ?? [];
    const failedPeople = failedNodes.filter((node) => node.layer === "People");
    const failedOps = failedNodes.filter((node) => node.layer !== "People");
    const estimatedImpact = Math.max(
      terminalNode.delta_H,
      1 - terminalNode.H,
      selectedScenario ? 1 - selectedScenario.health_remaining : 0,
    );

    const events = focusedPathNodes.slice(1).map((node, index) => ({
      step: index + 1,
      event: node.event_summary,
      deltaH: node.delta_H,
      H: node.H,
      failures: node.failed_count,
    }));

    const summary =
      selectedScenario?.summary ??
      (events.length > 0
        ? `${events[0]?.event ?? "The first branch"} triggered a cascade that brought the network to H ${focusedPathNodes.at(-1)?.H.toFixed(2)}.`
        : "The system is still at the initial state root.");

    const story =
      selectedScenario?.narrative ||
      (events.length > 0
        ? `The branch compounds through ${events.length} event${events.length === 1 ? "" : "s"}, with each step reducing resilience and widening the failure set around the focused path.`
        : "No event has been applied yet. The tree is waiting for the first branch selection.");

    const forecast =
      nextBranchCandidates.length > 0
        ? (() => {
            const worstNext = nextBranchCandidates[0];
            const alternatives = nextBranchCandidates.slice(1, 3);
            const altText =
              alternatives.length > 0
                ? `Other immediate continuations remain less severe, bottoming near H ${alternatives
                    .map((node) => node.H.toFixed(2))
                    .join(" / ")}.`
                : "There are no materially softer immediate continuations from this node.";
            return `If this branch continues, the most likely damaging next step is ${worstNext.event_summary}, which would push the state to roughly H ${worstNext.H.toFixed(2)} with ${worstNext.failed_count} failed nodes. ${altText}`;
          })()
        : `This branch currently terminates here. Based on the explored state space, this is an end-state candidate with network health at H ${focusedPathNodes.at(-1)?.H.toFixed(2)}.`;

    const terminalBusinessOutlook =
      nextBranchCandidates.length > 0
        ? null
        : (() => {
            const peopleSentence =
              failedPeople.length > 0
                ? `${failedPeople.length} people-layer node${failedPeople.length === 1 ? "" : "s"} have been removed from the active business graph${failedPeople.length <= 4 ? `: ${failedPeople.map((node) => node.name).join(", ")}` : ""}. Expect leadership gaps, slower decisions, and loss of tacit coordination capacity.`
                : "No explicit people-layer removals are recorded on this terminal branch, so the primary damage is operational rather than personnel-driven.";

            const opsSentence =
              failedOps.length > 0
                ? `${failedOps.length} non-people dependencies are down, which implies disrupted systems, supplier relationships, or operating capabilities that the business will struggle to route around quickly.`
                : "Operational dependencies remain partly intact, but the remaining network health still indicates a severely constrained operating posture.";

            const recoverySentence = selectedScenario
              ? `The current scenario projects recovery cost around ${selectedScenario.recovery_cost.toLocaleString()}, so management should treat this as a continuity event rather than a temporary incident.`
              : "Treat this as a sustained continuity failure, not a short-lived disturbance.";

            return `${peopleSentence} ${opsSentence} ${recoverySentence}`;
          })();

    return {
      title:
        selectedScenario?.title ??
        (focusedPathNodes.length > 1
          ? `Focused branch at depth ${focusedPathNodes.at(-1)?.depth ?? 0}`
          : "Root scenario"),
      severityLabel: selectedScenario?.severity_label ?? "ACTIVE",
      summary,
      story,
      forecast,
      impact: {
        healthLoss: 1 - terminalNode.H,
        deltaH: terminalNode.delta_H,
        failedCount: terminalNode.failed_count,
        estimatedImpact,
      },
      terminalBusinessOutlook,
      events,
      recommendations: selectedScenario?.recommendations ?? [],
    };
  }, [focusedPathNodes, graph, nextBranchCandidates, selectedScenario]);

  // -- D3 tree rendering --
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !treeNodes?.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr("width", width).attr("height", height);

    // Build d3 hierarchy from filtered list
    const rootNode = rootTreeNode;
    if (!rootNode) return;

    interface HierarchyDatum {
      id: string;
      data: TreeNode;
      children: HierarchyDatum[];
    }

    const childrenMap = new Map<string, TreeNode[]>();
    for (const n of treeNodes) {
      if (!visibleTreeIds.has(n.id)) continue;
      if (n.parent_id) {
        const arr = childrenMap.get(n.parent_id) || [];
        arr.push(n);
        childrenMap.set(n.parent_id, arr);
      }
    }

    function buildHierarchy(node: TreeNode): HierarchyDatum {
      const kids = (childrenMap.get(node.id) || []).filter((child) =>
        visibleTreeIds.has(child.id),
      );
      return {
        id: node.id,
        data: node,
        children: kids.map(buildHierarchy),
      };
    }

    const rootHierarchy = buildHierarchy(rootNode);
    const root = d3.hierarchy<HierarchyDatum>(rootHierarchy);

    // Tree layout
    const margin = { top: 76, right: 72, bottom: 160, left: 72 };
    const innerHeight = height - margin.top - margin.bottom;
    const innerWidth = width - margin.left - margin.right;
    const leaves = root.leaves();
    const leafGap = Math.max(
      92,
      Math.min(160, innerWidth / Math.max(leaves.length, 1)),
    );
    const depthGap = Math.max(
      116,
      Math.min(180, innerHeight / Math.max(root.height + 1, 2)),
    );

    leaves.forEach((leaf, index) => {
      leaf.x = index * leafGap;
    });

    root.eachAfter((node) => {
      if (!node.children || node.children.length === 0) return;
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      node.x = ((first.x ?? 0) + (last.x ?? 0)) / 2;
    });

    root.each((node) => {
      node.y = node.depth * depthGap;
    });

    const totalTreeWidth = Math.max((leaves.length - 1) * leafGap, 0);
    const horizontalOffset = Math.max((innerWidth - totalTreeWidth) / 2, 0);

    const baseX = margin.left + horizontalOffset;
    const baseY = margin.top;

    const g = svg.append("g");

    g.append("g")
      .selectAll("line")
      .data(root.descendants().filter((node) => node.depth > 0))
      .join("line")
      .attr("x1", (d) => d.x ?? 0)
      .attr("y1", (d) => 0)
      .attr("x2", (d) => d.x ?? 0)
      .attr("y2", (d) => (d.y ?? 0) - 16)
      .attr("stroke", "rgba(255,255,255,0.03)");

    // -- Links --
    g.selectAll(".tree-link")
      .data(root.links())
      .join("path")
      .attr("class", "tree-link")
      .attr("fill", "none")
      .attr("stroke", (d) =>
        highlightedPathIds.has(d.source.data.id) &&
        highlightedPathIds.has(d.target.data.id)
          ? "#ef4444"
          : "rgba(156, 176, 197, 0.25)",
      )
      .attr("stroke-width", (d) =>
        highlightedPathIds.has(d.source.data.id) &&
        highlightedPathIds.has(d.target.data.id)
          ? 2.5
          : 1.2,
      )
      .attr("stroke-linecap", "round")
      .attr(
        "d",
        d3
          .linkVertical<
            d3.HierarchyLink<HierarchyDatum>,
            d3.HierarchyPointNode<HierarchyDatum>
          >()
          .x((d) => d.x ?? 0)
          .y((d) => d.y ?? 0) as unknown as (
          _linkDatum: d3.HierarchyLink<HierarchyDatum>,
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

    nodeGroups
      .append("circle")
      .attr("class", "tree-node-halo")
      .attr("r", (d) =>
        Math.max(12, Math.min(10 + d.data.data.failed_count * 1.3, 24)),
      )
      .attr("fill", "rgba(123, 220, 198, 0.08)")
      .attr("opacity", 0);

    nodeGroups
      .append("circle")
      .attr("class", "tree-node-core")
      .attr("r", (d) => {
        const failures = d.data.data.failed_count ?? 0;
        return Math.max(5, Math.min(4 + failures * 1.5, 18));
      })
      .attr("fill", (d) => healthColor(d.data.data.H))
      .attr("stroke", (d) =>
        highlightedPathIds.has(d.data.id)
          ? "#ef4444"
          : "rgba(255,255,255,0.15)",
      )
      .attr("stroke-width", (d) =>
        highlightedPathIds.has(d.data.id) ? 2.5 : 1,
      );

    nodeGroups
      .append("text")
      .attr("class", "tree-node-health")
      .attr("dy", 26)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--foreground)")
      .attr("font-size", "11px")
      .attr("font-weight", 700)
      .text((d) => `H ${d.data.data.H.toFixed(2)}`);

    nodeGroups
      .append("text")
      .attr("class", "tree-node-event")
      .attr("dy", 42)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--muted)")
      .attr("font-size", "10px")
      .text((d) => d.data.data.event_summary);

    nodeGroups
      .select("circle.tree-node-halo")
      .attr("fill", (d) =>
        previewTreeIds.has(d.data.id)
          ? "rgba(156, 176, 197, 0.06)"
          : "rgba(123, 220, 198, 0.08)",
      )
      .attr("opacity", (d) => (previewTreeIds.has(d.data.id) ? 0.7 : 0));

    nodeGroups
      .select("circle.tree-node-core")
      .attr("opacity", (d) => (previewTreeIds.has(d.data.id) ? 0.28 : 1))
      .attr("fill", (d) =>
        previewTreeIds.has(d.data.id)
          ? "rgba(156, 176, 197, 0.65)"
          : healthColor(d.data.data.H),
      );

    nodeGroups
      .select("text.tree-node-health")
      .attr("opacity", (d) => (previewTreeIds.has(d.data.id) ? 0.45 : 1));

    nodeGroups
      .select("text.tree-node-event")
      .attr("opacity", (d) => (previewTreeIds.has(d.data.id) ? 0.35 : 0.88));

    const applyTransform = (transform: d3.ZoomTransform) => {
      g.attr(
        "transform",
        `translate(${baseX},${baseY}) translate(${transform.x},${transform.y}) scale(${transform.k})`,
      );
    };

    const centerOnNode = (
      node: d3.HierarchyNode<HierarchyDatum>,
      options?: { animate?: boolean },
    ) => {
      const scale = zoomTransformRef.current.k || 1;
      const targetX = width / 2 - (baseX + (node.x ?? 0)) * scale;
      const targetY = height / 2 - (baseY + (node.y ?? 0)) * scale;
      const transform = d3.zoomIdentity
        .translate(targetX, targetY)
        .scale(scale);
      zoomTransformRef.current = transform;

      if (options?.animate === false) {
        svg.call(zoomBehavior.transform, transform);
        return;
      }

      svg
        .transition()
        .duration(260)
        .ease(d3.easeCubicOut)
        .call(zoomBehavior.transform, transform);
    };

    nodeGroups
      .on("mouseenter", (_event, d) => {
        setHoveredTreeNodeId(d.data.id);
        setTooltip({
          x: (d.x ?? 0) + margin.left + horizontalOffset + 18,
          y: (d.y ?? 0) + margin.top + 18,
          node: d.data.data,
        });

        nodeGroups
          .select<SVGCircleElement>("circle.tree-node-halo")
          .attr("opacity", (nodeDatum) =>
            nodeDatum.data.id === d.data.id
              ? 1
              : previewTreeIds.has(nodeDatum.data.id)
                ? 0.32
                : nodeDatum.data.id === focusTargetId
                  ? 0.95
                  : 0,
          );
      })
      .on("mouseleave", () => {
        setHoveredTreeNodeId(null);
        setTooltip((current) =>
          focusTargetId && current?.node.id === focusTargetId ? current : null,
        );
        nodeGroups
          .select<SVGCircleElement>("circle.tree-node-halo")
          .attr("opacity", (nodeDatum) =>
            nodeDatum.data.id === focusTargetId
              ? 0.95
              : previewTreeIds.has(nodeDatum.data.id)
                ? 0.32
                : 0,
          );
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        setFocusedNodeId(d.data.id);
        setTooltip({
          x: (d.x ?? 0) + margin.left + horizontalOffset + 18,
          y: (d.y ?? 0) + margin.top + 18,
          node: d.data.data,
        });

        const leafIndex = leafNodes.findIndex((node) => node.id === d.data.id);
        if (leafIndex >= 0 && leafIndex < scenarios.length) {
          setActiveScenario(leafIndex);
        }
      });

    svg.on("click", () => {
      setHoveredTreeNodeId(null);
      setTooltip((current) =>
        focusTargetId && current?.node.id === focusTargetId ? current : null,
      );
      nodeGroups
        .select<SVGCircleElement>("circle.tree-node-halo")
        .attr("opacity", (nodeDatum) =>
          nodeDatum.data.id === focusTargetId
            ? 0.95
            : previewTreeIds.has(nodeDatum.data.id)
              ? 0.32
              : 0,
        );
    });

    // -- Zoom --
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2.4])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        applyTransform(event.transform);
      });

    svg.call(zoomBehavior);
    applyTransform(zoomTransformRef.current);

    const centeredNode = root
      .descendants()
      .find((node) => node.data.id === focusTargetId);
    if (centeredNode) {
      const shouldAnimate =
        lastCenteredNodeRef.current !== centeredNode.data.id;
      lastCenteredNodeRef.current = centeredNode.data.id;
      requestAnimationFrame(() => {
        centerOnNode(centeredNode, { animate: shouldAnimate });
      });
    }
  }, [
    childrenByNodeId,
    focusTargetId,
    leafNodes,
    rootTreeNode,
    scenarios.length,
    setActiveScenario,
    treeNodes,
    visibleTreeIds,
    previewTreeIds,
    highlightedPathIds,
  ]);

  // -- Top 3 worst scenarios --
  const topScenarios = useMemo(
    () => (scenarios ?? []).slice(0, 5),
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
          <div className="pointer-events-none absolute right-5 top-4 z-10 rounded-full border border-white/8 bg-[color:rgb(9_19_35_/_0.88)] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Click any branch to focus its path
          </div>

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
                style={{
                  borderColor: "var(--accent)",
                  borderTopColor: "transparent",
                }}
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
              display: vizData?.state_tree && !exploring ? "block" : "none",
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
                <span
                  className="font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
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
                <p>Event: {tooltip.node.event_summary || "initial state"}</p>
                <p>Failures: {tooltip.node.failed_count}</p>
                <p>Depth: {tooltip.node.depth}</p>
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
            {exploring ? "Exploring..." : treeStats ? "Results" : "Progress"}
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
                <StatCard label="Scenarios" value={String(scenarios.length)} />
              </div>

              {currentPathBriefing && (
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: "rgba(156, 176, 197, 0.12)",
                    background: "rgba(255, 255, 255, 0.025)",
                  }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                        style={{ color: "var(--muted)" }}
                      >
                        Current Path Briefing
                      </p>
                      <h4
                        className="mt-1 text-base font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {currentPathBriefing.title}
                      </h4>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{
                        color: severityColor(currentPathBriefing.severityLabel),
                        background: `${severityColor(currentPathBriefing.severityLabel)}18`,
                      }}
                    >
                      {currentPathBriefing.severityLabel}
                    </span>
                  </div>

                  <div className="space-y-4 text-sm leading-6">
                    <div>
                      <p
                        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--muted)" }}
                      >
                        Impact
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniMetric
                          label="Health loss"
                          value={currentPathBriefing.impact.healthLoss.toFixed(
                            2,
                          )}
                          tone="#ef4444"
                        />
                        <MiniMetric
                          label="Last delta"
                          value={currentPathBriefing.impact.deltaH.toFixed(2)}
                          tone="#f59e0b"
                        />
                        <MiniMetric
                          label="Failed nodes"
                          value={String(currentPathBriefing.impact.failedCount)}
                          tone="var(--foreground)"
                        />
                        <MiniMetric
                          label="Impact score"
                          value={currentPathBriefing.impact.estimatedImpact.toFixed(
                            2,
                          )}
                          tone="var(--accent)"
                        />
                      </div>
                    </div>

                    <div>
                      <p
                        className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--muted)" }}
                      >
                        What happened
                      </p>
                      <p style={{ color: "var(--foreground)" }}>
                        {currentPathBriefing.summary}
                      </p>
                      <p className="mt-2" style={{ color: "var(--muted)" }}>
                        {currentPathBriefing.story}
                      </p>
                    </div>

                    {currentPathBriefing.events.length > 0 && (
                      <div>
                        <p
                          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "var(--muted)" }}
                        >
                          Sequence
                        </p>
                        <div className="space-y-2">
                          {currentPathBriefing.events.map((event) => (
                            <div
                              key={`${event.step}-${event.event}`}
                              className="rounded-xl border px-3 py-2"
                              style={{
                                borderColor: "rgba(156, 176, 197, 0.08)",
                                background: "rgba(156, 176, 197, 0.04)",
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span style={{ color: "var(--foreground)" }}>
                                  Step {event.step}: {event.event}
                                </span>
                                <span
                                  className="tabular-nums text-xs"
                                  style={{ color: "#ef4444" }}
                                >
                                  -{event.deltaH.toFixed(2)} H
                                </span>
                              </div>
                              <p
                                className="mt-1 text-xs"
                                style={{ color: "var(--muted)" }}
                              >
                                State settles at H {event.H.toFixed(2)} with{" "}
                                {event.failures} failed nodes.
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p
                        className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--muted)" }}
                      >
                        Forward projection
                      </p>
                      <p style={{ color: "var(--foreground)" }}>
                        {currentPathBriefing.forecast}
                      </p>
                    </div>

                    {currentPathBriefing.terminalBusinessOutlook && (
                      <div>
                        <p
                          className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "var(--muted)" }}
                        >
                          Terminal outlook
                        </p>
                        <p style={{ color: "var(--foreground)" }}>
                          {currentPathBriefing.terminalBusinessOutlook}
                        </p>
                      </div>
                    )}

                    {currentPathBriefing.recommendations.length > 0 && (
                      <div>
                        <p
                          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "var(--muted)" }}
                        >
                          Recommended intervention
                        </p>
                        <ul className="space-y-2">
                          {currentPathBriefing.recommendations
                            .slice(0, 2)
                            .map((rec) => (
                              <li
                                key={`${rec.action}-${rec.reason}`}
                                className="rounded-xl border px-3 py-2"
                                style={{
                                  borderColor: "rgba(110, 231, 200, 0.14)",
                                  background: "rgba(110, 231, 200, 0.05)",
                                }}
                              >
                                <p style={{ color: "var(--foreground)" }}>
                                  {rec.action}
                                </p>
                                <p
                                  className="mt-1 text-xs"
                                  style={{ color: "var(--muted)" }}
                                >
                                  {rec.reason}
                                </p>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                        <div
                          className="flex gap-3"
                          style={{ color: "var(--muted)" }}
                        >
                          <span>{stats.nodes_explored} nodes</span>
                          <span
                            style={{ color: healthColor(stats.worst_H_found) }}
                          >
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
                      <button
                        key={s.rank ?? i}
                        type="button"
                        onClick={() => {
                          setActiveScenario(i);
                          const leaf = leafNodes[i];
                          setFocusedNodeId(leaf?.id ?? null);
                        }}
                        className="w-full rounded-lg border p-3 text-left transition-all"
                        style={{
                          borderColor:
                            activeScenarioIndex === i
                              ? "rgba(110, 231, 200, 0.28)"
                              : "rgba(156, 176, 197, 0.10)",
                          background:
                            activeScenarioIndex === i
                              ? "rgba(110, 231, 200, 0.08)"
                              : "rgba(156, 176, 197, 0.03)",
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
                        <p
                          className="mt-1 text-xs leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          {s.summary}
                        </p>
                      </button>
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

      <RiskDocumentsPanel
        graph={graph}
        scenarios={scenarios}
        recommendations={recommendations}
      />
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

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: "rgba(156, 176, 197, 0.08)",
        background: "rgba(156, 176, 197, 0.04)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-sm font-semibold tabular-nums"
        style={{ color: tone }}
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
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
