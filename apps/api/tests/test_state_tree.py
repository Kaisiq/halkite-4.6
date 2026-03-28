"""Tests for the Halkantir state tree engine (Module 4).

Covers build_state_tree, explore, backpropagate, extract_path, duplicate
pruning, ExplorationConfig, and TreeNode / StateTree data classes from
``nexus_api.engine.state_tree``.
"""

from __future__ import annotations

import pytest

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.engine.state_tree import (
    ExplorationConfig,
    StateTree,
    build_state_tree,
    extract_path,
)
from nexus_api.models.events import Event
from nexus_api.models.graph import Graph

# ---------------------------------------------------------------------------
# Minimal agent stub for controlled tree construction
# ---------------------------------------------------------------------------


class _StubAgent(Agent):
    """An agent that kills priority_targets one at a time."""

    def select_events(self, graph: Graph, depth: int) -> list[Event]:
        events: list[Event] = []
        for nid in self.brief.priority_targets:
            try:
                node = graph.get_node(nid)
            except KeyError:
                continue
            if not node.phi:
                events.append(Event(target=nid, action="kill"))
                if len(events) >= self.brief.branching_factor:
                    break
        return events


def _make_stub_agent(
    targets: list[str],
    agent_type: str = "stub_agent",
    branching: int = 2,
) -> _StubAgent:
    brief = AgentBrief(
        agent_type=agent_type,
        priority_targets=targets,
        priority_edges=[],
        focus_layers=[],
        focus_clusters=[],
        initial_events=[],
        max_depth=5,
        branching_factor=branching,
    )
    return _StubAgent(brief)


# ======================================================================
# Tests
# ======================================================================


class TestBuildStateTree:
    def test_build_state_tree(self, medium_graph: Graph) -> None:
        """Tree should have a root and at least one explored node beyond root."""
        agent = _make_stub_agent(["ceo", "cto", "server"])
        config = ExplorationConfig(max_depth=3, max_tree_nodes=200, worst_k=5)

        tree = build_state_tree(medium_graph, [agent], config)

        assert tree.root is not None
        assert tree.total_nodes_explored > 0

    def test_tree_root_health(self, medium_graph: Graph) -> None:
        """Root H should be 1.0 for a pristine graph."""
        agent = _make_stub_agent(["ceo"])
        config = ExplorationConfig(max_depth=2, max_tree_nodes=50, worst_k=3)

        tree = build_state_tree(medium_graph, [agent], config)

        assert pytest.approx(1.0) == tree.root.H

    def test_tree_depth(self, medium_graph: Graph) -> None:
        """max_depth_reached should not exceed config.max_depth."""
        max_depth = 3
        agent = _make_stub_agent(
            ["ceo", "cto", "server", "dev", "supplier", "office"],
            branching=2,
        )
        config = ExplorationConfig(
            max_depth=max_depth,
            max_tree_nodes=500,
            worst_k=5,
        )

        tree = build_state_tree(medium_graph, [agent], config)

        assert tree.max_depth_reached <= max_depth

    def test_tree_size_limit(self, medium_graph: Graph) -> None:
        """total_nodes_explored should not exceed config.max_tree_nodes."""
        limit = 20
        agent = _make_stub_agent(
            ["ceo", "cto", "server", "dev", "supplier", "office"],
            branching=3,
        )
        config = ExplorationConfig(
            max_depth=10,
            max_tree_nodes=limit,
            worst_k=5,
        )

        tree = build_state_tree(medium_graph, [agent], config)

        assert tree.total_nodes_explored <= limit


class TestWorstScenarios:
    def test_worst_scenarios(self, medium_graph: Graph) -> None:
        """worst_scenarios should be sorted by H ascending."""
        agent = _make_stub_agent(
            ["ceo", "cto", "server", "dev"],
            branching=2,
        )
        config = ExplorationConfig(max_depth=3, max_tree_nodes=200, worst_k=5)

        tree = build_state_tree(medium_graph, [agent], config)

        if len(tree.worst_scenarios) > 1:
            h_values = [n.H for n in tree.worst_scenarios]
            for i in range(len(h_values) - 1):
                assert h_values[i] <= h_values[i + 1]


class TestBackpropagation:
    def test_backpropagation(self, medium_graph: Graph) -> None:
        """After backpropagation, root.worst_descendant_H should be <= the
        worst scenario's H (since worst_scenarios are sorted H ascending)."""
        agent = _make_stub_agent(
            ["ceo", "cto", "server"],
            branching=2,
        )
        config = ExplorationConfig(max_depth=3, max_tree_nodes=200, worst_k=5)

        tree = build_state_tree(medium_graph, [agent], config)

        if tree.worst_scenarios:
            worst_leaf_H = tree.worst_scenarios[0].H
            assert tree.root.worst_descendant_H <= worst_leaf_H + 1e-9


class TestExtractPath:
    def _build_tree(self, medium_graph: Graph) -> StateTree:
        agent = _make_stub_agent(
            ["ceo", "cto", "server", "dev"],
            branching=2,
        )
        config = ExplorationConfig(max_depth=3, max_tree_nodes=200, worst_k=5)
        return build_state_tree(medium_graph, [agent], config)

    def test_extract_path_node_ids(self, medium_graph: Graph) -> None:
        """Path new_failures should contain actual node IDs, not numeric indices."""
        tree = self._build_tree(medium_graph)
        valid_ids = {n.id for n in medium_graph.nodes}

        if tree.worst_scenarios:
            leaf = tree.worst_scenarios[0]
            path = extract_path(leaf, node_ids=tree.node_ids)
            for step in path:
                for fid in step["new_failures"]:
                    assert fid in valid_ids, (
                        f"new_failures contains {fid!r} which is not a valid "
                        f"node id; expected one of {sorted(valid_ids)}"
                    )

    def test_extract_path_step_order(self, medium_graph: Graph) -> None:
        """Path steps should be in root-to-leaf order (ascending depth)."""
        tree = self._build_tree(medium_graph)

        if tree.worst_scenarios:
            leaf = tree.worst_scenarios[0]
            path = extract_path(leaf, node_ids=tree.node_ids)
            depths = [step["step"] for step in path]
            for i in range(len(depths) - 1):
                assert depths[i] <= depths[i + 1]


class TestDuplicateStatePruning:
    def test_duplicate_state_pruning(self, medium_graph: Graph) -> None:
        """Two agents killing the same nodes should not create duplicate states.

        If agent A kills [ceo] and agent B also kills [ceo], the resulting
        state (same phi vector) should be pruned the second time.
        """
        agent_a = _make_stub_agent(["ceo"], agent_type="agent_a", branching=1)
        agent_b = _make_stub_agent(["ceo"], agent_type="agent_b", branching=1)
        config = ExplorationConfig(max_depth=2, max_tree_nodes=100, worst_k=5)

        tree = build_state_tree(medium_graph, [agent_a, agent_b], config)

        # Count how many tree nodes have ceo killed (phi[0] = True) at depth 1.
        ceo_idx = medium_graph.get_node_index("ceo")
        depth_1_ceo_killed = [n for n in tree.all_nodes if n.depth == 1 and n.state.phi[ceo_idx]]
        # Should be exactly 1 (second agent's duplicate is pruned).
        assert len(depth_1_ceo_killed) == 1


class TestTreeNodeIds:
    def test_tree_node_ids(self, medium_graph: Graph) -> None:
        """tree.node_ids should match the graph's node IDs."""
        agent = _make_stub_agent(["ceo"])
        config = ExplorationConfig(max_depth=2, max_tree_nodes=50, worst_k=3)

        tree = build_state_tree(medium_graph, [agent], config)

        expected_ids = [n.id for n in medium_graph.nodes]
        assert tree.node_ids == expected_ids


class TestExplorationConfigDefaults:
    def test_exploration_config_defaults(self) -> None:
        """Verify ExplorationConfig defaults match the spec."""
        config = ExplorationConfig()
        assert config.max_depth == 5
        assert config.max_tree_nodes == 5000
        assert config.worst_k == 10
