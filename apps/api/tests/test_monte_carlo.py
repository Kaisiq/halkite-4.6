"""Tests for Monte Carlo agent, config, and resilience analysis."""

from __future__ import annotations

import itertools

import pytest

from achilles_api.agents.base import Agent, AgentBrief
from achilles_api.agents.monte_carlo import MonteCarloAgent
from achilles_api.briefing.briefing import brief_monte_carlo, create_all_agents
from achilles_api.mc.config import MCConfig
from achilles_api.mc.resilience import ResilienceProfile, run_resilience_analysis
from achilles_api.models.events import Event
from achilles_api.models.graph import Graph

# ---------------------------------------------------------------------------
# MCConfig tests
# ---------------------------------------------------------------------------


class TestMCConfig:
    def test_defaults(self) -> None:
        cfg = MCConfig()
        assert cfg.failure_model == "uniform"
        assert cfg.kill_prob == 0.4
        assert cfg.damage_prob == 0.4
        assert cfg.branching_factor == 8
        assert cfg.n_resilience_samples == 500

    def test_from_dict(self) -> None:
        cfg = MCConfig.from_dict(
            {
                "failure_model": "weighted_theta",
                "branching_factor": 4,
                "n_resilience_samples": 100,
                "unknown_key": "ignored",
            }
        )
        assert cfg.failure_model == "weighted_theta"
        assert cfg.branching_factor == 4
        assert cfg.n_resilience_samples == 100

    def test_invalid_failure_model(self) -> None:
        with pytest.raises(ValueError, match="Unknown failure_model"):
            MCConfig(failure_model="invalid")

    def test_prob_sum_exceeds_one(self) -> None:
        with pytest.raises(ValueError, match=r"kill_prob.*damage_prob"):
            MCConfig(kill_prob=0.6, damage_prob=0.6)

    def test_max_resilience_cap(self) -> None:
        cfg = MCConfig(n_resilience_samples=999999)
        assert cfg.n_resilience_samples == 5000


# ---------------------------------------------------------------------------
# MonteCarloAgent tests
# ---------------------------------------------------------------------------


class TestMonteCarloAgent:
    def test_isinstance_agent(self, small_graph: Graph) -> None:
        cfg = MCConfig(branching_factor=3)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        assert isinstance(agent, Agent)
        assert isinstance(brief, AgentBrief)

    def test_select_events_returns_list(self, small_graph: Graph) -> None:
        cfg = MCConfig(branching_factor=4)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        assert isinstance(events, list)
        assert len(events) <= 4
        for e in events:
            assert isinstance(e, Event)

    def test_select_events_respects_branching_factor(
        self,
        small_graph: Graph,
    ) -> None:
        cfg = MCConfig(branching_factor=2)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        assert len(events) <= 2

    def test_select_events_all_dead_returns_empty(
        self,
        small_graph: Graph,
    ) -> None:
        for n in small_graph.nodes:
            n.phi = True
        cfg = MCConfig(branching_factor=4)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        assert events == []

    def test_events_target_existing_nodes(self, small_graph: Graph) -> None:
        cfg = MCConfig(branching_factor=4)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        node_ids = {n.id for n in small_graph.nodes}
        edge_pairs = {(e.from_id, e.to_id) for e in small_graph.edges}

        for _ in range(10):  # run multiple times for randomness coverage
            events = agent.select_events(small_graph, depth=0)
            for e in events:
                if e.action == "cut_edge":
                    assert isinstance(e.target, dict)
                    assert (e.target["from"], e.target["to"]) in edge_pairs
                else:
                    assert e.target in node_ids

    def test_weighted_theta_model(self, small_graph: Graph) -> None:
        cfg = MCConfig(failure_model="weighted_theta", branching_factor=3)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        assert len(events) > 0

    def test_per_node_model(self, small_graph: Graph) -> None:
        cfg = MCConfig(
            failure_model="per_node",
            branching_factor=3,
            per_node_probs={"ceo": 10.0, "cto": 1.0, "server": 0.1, "dev": 0.01},
        )
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        assert len(events) > 0

    def test_damage_events_have_valid_magnitude(
        self,
        small_graph: Graph,
    ) -> None:
        cfg = MCConfig(
            kill_prob=0.0,
            damage_prob=1.0,  # force all damage
            branching_factor=4,
        )
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        for e in events:
            if e.action == "damage":
                assert 0.0 <= e.magnitude <= 1.0

    def test_cut_edge_events(self, small_graph: Graph) -> None:
        cfg = MCConfig(
            kill_prob=0.0,
            damage_prob=0.0,  # force all cut_edge
            branching_factor=4,
        )
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)
        events = agent.select_events(small_graph, depth=0)
        for e in events:
            assert e.action == "cut_edge"
            assert isinstance(e.target, dict)

    def test_path_metadata_is_available(self, small_graph: Graph) -> None:
        cfg = MCConfig(branching_factor=4, max_depth=3)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg, graph=small_graph)

        events = agent.select_events(small_graph, depth=0, path=[])
        assert len(events) > 0

        metadata = agent.describe_path([events[0]])
        assert metadata is not None
        assert metadata.scenario_title
        assert metadata.expected_outcome

    def test_fallback_candidates_follow_real_dependency_paths(
        self,
        small_graph: Graph,
    ) -> None:
        cfg = MCConfig(branching_factor=4, max_depth=4)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg, graph=small_graph)

        plans = agent._get_or_build_plans(small_graph)
        assert plans

        edge_pairs = {(edge.from_id, edge.to_id) for edge in small_graph.edges}
        for plan in plans:
            node_steps = [
                step.event.target
                for step in plan.steps
                if isinstance(step.event.target, str)
            ]
            for left, right in itertools.pairwise(node_steps):
                assert (left, right) in edge_pairs
            assert plan.summary
            assert plan.outcome

    def test_ai_payload_can_only_select_graph_grounded_candidates(
        self,
        small_graph: Graph,
    ) -> None:
        cfg = MCConfig(branching_factor=4, max_depth=3)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg, graph=small_graph)

        candidates = agent._build_candidate_catalog(small_graph)
        assert candidates
        candidate = candidates[0]

        payload = {
            "scenarios": [
                {
                    "candidate_id": candidate.candidate_id,
                    "title": "Chosen scenario",
                    "summary": "Uses a real dependency chain.",
                    "outcome": "Leads to a clear downstream operating failure.",
                    "step_descriptions": ["Step follows the dependency path."]
                    * len(candidate.events),
                }
            ]
        }

        plans = agent._parse_scenario_payload(payload, candidates)
        assert len(plans) == 1
        assert [step.event for step in plans[0].steps] == candidate.events


# ---------------------------------------------------------------------------
# Briefing & registry integration tests
# ---------------------------------------------------------------------------


class TestBriefingIntegration:
    def test_brief_monte_carlo(self) -> None:
        cfg = MCConfig(branching_factor=6, max_depth=3)
        brief = brief_monte_carlo(cfg)
        assert brief.agent_type == "monte_carlo"
        assert brief.branching_factor == 6
        assert brief.max_depth == 3

    def test_create_all_agents_with_mc(self) -> None:
        cfg = MCConfig(branching_factor=4)
        brief = brief_monte_carlo(cfg)
        agents = create_all_agents([brief], mc_config=cfg)
        assert len(agents) == 1
        assert isinstance(agents[0], MonteCarloAgent)

    def test_create_all_agents_mc_without_config_raises(self) -> None:
        cfg = MCConfig()
        brief = brief_monte_carlo(cfg)
        with pytest.raises(ValueError, match="mc_config is required"):
            create_all_agents([brief])  # no mc_config


# ---------------------------------------------------------------------------
# Resilience analysis tests
# ---------------------------------------------------------------------------


class TestResilienceAnalysis:
    def test_basic_resilience(self, small_graph: Graph) -> None:
        cfg = MCConfig(n_resilience_samples=50)
        profile = run_resilience_analysis(small_graph, cfg)

        assert isinstance(profile, ResilienceProfile)
        assert profile.n_samples > 0
        assert 0.0 <= profile.mean_H <= 1.0
        assert profile.std_H >= 0.0
        assert 0.0 <= profile.min_H <= 1.0
        assert 0.0 <= profile.max_H <= 1.0
        assert 0.0 <= profile.p_catastrophic <= 1.0
        assert 0.0 <= profile.p_severe <= 1.0

    def test_per_node_probs_in_range(self, small_graph: Graph) -> None:
        cfg = MCConfig(n_resilience_samples=50)
        profile = run_resilience_analysis(small_graph, cfg)

        for nid, prob in profile.per_node_failure_prob.items():
            assert 0.0 <= prob <= 1.0, f"Node {nid} prob out of range: {prob}"

    def test_percentiles_ordered(self, small_graph: Graph) -> None:
        cfg = MCConfig(n_resilience_samples=100)
        profile = run_resilience_analysis(small_graph, cfg)

        p = profile.H_percentiles
        assert p["p5"] <= p["p25"] <= p["p50"] <= p["p75"] <= p["p95"]

    def test_to_dict(self, small_graph: Graph) -> None:
        cfg = MCConfig(n_resilience_samples=20)
        profile = run_resilience_analysis(small_graph, cfg)
        d = profile.to_dict()

        assert isinstance(d, dict)
        assert "mean_H" in d
        assert "per_node_failure_prob" in d
        assert "H_percentiles" in d
        assert "sample_H_values" in d
        assert len(d["sample_H_values"]) <= 1000

    def test_layer_mean_damage(self, small_graph: Graph) -> None:
        cfg = MCConfig(n_resilience_samples=50)
        profile = run_resilience_analysis(small_graph, cfg)

        for layer in small_graph.layers:
            assert layer in profile.layer_mean_damage
            assert profile.layer_mean_damage[layer] >= 0.0

    def test_weighted_theta_resilience(self, medium_graph: Graph) -> None:
        cfg = MCConfig(
            failure_model="weighted_theta",
            n_resilience_samples=50,
        )
        profile = run_resilience_analysis(medium_graph, cfg)
        assert profile.n_samples > 0
        assert 0.0 <= profile.mean_H <= 1.0


# ---------------------------------------------------------------------------
# Full pipeline integration test
# ---------------------------------------------------------------------------


class TestFullMCPipeline:
    def test_mc_agent_in_state_tree(self, small_graph: Graph) -> None:
        """MC agent explores alongside deterministic agents in the tree."""
        from achilles_api.engine.state_tree import ExplorationConfig, build_state_tree

        cfg = MCConfig(branching_factor=3, max_depth=2)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg)

        config = ExplorationConfig(max_depth=2, max_tree_nodes=100)
        tree = build_state_tree(small_graph, [agent], config)

        assert tree.total_nodes_explored > 1
        # At least one non-root node should have agent="monte_carlo"
        mc_nodes = [n for n in tree.all_nodes if n.agent == "monte_carlo"]
        assert len(mc_nodes) > 0

    def test_mc_agent_keeps_tree_compact(self, small_graph: Graph) -> None:
        from achilles_api.engine.state_tree import ExplorationConfig, build_state_tree

        cfg = MCConfig(branching_factor=6, max_depth=4)
        brief = brief_monte_carlo(cfg)
        agent = MonteCarloAgent(brief, cfg, graph=small_graph)

        config = ExplorationConfig(max_depth=4, max_tree_nodes=200)
        tree = build_state_tree(small_graph, [agent], config)

        assert tree.total_nodes_explored <= 12
        assert any(node.scenario_title for node in tree.all_nodes if node.agent == "monte_carlo")

    def test_mc_mixed_with_deterministic(self, medium_graph: Graph) -> None:
        """MC agent runs alongside a deterministic agent.

        Uses medium_graph (6 nodes) to ensure enough unique failure states
        for both agents to find non-duplicate branches.
        """
        from achilles_api.agents.critical_node import CriticalNodeAttacker
        from achilles_api.engine.state_tree import ExplorationConfig, build_state_tree
        from achilles_api.engine.weakpoint import run_full_analysis

        report = run_full_analysis(medium_graph)

        from achilles_api.briefing.briefing import brief_critical_node_attacker

        det_brief = brief_critical_node_attacker(report)
        det_agent = CriticalNodeAttacker(det_brief)

        mc_cfg = MCConfig(branching_factor=4, max_depth=3)
        mc_brief = brief_monte_carlo(mc_cfg)
        mc_agent = MonteCarloAgent(mc_brief, mc_cfg)

        config = ExplorationConfig(max_depth=3, max_tree_nodes=500)
        tree = build_state_tree(medium_graph, [det_agent, mc_agent], config)

        agents_in_tree = {n.agent for n in tree.all_nodes}
        assert "monte_carlo" in agents_in_tree
        assert "critical_node_attacker" in agents_in_tree
