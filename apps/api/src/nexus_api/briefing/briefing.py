"""Module 3 -- Agent Briefing.

Transform the ``VulnerabilityReport`` (Module 2 output) into targeted
``AgentBrief`` packets for each of the five agent strategies.  This is a
pure deterministic mapping -- no AI, no randomness.

An optional Monte Carlo brief can be appended when ``MCConfig`` is provided.

Public API
----------
brief_critical_node_attacker(report)        -> AgentBrief
brief_bridge_breaker(report)                -> AgentBrief
brief_compound_exploiter(report)            -> AgentBrief
brief_layer_assassin(report, graph)         -> AgentBrief
brief_cluster_isolator(report, graph)       -> AgentBrief
brief_monte_carlo(mc_config)                -> AgentBrief
generate_all_briefs(report, graph)          -> list[AgentBrief]
create_all_agents(briefs, mc_config=None)   -> list[Agent]

Reference: docs/03_AGENT_BRIEFING.md
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.engine.weakpoint import VulnerabilityReport
    from nexus_api.mc.config import MCConfig
    from nexus_api.models.graph import Graph


# ======================================================================
# Brief builders — one per agent type
# ======================================================================


def brief_critical_node_attacker(report: VulnerabilityReport) -> AgentBrief:
    """Agent 1: Critical Node Attacker.

    Targets: top 10 nodes by health_loss.
    Initial events: kill top 3 nodes.
    Depth 5, branching 3.
    """
    top_nodes = sorted(
        report.node_rankings,
        key=lambda n: n.health_loss,
        reverse=True,
    )[:10]

    priority_targets = [n.node_id for n in top_nodes]

    initial_events = [Event(target=n.node_id, action="kill") for n in top_nodes[:3]]

    return AgentBrief(
        agent_type="critical_node_attacker",
        priority_targets=priority_targets,
        priority_edges=[],
        focus_layers=[],
        focus_clusters=[],
        initial_events=initial_events,
        max_depth=5,
        branching_factor=3,
    )


def brief_bridge_breaker(report: VulnerabilityReport) -> AgentBrief:
    """Agent 2: Bridge Breaker.

    If bridge nodes exist: target top 10 by fragmentation_score.
    If none: fall back to critical edges by health_loss.
    Depth 4-5, branching 3.
    """
    if not report.bridge_nodes:
        # No bridges — fall back to critical edges
        top_edges = sorted(
            report.critical_edges,
            key=lambda e: e.health_loss,
            reverse=True,
        )[:10]

        priority_edges = [(e.from_node, e.to_node) for e in top_edges]

        initial_events = [
            Event(
                target={"from": e.from_node, "to": e.to_node},
                action="cut_edge",
            )
            for e in top_edges[:3]
        ]

        return AgentBrief(
            agent_type="bridge_breaker",
            priority_targets=[],
            priority_edges=priority_edges,
            focus_layers=[],
            focus_clusters=[],
            initial_events=initial_events,
            max_depth=5,
            branching_factor=3,
        )

    # Bridge nodes exist
    top_bridges = sorted(
        report.bridge_nodes,
        key=lambda b: b.fragmentation_score,
        reverse=True,
    )[:10]

    priority_targets = [b.node_id for b in top_bridges]

    # Cross-layer critical edges (secondary targets)
    cross_layer_edges = [e for e in report.critical_edges if e.crosses_layers][:5]
    priority_edges = [(e.from_node, e.to_node) for e in cross_layer_edges]

    initial_events = [Event(target=b.node_id, action="kill") for b in top_bridges[:3]]

    return AgentBrief(
        agent_type="bridge_breaker",
        priority_targets=priority_targets,
        priority_edges=priority_edges,
        focus_layers=[],
        focus_clusters=[],
        initial_events=initial_events,
        max_depth=4,
        branching_factor=3,
    )


def brief_compound_exploiter(report: VulnerabilityReport) -> AgentBrief:
    """Agent 3: Compound Exploiter.

    Targets: unique nodes from top 10 synergy pairs (synergy > 0).
    Initial events: kill each pair simultaneously.
    Depth 4, branching 4.
    """
    top_pairs = sorted(
        (p for p in report.compound_pairs if p.synergy > 0),
        key=lambda p: p.synergy,
        reverse=True,
    )[:10]

    # Extract unique node ids while preserving priority order
    seen: set[str] = set()
    priority_targets: list[str] = []
    for pair in top_pairs:
        for nid in (pair.node_a, pair.node_b):
            if nid not in seen:
                seen.add(nid)
                priority_targets.append(nid)

    # Initial events: kill each pair (compound events targeting both nodes)
    initial_events = [Event(target=[p.node_a, p.node_b], action="kill") for p in top_pairs[:3]]

    return AgentBrief(
        agent_type="compound_exploiter",
        priority_targets=priority_targets,
        priority_edges=[],
        focus_layers=[],
        focus_clusters=[],
        initial_events=initial_events,
        max_depth=4,
        branching_factor=4,
    )


def brief_layer_assassin(
    report: VulnerabilityReport,
    graph: Graph,
) -> AgentBrief:
    """Agent 4: Layer Assassin.

    Target: the layer with the highest ``criticality * (1 - autonomy)``
    score.  Priority targets are the top 10 nodes in that layer sorted
    by theta descending.
    Depth 6, branching 2.
    """
    # Score each layer
    layer_scores: dict[str, float] = {}
    for layer_name, analysis in report.layer_analysis.items():
        criticality = getattr(analysis, "criticality", 0.0)
        autonomy = getattr(analysis, "autonomy", 1.0)
        layer_scores[layer_name] = criticality * (1.0 - autonomy)

    if not layer_scores:
        # Degenerate case: no layer analysis available
        return AgentBrief(
            agent_type="layer_assassin",
            priority_targets=[],
            priority_edges=[],
            focus_layers=[],
            focus_clusters=[],
            initial_events=[],
            max_depth=6,
            branching_factor=2,
        )

    target_layer = max(layer_scores, key=lambda k: layer_scores[k])

    # Get nodes in target layer from the graph, sorted by theta descending
    layer_node_ids: set[str] = {n.id for n in graph.nodes if n.layer == target_layer}
    # Use node_rankings for ordering (they carry theta via health_loss)
    # but we want to sort by actual theta from the graph
    layer_nodes_by_theta = sorted(
        (n for n in graph.nodes if n.id in layer_node_ids),
        key=lambda n: n.theta,
        reverse=True,
    )

    priority_targets = [n.id for n in layer_nodes_by_theta[:10]]

    # Priority edges: critical edges touching the target layer
    layer_edges = []
    for e in report.critical_edges:
        # Check if either endpoint is in the target layer
        from_in_layer = e.from_node in layer_node_ids
        to_in_layer = e.to_node in layer_node_ids
        if from_in_layer or to_in_layer:
            layer_edges.append(e)
    layer_edges = layer_edges[:5]
    priority_edges = [(e.from_node, e.to_node) for e in layer_edges]

    initial_events = [Event(target=n.id, action="kill") for n in layer_nodes_by_theta[:2]]

    return AgentBrief(
        agent_type="layer_assassin",
        priority_targets=priority_targets,
        priority_edges=priority_edges,
        focus_layers=[target_layer],
        focus_clusters=[],
        initial_events=initial_events,
        max_depth=6,
        branching_factor=2,
    )


def brief_cluster_isolator(
    report: VulnerabilityReport,
    graph: Graph,
) -> AgentBrief:
    """Agent 5: Cluster Isolator.

    Targets: top 5 clusters by ``isolation_risk * cluster_impact``.
    Priority edges: boundary edges of those clusters (strongest first).
    Depth 4, branching 4.
    """
    # Score and sort clusters
    scored_clusters = sorted(
        report.clusters,
        key=lambda c: c.isolation_risk * c.cluster_impact,
        reverse=True,
    )[:5]

    if not scored_clusters:
        return AgentBrief(
            agent_type="cluster_isolator",
            priority_targets=[],
            priority_edges=[],
            focus_layers=[],
            focus_clusters=[],
            initial_events=[],
            max_depth=4,
            branching_factor=4,
        )

    # Collect boundary nodes from target clusters
    priority_targets: list[str] = []
    seen_nodes: set[str] = set()
    for cluster in scored_clusters:
        for nid in cluster.boundary_nodes:
            if nid not in seen_nodes:
                seen_nodes.add(nid)
                priority_targets.append(nid)

    # For each target cluster, find boundary edges (connecting inside to outside)
    # and sort by weight descending within each cluster, take top 3 per cluster
    target_edges: list[tuple[str, str]] = []
    for cluster in scored_clusters:
        cluster_node_set = set(cluster.nodes)
        boundary_edge_list: list[tuple[str, str, float]] = []
        for edge in graph.edges:
            from_in = edge.from_id in cluster_node_set
            to_in = edge.to_id in cluster_node_set
            if from_in != to_in:
                boundary_edge_list.append((edge.from_id, edge.to_id, edge.weight))
        # Sort by weight descending (cut strongest first)
        boundary_edge_list.sort(key=lambda e: e[2], reverse=True)
        for from_id, to_id, _w in boundary_edge_list[:3]:
            target_edges.append((from_id, to_id))

    # Initial events: cut the top 3 boundary edges
    initial_events: list[Event] = []
    for from_id, to_id in target_edges[:3]:
        initial_events.append(
            Event(
                target={"from": from_id, "to": to_id},
                action="cut_edge",
            )
        )

    focus_clusters = list(range(len(scored_clusters)))

    return AgentBrief(
        agent_type="cluster_isolator",
        priority_targets=priority_targets,
        priority_edges=target_edges,
        focus_layers=[],
        focus_clusters=focus_clusters,
        initial_events=initial_events,
        max_depth=4,
        branching_factor=4,
    )


def brief_monte_carlo(mc_config: MCConfig) -> AgentBrief:
    """Agent 6: Monte Carlo Explorer.

    Produces a minimal ``AgentBrief`` whose depth and branching factor
    come from *mc_config*.  The MC agent does not use priority targets
    or initial events — it generates events randomly.
    """
    return AgentBrief(
        agent_type="monte_carlo",
        priority_targets=[],
        priority_edges=[],
        focus_layers=[],
        focus_clusters=[],
        initial_events=[],
        max_depth=mc_config.max_depth,
        branching_factor=mc_config.branching_factor,
    )


# ======================================================================
# Orchestration
# ======================================================================


def generate_all_briefs(
    report: VulnerabilityReport,
    graph: Graph,
) -> list[AgentBrief]:
    """Produce one ``AgentBrief`` for each of the five agent types.

    Parameters
    ----------
    report : VulnerabilityReport
        Full vulnerability analysis from Module 2.
    graph : Graph
        The network graph (needed by layer_assassin and cluster_isolator
        for topology lookups).

    Returns
    -------
    list[AgentBrief]
        Five briefs in canonical order: critical_node_attacker,
        bridge_breaker, compound_exploiter, layer_assassin,
        cluster_isolator.
    """
    return [
        brief_critical_node_attacker(report),
        brief_bridge_breaker(report),
        brief_compound_exploiter(report),
        brief_layer_assassin(report, graph),
        brief_cluster_isolator(report, graph),
    ]


# ======================================================================
# Agent factory
# ======================================================================

# Maps agent_type strings to their concrete Agent subclass.
# Imports are deferred to avoid circular dependencies at module load time.
_AGENT_REGISTRY: dict[str, type[Agent]] | None = None


def _get_agent_registry() -> dict[str, type[Agent]]:
    """Lazily build and cache the agent type -> class mapping."""
    global _AGENT_REGISTRY
    if _AGENT_REGISTRY is not None:
        return _AGENT_REGISTRY

    from nexus_api.agents.bridge_breaker import BridgeBreaker
    from nexus_api.agents.cluster_isolator import ClusterIsolator
    from nexus_api.agents.compound_exploiter import CompoundExploiter
    from nexus_api.agents.critical_node import CriticalNodeAttacker
    from nexus_api.agents.layer_assassin import LayerAssassin
    from nexus_api.agents.monte_carlo import MonteCarloAgent

    _AGENT_REGISTRY = {
        "critical_node_attacker": CriticalNodeAttacker,
        "bridge_breaker": BridgeBreaker,
        "compound_exploiter": CompoundExploiter,
        "layer_assassin": LayerAssassin,
        "cluster_isolator": ClusterIsolator,
        "monte_carlo": MonteCarloAgent,
    }
    return _AGENT_REGISTRY


def create_all_agents(
    briefs: list[AgentBrief],
    *,
    mc_config: MCConfig | None = None,
) -> list[Agent]:
    """Instantiate the correct ``Agent`` subclass for each brief.

    Parameters
    ----------
    briefs : list[AgentBrief]
        Briefs as returned by :func:`generate_all_briefs`.
    mc_config : MCConfig | None
        Monte Carlo configuration.  Required when any brief has
        ``agent_type="monte_carlo"``.

    Returns
    -------
    list[Agent]
        One agent per brief, in the same order.

    Raises
    ------
    ValueError
        If a brief has an ``agent_type`` that does not match any known
        agent strategy, or if a ``monte_carlo`` brief is present but
        *mc_config* is ``None``.
    """
    registry = _get_agent_registry()
    agents: list[Agent] = []

    for brief in briefs:
        agent_cls = registry.get(brief.agent_type)
        if agent_cls is None:
            raise ValueError(
                f"Unknown agent_type {brief.agent_type!r}. Known types: {sorted(registry.keys())}"
            )

        if brief.agent_type == "monte_carlo":
            if mc_config is None:
                raise ValueError("mc_config is required for monte_carlo agent.")
            agents.append(agent_cls(brief, mc_config))
        else:
            agents.append(agent_cls(brief))

    return agents
