"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import * as d3 from "d3";
import NavBar from "@/components/NavBar";
import { useNexusStore } from "@/lib/store";
import type {
  ExploreConfig,
  ExploreMonteCarloConfig,
  Scenario,
} from "@/lib/types";

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
  {
    label: "Cascading Domino",
    type: "cascading_domino",
    description: "Hunts longest chain reactions",
  },
  {
    label: "Recovery Maximizer",
    type: "recovery_maximizer",
    description: "Maximizes total recovery cost",
  },
  {
    label: "Full Spectrum Sweep",
    type: "monte_carlo",
    description: "Samples random people, system, client, and supplier shocks",
  },
];

const SCENARIO_PROFILES = [
  {
    id: "balanced",
    label: "Balanced Sweep",
    description: "Covers people incidents, outages, degradation, and broken links.",
    mc: {
      failure_model: "uniform",
      kill_prob: 0.34,
      damage_prob: 0.46,
      damage_magnitude_min: 0.2,
      damage_magnitude_max: 0.75,
      branching_factor: 10,
      max_depth: 5,
      n_resilience_samples: 800,
    } satisfies ExploreMonteCarloConfig,
  },
  {
    id: "human",
    label: "Human Shock",
    description: "Biases toward worker and leadership disruption across the graph.",
    mc: {
      failure_model: "weighted_theta",
      kill_prob: 0.45,
      damage_prob: 0.4,
      damage_magnitude_min: 0.25,
      damage_magnitude_max: 0.7,
      branching_factor: 8,
      max_depth: 4,
      n_resilience_samples: 600,
    } satisfies ExploreMonteCarloConfig,
  },
  {
    id: "infra",
    label: "Infra Stress",
    description: "Pushes intermittent system degradation and hard technical outages.",
    mc: {
      failure_model: "weighted_theta",
      kill_prob: 0.28,
      damage_prob: 0.58,
      damage_magnitude_min: 0.35,
      damage_magnitude_max: 0.85,
      branching_factor: 12,
      max_depth: 5,
      n_resilience_samples: 900,
    } satisfies ExploreMonteCarloConfig,
  },
  {
    id: "supply",
    label: "Supply Break",
    description: "Emphasizes severed dependencies and unreliable counterparties.",
    mc: {
      failure_model: "uniform",
      kill_prob: 0.22,
      damage_prob: 0.33,
      damage_magnitude_min: 0.2,
      damage_magnitude_max: 0.65,
      branching_factor: 11,
      max_depth: 5,
      n_resilience_samples: 750,
    } satisfies ExploreMonteCarloConfig,
  },
] as const;

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
      return "var(--danger)";
    case "HIGH":
      return "var(--warn)";
    case "MEDIUM":
      return "oklch(0.85 0.12 95)";
    default:
      return "var(--accent)";
  }
}

// ---------------------------------------------------------------------------
// Health color scale (green -> yellow -> red)
// ---------------------------------------------------------------------------

function healthColor(H: number): string {
  if (H > 0.7) return "var(--healthy)";
  if (H > 0.3) return "var(--warn)";
  return "var(--danger)";
}

function normalizeLayer(layer: string | undefined): string {
  return (layer ?? "").trim().toLowerCase();
}

function isPeopleLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer);
  return (
    normalized.includes("people") ||
    normalized.includes("human") ||
    normalized.includes("employee") ||
    normalized.includes("team") ||
    normalized.includes("staff")
  );
}

function inferNodeLabel(nodeId: string, graph: NonNullable<ReturnType<typeof useNexusStore.getState>["graph"]>): string {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function inferIncidentLabel(
  action: string,
  targetLabel: string,
  layer?: string,
  magnitude?: number,
): string {
  const normalizedLayer = normalizeLayer(layer);
  const impactText =
    typeof magnitude === "number"
      ? ` (${Math.round(magnitude * 100)}% degradation)`
      : "";

  if (action === "cut_edge") {
    return `Dependency between ${targetLabel} is severed`;
  }

  if (isPeopleLayer(normalizedLayer)) {
    if (action === "kill") return `${targetLabel} becomes unavailable`;
    return `${targetLabel} is impaired or operating erratically${impactText}`;
  }

  if (
    normalizedLayer.includes("system") ||
    normalizedLayer.includes("server") ||
    normalizedLayer.includes("infra") ||
    normalizedLayer.includes("technology") ||
    normalizedLayer.includes("application") ||
    normalizedLayer.includes("platform") ||
    normalizedLayer.includes("it")
  ) {
    if (action === "kill") return `${targetLabel} crashes or goes offline`;
    return `${targetLabel} degrades intermittently${impactText}`;
  }

  if (
    normalizedLayer.includes("supplier") ||
    normalizedLayer.includes("vendor") ||
    normalizedLayer.includes("partner") ||
    normalizedLayer.includes("procurement")
  ) {
    if (action === "kill") return `${targetLabel} fails to deliver`;
    return `${targetLabel} becomes unreliable${impactText}`;
  }

  if (
    normalizedLayer.includes("client") ||
    normalizedLayer.includes("customer") ||
    normalizedLayer.includes("sales") ||
    normalizedLayer.includes("account")
  ) {
    if (action === "kill") return `${targetLabel} relationship breaks down`;
    return `${targetLabel} demand or engagement becomes unstable${impactText}`;
  }

  if (action === "kill") return `${targetLabel} fails suddenly`;
  return `${targetLabel} degrades${impactText}`;
}

function formatScenarioEvent(
  event:
    | {
        target: string | { from: string; to: string };
        action: string;
        magnitude: number;
      }
    | null
    | undefined,
  graph: NonNullable<ReturnType<typeof useNexusStore.getState>["graph"]> | null,
): string {
  if (!event) return "Initial state";
  if (!graph) return `${event.action} ${event.target}`;

  if (event.action === "cut_edge") {
    const target =
      typeof event.target === "string" ? null : event.target;
    const fromLabel = target?.from
      ? inferNodeLabel(target.from, graph)
      : String(event.target);
    const toLabel = target?.to
      ? inferNodeLabel(target.to, graph)
      : String(event.target);
    return inferIncidentLabel("cut_edge", `${fromLabel} and ${toLabel}`);
  }

  const targetId = typeof event.target === "string" ? event.target : "";
  const node = graph.nodes.find((candidate) => candidate.id === targetId);
  const targetLabel = node?.name ?? targetId;
  return inferIncidentLabel(
    event.action,
    targetLabel,
    node?.layer,
    event.magnitude,
  );
}

function formatTreeEventSummary(
  summary: string | undefined,
  graph: NonNullable<ReturnType<typeof useNexusStore.getState>["graph"]> | null,
): string {
  if (!summary || summary === "root") return "Initial state";
  const match = summary.match(/^(kill|damage|cut_edge)\s+(.+)$/);
  if (!match || !graph) return summary;

  const [, action, rawTarget] = match;
  if (action === "cut_edge") {
    const edgeMatch = rawTarget.match(/from['"]?:?\s*['"]([^'"]+)['"].*to['"]?:?\s*['"]([^'"]+)['"]/);
    if (!edgeMatch) return summary;
    const fromLabel = inferNodeLabel(edgeMatch[1], graph);
    const toLabel = inferNodeLabel(edgeMatch[2], graph);
    return inferIncidentLabel("cut_edge", `${fromLabel} and ${toLabel}`);
  }

  const node = graph.nodes.find((candidate) => candidate.id === rawTarget);
  const targetLabel = node?.name ?? rawTarget;
  return inferIncidentLabel(action, targetLabel, node?.layer);
}

function extractNarrativeText(narrative: Scenario["narrative"]): string {
  if (!narrative) return "";
  if (typeof narrative === "string") return narrative;
  if (typeof narrative.narrative === "string") return narrative.narrative;
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SimulatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // -- Store slices --
  const exploring = useNexusStore((s) => s.exploring);
  const graph = useNexusStore((s) => s.graph);
  const scenarios = useNexusStore((s) => s.scenarios);
  const treeStats = useNexusStore((s) => s.treeStats);
  const vizData = useNexusStore((s) => s.vizData);
  const resilienceProfile = useNexusStore((s) => s.resilienceProfile);
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
  const [scenarioProfileId, setScenarioProfileId] = useState<
    (typeof SCENARIO_PROFILES)[number]["id"]
  >("balanced");
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
    const selectedProfile = SCENARIO_PROFILES.find(
      (profile) => profile.id === scenarioProfileId,
    );
    runExploration({
      config,
      mc: enabledAgents.has("monte_carlo") ? selectedProfile?.mc : undefined,
    });
  }, [depth, treeLimit, enabledAgents, runExploration, scenarioProfileId]);

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
      event_summary: formatTreeEventSummary(node.event_summary, graph),
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
  }, [graph, vizData]);

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

    const pathSource =
      selectedScenario?.path.length === focusedPathNodes.length - 1
        ? selectedScenario.path.map((step, index) => ({
            step: index + 1,
            event: formatScenarioEvent(step.event, graph),
            deltaH: step.H_before - step.H_after,
            H: step.H_after,
            failures: step.new_failures.length,
          }))
        : focusedPathNodes.slice(1).map((node, index) => ({
            step: index + 1,
            event: node.event_summary,
            deltaH: node.delta_H,
            H: node.H,
            failures: node.failed_count,
          }));

    const events = pathSource;

    const summary =
      selectedScenario?.summary ??
      (events.length > 0
        ? `${events[0]?.event ?? "The first branch"} triggered a cascade that brought the network to H ${focusedPathNodes.at(-1)?.H.toFixed(2)}.`
        : "The system is still at the initial state root.");

    const story =
      extractNarrativeText(selectedScenario?.narrative ?? null) ||
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
      .attr("y1", () => 0)
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
          ? "var(--danger)"
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
          ? "var(--danger)"
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

  // -- Top 5 worst scenarios --
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
    >
      {/* ---- Navigation ---- */}
      <NavBar sessionId={sessionId} />

      {/* ---- Agent Controls ---- */}
      <section
        className="mx-8 mt-8 rounded-[40px] border border-white/5 bg-black/20 p-8 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="h-1 w-6 bg-[var(--accent)]" />
          <h2 className="mono-label text-[10px] text-[var(--accent-soft)]">
            ADVERSARIAL_SIMULATION_CONTROLS
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-8">
            {/* Agents row */}
            <div className="flex flex-col gap-4">
              <div className="mono-label text-[9px] opacity-40">ACTIVE_AGENTS</div>
              <div className="flex flex-wrap gap-3">
                {AGENTS.map((agent) => {
                  const active = enabledAgents.has(agent.type);
                  return (
                    <button
                      key={agent.type}
                      type="button"
                      onClick={() => toggleAgent(agent.type)}
                      className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
                        active
                          ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-white/5 bg-white/[0.02] text-[var(--muted)] hover:bg-white/[0.04]"
                      }`}
                      title={agent.description}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full transition-all ${active ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" : "bg-white/10"}`} />
                      {agent.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="mono-label text-[9px] opacity-40">
                  WHAT_IF_SWEEP_PROFILE
                </div>
                <span className="mono-label text-[8px] opacity-30">
                  {enabledAgents.has("monte_carlo")
                    ? "FULL_SPECTRUM_SWEEP_ENABLED"
                    : "FULL_SPECTRUM_SWEEP_DISABLED"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {SCENARIO_PROFILES.map((profile) => {
                  const active = scenarioProfileId === profile.id;
                  const disabled = !enabledAgents.has("monte_carlo");
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setScenarioProfileId(profile.id)}
                      disabled={disabled}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? "border-[var(--accent)]/35 bg-[var(--accent)]/10"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                      } ${disabled ? "opacity-40" : ""}`}
                    >
                      <div className="mono-label text-[8px] text-[var(--accent-soft)]">
                        {profile.label}
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                        {profile.description}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="max-w-3xl text-xs leading-relaxed text-[var(--muted)]">
                The full-spectrum sweep adds non-deterministic branches on top of the strategic agents so the tree explores routine human mistakes, intermittent technical degradation, supplier failures, and broken dependencies across all mapped nodes.
              </p>
            </div>

            {/* Sliders row */}
            <div className="grid gap-12 sm:grid-cols-2 lg:max-w-3xl">
              {/* Depth slider */}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                  <label className="mono-label text-[9px] opacity-40">
                    EXPLORATION_DEPTH
                  </label>
                  <span className="font-mono text-xl font-bold text-[var(--foreground)]">{depth.toString().padStart(2, '0')}</span>
                </div>
                <div className="relative flex items-center h-6">
                  <div className="absolute h-[1px] w-full bg-white/5" />
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    className="absolute w-full appearance-none bg-transparent accent-[var(--accent)] cursor-pointer [&::-webkit-slider-runnable-track]:h-[1px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-[0_0_12px_var(--accent)]"
                  />
                </div>
              </div>

              {/* Tree limit slider */}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                  <label className="mono-label text-[9px] opacity-40">
                    NODE_COMPUTE_LIMIT
                  </label>
                  <span className="font-mono text-xl font-bold text-[var(--foreground)]">
                    {(treeLimit / 1000).toFixed(1)}K
                  </span>
                </div>
                <div className="relative flex items-center h-6">
                  <div className="absolute h-[1px] w-full bg-white/5" />
                  <input
                    type="range"
                    min={100}
                    max={10000}
                    step={100}
                    value={treeLimit}
                    onChange={(e) => setTreeLimit(Number(e.target.value))}
                    className="absolute w-full appearance-none bg-transparent accent-[var(--accent)] cursor-pointer [&::-webkit-slider-runnable-track]:h-[1px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-[0_0_12px_var(--accent)]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={handleRun}
              disabled={exploring || enabledAgents.size === 0}
              className="accent-button min-w-[240px] rounded-full py-6 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-20"
            >
              {exploring ? "COMPUTING..." : "RUN EXPLORATION →"}
            </button>
          </div>
        </div>
      </section>

      {/* ---- Bottom: Tree + Results ---- */}
      <div className="flex flex-1 gap-8 mx-8 my-8 min-h-0">
        {/* -- Left: State Tree Visualization -- */}
        <section
          ref={containerRef}
          className="relative flex-1 rounded-[48px] border border-white/5 bg-black/20 backdrop-blur-md overflow-hidden"
          style={{ minHeight: 480 }}
        >
          <div className="absolute top-8 left-8 z-10 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <div className="mono-label text-[10px] text-[var(--accent-soft)]">STATE_TREE_TOPOLOGY</div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-8 top-8 z-10 rounded-full border border-white/5 bg-black/40 px-5 py-2 backdrop-blur-md">
            <span className="mono-label text-[9px] opacity-60">INTERACTION: CLICK_BRANCH_TO_FOCUS</span>
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
                  <span style={{ color: "var(--danger)" }}>
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
        <aside
          className="flex-[4] min-w-[340px] max-w-[480px] rounded-[48px] border border-white/5 bg-black/20 p-8 flex flex-col gap-8 overflow-y-auto backdrop-blur-md"
        >
          <div className="flex items-center gap-3">
            <div className="h-1 w-4 bg-[var(--accent)]" />
            <h3 className="mono-label text-[10px]">
              {exploring ? "MONITORING_THREAD..." : treeStats ? "SIMULATION_RESULTS" : "SYSTEM_LOG"}
            </h3>
          </div>

          {/* -- Before exploration -- */}
          {!exploring && !treeStats && !exploreError && (
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Initialize the adversarial engine to discover high-consequence
                failure paths across the organizational topology.
              </p>
              <div className="h-px w-full bg-white/5" />
              <div className="mono-label text-[9px] opacity-40">WAITING_FOR_TRIGGER...</div>
            </div>
          )}

          {/* -- Error state -- */}
          {exploreError && (
            <div
              className="bracket-box rounded-2xl border-[var(--danger)]/20 bg-[var(--danger)]/5 p-4 text-xs text-[var(--danger)]"
            >
              <div className="mono-label text-[8px] mb-1">CRITICAL_EXCEPTION</div>
              {exploreError}
            </div>
          )}

          {/* -- During exploration -- */}
          {exploring && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div
                  className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin border-[var(--accent)]"
                />
                <span className="mono-label text-[10px] text-[var(--accent-soft)]">
                  PARALLEL_STATE_SEARCH_ACTIVE
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full animate-pulse bg-white/5"
                    style={{ width: `${80 - i * 15}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* -- After exploration (results) -- */}
          {!exploring && treeStats && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="NODES_EXPLORED"
                  value={treeStats.total_nodes_explored.toLocaleString().replace(/,/g, '_')}
                />
                <StatCard
                  label="MAX_DEPTH"
                  value={String(treeStats.max_depth_reached).padStart(2, '0')}
                />
                <StatCard
                  label="COMPUTE_LATENCY"
                  value={`${(treeStats.computation_time_ms / 1000).toFixed(1)}S`}
                />
                <StatCard label="UNIQUE_SCENARIOS" value={String(scenarios.length).padStart(2, '0')} />
              </div>

              {resilienceProfile && (
                <div className="grid grid-cols-2 gap-4">
                  <MiniMetric
                    label="MEAN_RANDOM_HEALTH"
                    value={
                      resilienceProfile.mean_H !== undefined
                        ? resilienceProfile.mean_H.toFixed(2)
                        : "--"
                    }
                    tone="var(--foreground)"
                  />
                  <MiniMetric
                    label="CATASTROPHIC_PROB"
                    value={
                      resilienceProfile.p_catastrophic !== undefined
                        ? `${Math.round(resilienceProfile.p_catastrophic * 100)}%`
                        : "--"
                    }
                    tone="var(--danger)"
                  />
                </div>
              )}

              {currentPathBriefing && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="mono-label text-[9px] opacity-40">SELECTED_PATH_DIAGNOSTICS</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>

                  <div
                    className="bracket-box flex flex-col gap-6 rounded-[32px] border-white/5 bg-white/[0.02]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <div
                          className="mono-label text-[9px] text-[var(--accent-soft)]"
                        >
                          CASE_STUDY
                        </div>
                        <h4
                          className="display-face text-xl font-bold tracking-tight text-[var(--foreground)] uppercase"
                        >
                          {currentPathBriefing.title}
                        </h4>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
                        style={{
                          color: severityColor(currentPathBriefing.severityLabel),
                          background: `${severityColor(currentPathBriefing.severityLabel)}18`,
                          border: `1px solid ${severityColor(currentPathBriefing.severityLabel)}33`,
                        }}
                      >
                        {currentPathBriefing.severityLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <MiniMetric
                        label="TOTAL_H_LOSS"
                        value={`-${currentPathBriefing.impact.healthLoss.toFixed(2)}`}
                        tone="var(--danger)"
                      />
                      <MiniMetric
                        label="CASCADE_COUNT"
                        value={String(currentPathBriefing.impact.failedCount).padStart(2, '0')}
                        tone="var(--foreground)"
                      />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="mono-label text-[9px] opacity-40">EVENT_NARRATIVE</div>
                      <p className="text-sm leading-relaxed text-[var(--muted-strong)]">
                        {currentPathBriefing.summary}
                      </p>
                      <p className="text-xs leading-relaxed text-[var(--muted)] opacity-70">
                        {currentPathBriefing.story}
                      </p>
                    </div>

                    {currentPathBriefing.events.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <div className="mono-label text-[9px] opacity-40">PROPAGATION_SEQUENCE</div>
                        <div className="flex flex-col gap-2">
                          {currentPathBriefing.events.map((event) => (
                            <div
                              key={`${event.step}-${event.event}`}
                              className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                            >
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="mono-label !text-[8px] opacity-40">STEP_{String(event.step).padStart(2, '0')}</span>
                                <span className="truncate text-[11px] font-bold text-[var(--foreground)] uppercase tracking-tight">
                                  {event.event}
                                </span>
                              </div>
                              <span
                                className="font-mono text-[11px] font-bold text-[var(--danger)] shrink-0"
                              >
                                -{event.deltaH.toFixed(2)}H
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentPathBriefing.recommendations.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <div className="mono-label text-[9px] opacity-40">COUNTERMEASURE_ADVISORY</div>
                        <div className="flex flex-col gap-3">
                          {currentPathBriefing.recommendations
                            .slice(0, 2)
                            .map((rec) => (
                              <div
                                key={`${rec.action}-${rec.reason}`}
                                className="bracket-box rounded-2xl border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4"
                              >
                                <p className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-tight">
                                  {rec.action}
                                </p>
                                <p
                                  className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]"
                                >
                                  {rec.reason}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Per-agent stats */}
              {agentStatEntries.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="mono-label text-[9px] opacity-40">AGENT_DIAGNOSTICS</div>
                  <div className="flex flex-col gap-2">
                    {agentStatEntries.map(([name, stats]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                      >
                        <span
                          className="mono-label text-[9px] font-bold text-[var(--muted-strong)]"
                        >
                          {formatAgentName(name).toUpperCase()}
                        </span>
                        <div
                          className="flex gap-4 font-mono text-[9px]"
                        >
                          <span className="opacity-40">{stats.nodes_explored}_NODES</span>
                          <span
                            style={{ color: healthColor(stats.worst_H_found) }}
                          >
                            MIN_H:{stats.worst_H_found.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 5 worst scenarios */}
              {topScenarios.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="mono-label text-[9px] opacity-40">CRITICAL_VECTORS</div>
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
                        className={`group flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                          activeScenarioIndex === i
                            ? "border-[var(--danger)]/40 bg-[var(--danger)]/10"
                            : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="mono-label text-[8px] font-bold uppercase border px-1.5 py-0.5 rounded"
                            style={{
                              color: severityColor(s.severity_label),
                              borderColor: `${severityColor(s.severity_label)}33`,
                              background: `${severityColor(s.severity_label)}15`,
                            }}
                          >
                            {s.severity_label}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-bold tracking-tight text-[var(--foreground)] uppercase">
                              {s.title || `SCENARIO_${String(i + 1).padStart(2, '0')}`}
                            </span>
                            <span className="block truncate pt-1 text-[10px] text-[var(--muted)]">
                              {s.summary || "Explored cascade path across the mapped organization."}
                            </span>
                          </div>
                        </div>
                        <span
                          className="font-mono text-[11px] font-bold"
                          style={{ color: healthColor(s.health_remaining) }}
                        >
                          {s.health_remaining.toFixed(2)}_H
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
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
    <div className="flex flex-col gap-1">
      <p
        className="mono-label !text-[8px] opacity-40"
      >
        {label}
      </p>
      <p className="font-mono text-xs font-bold" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}

function formatAgentName(name: string): string {
  return name.replace(/_/g, " ");
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div
      className="bracket-box flex flex-col gap-2 rounded-2xl border-white/5 bg-white/[0.02] p-4"
    >
      <p
        className="mono-label !text-[8px] opacity-40"
      >
        {label}
      </p>
      <p className="text-xs font-bold tracking-tight uppercase" style={{ color: accent }}>{value}</p>
    </div>
  );
}
