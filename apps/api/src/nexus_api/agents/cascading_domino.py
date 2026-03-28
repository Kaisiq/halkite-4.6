"""Agent 7 -- Cascading Domino.

Strategy: At each depth, pick the event that triggers the *longest* cascade
chain — the most propagation steps before the network stabilises.  This agent
doesn't care about raw health loss; it hunts for chain reactions.  A single
well-placed failure that cascades through 6 hops is more interesting to this
agent than killing the CEO outright.

This is a tree-walking agent: it evaluates the *current* damaged state at
every depth and simulates each candidate to measure cascade depth, not
just health loss.  It discovers "domino paths" that other agents miss
because they optimise for different objectives.

Reference: docs/03A_AGENT_STRATEGIES.md (extension).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.engine.cascade import cascade
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph


class CascadingDomino(Agent):
    """Hunt for the longest cascade chain at each tree depth."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Score surviving nodes by cascade *depth* (propagation steps),
        breaking ties with cascade *size* (fraction of nodes affected).

        At depth 0, uses priority targets from the brief.  At deeper levels,
        considers all surviving nodes — the network topology has changed and
        new domino chains may have formed.
        """
        bf = self.brief.branching_factor
        surviving = [n for n in graph.nodes if not n.phi]

        if not surviving:
            return []

        # At depth 0 prefer priority targets; deeper levels scan all survivors
        if depth == 0 and self.brief.priority_targets:
            priority_ids = set(self.brief.priority_targets)
            candidates = [n for n in surviving if n.id in priority_ids]
            if len(candidates) < bf:
                candidates = surviving
        else:
            candidates = surviving

        scored: list[tuple[str, int, float, float]] = []
        for node in candidates:
            g_copy = graph.deep_copy()
            kill_event = Event(target=node.id, action="kill")
            cascade_log, final_state, metrics = cascade(g_copy, kill_event)
            # Primary sort: cascade depth (longer chains first)
            # Secondary sort: cascade size (more damage on tie)
            # Tertiary sort: health loss
            scored.append((
                node.id,
                metrics.cascade_depth,
                metrics.cascade_size,
                metrics.health_loss,
            ))

        # Sort by cascade depth desc, then cascade size desc, then health_loss desc
        scored.sort(key=lambda t: (t[1], t[2], t[3]), reverse=True)

        return [Event(target=nid, action="kill") for nid, _, _, _ in scored[:bf]]
