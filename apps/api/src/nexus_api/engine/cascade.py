"""Module 2A -- Cascade Engine.

Pure math, no AI, fully deterministic.  Given a graph *G* and one or more
events, compute the exact chain reaction: which nodes degrade, which nodes
fail, and what the final network state is.

Public API
----------
apply_event(graph, event)        -- mutate *graph* according to *event*.
cascade(graph, event)            -- run a full cascade from a single event.
cascade_compound(graph, events)  -- apply all events first, then cascade.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np

from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph, State


# ======================================================================
# Data classes for cascade output
# ======================================================================


@dataclass(slots=True)
class CascadeStep:
    """A single step in the cascade log.

    Parameters
    ----------
    step : int
        Zero-based step index.  Step 0 is always the initial event.
    trigger : str
        ``"initial_event"`` for step 0, ``"cascade"`` for propagation steps.
    event : Event | None
        The event that caused this step (only set for ``"initial_event"``).
    new_failures : list[str]
        Node ids that transitioned to ``phi = True`` during this step.
    new_degraded : list[str]
        Node ids that lost health but survived during this step.
    damages : dict[str, float]
        Mapping of node id to the damage amount applied in this step.
    """

    step: int
    trigger: str
    event: Event | None = None
    events: list[Event] = field(default_factory=list)
    new_failures: list[str] = field(default_factory=list)
    new_degraded: list[str] = field(default_factory=list)
    damages: dict[str, float] = field(default_factory=dict)
    damage_sources: dict[str, set[str]] = field(
        default_factory=dict, repr=False,
    )

    def to_dict(self) -> dict:
        """JSON-safe serialisation."""
        return {
            "step": self.step,
            "trigger": self.trigger,
            "event": self.event.to_dict() if self.event is not None else None,
            "events": [e.to_dict() for e in self.events],
            "new_failures": self.new_failures,
            "new_degraded": self.new_degraded,
            "damages": self.damages,
        }


@dataclass(slots=True)
class CascadeMetrics:
    """Summary metrics computed after a cascade reaches its fixed point.

    All fields match the specification in ``docs/02A_CASCADE_ENGINE.md``.
    """

    cascade_size: float
    cascade_depth: int
    health_loss: float
    nodes_failed: list[str]
    nodes_degraded: list[str]
    cross_layer_failures: int
    layer_damage: dict[str, float]
    total_recovery_cost: float

    def to_dict(self) -> dict:
        """JSON-safe serialisation."""
        return {
            "cascade_size": self.cascade_size,
            "cascade_depth": self.cascade_depth,
            "health_loss": self.health_loss,
            "nodes_failed": self.nodes_failed,
            "nodes_degraded": self.nodes_degraded,
            "cross_layer_failures": self.cross_layer_failures,
            "layer_damage": self.layer_damage,
            "total_recovery_cost": self.total_recovery_cost,
        }


# ======================================================================
# Event application (mutates graph in-place)
# ======================================================================


def _validate_node_exists(graph: Graph, node_id: str) -> None:
    """Raise ``ValueError`` if *node_id* is not present in *graph*."""
    if node_id not in graph.node_index:
        raise ValueError(
            f"Event targets non-existent node {node_id!r}. "
            f"Known node ids: {sorted(graph.node_index.keys())}"
        )


def apply_event(
    graph: Graph,
    event: Event,
) -> tuple[set[str], set[str]]:
    """Apply *event* to *graph* **in place**.

    Returns
    -------
    new_failures : set[str]
        Node ids that transitioned to ``phi = True`` as a direct result
        of this event.
    new_degraded : set[str]
        Node ids whose health decreased but remain alive.
    """
    new_failures: set[str] = set()
    new_degraded: set[str] = set()

    if event.action == "cut_edge":
        target = event.target
        assert isinstance(target, dict)
        from_id: str = target["from"]
        to_id: str = target["to"]
        _validate_node_exists(graph, from_id)
        _validate_node_exists(graph, to_id)
        graph.remove_edge(from_id, to_id)
        return new_failures, new_degraded

    # "kill" or "damage" -- resolve target list
    targets: list[str]
    if isinstance(event.target, str):
        targets = [event.target]
    elif isinstance(event.target, list):
        targets = event.target
    else:
        raise ValueError(
            f"Expected str or list[str] for {event.action} target, "
            f"got {type(event.target).__name__}."
        )

    for node_id in targets:
        _validate_node_exists(graph, node_id)
        node = graph.get_node(node_id)

        # Edge case 1: already-dead node -- skip.
        if node.phi:
            continue

        h_before = node.h

        if event.action == "kill":
            node.h = 0.0
            node.phi = True
            new_failures.add(node_id)
        elif event.action == "damage":
            node.h = max(0.0, node.h * (1.0 - event.magnitude))
            if node.h <= 0.0:
                node.h = 0.0
                node.phi = True
                new_failures.add(node_id)
            elif node.h < h_before:
                new_degraded.add(node_id)
        else:
            # Unreachable due to Event validation, but defensive.
            raise ValueError(f"Unknown action {event.action!r}.")

    return new_failures, new_degraded


# ======================================================================
# Cascade propagation
# ======================================================================


def _propagate_step(
    graph: Graph,
    changed_node_ids: set[str],
) -> tuple[set[str], set[str], dict[str, float]]:
    """Run one propagation step from the set of recently changed nodes.

    For every node *v* in *changed_node_ids*, compute the damage it
    inflicts on each alive neighbour *u* and apply it.

    Returns
    -------
    next_failures : set[str]
    next_degraded : set[str]
    damages : dict[str, float]
        Cumulative damage applied to each affected node in this step.
    damage_sources : dict[str, set[str]]
        For each damaged/failed node, the set of source node ids that
        contributed non-zero damage.
    """
    A = graph.adjacency_matrix
    node_index = graph.node_index
    nodes = graph.nodes
    n = len(nodes)

    # Accumulate damage per target index before applying, so that the
    # order of iteration does not affect the result (determinism).
    damage_accum: np.ndarray = np.zeros(n, dtype=np.float64)
    # Track which sources contribute non-zero damage to each target.
    source_map: dict[int, set[str]] = {}

    for v_id in changed_node_ids:
        v_idx = node_index[v_id]
        v_node = nodes[v_idx]
        theta_v = v_node.theta
        health_loss_v = 1.0 - v_node.h  # how much health v has lost

        if theta_v == 0.0 or health_loss_v <= 0.0:
            continue

        # Column v_idx of A tells us who depends on v and how strongly.
        col = A[:, v_idx]
        damage_from_v = col * theta_v * health_loss_v
        damage_accum += damage_from_v

        # Record which targets received non-zero damage from v.
        for u_idx in range(n):
            if damage_from_v[u_idx] > 0.0:
                source_map.setdefault(u_idx, set()).add(v_id)

    # Apply accumulated damage
    next_failures: set[str] = set()
    next_degraded: set[str] = set()
    damages: dict[str, float] = {}
    damage_sources: dict[str, set[str]] = {}

    for u_idx in range(n):
        u_node = nodes[u_idx]
        if u_node.phi:
            continue  # already dead, skip

        dmg = float(damage_accum[u_idx])
        if dmg <= 0.0:
            continue  # clamp negative damage to 0

        h_before = u_node.h
        u_node.h = max(0.0, u_node.h - dmg)
        sources = source_map.get(u_idx, set())

        if u_node.h <= 0.0:
            u_node.h = 0.0
            u_node.phi = True
            next_failures.add(u_node.id)
            damages[u_node.id] = dmg
            damage_sources[u_node.id] = sources
        elif u_node.h < h_before:
            next_degraded.add(u_node.id)
            damages[u_node.id] = dmg
            damage_sources[u_node.id] = sources

    return next_failures, next_degraded, damages, damage_sources


# ======================================================================
# Metrics
# ======================================================================


def _compute_metrics(
    graph: Graph,
    state_before: State,
    state_after: State,
    cascade_log: list[CascadeStep],
) -> CascadeMetrics:
    """Compute summary metrics from the cascade result."""

    n = len(graph.nodes)

    # -- nodes_failed: all nodes where phi is True in the final state
    nodes_failed = [
        graph.nodes[i].id
        for i in range(n)
        if state_after.phi[i]
    ]

    # -- nodes_degraded: health decreased but still alive
    nodes_degraded = [
        graph.nodes[i].id
        for i in range(n)
        if (
            not state_after.phi[i]
            and state_after.h[i] < state_before.h[i] - 1e-12
        )
    ]

    # -- cascade_size: fraction of nodes that died
    cascade_size = len(nodes_failed) / n if n > 0 else 0.0

    # -- cascade_depth: number of propagation steps (excluding step 0)
    cascade_depth = max(
        (step.step for step in cascade_log if step.trigger == "cascade"),
        default=0,
    )

    # -- health_loss
    health_loss = state_before.H - state_after.H

    # -- layer_damage
    layer_damage: dict[str, float] = {}
    for layer in graph.layers:
        h_before_layer = state_before.H_per_layer.get(layer, 0.0)
        h_after_layer = state_after.H_per_layer.get(layer, 0.0)
        layer_damage[layer] = h_before_layer - h_after_layer

    # -- cross_layer_failures
    # Count cascade-step failures where at least one *causing* node
    # is in a different layer than the failed node.  Uses per-node
    # damage attribution from _propagate_step for accuracy.
    cross_layer = 0
    for cs in cascade_log:
        if cs.trigger != "cascade":
            continue
        for fid in cs.new_failures:
            failed_layer = graph.get_node(fid).layer
            sources = cs.damage_sources.get(fid, set())
            for src_id in sources:
                src_node = graph.get_node(src_id)
                if src_node.layer != failed_layer:
                    cross_layer += 1
                    break  # count each failure at most once

    # -- total_recovery_cost
    total_recovery_cost = sum(
        graph.get_node(nid).r for nid in nodes_failed
    )

    return CascadeMetrics(
        cascade_size=cascade_size,
        cascade_depth=cascade_depth,
        health_loss=health_loss,
        nodes_failed=nodes_failed,
        nodes_degraded=nodes_degraded,
        cross_layer_failures=cross_layer,
        layer_damage=layer_damage,
        total_recovery_cost=total_recovery_cost,
    )


# ======================================================================
# Public API
# ======================================================================


def cascade(
    graph: Graph,
    event: Event,
) -> tuple[list[CascadeStep], State, CascadeMetrics]:
    """Run a full cascade simulation on *graph* from a single *event*.

    The graph is mutated **in place**.  If you need to preserve the
    original, call ``graph.deep_copy()`` before invoking this function.

    Parameters
    ----------
    graph : Graph
        The network graph.  Will be modified in place.
    event : Event
        The triggering event.

    Returns
    -------
    cascade_log : list[CascadeStep]
        Ordered list of cascade steps (step 0 is the initial event).
    final_state : State
        Snapshot of the graph after the cascade reaches its fixed point.
    metrics : CascadeMetrics
        Summary statistics about the cascade.
    """
    # Step 0: save initial state
    state_before = graph.snapshot()
    cascade_log: list[CascadeStep] = []

    # Step 1: apply the initial event
    new_failures, new_degraded = apply_event(graph, event)

    # Build the initial damage map (health difference for each affected node)
    initial_damages: dict[str, float] = {}
    for nid in new_failures | new_degraded:
        idx = graph.get_node_index(nid)
        initial_damages[nid] = state_before.h[idx] - graph.nodes[idx].h

    cascade_log.append(
        CascadeStep(
            step=0,
            trigger="initial_event",
            event=event,
            new_failures=sorted(new_failures),
            new_degraded=sorted(new_degraded),
            damages=initial_damages,
        )
    )

    # Step 2: propagate
    changed = new_failures | new_degraded
    max_steps = len(graph.nodes)
    step = 0

    while changed and step < max_steps:
        step += 1
        next_failures, next_degraded, damages, dsources = _propagate_step(
            graph, changed
        )

        if not next_failures and not next_degraded:
            break  # fixed point

        cascade_log.append(
            CascadeStep(
                step=step,
                trigger="cascade",
                event=None,
                new_failures=sorted(next_failures),
                new_degraded=sorted(next_degraded),
                damages=damages,
                damage_sources=dsources,
            )
        )

        changed = next_failures | next_degraded

    # Step 3: compute metrics
    state_after = graph.snapshot()
    metrics = _compute_metrics(graph, state_before, state_after, cascade_log)

    return cascade_log, state_after, metrics


def cascade_compound(
    graph: Graph,
    events: list[Event],
) -> tuple[list[CascadeStep], State, CascadeMetrics]:
    """Apply multiple events simultaneously, then run a single cascade.

    All events are applied **before** propagation begins.  This captures
    interaction effects between simultaneous failures (synergy).

    The graph is mutated **in place**.

    Parameters
    ----------
    graph : Graph
        The network graph.  Will be modified in place.
    events : list[Event]
        One or more triggering events applied simultaneously.

    Returns
    -------
    cascade_log : list[CascadeStep]
        Ordered list of cascade steps.
    final_state : State
        Snapshot after the cascade reaches its fixed point.
    metrics : CascadeMetrics
        Summary statistics.

    Raises
    ------
    ValueError
        If *events* is empty, or if any event references a non-existent
        node.
    """
    if not events:
        raise ValueError("At least one event is required.")

    # Step 0: save initial state
    state_before = graph.snapshot()
    cascade_log: list[CascadeStep] = []

    # Apply every event before propagating
    all_failures: set[str] = set()
    all_degraded: set[str] = set()

    for event in events:
        nf, nd = apply_event(graph, event)
        all_failures |= nf
        all_degraded |= nd

    # Degraded nodes that later failed should only appear in failures
    all_degraded -= all_failures

    # Build the initial damage map
    initial_damages: dict[str, float] = {}
    for nid in all_failures | all_degraded:
        idx = graph.get_node_index(nid)
        initial_damages[nid] = state_before.h[idx] - graph.nodes[idx].h

    cascade_log.append(
        CascadeStep(
            step=0,
            trigger="initial_event",
            event=events[0] if len(events) == 1 else None,
            events=list(events),
            new_failures=sorted(all_failures),
            new_degraded=sorted(all_degraded),
            damages=initial_damages,
        )
    )

    # Propagate from all changed nodes
    changed = all_failures | all_degraded
    max_steps = len(graph.nodes)
    step = 0

    while changed and step < max_steps:
        step += 1
        next_failures, next_degraded, damages, dsources = _propagate_step(
            graph, changed
        )

        if not next_failures and not next_degraded:
            break

        cascade_log.append(
            CascadeStep(
                step=step,
                trigger="cascade",
                event=None,
                new_failures=sorted(next_failures),
                new_degraded=sorted(next_degraded),
                damages=damages,
                damage_sources=dsources,
            )
        )

        changed = next_failures | next_degraded

    # Metrics
    state_after = graph.snapshot()
    metrics = _compute_metrics(graph, state_before, state_after, cascade_log)

    return cascade_log, state_after, metrics
