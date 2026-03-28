"""Module 3A -- Agent base interface.

Defines the abstract agent contract that every exploration strategy must
implement.  The state-tree driver (Module 4) depends only on this interface,
keeping agent logic fully decoupled from tree mechanics.

Public API
----------
AgentBrief   -- immutable briefing payload produced by Module 3.
Agent        -- abstract base class for all agent strategies.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph

from nexus_api.models.events import Event

# ======================================================================
# AgentBrief
# ======================================================================


class AgentBrief:
    """Immutable briefing packet that configures one agent's exploration.

    Produced by :mod:`nexus_api.briefing.briefing` (Module 3).  Each field
    maps directly to the specification in ``docs/03_AGENT_BRIEFING.md``.

    Parameters
    ----------
    agent_type : str
        Identifier for the agent strategy (e.g. ``"critical_node_attacker"``).
    priority_targets : list[str]
        Ordered list of node ids to attack first.
    priority_edges : list[tuple[str, str]]
        Ordered list of ``(from_id, to_id)`` edge pairs to cut first.
    focus_layers : list[str]
        Layer names the agent should concentrate on.  Empty means all layers.
    focus_clusters : list[int]
        Cluster indices to target.  Empty means not cluster-focused.
    initial_events : list[Event]
        Suggested first moves.
    max_depth : int
        Maximum tree depth for state-tree exploration.
    branching_factor : int
        Number of branches to explore at each tree level.
    """

    __slots__ = (
        "agent_type",
        "branching_factor",
        "focus_clusters",
        "focus_layers",
        "initial_events",
        "max_depth",
        "priority_edges",
        "priority_targets",
    )

    def __init__(
        self,
        agent_type: str,
        priority_targets: list[str],
        priority_edges: list[tuple[str, str]],
        focus_layers: list[str],
        focus_clusters: list[int],
        initial_events: list[Event],
        max_depth: int,
        branching_factor: int,
    ) -> None:
        self.agent_type: str = agent_type
        self.priority_targets: list[str] = priority_targets
        self.priority_edges: list[tuple[str, str]] = priority_edges
        self.focus_layers: list[str] = focus_layers
        self.focus_clusters: list[int] = focus_clusters
        self.initial_events: list[Event] = initial_events
        self.max_depth: int = max_depth
        self.branching_factor: int = branching_factor

    def __repr__(self) -> str:
        return (
            f"AgentBrief(type={self.agent_type!r}, "
            f"targets={len(self.priority_targets)}, "
            f"depth={self.max_depth}, "
            f"branching={self.branching_factor})"
        )


# ======================================================================
# Agent (abstract base)
# ======================================================================


class Agent(ABC):
    """Abstract base for all agent strategies.

    Every concrete agent receives an :class:`AgentBrief` and must implement
    :meth:`select_events`, which the state-tree driver calls at every tree
    node to decide which branches to explore next.
    """

    def __init__(self, brief: AgentBrief) -> None:
        self.brief: AgentBrief = brief

    @abstractmethod
    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        """Given the current graph state and tree depth, return events to explore.

        Parameters
        ----------
        graph : Graph
            The current network state.  Nodes carry live ``h`` / ``phi``
            values reflecting all events applied on the path from the tree
            root to this node.  **Must not be mutated** -- agents should
            use ``graph.deep_copy()`` for any trial simulations.
        depth : int
            Current depth in the state tree (0 at the root).

        Returns
        -------
        list[Event]
            Up to ``brief.branching_factor`` events.  Each event becomes a
            child branch in the state tree.
        """
        ...

    def __repr__(self) -> str:
        return f"{type(self).__name__}(brief={self.brief!r})"
