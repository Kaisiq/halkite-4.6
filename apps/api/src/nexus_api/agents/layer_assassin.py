"""Agent 4 -- Layer Assassin.

Strategy: Systematically destroy one layer, then observe cross-layer cascading.
Targets the highest-theta surviving node in the focus layer.  When the target
layer is fully destroyed, switches to attacking the most-damaged surviving
nodes in other layers to amplify cross-layer cascade damage.

Reference: docs/03A_AGENT_STRATEGIES.md -- Agent 4.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph


class LayerAssassin(Agent):
    """Focused destruction of a single layer, then cross-layer exploitation."""

    def __init__(self, brief: AgentBrief) -> None:
        super().__init__(brief)

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Kill highest-theta survivors in the target layer; fall back to
        weakest survivors in other layers once the target is fully dead.

        Parameters
        ----------
        graph : Graph
            Current network state with live ``h`` / ``phi``.
        depth : int
            Current depth in the state tree.
        """
        bf = self.brief.branching_factor

        if not self.brief.focus_layers:
            # No target layer specified -- nothing to do.
            return []

        target_layer = self.brief.focus_layers[0]

        # Surviving nodes in the target layer
        layer_survivors = [
            n for n in graph.nodes
            if not n.phi and n.layer == target_layer
        ]

        if layer_survivors:
            # Kill highest-theta surviving node(s) in target layer
            layer_survivors.sort(key=lambda n: n.theta, reverse=True)
            return [
                Event(target=n.id, action="kill")
                for n in layer_survivors[:bf]
            ]

        # Target layer is fully destroyed -- attack most-damaged survivors
        # in OTHER layers (lowest h first) to amplify cascade effects.
        other_survivors = [
            n for n in graph.nodes
            if not n.phi and n.layer != target_layer
        ]

        if not other_survivors:
            return []

        # Sort by health ascending (most damaged first -- easiest to finish)
        other_survivors.sort(key=lambda n: n.h)

        return [
            Event(target=n.id, action="kill")
            for n in other_survivors[:bf]
        ]
