"""Agent 6 -- Monte Carlo Explorer.

Strategy: Generate random events (kill, damage, cut_edge) to explore failure
paths that deterministic agents would never consider.  Complements the five
strategic agents by covering the stochastic "random bad luck" space.

The agent uses Python's stdlib ``random`` module with OS-seeded entropy —
no fixed seed, truly random on every invocation.

Reference: docs/03A_AGENT_STRATEGIES.md conventions.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.mc.config import MCConfig
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Edge, Graph, Node


class MonteCarloAgent(Agent):
    """Stochastic agent that proposes random events at each tree node.

    Generates up to ``brief.branching_factor`` events per call by randomly
    sampling nodes/edges according to the configured ``failure_model``.
    """

    def __init__(self, brief: AgentBrief, mc_config: MCConfig) -> None:
        super().__init__(brief)
        self.mc_config: MCConfig = mc_config
        self._rng = random.SystemRandom()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Return up to ``branching_factor`` random events."""
        bf = self.brief.branching_factor
        surviving = self._candidate_nodes(graph)
        alive_edges = self._candidate_edges(graph)

        if not surviving:
            return []

        events: list[Event] = []
        seen: set[str] = set()

        # Attempt up to 3x branching factor draws to fill the quota
        # (some draws may collide or produce invalid events).
        max_attempts = bf * 3
        for _ in range(max_attempts):
            if len(events) >= bf:
                break

            event = self._build_event(surviving, alive_edges)
            if event is None:
                continue

            if event.action == "cut_edge":
                key = f"cut_edge:{event.target['from']}:{event.target['to']}"
            else:
                key = f"{event.action}:{event.target}"
            if key in seen:
                continue

            seen.add(key)
            events.append(event)

        # Ensure root exploration always includes one low-probability surprise
        # branch so Monte Carlo contributes a distinct subtree alongside
        # deterministic agents.
        if depth == 0 and self.mc_config.kill_prob + self.mc_config.damage_prob > 0.0:
            self._ensure_root_diversity(events, seen, surviving)

        return events

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _candidate_nodes(graph: Graph) -> list[Node]:
        return [n for n in graph.nodes if not n.phi]

    @staticmethod
    def _candidate_edges(graph: Graph) -> list[Edge]:
        node_index = graph.node_index
        return [
            e
            for e in graph.edges
            if (
                not graph.nodes[node_index[e.from_id]].phi
                and not graph.nodes[node_index[e.to_id]].phi
            )
        ]

    def _node_weights(self, candidates: list[Node]) -> list[float]:
        """Compute selection weights based on failure_model."""
        model = self.mc_config.failure_model

        if model == "uniform":
            return [1.0] * len(candidates)

        if model == "weighted_theta":
            weights = [n.theta for n in candidates]
            if sum(weights) == 0.0:
                return [1.0] * len(candidates)
            return weights

        # per_node
        probs = self.mc_config.per_node_probs
        weights = [probs.get(n.id, 1.0) for n in candidates]
        if sum(weights) == 0.0:
            return [1.0] * len(candidates)
        return weights

    def _pick_action(self, has_edges: bool) -> str:
        """Sample an action type based on configured probabilities."""
        cfg = self.mc_config
        roll = self._rng.random()

        if roll < cfg.kill_prob:
            return "kill"
        if roll < cfg.kill_prob + cfg.damage_prob:
            return "damage"

        # cut_edge — fall back to kill/damage if no edges available
        if has_edges:
            return "cut_edge"
        return "kill" if self._rng.random() < 0.5 else "damage"

    def _build_event(
        self,
        candidates: list[Node],
        alive_edges: list[Edge],
    ) -> Event | None:
        """Build a single random event."""
        if not candidates:
            return None

        action = self._pick_action(has_edges=bool(alive_edges))
        cfg = self.mc_config

        if action == "cut_edge":
            if not alive_edges:
                return None
            edge = self._rng.choice(alive_edges)
            return Event(
                target={"from": edge.from_id, "to": edge.to_id},
                action="cut_edge",
            )

        # kill or damage — pick a node
        weights = self._node_weights(candidates)
        node = self._rng.choices(candidates, weights=weights, k=1)[0]

        if action == "kill":
            return Event(target=node.id, action="kill")

        # damage
        magnitude = self._rng.uniform(
            cfg.damage_magnitude_min,
            cfg.damage_magnitude_max,
        )
        return Event(target=node.id, action="damage", magnitude=magnitude)

    def _ensure_root_diversity(
        self,
        events: list[Event],
        seen: set[str],
        candidates: list[Node],
    ) -> None:
        if not candidates:
            return

        fallback = min(candidates, key=lambda node: (node.theta, node.id))
        key = f"kill:{fallback.id}"
        if key in seen:
            return

        event = Event(target=fallback.id, action="kill")
        if len(events) < self.brief.branching_factor:
            events.append(event)
        else:
            events[-1] = event
