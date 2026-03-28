"""Tests for nexus_api.agents.* and nexus_api.briefing.briefing."""

from __future__ import annotations

import pytest

from nexus_api.agents.base import Agent, AgentBrief
from nexus_api.agents.bridge_breaker import BridgeBreaker
from nexus_api.agents.cluster_isolator import ClusterIsolator
from nexus_api.agents.compound_exploiter import CompoundExploiter
from nexus_api.agents.critical_node import CriticalNodeAttacker
from nexus_api.agents.layer_assassin import LayerAssassin
from nexus_api.briefing.briefing import (
    create_all_agents,
    generate_all_briefs,
)
from nexus_api.engine.weakpoint import VulnerabilityReport, run_full_analysis
from nexus_api.models.graph import Edge, Graph, Node

# ======================================================================
# Shared fixtures (built from medium_graph via conftest)
# ======================================================================


@pytest.fixture
def report(medium_graph) -> VulnerabilityReport:
    return run_full_analysis(medium_graph)


@pytest.fixture
def briefs(report, medium_graph) -> list[AgentBrief]:
    return generate_all_briefs(report, medium_graph)


@pytest.fixture
def agents(briefs) -> list[Agent]:
    return create_all_agents(briefs)


# ======================================================================
# Briefing tests
# ======================================================================

EXPECTED_AGENT_TYPES = [
    "critical_node_attacker",
    "bridge_breaker",
    "compound_exploiter",
    "layer_assassin",
    "cluster_isolator",
]


def test_generate_all_briefs(briefs):
    """Should produce exactly 5 briefs with the expected agent types."""
    assert len(briefs) == 5
    actual_types = [b.agent_type for b in briefs]
    assert actual_types == EXPECTED_AGENT_TYPES


def test_create_all_agents(agents):
    """Should produce 5 agents, each the correct concrete type."""
    assert len(agents) == 5

    expected_classes = [
        CriticalNodeAttacker,
        BridgeBreaker,
        CompoundExploiter,
        LayerAssassin,
        ClusterIsolator,
    ]
    for agent, expected_cls in zip(agents, expected_classes, strict=True):
        assert isinstance(agent, expected_cls)


# ======================================================================
# CriticalNodeAttacker (Agent 1)
# ======================================================================


def test_critical_node_attacker_events(agents, medium_graph):
    """Should return kill events targeting surviving nodes."""
    attacker = agents[0]
    assert isinstance(attacker, CriticalNodeAttacker)

    events = attacker.select_events(medium_graph, depth=0)
    assert len(events) > 0
    assert len(events) <= attacker.brief.branching_factor

    surviving_ids = {n.id for n in medium_graph.nodes if not n.phi}
    for ev in events:
        assert ev.action == "kill"
        assert isinstance(ev.target, str)
        assert ev.target in surviving_ids


# ======================================================================
# BridgeBreaker (Agent 2)
# ======================================================================


def test_bridge_breaker_events(agents, medium_graph):
    """Should return kill or cut_edge events."""
    breaker = agents[1]
    assert isinstance(breaker, BridgeBreaker)

    events = breaker.select_events(medium_graph, depth=0)
    assert len(events) > 0
    assert len(events) <= breaker.brief.branching_factor

    for ev in events:
        assert ev.action in ("kill", "cut_edge")


# ======================================================================
# CompoundExploiter (Agent 3)
# ======================================================================


def test_compound_exploiter_depth_0(agents, medium_graph):
    """At depth 0, should use initial_events from brief."""
    exploiter = agents[2]
    assert isinstance(exploiter, CompoundExploiter)

    events = exploiter.select_events(medium_graph, depth=0)
    # depth 0 returns initial_events[:branching_factor]
    bf = exploiter.brief.branching_factor
    expected = exploiter.brief.initial_events[:bf]
    assert events == expected


def test_compound_exploiter_depth_1(agents, medium_graph):
    """At depth > 0, should score by synergy and return kill events."""
    exploiter = agents[2]
    assert isinstance(exploiter, CompoundExploiter)

    events = exploiter.select_events(medium_graph, depth=1)
    assert len(events) > 0
    assert len(events) <= exploiter.brief.branching_factor
    for ev in events:
        assert ev.action == "kill"


# ======================================================================
# LayerAssassin (Agent 4)
# ======================================================================


def test_layer_assassin_targets_layer(agents, medium_graph):
    """Should target nodes in focus_layers[0]."""
    assassin = agents[3]
    assert isinstance(assassin, LayerAssassin)
    assert len(assassin.brief.focus_layers) >= 1

    target_layer = assassin.brief.focus_layers[0]
    events = assassin.select_events(medium_graph, depth=0)

    assert len(events) > 0
    layer_node_ids = {n.id for n in medium_graph.nodes if n.layer == target_layer}
    for ev in events:
        assert ev.action == "kill"
        assert ev.target in layer_node_ids


def test_layer_assassin_layer_dead(agents, medium_graph):
    """When the target layer is fully dead, should target other layers."""
    assassin = agents[3]
    assert isinstance(assassin, LayerAssassin)
    target_layer = assassin.brief.focus_layers[0]

    # Kill all nodes in the target layer
    damaged_graph = medium_graph.deep_copy()
    for node in damaged_graph.nodes:
        if node.layer == target_layer:
            node.h = 0.0
            node.phi = True

    events = assassin.select_events(damaged_graph, depth=0)

    if events:
        # All returned targets should be in OTHER layers
        for ev in events:
            assert ev.action == "kill"
            targeted_node = damaged_graph.get_node(ev.target)
            assert targeted_node.layer != target_layer


# ======================================================================
# ClusterIsolator (Agent 5)
# ======================================================================


def test_cluster_isolator_events(agents, medium_graph):
    """Should return events (kill or cut_edge)."""
    isolator = agents[4]
    assert isinstance(isolator, ClusterIsolator)

    events = isolator.select_events(medium_graph, depth=0)
    assert len(events) > 0
    assert len(events) <= isolator.brief.branching_factor
    for ev in events:
        assert ev.action in ("kill", "cut_edge")


# ======================================================================
# Interface and cross-cutting tests
# ======================================================================


def test_agent_interface(agents):
    """All agents implement select_events (Agent ABC contract)."""
    for agent in agents:
        assert isinstance(agent, Agent)
        assert callable(getattr(agent, "select_events", None))


def test_brief_branching_factor(agents, medium_graph):
    """No agent should return more events than its branching_factor."""
    for agent in agents:
        events = agent.select_events(medium_graph, depth=0)
        assert len(events) <= agent.brief.branching_factor


def test_agent_on_dead_network(agents):
    """When every node is dead, all agents should return empty event lists.

    The CompoundExploiter at depth 0 unconditionally returns initial_events
    from its brief (pre-computed pairs), so we test it at depth 1 where it
    inspects the graph for surviving nodes.
    """
    dead_graph = Graph(
        nodes=[
            Node("a", "A", "L1", theta=0.5, r=1, h=0.0, phi=True),
            Node("b", "B", "L1", theta=0.5, r=1, h=0.0, phi=True),
        ],
        edges=[Edge("a", "b", 0.5)],
        layers=["L1"],
    )

    for agent in agents:
        # CompoundExploiter depth-0 returns cached initial_events from the
        # brief regardless of graph state, so test at depth 1 instead.
        depth = 1 if isinstance(agent, CompoundExploiter) else 0
        events = agent.select_events(dead_graph, depth=depth)
        assert events == [], f"{type(agent).__name__} returned events on a dead network: {events}"
