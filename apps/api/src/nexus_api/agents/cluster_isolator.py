"""Agent 5 -- Cluster Isolator.

Strategy: Cut off tightly-coupled clusters from the rest of the network by
severing boundary edges (strongest first) or killing boundary nodes.
Recomputes clusters on the surviving subgraph at every depth since topology
evolves as nodes die.

Falls back to a critical-node greedy attack when no meaningful clusters
can be detected.

Reference: docs/03A_AGENT_STRATEGIES.md -- Agent 5.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import networkx as nx
from networkx.algorithms.community import louvain_communities

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph

logger = logging.getLogger(__name__)


class ClusterIsolator(Agent):
    """Isolates clusters by cutting boundary connections or killing boundary
    nodes."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Recompute clusters, find most valuable, cut its boundaries.

        1. Build surviving subgraph and detect communities.
        2. Score each cluster by ``cluster_impact * isolation_risk``.
        3. Find boundary edges of the top cluster and cut them (strongest
           first), or kill boundary nodes if no boundary edges remain.
        4. Fall back to critical-node greedy attack if clustering fails.
        """
        bf = self.brief.branching_factor
        surviving_ids = {n.id for n in graph.nodes if not n.phi}

        if len(surviving_ids) < 3:
            return _fallback_critical_node(graph, bf)

        # -- Build undirected surviving subgraph ---------------------------
        nxg = _build_surviving_subgraph(graph, surviving_ids)

        if nxg.number_of_nodes() < 3 or nxg.number_of_edges() == 0:
            return _fallback_critical_node(graph, bf)

        # -- Detect communities --------------------------------------------
        try:
            communities = louvain_communities(nxg, seed=42)
        except Exception:
            logger.debug("Louvain community detection failed; falling back.")
            return _fallback_critical_node(graph, bf)

        if len(communities) < 2:
            # Only one big cluster -- nothing to isolate.
            return _fallback_critical_node(graph, bf)

        # -- Score clusters -------------------------------------------------
        cluster_scores: list[tuple[set[str], float]] = []
        for community in communities:
            cluster_nodes = set(community)
            info = _cluster_info(graph, nxg, cluster_nodes, surviving_ids)
            score = info["cluster_impact"] * info["isolation_risk"]
            cluster_scores.append((cluster_nodes, score))

        cluster_scores.sort(key=lambda pair: pair[1], reverse=True)
        target_cluster, _ = cluster_scores[0]

        # -- Find boundary edges (connecting cluster to outside) -----------
        boundary_edges = _find_boundary_edges(graph, nxg, target_cluster)

        if boundary_edges:
            # Cut strongest boundary edges first
            boundary_edges.sort(key=lambda e: e[2], reverse=True)
            events: list[Event] = []
            for from_id, to_id, _w in boundary_edges[:bf]:
                events.append(
                    Event(
                        target={"from": from_id, "to": to_id},
                        action="cut_edge",
                    )
                )
            return events

        # -- No boundary edges: kill boundary nodes ------------------------
        boundary_node_ids = _find_boundary_nodes(graph, nxg, target_cluster, surviving_ids)
        if boundary_node_ids:
            return [Event(target=nid, action="kill") for nid in boundary_node_ids[:bf]]

        # Ultimate fallback
        return _fallback_critical_node(graph, bf)


# ======================================================================
# Helpers
# ======================================================================


def _build_surviving_subgraph(
    graph: Graph,
    surviving_ids: set[str],
) -> nx.Graph:
    """Undirected networkx graph of surviving nodes and their edges."""
    nxg = nx.Graph()
    for nid in surviving_ids:
        nxg.add_node(nid)
    for edge in graph.edges:
        if edge.from_id in surviving_ids and edge.to_id in surviving_ids:
            if nxg.has_edge(edge.from_id, edge.to_id):
                existing_w = nxg[edge.from_id][edge.to_id].get("weight", 0.0)
                nxg[edge.from_id][edge.to_id]["weight"] = max(existing_w, edge.weight)
            else:
                nxg.add_edge(edge.from_id, edge.to_id, weight=edge.weight)
    return nxg


def _cluster_info(
    graph: Graph,
    nxg: nx.Graph,
    cluster_nodes: set[str],
    surviving_ids: set[str],
) -> dict[str, float]:
    """Compute cluster_impact and isolation_risk for a community."""
    # Internal edge weights
    internal_weights: list[float] = []
    external_weights: list[float] = []

    for u, v, data in nxg.edges(data=True):
        w = data.get("weight", 1.0)
        u_in = u in cluster_nodes
        v_in = v in cluster_nodes
        if u_in and v_in:
            internal_weights.append(w)
        elif u_in or v_in:
            external_weights.append(w)

    internal_strength = sum(internal_weights) / len(internal_weights) if internal_weights else 0.0
    external_strength = sum(external_weights) / len(external_weights) if external_weights else 0.0

    isolation_risk = (
        (internal_strength / external_strength) if external_strength > 0 else float("inf")
    )
    # Clamp to a large finite value for sorting stability
    if isolation_risk == float("inf"):
        isolation_risk = 1e6

    # Cluster impact: sum of theta in cluster / total theta
    cluster_theta = sum(graph.get_node(nid).theta for nid in cluster_nodes)
    total_theta = sum(n.theta for n in graph.nodes if n.id in surviving_ids)
    cluster_impact = cluster_theta / total_theta if total_theta > 0 else 0.0

    return {
        "cluster_impact": cluster_impact,
        "isolation_risk": isolation_risk,
    }


def _find_boundary_edges(
    graph: Graph,
    nxg: nx.Graph,
    cluster_nodes: set[str],
) -> list[tuple[str, str, float]]:
    """Return directed edges from the original graph that cross the cluster
    boundary, as ``(from_id, to_id, weight)`` triples."""
    boundary: list[tuple[str, str, float]] = []
    cluster_set = set(cluster_nodes)
    for edge in graph.edges:
        from_in = edge.from_id in cluster_set
        to_in = edge.to_id in cluster_set
        if from_in != to_in:
            # Both endpoints must be surviving (present in nxg)
            if nxg.has_node(edge.from_id) and nxg.has_node(edge.to_id):
                boundary.append((edge.from_id, edge.to_id, edge.weight))
    return boundary


def _find_boundary_nodes(
    graph: Graph,
    nxg: nx.Graph,
    cluster_nodes: set[str],
    surviving_ids: set[str],
) -> list[str]:
    """Return node ids in the cluster that have at least one edge to a node
    outside the cluster.  Sorted by theta descending (most important first)."""
    cluster_set = set(cluster_nodes)
    boundary: set[str] = set()
    for edge in graph.edges:
        if edge.from_id in cluster_set and edge.to_id not in cluster_set:
            if edge.to_id in surviving_ids:
                boundary.add(edge.from_id)
        elif edge.to_id in cluster_set and edge.from_id not in cluster_set:
            if edge.from_id in surviving_ids:
                boundary.add(edge.to_id)
    # Sort by theta descending
    result = sorted(
        boundary,
        key=lambda nid: graph.get_node(nid).theta,
        reverse=True,
    )
    return result


def _fallback_critical_node(graph: Graph, bf: int) -> list[Event]:
    """Greedy fallback: kill the highest-theta surviving node(s).

    Used when cluster detection yields no actionable result.  This mirrors
    a simplified version of the CriticalNodeAttacker without running full
    cascade simulations (to keep the fallback lightweight).
    """
    surviving = [n for n in graph.nodes if not n.phi]
    if not surviving:
        return []
    surviving.sort(key=lambda n: n.theta, reverse=True)
    return [Event(target=n.id, action="kill") for n in surviving[:bf]]
