"""Tests for the NEXUS results ranking module (Module 4A).

Covers extract_scenarios, generate_recommendations, precompute_animation,
build_final_report, and the Scenario / Recommendation / FinalReport data
classes from ``nexus_api.results.ranking``.
"""

from __future__ import annotations

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.engine.state_tree import (
    ExplorationConfig,
    StateTree,
    build_state_tree,
)
from nexus_api.engine.weakpoint import VulnerabilityReport, run_full_analysis
from nexus_api.models.events import Event
from nexus_api.models.graph import Graph
from nexus_api.results.ranking import (
    AnimationFrame,
    FinalReport,
    build_final_report,
    extract_scenarios,
    generate_recommendations,
    precompute_animation,
)

# ---------------------------------------------------------------------------
# Minimal agent stub (same as in test_state_tree)
# ---------------------------------------------------------------------------


class _StubAgent(Agent):
    """Agent that kills priority_targets one at a time."""

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


# ---------------------------------------------------------------------------
# Shared helper: build a tree + vulnerability report from medium_graph
# ---------------------------------------------------------------------------


def _build_tree_and_report(
    graph: Graph,
) -> tuple[StateTree, VulnerabilityReport]:
    """Run weakpoint analysis and state tree exploration on the graph."""
    vr = run_full_analysis(graph)
    agent = _make_stub_agent(
        ["ceo", "cto", "server", "dev", "supplier", "office"],
        branching=2,
    )
    config = ExplorationConfig(max_depth=3, max_tree_nodes=200, worst_k=5)
    tree = build_state_tree(graph, [agent], config)
    return tree, vr


# ======================================================================
# Tests — Scenario extraction
# ======================================================================


class TestExtractScenarios:
    def test_extract_scenarios(self, medium_graph: Graph) -> None:
        """Scenarios should be sorted by severity descending."""
        tree, _vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=10)

        assert len(scenarios) > 0
        severities = [s.severity for s in scenarios]
        for i in range(len(severities) - 1):
            assert severities[i] >= severities[i + 1]

    def test_scenario_severity_range(self, medium_graph: Graph) -> None:
        """Every scenario's severity should be in [0, 1]."""
        tree, _vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=10)

        for sc in scenarios:
            assert 0.0 <= sc.severity <= 1.0, (
                f"Scenario rank={sc.rank} has severity={sc.severity} "
                f"outside [0, 1]"
            )

    def test_scenario_deduplication(self, medium_graph: Graph) -> None:
        """Duplicate failure sets should be merged so that each unique
        failure-set appears at most once in the returned scenarios."""
        tree, _vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=50)

        failure_sets_seen: list[frozenset[str]] = []
        for sc in scenarios:
            key = frozenset(sc.failed_nodes)
            assert key not in failure_sets_seen, (
                f"Duplicate failure set found: {sorted(key)}"
            )
            failure_sets_seen.append(key)


# ======================================================================
# Tests — Recommendations
# ======================================================================


class TestRecommendations:
    def test_recommendations_generated(self, medium_graph: Graph) -> None:
        """At least one recommendation should be generated for a non-trivial graph."""
        tree, vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=10)
        recs = generate_recommendations(scenarios, vr, medium_graph)

        assert len(recs) >= 1

    def test_recommendation_types(self, medium_graph: Graph) -> None:
        """Every recommendation type should come from the expected set."""
        expected_types = {
            "add_redundancy",
            "add_bypass",
            "reduce_recovery_time",
            "increase_layer_autonomy",
        }

        tree, vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=10)
        recs = generate_recommendations(scenarios, vr, medium_graph)

        for rec in recs:
            assert rec.type in expected_types, (
                f"Recommendation type {rec.type!r} not in {expected_types}"
            )


# ======================================================================
# Tests — Animation
# ======================================================================


class TestAnimation:
    def test_animation_frames(self, medium_graph: Graph) -> None:
        """precompute_animation should return frames with node_healths."""
        tree, _vr = _build_tree_and_report(medium_graph)
        scenarios = extract_scenarios(tree, medium_graph, top_k=5)

        assert len(scenarios) > 0
        sc = scenarios[0]

        frames = precompute_animation(sc, medium_graph)

        # At least the initial frame.
        assert len(frames) >= 1
        # Every frame should have node_healths.
        for frame in frames:
            assert isinstance(frame, AnimationFrame)
            assert isinstance(frame.node_healths, dict)
            assert len(frame.node_healths) == len(medium_graph.nodes)


# ======================================================================
# Tests — Final report
# ======================================================================


class TestFinalReport:
    def test_build_final_report(self, medium_graph: Graph) -> None:
        """FinalReport should have all top-level fields populated."""
        tree, vr = _build_tree_and_report(medium_graph)
        report = build_final_report(medium_graph, tree, vr)

        assert isinstance(report, FinalReport)
        assert report.metadata is not None
        assert "timestamp" in report.metadata
        assert "graph_size" in report.metadata
        assert "tree_stats" in report.metadata
        assert report.network_health is not None
        assert "overall" in report.network_health
        assert "per_layer" in report.network_health
        assert isinstance(report.worst_scenarios, list)
        assert isinstance(report.recommendations, list)
        assert isinstance(report.visualization_data, dict)

    def test_visualization_data_has_state_tree(self, medium_graph: Graph) -> None:
        """visualization_data should contain a 'state_tree' key with nodes and edges."""
        tree, vr = _build_tree_and_report(medium_graph)
        report = build_final_report(medium_graph, tree, vr)

        viz = report.visualization_data
        assert "state_tree" in viz
        assert "nodes" in viz["state_tree"]
        assert "edges" in viz["state_tree"]
        assert len(viz["state_tree"]["nodes"]) > 0
