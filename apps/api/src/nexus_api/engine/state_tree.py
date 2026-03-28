"""Module 4 -- State Tree.

Data structure storing all explored failure scenarios.  The state tree is a
rooted tree where each node represents a network state and each edge represents
an event that transforms one state into another.  Multiple agents explore this
tree, building different branches based on their strategies.

Public API
----------
build_state_tree(graph, agents, config) -- construct and explore the full tree.
explore(tree, parent, agent, config)    -- recursive per-agent exploration.
rebuild_graph_from_state(graph, state)  -- reconstruct a Graph from a State.
is_duplicate_state(tree, phi)           -- duplicate-state pruning check.
backpropagate(tree)                     -- propagate worst-case info upward.
extract_path(leaf)                      -- root-to-leaf disaster path.
tree_stats(tree)                        -- summary statistics for the tree.

References: docs/04_STATE_TREE.md
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from nexus_api.agents.base import Agent
from nexus_api.engine.cascade import cascade
from nexus_api.models.events import Event
from nexus_api.models.graph import Graph, State

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class TreeNode:
    """A single node in the exploration state tree.

    Each tree node captures a complete network state snapshot together with
    metrics that describe the damage at this point and backpropagated
    worst-case information from descendants.
    """

    __slots__ = (
        "H",
        "agent",
        "children",
        "cumulative_loss",
        "delta_H",
        "depth",
        "event",
        "failed_count",
        "id",
        "parent",
        "recovery_cost",
        "state",
        "worst_descendant_H",
        "worst_path",
    )

    def __init__(
        self,
        *,
        id: str,
        state: State,
        parent: TreeNode | None,
        children: list[TreeNode] | None = None,
        event: Event | None,
        agent: str,
        depth: int,
        H: float,
        delta_H: float,
        cumulative_loss: float,
        failed_count: int,
        recovery_cost: float,
        worst_descendant_H: float,
        worst_path: list[Event] | None = None,
    ) -> None:
        self.id: str = id
        self.state: State = state
        self.parent: TreeNode | None = parent
        self.children: list[TreeNode] = children if children is not None else []
        self.event: Event | None = event
        self.agent: str = agent
        self.depth: int = depth
        self.H: float = H
        self.delta_H: float = delta_H
        self.cumulative_loss: float = cumulative_loss
        self.failed_count: int = failed_count
        self.recovery_cost: float = recovery_cost
        self.worst_descendant_H: float = worst_descendant_H
        self.worst_path: list[Event] = worst_path if worst_path is not None else []

    def __repr__(self) -> str:
        return (
            f"TreeNode(id={self.id!r}, depth={self.depth}, "
            f"H={self.H:.4f}, agent={self.agent!r})"
        )

    def to_dict(self) -> dict[str, Any]:
        """JSON-safe serialisation (non-recursive to avoid deep nesting)."""
        return {
            "id": self.id,
            "state": self.state.to_dict(),
            "parent_id": self.parent.id if self.parent is not None else None,
            "children_ids": [c.id for c in self.children],
            "event": self.event.to_dict() if self.event is not None else None,
            "agent": self.agent,
            "depth": self.depth,
            "H": self.H,
            "delta_H": self.delta_H,
            "cumulative_loss": self.cumulative_loss,
            "failed_count": self.failed_count,
            "recovery_cost": self.recovery_cost,
            "worst_descendant_H": self.worst_descendant_H,
            "worst_path": [e.to_dict() for e in self.worst_path],
        }


class StateTree:
    """Container for the full exploration tree.

    Holds the root node, a flat index of every node, the worst-case leaf
    scenarios, and aggregate statistics.
    """

    __slots__ = (
        "agents_used",
        "all_nodes",
        "max_depth_reached",
        "node_ids",
        "root",
        "total_nodes_explored",
        "worst_scenarios",
    )

    def __init__(
        self,
        *,
        root: TreeNode,
        all_nodes: list[TreeNode] | None = None,
        worst_scenarios: list[TreeNode] | None = None,
        total_nodes_explored: int = 1,
        max_depth_reached: int = 0,
        agents_used: list[str] | None = None,
        node_ids: list[str] | None = None,
    ) -> None:
        self.root: TreeNode = root
        self.all_nodes: list[TreeNode] = (
            all_nodes if all_nodes is not None else [root]
        )
        self.worst_scenarios: list[TreeNode] = (
            worst_scenarios if worst_scenarios is not None else []
        )
        self.total_nodes_explored: int = total_nodes_explored
        self.max_depth_reached: int = max_depth_reached
        self.agents_used: list[str] = agents_used if agents_used is not None else []
        self.node_ids: list[str] = node_ids if node_ids is not None else []

    def __repr__(self) -> str:
        return (
            f"StateTree(nodes={self.total_nodes_explored}, "
            f"max_depth={self.max_depth_reached}, "
            f"agents={self.agents_used})"
        )


class ExplorationConfig:
    """Tuneable knobs for state-tree exploration."""

    __slots__ = ("max_depth", "max_tree_nodes", "worst_k")

    def __init__(
        self,
        *,
        max_depth: int = 5,
        max_tree_nodes: int = 5000,
        worst_k: int = 10,
    ) -> None:
        self.max_depth: int = max_depth
        self.max_tree_nodes: int = max_tree_nodes
        self.worst_k: int = worst_k

    def __repr__(self) -> str:
        return (
            f"ExplorationConfig(max_depth={self.max_depth}, "
            f"max_tree_nodes={self.max_tree_nodes}, worst_k={self.worst_k})"
        )


# ---------------------------------------------------------------------------
# Graph / state helpers
# ---------------------------------------------------------------------------


def rebuild_graph_from_state(original_graph: Graph, state: State) -> Graph:
    """Create a deep copy of *original_graph* with health and failure values
    taken from *state*.

    The topology (edges, theta, r, layers) comes from the original graph; only
    ``h`` and ``phi`` are overwritten from the state snapshot.
    """
    g = original_graph.deep_copy()
    for i, node in enumerate(g.nodes):
        node.h = state.h[i]
        node.phi = state.phi[i]
    g._sync_nodes_to_vectors()
    return g


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------


def is_duplicate_state(tree: StateTree, phi: list[bool]) -> bool:
    """Return ``True`` if any existing tree node has the same failure pattern.

    Two states are considered duplicates when exactly the same set of nodes
    has failed (``phi`` vectors are identical).  This prevents the tree from
    exploring the same failure configuration via different paths.
    """
    for existing in tree.all_nodes:
        if existing.state.phi == phi:
            return True
    return False


# ---------------------------------------------------------------------------
# Exploration
# ---------------------------------------------------------------------------


def explore(
    tree: StateTree,
    parent: TreeNode,
    agent: Agent,
    config: ExplorationConfig,
    original_graph: Graph,
) -> None:
    """Recursively explore the state tree from *parent* using *agent*.

    Pruning rules (applied in order):
    1. Depth limit reached.
    2. Tree size limit reached.
    3. Network effectively dead (H <= 0.05).

    For each event returned by the agent, a cascade is simulated on a fresh
    copy of the graph and, if the resulting state is novel, a new child node
    is appended to the tree.
    """
    # -- Pruning checks ----------------------------------------------------
    if parent.depth >= config.max_depth:
        return

    if tree.total_nodes_explored >= config.max_tree_nodes:
        return

    if parent.H <= 0.05:
        return

    # -- Ask agent for events to explore -----------------------------------
    graph_for_agent = rebuild_graph_from_state(original_graph, parent.state)
    events: list[Event] = agent.select_events(graph_for_agent, parent.depth)

    for event in events:
        # Respect tree size cap between events as well.
        if tree.total_nodes_explored >= config.max_tree_nodes:
            return

        # Apply event + cascade on a fresh copy.
        g_copy = rebuild_graph_from_state(original_graph, parent.state)
        try:
            _cascade_log, new_state, _metrics = cascade(g_copy, event)
        except (ValueError, KeyError) as exc:
            # Invalid event (e.g. targets a non-existent node) -- skip.
            logger.debug("Skipping event %s: %s", event, exc)
            continue

        # Duplicate-state pruning.
        if is_duplicate_state(tree, new_state.phi):
            continue

        # Compute metrics for the new node.
        new_H: float = new_state.H
        delta_H: float = parent.H - new_H
        cumulative_loss: float = tree.root.H - new_H
        failed_count: int = sum(new_state.phi)
        recovery_cost: float = sum(
            g_copy.nodes[i].r for i, phi in enumerate(new_state.phi) if phi
        )

        child = TreeNode(
            id=str(uuid.uuid4()),
            state=new_state,
            parent=parent,
            event=event,
            agent=agent.brief.agent_type,
            depth=parent.depth + 1,
            H=new_H,
            delta_H=delta_H,
            cumulative_loss=cumulative_loss,
            failed_count=failed_count,
            recovery_cost=recovery_cost,
            worst_descendant_H=new_H,
            worst_path=list(parent.worst_path) + [event],
        )

        parent.children.append(child)
        tree.all_nodes.append(child)
        tree.total_nodes_explored += 1
        tree.max_depth_reached = max(tree.max_depth_reached, child.depth)

        # Recurse.
        explore(tree, child, agent, config, original_graph)


# ---------------------------------------------------------------------------
# Backpropagation
# ---------------------------------------------------------------------------


def backpropagate(tree: StateTree) -> None:
    """Post-order traversal that propagates worst-case health upward.

    After this pass every internal node knows the lowest ``H`` reachable
    from any of its descendants and the event path to get there.
    """

    def _backprop(node: TreeNode) -> None:
        if not node.children:
            # Leaf -- worst descendant is itself.
            node.worst_descendant_H = node.H
            return

        for child in node.children:
            _backprop(child)

        worst_child: TreeNode = min(
            node.children, key=lambda c: c.worst_descendant_H
        )

        if worst_child.worst_descendant_H < node.worst_descendant_H:
            node.worst_descendant_H = worst_child.worst_descendant_H
            node.worst_path = list(worst_child.worst_path)

    _backprop(tree.root)


# ---------------------------------------------------------------------------
# Path extraction
# ---------------------------------------------------------------------------


def extract_path(
    leaf: TreeNode,
    node_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Walk from *leaf* to root and return the disaster story in root-to-leaf
    order.

    Each element in the returned list describes one step:

    * ``step`` -- tree depth at this point
    * ``event`` -- the :class:`Event` that was applied
    * ``agent`` -- which agent proposed the event
    * ``H_before`` -- network health before this event
    * ``H_after`` -- network health after
    * ``delta_H`` -- health lost
    * ``new_failures`` -- node ids that failed in this step but not the parent
    * ``recovery_cost_so_far`` -- cumulative recovery cost
    """
    path: list[dict[str, Any]] = []
    current: TreeNode | None = leaf

    while current is not None and current.parent is not None:
        parent_state = current.parent.state
        current_state = current.state

        # Identify nodes that failed at this step but not at the parent.
        new_failures: list[str] = []
        for i, (cur_phi, par_phi) in enumerate(
            zip(current_state.phi, parent_state.phi, strict=True)
        ):
            if cur_phi and not par_phi:
                if node_ids and i < len(node_ids):
                    new_failures.append(node_ids[i])
                else:
                    new_failures.append(str(i))

        path.append(
            {
                "step": current.depth,
                "event": current.event,
                "agent": current.agent,
                "H_before": current.parent.H,
                "H_after": current.H,
                "delta_H": current.delta_H,
                "new_failures": new_failures,
                "recovery_cost_so_far": current.recovery_cost,
            }
        )
        current = current.parent

    path.reverse()
    return path


# ---------------------------------------------------------------------------
# Tree statistics
# ---------------------------------------------------------------------------


def tree_stats(tree: StateTree) -> dict[str, Any]:
    """Compute summary statistics for the exploration tree.

    Returns a dict with total nodes, max depth, per-agent breakdowns, leaf
    health distribution, worst H per agent, and pruning counters.
    """
    # -- Per-agent stats ---------------------------------------------------
    agent_nodes: dict[str, list[TreeNode]] = {}
    for node in tree.all_nodes:
        agent_nodes.setdefault(node.agent, []).append(node)

    agent_stats: dict[str, dict[str, Any]] = {}
    for agent_name, nodes in agent_nodes.items():
        if agent_name == "root":
            continue
        h_values = [n.H for n in nodes]
        delta_values = [n.delta_H for n in nodes]
        unique_failures: set[int] = set()
        for n in nodes:
            for i, phi in enumerate(n.state.phi):
                if phi:
                    unique_failures.add(i)

        agent_stats[agent_name] = {
            "nodes_explored": len(nodes),
            "worst_H_found": min(h_values) if h_values else 1.0,
            "avg_delta_H": (
                sum(delta_values) / len(delta_values)
                if delta_values
                else 0.0
            ),
            "unique_failures_found": len(unique_failures),
        }

    # -- Leaf health distribution ------------------------------------------
    leaves = [n for n in tree.all_nodes if not n.children]
    leaf_h_values = sorted([n.H for n in leaves])

    # Build a simple histogram (10 buckets from 0.0 to 1.0).
    bucket_count = 10
    h_distribution: dict[str, int] = {}
    for i in range(bucket_count):
        lo = i / bucket_count
        hi = (i + 1) / bucket_count
        label = f"{lo:.1f}-{hi:.1f}"
        h_distribution[label] = sum(
            1 for h in leaf_h_values if lo <= h < hi
        )
    # Include values exactly equal to 1.0 in the last bucket.
    if leaf_h_values and leaf_h_values[-1] == 1.0:
        last_label = f"{(bucket_count - 1) / bucket_count:.1f}-1.0"
        h_distribution[last_label] = h_distribution.get(last_label, 0) + sum(
            1 for h in leaf_h_values if h == 1.0
        )

    # -- Worst H per agent -------------------------------------------------
    worst_per_agent: dict[str, float] = {}
    for agent_name, nodes in agent_nodes.items():
        if agent_name == "root":
            continue
        agent_leaves = [n for n in nodes if not n.children]
        if agent_leaves:
            worst_per_agent[agent_name] = min(n.H for n in agent_leaves)

    return {
        "total_nodes": tree.total_nodes_explored,
        "max_depth": tree.max_depth_reached,
        "agent_stats": agent_stats,
        "H_distribution": h_distribution,
        "worst_per_agent": worst_per_agent,
        "leaf_count": len(leaves),
        "worst_scenario_count": len(tree.worst_scenarios),
    }


# ---------------------------------------------------------------------------
# Top-level builder
# ---------------------------------------------------------------------------


def build_state_tree(
    graph: Graph,
    agents: list[Agent],
    config: ExplorationConfig | None = None,
) -> StateTree:
    """Construct the full state tree by having every agent explore from root.

    Parameters
    ----------
    graph : Graph
        The network graph in its initial (all-healthy) state.
    agents : list[Agent]
        Agents that will propose events for exploration.
    config : ExplorationConfig | None
        Exploration limits.  Defaults to ``ExplorationConfig()`` if *None*.

    Returns
    -------
    StateTree
        The fully explored and backpropagated state tree.
    """
    if config is None:
        config = ExplorationConfig()

    # -- Build root node from pristine graph state -------------------------
    initial_state: State = graph.snapshot()
    root_H: float = initial_state.H

    root = TreeNode(
        id=str(uuid.uuid4()),
        state=initial_state,
        parent=None,
        event=None,
        agent="root",
        depth=0,
        H=root_H,
        delta_H=0.0,
        cumulative_loss=0.0,
        failed_count=0,
        recovery_cost=0.0,
        worst_descendant_H=root_H,
    )

    tree = StateTree(
        root=root,
        all_nodes=[root],
        total_nodes_explored=1,
        max_depth_reached=0,
        agents_used=[a.brief.agent_type for a in agents],
        node_ids=[n.id for n in graph.nodes],
    )

    # -- Each agent explores from the root ---------------------------------
    for agent in agents:
        logger.info(
            "Agent %s starting exploration (tree size: %d)",
            agent.brief.agent_type,
            tree.total_nodes_explored,
        )
        explore(tree, root, agent, config, graph)
        logger.info(
            "Agent %s finished (tree size: %d)",
            agent.brief.agent_type,
            tree.total_nodes_explored,
        )

    # -- Collect worst scenarios (leaves sorted by H ascending) ------------
    leaves = [n for n in tree.all_nodes if not n.children]
    leaves.sort(key=lambda n: n.H)
    tree.worst_scenarios = leaves[: config.worst_k]

    # -- Backpropagate worst-case information upward -----------------------
    backpropagate(tree)

    logger.info(
        "State tree complete: %d nodes, max depth %d, %d worst scenarios",
        tree.total_nodes_explored,
        tree.max_depth_reached,
        len(tree.worst_scenarios),
    )

    return tree
