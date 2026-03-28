"""Module 2 -- Weakpoint Analysis.

Pure mathematical analysis on the graph to identify all vulnerabilities.
No AI, no randomness, fully deterministic.  Produces the vulnerability
report that guides the agents in Module 3.

Algorithms implemented
----------------------
1. Node Impact Ranking
2. Critical Edge Detection
3. Bridge Node Detection
4. Cluster Detection (Louvain)
5. Compound Vulnerability Pairs
6. Layer Dependency Analysis

Plus the combined ``run_full_analysis`` entry-point.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

import networkx as nx
import numpy as np

from nexus_api.engine.cascade import cascade, cascade_compound
from nexus_api.models.events import Event
from nexus_api.models.graph import Graph, Node

# ---------------------------------------------------------------------------
# Result data-classes (plain Python, no Pydantic)
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class NodeImpact:
    """Result row for Algorithm 1 -- Node Impact Ranking."""

    node_id: str
    health_loss: float
    cascade_size: float
    cascade_depth: int
    recovery_cost: float
    layers_affected: int


@dataclass(slots=True)
class EdgeImpact:
    """Result row for Algorithm 2 -- Critical Edge Detection."""

    from_node: str
    to_node: str
    health_loss: float
    crosses_layers: bool
    weight: float


@dataclass(slots=True)
class BridgeNode:
    """Result row for Algorithm 3 -- Bridge Node Detection."""

    node_id: str
    splits_into: int
    smallest_fragment_size: int
    largest_fragment_size: int
    fragmentation_score: float
    layer: str


@dataclass(slots=True)
class ClusterInfo:
    """Result row for Algorithm 4 -- Cluster Detection."""

    nodes: list[str]
    size: int
    internal_strength: float
    external_strength: float
    isolation_risk: float
    boundary_nodes: list[str]
    boundary_count: int
    cluster_theta: float
    cluster_impact: float
    layer_distribution: dict[str, int]
    recovery_cost: float


@dataclass(slots=True)
class CompoundPair:
    """Result row for Algorithm 5 -- Compound Vulnerability Pairs."""

    node_a: str
    node_b: str
    impact_a: float
    impact_b: float
    impact_combined: float
    synergy: float
    synergy_ratio: float
    same_layer: bool
    same_cluster: bool


@dataclass(slots=True)
class LayerAnalysis:
    """Result row for Algorithm 6 -- Layer Dependency Analysis."""

    node_count: int
    internal_weight: float
    incoming_from: dict[str, float]
    outgoing_to: dict[str, float]
    autonomy: float
    criticality: float
    avg_theta: float
    avg_recovery: float
    layer_health: float
    risk_score: float


@dataclass(slots=True)
class SummaryStats:
    """Aggregate statistics derived from the full analysis."""

    total_nodes: int
    total_edges: int
    total_layers: int
    most_critical_node: str | None
    most_fragile_layer: str | None
    highest_synergy_pair: tuple[str, str] | None
    bridge_count: int
    cluster_count: int


@dataclass(slots=True)
class VulnerabilityReport:
    """Combined output of all six weakpoint algorithms."""

    network_health: float
    node_rankings: list[NodeImpact]
    critical_edges: list[EdgeImpact]
    bridge_nodes: list[BridgeNode]
    clusters: list[ClusterInfo]
    compound_pairs: list[CompoundPair]
    layer_analysis: dict[str, LayerAnalysis]
    summary_stats: SummaryStats


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_nx_undirected(graph: Graph) -> nx.Graph:
    """Convert the NEXUS *Graph* to an undirected NetworkX graph.

    Edge weights are preserved.  When two directed edges exist between the
    same pair of nodes (a->b and b->a), the maximum weight is kept.
    """
    g = nx.Graph()
    for node in graph.nodes:
        g.add_node(node.id, layer=node.layer)
    for edge in graph.edges:
        if g.has_edge(edge.from_id, edge.to_id):
            existing_weight = g[edge.from_id][edge.to_id]["weight"]
        else:
            existing_weight = 0.0
        g.add_edge(edge.from_id, edge.to_id, weight=max(edge.weight, existing_weight))
    return g


def _unique_layers_in(node_ids: list[str], graph: Graph) -> int:
    """Count distinct layers among *node_ids*."""
    layers: set[str] = set()
    for nid in node_ids:
        node = graph.get_node(nid)
        if node is not None:
            layers.add(node.layer)
    return len(layers)


def _cluster_membership(clusters: list[ClusterInfo]) -> dict[str, int]:
    """Map every node id to its cluster index."""
    membership: dict[str, int] = {}
    for idx, cluster in enumerate(clusters):
        for nid in cluster.nodes:
            membership[nid] = idx
    return membership


# ---------------------------------------------------------------------------
# Algorithm 1: Node Impact Ranking
# ---------------------------------------------------------------------------

def node_impact_ranking(graph: Graph) -> list[NodeImpact]:
    """Kill each node one at a time, run cascade, measure damage.

    Returns a list sorted by ``health_loss`` descending.
    """
    impacts: list[NodeImpact] = []

    for node in graph.nodes:
        g_copy = graph.deep_copy()
        event = Event(target=node.id, action="kill")
        _cascade_log, _final_state, metrics = cascade(g_copy, event)

        layers_affected = _unique_layers_in(metrics.nodes_failed, graph)

        impacts.append(
            NodeImpact(
                node_id=node.id,
                health_loss=metrics.health_loss,
                cascade_size=metrics.cascade_size,
                cascade_depth=metrics.cascade_depth,
                recovery_cost=metrics.total_recovery_cost,
                layers_affected=layers_affected,
            )
        )

    impacts.sort(key=lambda ni: ni.health_loss, reverse=True)
    return impacts


# ---------------------------------------------------------------------------
# Algorithm 2: Critical Edge Detection
# ---------------------------------------------------------------------------

def critical_edge_detection(graph: Graph) -> list[EdgeImpact]:
    """For each edge, remove it, compute resulting damage.

    If the target node dies as a result the cascade is propagated.
    Returns a list sorted by ``health_loss`` descending.
    """
    baseline_health = graph.network_health()
    edge_impacts: list[EdgeImpact] = []

    for edge in graph.edges:
        g_copy = graph.deep_copy()

        # Locate the source node in the copy to read its theta.
        src_node = g_copy.get_node(edge.from_id)
        tgt_node = g_copy.get_node(edge.to_id)

        if src_node is None or tgt_node is None:  # pragma: no cover
            continue

        theta_u = src_node.theta

        # Remove edge from adjacency matrix.
        src_idx = g_copy.get_node_index(edge.from_id)
        tgt_idx = g_copy.get_node_index(edge.to_id)
        g_copy.adjacency_matrix[tgt_idx][src_idx] = 0.0

        # Remove edge from the edges list.
        g_copy.edges = [
            e for e in g_copy.edges
            if not (e.from_id == edge.from_id and e.to_id == edge.to_id)
        ]

        # Compute damage to v: weight * theta_u
        damage_to_v = edge.weight * theta_u
        new_h = max(0.0, tgt_node.h - damage_to_v)
        tgt_node.h = new_h
        g_copy._sync_nodes_to_vectors()

        if new_h <= 0.0:
            tgt_node.phi = True
            # Propagate cascade from the failed node.
            # Use cascade_compound with kill event — apply_event will
            # detect the node is already dead and skip, then propagation
            # runs from its failed state.
            _log, _state, metrics = cascade_compound(
                g_copy, [Event(target=edge.to_id, action="kill")]
            )
            health_loss = baseline_health - _state.H
        else:
            health_loss = baseline_health - g_copy.network_health()

        crosses = graph.get_node(edge.from_id).layer != graph.get_node(edge.to_id).layer

        edge_impacts.append(
            EdgeImpact(
                from_node=edge.from_id,
                to_node=edge.to_id,
                health_loss=health_loss,
                crosses_layers=crosses,
                weight=edge.weight,
            )
        )

    edge_impacts.sort(key=lambda ei: ei.health_loss, reverse=True)
    return edge_impacts


# ---------------------------------------------------------------------------
# Algorithm 3: Bridge Node Detection
# ---------------------------------------------------------------------------

def bridge_node_detection(graph: Graph) -> list[BridgeNode]:
    """Detect nodes whose removal increases the number of connected components.

    Uses NetworkX on an undirected representation of the graph.
    Returns a list sorted by ``fragmentation_score`` descending.
    """
    if len(graph.nodes) < 2:
        return []

    g_undirected = _to_nx_undirected(graph)
    baseline_components = nx.number_connected_components(g_undirected)

    bridges: list[BridgeNode] = []

    for node in graph.nodes:
        g_test = g_undirected.copy()
        g_test.remove_node(node.id)

        if g_test.number_of_nodes() == 0:
            continue

        new_components = nx.number_connected_components(g_test)

        if new_components > baseline_components:
            component_sizes = [len(c) for c in nx.connected_components(g_test)]
            smallest = min(component_sizes)
            largest = max(component_sizes)
            remaining = len(graph.nodes) - 1
            frag_score = 1.0 - (largest / remaining) if remaining > 0 else 0.0

            bridges.append(
                BridgeNode(
                    node_id=node.id,
                    splits_into=new_components,
                    smallest_fragment_size=smallest,
                    largest_fragment_size=largest,
                    fragmentation_score=frag_score,
                    layer=node.layer,
                )
            )

    bridges.sort(key=lambda b: b.fragmentation_score, reverse=True)
    return bridges


# ---------------------------------------------------------------------------
# Algorithm 4: Cluster Detection (Louvain)
# ---------------------------------------------------------------------------

def cluster_detection(graph: Graph) -> list[ClusterInfo]:
    """Detect tightly-connected communities via Louvain and assess isolation risk.

    Returns clusters sorted by ``isolation_risk`` descending.
    """
    if len(graph.nodes) < 2:
        return []

    g_undirected = _to_nx_undirected(graph)

    # NetworkX louvain_communities requires at least one edge.
    if g_undirected.number_of_edges() == 0:
        # Treat every node as its own cluster.
        communities: list[set[str]] = [{n.id} for n in graph.nodes]
    else:
        communities = nx.community.louvain_communities(
            g_undirected, weight="weight", seed=42
        )

    # Build look-ups for efficient edge classification.
    node_map: dict[str, Node] = {n.id: n for n in graph.nodes}
    tv = graph.theta_vector
    total_theta = float(np.sum(tv)) if tv is not None else sum(
        n.theta for n in graph.nodes
    )
    if total_theta == 0.0:
        total_theta = 1.0  # avoid division by zero

    cluster_analysis: list[ClusterInfo] = []

    for community in communities:
        community_set = set(community)

        # -- Internal / external edge weights ---------------------------------
        internal_weights: list[float] = []
        external_weights: list[float] = []

        for edge in graph.edges:
            src_in = edge.from_id in community_set
            tgt_in = edge.to_id in community_set
            if src_in and tgt_in:
                internal_weights.append(edge.weight)
            elif src_in or tgt_in:
                external_weights.append(edge.weight)

        internal_strength = float(np.mean(internal_weights)) if internal_weights else 0.0
        external_strength = float(np.mean(external_weights)) if external_weights else 0.0

        isolation_risk: float
        if external_strength > 0.0:
            isolation_risk = internal_strength / external_strength
        else:
            isolation_risk = float("inf")

        # -- Boundary nodes ---------------------------------------------------
        boundary: list[str] = []
        for nid in community_set:
            is_boundary = False
            for edge in graph.edges:
                if edge.from_id == nid and edge.to_id not in community_set:
                    is_boundary = True
                    break
                if edge.to_id == nid and edge.from_id not in community_set:
                    is_boundary = True
                    break
            if is_boundary:
                boundary.append(nid)

        # -- Aggregate metrics ------------------------------------------------
        cluster_theta = sum(node_map[nid].theta for nid in community_set if nid in node_map)
        cluster_impact = cluster_theta / total_theta
        layer_dist = dict(Counter(node_map[nid].layer for nid in community_set if nid in node_map))
        recovery = sum(node_map[nid].r for nid in community_set if nid in node_map)

        cluster_analysis.append(
            ClusterInfo(
                nodes=sorted(community_set),
                size=len(community_set),
                internal_strength=internal_strength,
                external_strength=external_strength,
                isolation_risk=isolation_risk,
                boundary_nodes=sorted(boundary),
                boundary_count=len(boundary),
                cluster_theta=cluster_theta,
                cluster_impact=cluster_impact,
                layer_distribution=layer_dist,
                recovery_cost=recovery,
            )
        )

    # Sort: inf goes first (highest isolation risk).
    cluster_analysis.sort(
        key=lambda c: c.isolation_risk if math.isfinite(c.isolation_risk) else 1e18,
        reverse=True,
    )
    return cluster_analysis


# ---------------------------------------------------------------------------
# Algorithm 5: Compound Vulnerability Pairs
# ---------------------------------------------------------------------------

def compound_vulnerability_pairs(
    graph: Graph,
    top_k: int = 20,
    *,
    _node_rankings: list[NodeImpact] | None = None,
    _clusters: list[ClusterInfo] | None = None,
) -> list[CompoundPair]:
    """Find node pairs whose simultaneous failure causes super-additive damage.

    Parameters
    ----------
    graph:
        The network graph.
    top_k:
        Only the top-*k* nodes by individual impact are considered (keeps
        complexity at O(top_k^2 * cascade_cost)).
    _node_rankings:
        Pre-computed node rankings to avoid re-running Algorithm 1.
    _clusters:
        Pre-computed clusters to annotate ``same_cluster``.
    """
    rankings = _node_rankings if _node_rankings is not None else node_impact_ranking(graph)
    top_nodes = rankings[:top_k]

    # Build a quick look-up for individual impacts.
    individual: dict[str, float] = {ni.node_id: ni.health_loss for ni in top_nodes}

    # Cluster membership look-up.
    clusters = _clusters if _clusters is not None else cluster_detection(graph)
    membership = _cluster_membership(clusters)

    node_map: dict[str, Node] = {n.id: n for n in graph.nodes}
    pairs: list[CompoundPair] = []

    for idx_a, ni_a in enumerate(top_nodes):
        for ni_b in top_nodes[idx_a + 1 :]:
            g_copy = graph.deep_copy()

            # Kill both nodes simultaneously and cascade.
            events = [
                Event(target=ni_a.node_id, action="kill"),
                Event(target=ni_b.node_id, action="kill"),
            ]
            _log, _state, metrics = cascade_compound(g_copy, events)
            impact_combined = metrics.health_loss

            impact_a = individual[ni_a.node_id]
            impact_b = individual[ni_b.node_id]
            expected = impact_a + impact_b
            synergy = impact_combined - expected
            synergy_ratio = impact_combined / max(expected, 1e-3)

            layer_a = node_map[ni_a.node_id].layer
            layer_b = node_map[ni_b.node_id].layer
            same_layer = layer_a == layer_b
            mem_a = membership.get(ni_a.node_id)
            mem_b = membership.get(ni_b.node_id)
            same_cluster = mem_a == mem_b and mem_a is not None

            pairs.append(
                CompoundPair(
                    node_a=ni_a.node_id,
                    node_b=ni_b.node_id,
                    impact_a=impact_a,
                    impact_b=impact_b,
                    impact_combined=impact_combined,
                    synergy=synergy,
                    synergy_ratio=synergy_ratio,
                    same_layer=same_layer,
                    same_cluster=same_cluster,
                )
            )

    pairs.sort(key=lambda p: p.synergy, reverse=True)
    return pairs


# ---------------------------------------------------------------------------
# Algorithm 6: Layer Dependency Analysis
# ---------------------------------------------------------------------------

def layer_dependency_analysis(graph: Graph) -> dict[str, LayerAnalysis]:
    """Analyse inter-layer dependency patterns.

    Returns a dict keyed by layer name.
    """
    node_map: dict[str, Node] = {n.id: n for n in graph.nodes}

    # Pre-compute total external edge weight once.
    all_external_weight = sum(
        e.weight
        for e in graph.edges
        if node_map[e.from_id].layer != node_map[e.to_id].layer
    )

    analysis: dict[str, LayerAnalysis] = {}

    for layer in graph.layers:
        nodes_in_layer = [n for n in graph.nodes if n.layer == layer]

        if not nodes_in_layer:
            continue

        internal_weight = 0.0
        incoming_from: dict[str, float] = {}
        outgoing_to: dict[str, float] = {}

        for edge in graph.edges:
            src_layer = node_map[edge.from_id].layer
            tgt_layer = node_map[edge.to_id].layer

            if src_layer == layer and tgt_layer == layer:
                internal_weight += edge.weight
            elif src_layer != layer and tgt_layer == layer:
                incoming_from[src_layer] = incoming_from.get(src_layer, 0.0) + edge.weight
            elif src_layer == layer and tgt_layer != layer:
                outgoing_to[tgt_layer] = outgoing_to.get(tgt_layer, 0.0) + edge.weight

        total_incoming = sum(incoming_from.values())
        total_outgoing = sum(outgoing_to.values())
        total_all = internal_weight + total_incoming

        autonomy = internal_weight / total_all if total_all > 0.0 else 1.0
        criticality = total_outgoing / all_external_weight if all_external_weight > 0.0 else 0.0

        thetas = [n.theta for n in nodes_in_layer]
        recoveries = [n.r for n in nodes_in_layer]
        avg_theta = float(np.mean(thetas)) if thetas else 0.0
        avg_recovery = float(np.mean(recoveries)) if recoveries else 0.0

        lh = graph.layer_health(layer)

        risk_score = (1.0 - autonomy) * criticality * avg_theta

        analysis[layer] = LayerAnalysis(
            node_count=len(nodes_in_layer),
            internal_weight=internal_weight,
            incoming_from=incoming_from,
            outgoing_to=outgoing_to,
            autonomy=autonomy,
            criticality=criticality,
            avg_theta=avg_theta,
            avg_recovery=avg_recovery,
            layer_health=lh,
            risk_score=risk_score,
        )

    return analysis


# ---------------------------------------------------------------------------
# Combined report
# ---------------------------------------------------------------------------

def run_full_analysis(graph: Graph) -> VulnerabilityReport:
    """Execute all six weakpoint algorithms and assemble the vulnerability report.

    This is the main entry-point for Module 2.
    """
    # Algorithm 1 -- Node Impact Ranking
    rankings = node_impact_ranking(graph)

    # Algorithm 2 -- Critical Edge Detection
    edges = critical_edge_detection(graph)

    # Algorithm 3 -- Bridge Node Detection
    bridges = bridge_node_detection(graph)

    # Algorithm 4 -- Cluster Detection
    clusters = cluster_detection(graph)

    # Algorithm 5 -- Compound Vulnerability Pairs (reuse rankings + clusters)
    compounds = compound_vulnerability_pairs(
        graph,
        top_k=20,
        _node_rankings=rankings,
        _clusters=clusters,
    )

    # Algorithm 6 -- Layer Dependency Analysis
    layers = layer_dependency_analysis(graph)

    # -- Summary statistics ---------------------------------------------------
    most_critical = rankings[0].node_id if rankings else None

    most_fragile_layer: str | None = None
    if layers:
        most_fragile_layer = max(layers, key=lambda k: layers[k].risk_score)

    highest_synergy: tuple[str, str] | None = None
    if compounds:
        top_pair = compounds[0]
        highest_synergy = (top_pair.node_a, top_pair.node_b)

    stats = SummaryStats(
        total_nodes=len(graph.nodes),
        total_edges=len(graph.edges),
        total_layers=len(graph.layers),
        most_critical_node=most_critical,
        most_fragile_layer=most_fragile_layer,
        highest_synergy_pair=highest_synergy,
        bridge_count=len(bridges),
        cluster_count=len(clusters),
    )

    return VulnerabilityReport(
        network_health=graph.network_health(),
        node_rankings=rankings,
        critical_edges=edges,
        bridge_nodes=bridges,
        clusters=clusters,
        compound_pairs=compounds,
        layer_analysis=layers,
        summary_stats=stats,
    )
