"""Agent 1 -- Critical Node Attacker.

Strategy: Always kill the highest-impact surviving node.  Greedy, state-aware,
recalculates at every depth.  Finds the steepest single-chain collapse path.

Reference: docs/03A_AGENT_STRATEGIES.md -- Agent 1.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.engine.cascade import cascade
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph


class CriticalNodeAttacker(Agent):
    """Greedy agent that always kills whichever surviving node causes the
    largest health loss when removed."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Score every surviving candidate by simulated damage, return top-k.

        1. Collect surviving nodes (``phi == False``).
        2. Prefer ``brief.priority_targets`` if enough candidates remain.
        3. For each candidate, deep-copy the graph, kill the node via
           cascade, and score as ``H_before - H_after``.
        4. Return the top ``branching_factor`` events sorted by score desc.
        """
        bf = self.brief.branching_factor
        surviving = [n for n in graph.nodes if not n.phi]

        if not surviving:
            return []

        # Prefer priority targets that are still alive
        priority_ids = set(self.brief.priority_targets)
        candidates = [n for n in surviving if n.id in priority_ids]
        if len(candidates) < bf:
            candidates = surviving

        h_before = graph.network_health()

        scored: list[tuple[str, float]] = []
        for node in candidates:
            g_copy = graph.deep_copy()
            kill_event = Event(target=node.id, action="kill")
            _, final_state, metrics = cascade(g_copy, kill_event)
            h_after = final_state.H
            score = h_before - h_after
            scored.append((node.id, score))

        scored.sort(key=lambda pair: pair[1], reverse=True)

        return [Event(target=node_id, action="kill") for node_id, _ in scored[:bf]]
