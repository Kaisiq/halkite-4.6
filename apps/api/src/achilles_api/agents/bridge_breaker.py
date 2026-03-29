"""Agent 2 -- Bridge Breaker.

Strategy: Fragment the network into disconnected components by targeting
bridge nodes (articulation points) or, when none exist, cutting critical
edges.  Recalculates bridges at each depth since topology changes as nodes
die.

Reference: docs/03A_AGENT_STRATEGIES.md -- Agent 2.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import networkx as nx

from achilles_api.agents.base import Agent, AgentBrief
from achilles_api.models.events import Event

if TYPE_CHECKING:
    from achilles_api.models.graph import Graph


class BridgeBreaker(Agent):
    """Targets articulation points to maximise network fragmentation."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Find current bridge nodes and kill them; fall back to edge cuts.

        1. Build an undirected networkx subgraph of surviving nodes.
        2. Find articulation points (bridge nodes).
        3. If bridges exist: score each by fragmentation impact and kill
           the top ``branching_factor`` by score.
        4. If no bridges: identify critical edges (bridges in the edge
           sense) and cut the top ones.
        """
        bf = self.brief.branching_factor
        surviving_ids = {n.id for n in graph.nodes if not n.phi}

        if not surviving_ids:
            return []

        # -- Build surviving subgraph (undirected) --------------------------
        nxg = _build_surviving_subgraph(graph, surviving_ids)

        if nxg.number_of_nodes() < 2:
            return []

        # -- Detect articulation points (bridge nodes) ---------------------
        bridge_node_ids = list(nx.articulation_points(nxg))

        if bridge_node_ids:
            # Score bridges: simulate killing each, measure fragmentation
            scored = _score_bridge_nodes(graph, nxg, bridge_node_ids, surviving_ids)
            scored.sort(key=lambda pair: pair[1], reverse=True)
            return [Event(target=node_id, action="kill") for node_id, _ in scored[:bf]]

        # -- No bridge nodes: cut critical edges (bridge edges) ------------
        bridge_edges = list(nx.bridges(nxg))

        if bridge_edges:
            # Score edges by weight of the connection (strongest first)
            scored_edges = _score_edges(graph, bridge_edges)
            scored_edges.sort(key=lambda pair: pair[1], reverse=True)
            return [
                Event(
                    target={"from": from_id, "to": to_id},
                    action="cut_edge",
                )
                for (from_id, to_id), _ in scored_edges[:bf]
            ]

        # -- Fallback: cut highest-weight edges in the surviving subgraph --
        all_edges = list(nxg.edges(data="weight", default=1.0))
        all_edges.sort(key=lambda e: e[2], reverse=True)
        events: list[Event] = []
        for u, v, _w in all_edges[:bf]:
            # Ensure we use the directed edge that exists in the original graph
            from_id, to_id = _resolve_directed_edge(graph, u, v)
            events.append(
                Event(
                    target={"from": from_id, "to": to_id},
                    action="cut_edge",
                )
            )
        return events


# ======================================================================
# Helpers
# ======================================================================


def _build_surviving_subgraph(
    graph: Graph,
    surviving_ids: set[str],
) -> nx.Graph:
    """Create an undirected networkx graph from the surviving nodes and
    edges whose both endpoints survive."""
    nxg = nx.Graph()
    for nid in surviving_ids:
        nxg.add_node(nid)
    for edge in graph.edges:
        if edge.from_id in surviving_ids and edge.to_id in surviving_ids:
            # Use max weight if both directions exist (undirected merge)
            if nxg.has_edge(edge.from_id, edge.to_id):
                existing_w = nxg[edge.from_id][edge.to_id].get("weight", 0.0)
                nxg[edge.from_id][edge.to_id]["weight"] = max(existing_w, edge.weight)
            else:
                nxg.add_edge(edge.from_id, edge.to_id, weight=edge.weight)
    return nxg


def _score_bridge_nodes(
    graph: Graph,
    nxg: nx.Graph,
    bridge_node_ids: list[str],
    surviving_ids: set[str],
) -> list[tuple[str, float]]:
    """Score each bridge node by fragmentation caused when removed.

    Fragmentation score = ``1 - (largest_fragment / (n - 1))`` where *n*
    is the number of surviving nodes before removal.
    """
    n = len(surviving_ids)
    scored: list[tuple[str, float]] = []
    for nid in bridge_node_ids:
        test_g = nxg.copy()
        test_g.remove_node(nid)
        if test_g.number_of_nodes() == 0:
            scored.append((nid, 1.0))
            continue
        components = list(nx.connected_components(test_g))
        largest = max(len(c) for c in components)
        frag_score = 1.0 - (largest / max(n - 1, 1))
        scored.append((nid, frag_score))
    return scored


def _score_edges(
    graph: Graph,
    bridge_edges: list[tuple[str, str]],
) -> list[tuple[tuple[str, str], float]]:
    """Score bridge edges by their weight (strongest = highest priority)."""
    scored: list[tuple[tuple[str, str], float]] = []
    edge_lookup: dict[tuple[str, str], float] = {
        (e.from_id, e.to_id): e.weight for e in graph.edges
    }
    for u, v in bridge_edges:
        # networkx undirected bridge -- look up either direction
        w = edge_lookup.get((u, v), edge_lookup.get((v, u), 0.0))
        # Resolve to the directed edge that actually exists
        from_id, to_id = _resolve_directed_edge(graph, u, v)
        scored.append(((from_id, to_id), w))
    return scored


def _resolve_directed_edge(graph: Graph, u: str, v: str) -> tuple[str, str]:
    """Given an undirected pair (u, v), return the directed (from, to) that
    exists in the original graph.  Prefers u->v; falls back to v->u."""
    for edge in graph.edges:
        if edge.from_id == u and edge.to_id == v:
            return (u, v)
        if edge.from_id == v and edge.to_id == u:
            return (v, u)
    # Should not happen if the subgraph was built correctly; return as-is.
    return (u, v)
