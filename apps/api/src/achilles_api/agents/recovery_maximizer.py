"""Agent 8 -- Recovery Cost Maximizer.

Strategy: Maximise the total recovery bill.  At each depth, simulate killing
each surviving node and pick the one whose cascade produces the highest
cumulative recovery cost (sum of ``r`` for every failed node).

This agent walks the tree looking for expensive disasters — it might ignore
a node that causes massive health loss but is cheap to fix, and instead
target the one that triggers failures in slow-to-replace, high-cost nodes.

Use case: answers "what scenario costs the most to recover from?" rather
than "what scenario causes the most damage?"  Particularly relevant for
NIS2/DORA compliance where recovery time and cost are regulatory concerns.

Reference: docs/03A_AGENT_STRATEGIES.md (extension).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from achilles_api.agents.base import Agent, AgentBrief
from achilles_api.engine.cascade import cascade
from achilles_api.models.events import Event

if TYPE_CHECKING:
    from achilles_api.models.graph import Graph


class RecoveryCostMaximizer(Agent):
    """Target failures that maximise cumulative recovery cost."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(
        self,
        graph: Graph,
        depth: int,
        path: list[Event] | None = None,
    ) -> list[Event]:
        """Score surviving nodes by total recovery cost of the cascade they
        trigger, breaking ties with health loss.

        At every depth the agent re-evaluates because the recovery landscape
        changes as nodes fail — losing a cheap node might now cascade into
        an expensive cluster that was previously shielded.
        """
        bf = self.brief.branching_factor
        surviving = [n for n in graph.nodes if not n.phi]

        if not surviving:
            return []

        # Prefer priority targets at depth 0
        if depth == 0 and self.brief.priority_targets:
            priority_ids = set(self.brief.priority_targets)
            candidates = [n for n in surviving if n.id in priority_ids]
            if len(candidates) < bf:
                candidates = surviving
        else:
            candidates = surviving

        scored: list[tuple[str, float, float]] = []
        for node in candidates:
            g_copy = graph.deep_copy()
            kill_event = Event(target=node.id, action="kill")
            _log, _state, metrics = cascade(g_copy, kill_event)
            scored.append((
                node.id,
                metrics.total_recovery_cost,
                metrics.health_loss,
            ))

        # Primary: highest recovery cost. Secondary: highest health loss.
        scored.sort(key=lambda t: (t[1], t[2]), reverse=True)

        return [Event(target=nid, action="kill") for nid, _, _ in scored[:bf]]
