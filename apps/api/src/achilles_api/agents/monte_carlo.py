"""Agent 6 -- AI-guided scenario explorer.

This agent used to emit mostly random Monte Carlo events. It now asks Gemini
for a compact set of plausible, high-impact scenario plans and then explores
only those branches. The deterministic cascade engine still computes every
state transition and score; AI only proposes which events are worth testing and
how to describe the intended outcome.

When no API key is configured, the agent falls back to deterministic scenario
templates derived from the vulnerability report so the tree still stays small
and meaningful.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from achilles_api.agents.base import Agent, AgentBrief, BranchMetadata
from achilles_api.models.events import Event

if TYPE_CHECKING:
    from achilles_api.engine.weakpoint import VulnerabilityReport
    from achilles_api.mc.config import MCConfig
    from achilles_api.models.graph import Edge, Graph, Node

logger = logging.getLogger(__name__)

_SCENARIO_SYSTEM_PROMPT = """\
You are designing failure scenarios for an organizational stress-testing
platform. Your job is to propose only a few plausible, high-value scenario
branches that are easy to explain.

Rules:
- Prefer 3-6 scenarios total, not exhaustive coverage.
- Keep each scenario focused on one business outcome.
- Every step must make causal sense.
- Prefer scenarios that are severe, cross-layer, and realistic.
- Do not invent nodes or edges. Use only ids from the provided graph.
- You may use only these actions: kill, damage, cut_edge.
- Keep plans short: 1 to max_depth steps.
- Avoid redundant steps that target already-collapsed areas.
- Optimize for clarity and worst-case impact, not randomness.
- Return valid JSON only.
"""


@dataclass(slots=True)
class PlannedStep:
    event: Event
    description: str
    expected_outcome: str


@dataclass(slots=True)
class ScenarioPlan:
    scenario_id: str
    title: str
    summary: str
    outcome: str
    steps: list[PlannedStep]


class MonteCarloAgent(Agent):
    """AI-guided scenario agent that keeps only crucial worst-case branches."""

    def __init__(
        self,
        brief: AgentBrief,
        mc_config: MCConfig,
        *,
        graph: Graph | None = None,
        vulnerability_report: VulnerabilityReport | None = None,
    ) -> None:
        super().__init__(brief)
        self.mc_config: MCConfig = mc_config
        self._initial_graph: Graph | None = graph.deep_copy() if graph is not None else None
        self._vulnerability_report: VulnerabilityReport | None = vulnerability_report
        self._scenario_plans: list[ScenarioPlan] | None = None

    def select_events(
        self,
        graph: Graph,
        depth: int,
        path: list[Event] | None = None,
    ) -> list[Event]:
        """Return the next event(s) from matching planned scenarios."""
        current_path = list(path or [])
        plans = self._get_or_build_plans(graph)
        if not plans:
            return []

        events: list[Event] = []
        seen: set[str] = set()
        matching = self._matching_plans(current_path)

        for plan in matching:
            next_index = len(current_path)
            if next_index >= len(plan.steps):
                continue

            event = plan.steps[next_index].event
            if not self._event_is_actionable(graph, event):
                continue

            key = self._event_key(event)
            if key in seen:
                continue

            seen.add(key)
            events.append(event)
            if len(events) >= self.brief.branching_factor:
                break

        return events

    def describe_path(self, path: list[Event]) -> BranchMetadata | None:
        plan = self._plan_for_path(path)
        if plan is None or not path:
            return None

        step = plan.steps[len(path) - 1]
        return BranchMetadata(
            scenario_id=plan.scenario_id,
            scenario_title=plan.title,
            scenario_summary=plan.summary,
            expected_outcome=plan.outcome,
            step_description=step.description or step.expected_outcome,
        )

    def _get_or_build_plans(self, graph: Graph) -> list[ScenarioPlan]:
        if self._scenario_plans is not None:
            return self._scenario_plans

        source_graph = self._initial_graph.deep_copy() if self._initial_graph is not None else graph.deep_copy()
        if self._initial_graph is not None:
            source_graph.reset()

        plans = self._generate_ai_scenario_plans(source_graph)
        if not plans:
            plans = self._build_fallback_plans(source_graph)

        plans.sort(key=lambda plan: len(plan.steps))
        self._scenario_plans = plans[: self.brief.branching_factor]
        return self._scenario_plans

    def _matching_plans(self, path: list[Event]) -> list[ScenarioPlan]:
        return [plan for plan in self._scenario_plans or [] if self._path_matches(plan, path)]

    def _plan_for_path(self, path: list[Event]) -> ScenarioPlan | None:
        for plan in self._scenario_plans or []:
            if self._path_matches(plan, path):
                return plan
        return None

    @staticmethod
    def _path_matches(plan: ScenarioPlan, path: list[Event]) -> bool:
        if len(path) > len(plan.steps):
            return False
        for idx, event in enumerate(path):
            if plan.steps[idx].event != event:
                return False
        return True

    def _generate_ai_scenario_plans(self, graph: Graph) -> list[ScenarioPlan]:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return []

        try:
            import google.genai as genai
            from google.genai import types
        except Exception as exc:
            logger.warning("Gemini client unavailable for scenario planning: %s", exc)
            return []

        prompt = self._build_planning_prompt(graph)

        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=_SCENARIO_SYSTEM_PROMPT,
                    temperature=0.2,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )
        except Exception as exc:
            logger.warning("AI scenario planning failed: %s", exc)
            return []

        cleaned = (response.text or "").strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.find("\n")
            if first_newline != -1:
                cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("AI scenario planning returned invalid JSON: %s", exc)
            return []

        return self._parse_scenario_payload(payload, graph)

    def _build_planning_prompt(self, graph: Graph) -> str:
        node_lines = [
            (
                f"- {node.id}: {node.name} | layer={node.layer} | theta={node.theta:.2f} "
                f"| recovery_cost={node.r:.1f}"
            )
            for node in graph.nodes
        ]
        edge_lines = [
            f"- {edge.from_id} -> {edge.to_id} | weight={edge.weight:.2f}"
            for edge in graph.edges
        ]

        report_lines: list[str] = []
        report = self._vulnerability_report
        if report is not None:
            top_nodes = ", ".join(n.node_id for n in report.node_rankings[:5]) or "none"
            top_bridges = ", ".join(b.node_id for b in report.bridge_nodes[:5]) or "none"
            top_pairs = ", ".join(
                f"{p.node_a}+{p.node_b}({p.synergy:.2f})" for p in report.compound_pairs[:5]
            ) or "none"
            risky_layers = ", ".join(
                f"{layer}({analysis.risk_score:.2f})"
                for layer, analysis in sorted(
                    report.layer_analysis.items(),
                    key=lambda item: item[1].risk_score,
                    reverse=True,
                )[:5]
            ) or "none"
            report_lines = [
                f"Top critical nodes: {top_nodes}",
                f"Bridge nodes: {top_bridges}",
                f"Synergy pairs: {top_pairs}",
                f"Risky layers: {risky_layers}",
            ]

        return (
            f"MAX_SCENARIOS: {self.brief.branching_factor}\n"
            f"MAX_DEPTH: {self.mc_config.max_depth}\n\n"
            "GRAPH NODES:\n"
            + "\n".join(node_lines)
            + "\n\nGRAPH EDGES:\n"
            + "\n".join(edge_lines)
            + "\n\nVULNERABILITY SIGNALS:\n"
            + ("\n".join(report_lines) if report_lines else "- none")
            + "\n\nReturn JSON in this shape:\n"
            + '{"scenarios": ['
            + '{"id": "scenario-1", "title": "...", "summary": "...", '
            + '"outcome": "...", "steps": ['
            + '{"action": "kill|damage|cut_edge", "target": "node_id | [node_ids] | {from,to}", '
            + '"magnitude": 0.0, "description": "why this step matters", '
            + '"expected_outcome": "what this causes"}]}'
            + "]}"
        )

    def _parse_scenario_payload(self, payload: Any, graph: Graph) -> list[ScenarioPlan]:
        raw_scenarios = payload.get("scenarios", []) if isinstance(payload, dict) else []
        plans: list[ScenarioPlan] = []

        for idx, raw in enumerate(raw_scenarios, start=1):
            if not isinstance(raw, dict):
                continue

            steps: list[PlannedStep] = []
            for raw_step in raw.get("steps", []):
                if not isinstance(raw_step, dict):
                    continue
                event = self._parse_event(raw_step, graph)
                if event is None:
                    continue
                steps.append(
                    PlannedStep(
                        event=event,
                        description=str(raw_step.get("description", "")).strip(),
                        expected_outcome=str(raw_step.get("expected_outcome", "")).strip(),
                    )
                )
                if len(steps) >= self.mc_config.max_depth:
                    break

            if not steps:
                continue

            plans.append(
                ScenarioPlan(
                    scenario_id=str(raw.get("id", f"scenario-{idx}")),
                    title=str(raw.get("title", f"Scenario {idx}")).strip(),
                    summary=str(raw.get("summary", "")).strip(),
                    outcome=str(raw.get("outcome", "")).strip(),
                    steps=steps,
                )
            )

        return plans

    def _parse_event(self, raw_step: dict[str, Any], graph: Graph) -> Event | None:
        action = str(raw_step.get("action", "")).strip()
        if action not in {"kill", "damage", "cut_edge"}:
            return None

        target = raw_step.get("target")
        magnitude = float(raw_step.get("magnitude", self.mc_config.damage_magnitude_max))
        magnitude = max(0.0, min(1.0, magnitude))

        try:
            event = Event(target=target, action=action, magnitude=magnitude)
        except (TypeError, ValueError):
            return None

        if self._event_targets_exist(graph, event):
            return event
        return None

    def _build_fallback_plans(self, graph: Graph) -> list[ScenarioPlan]:
        """Deterministic, business-readable scenarios used when AI is unavailable."""
        plans: list[ScenarioPlan] = []
        allowed_actions = self._allowed_actions(graph)
        report = self._vulnerability_report

        critical_nodes = self._ordered_nodes(graph)
        critical_edges = self._ordered_edges(graph)

        if report is not None and report.compound_pairs and "kill" in allowed_actions:
            pair = report.compound_pairs[0]
            plans.append(
                ScenarioPlan(
                    scenario_id="fallback-compound",
                    title="Compound Failure Chain",
                    summary="Two mutually amplifying failures land together instead of in isolation.",
                    outcome="The network absorbs a super-additive shock that should surface as one of the worst branches.",
                    steps=[
                        PlannedStep(
                            event=Event(target=[pair.node_a, pair.node_b], action="kill"),
                            description=f"Trigger the highest-synergy failure pair: {pair.node_a} and {pair.node_b}.",
                            expected_outcome="Two individually bad failures combine into a much worse systemic breakdown.",
                        )
                    ],
                )
            )

        if "kill" in allowed_actions and critical_nodes:
            primary = critical_nodes[0]
            secondary = critical_nodes[1] if len(critical_nodes) > 1 else None
            steps = [
                PlannedStep(
                    event=Event(target=primary.id, action="kill"),
                    description=f"Remove {primary.name} to trigger an immediate critical dependency shock.",
                    expected_outcome="Core operations lose a high-importance dependency.",
                )
            ]
            if secondary is not None and len(steps) < self.mc_config.max_depth:
                steps.append(
                    PlannedStep(
                        event=Event(target=secondary.id, action="kill"),
                        description=f"Follow by removing {secondary.name} before the organization stabilizes.",
                        expected_outcome="The initial disruption turns into a broader cascade.",
                    )
                )
            plans.append(
                ScenarioPlan(
                    scenario_id="fallback-critical-collapse",
                    title="Critical Dependency Collapse",
                    summary="A concentrated strike removes the most central dependency first and then compounds the disruption.",
                    outcome="Leadership or infrastructure shock cascades into a multi-node operational collapse.",
                    steps=steps,
                )
            )

        if "damage" in allowed_actions and critical_nodes:
            node = critical_nodes[0]
            steps = [
                PlannedStep(
                    event=Event(
                        target=node.id,
                        action="damage",
                        magnitude=max(self.mc_config.damage_magnitude_min, self.mc_config.damage_magnitude_max),
                    ),
                    description=f"Severely degrade {node.name} instead of fully removing it to model a sustained impairment.",
                    expected_outcome="The organization keeps operating in a weakened state that can still trigger downstream failures.",
                )
            ]
            plans.append(
                ScenarioPlan(
                    scenario_id="fallback-sustained-damage",
                    title="Sustained Degradation",
                    summary="A high-value dependency suffers heavy degradation rather than an instant shutdown.",
                    outcome="The weakened node drags dependent operations down over subsequent cascade steps.",
                    steps=steps,
                )
            )

        if "cut_edge" in allowed_actions and critical_edges:
            edge = critical_edges[0]
            steps = [
                PlannedStep(
                    event=Event(target={"from": edge.from_id, "to": edge.to_id}, action="cut_edge"),
                    description=f"Sever the dependency from {edge.from_id} to {edge.to_id} at a structurally important connection.",
                    expected_outcome="A cluster or layer loses a key link and becomes isolated or brittle.",
                )
            ]
            plans.append(
                ScenarioPlan(
                    scenario_id="fallback-isolation",
                    title="Isolation Shock",
                    summary="A key dependency link is severed to split an important part of the organization from support functions.",
                    outcome="A previously connected capability becomes isolated and more likely to collapse under cascade pressure.",
                    steps=steps,
                )
            )

        return plans[: self.brief.branching_factor]

    def _allowed_actions(self, graph: Graph) -> set[str]:
        allowed: set[str] = set()
        if self.mc_config.kill_prob > 0.0:
            allowed.add("kill")
        if self.mc_config.damage_prob > 0.0:
            allowed.add("damage")
        if (1.0 - self.mc_config.kill_prob - self.mc_config.damage_prob) > 0.0:
            allowed.add("cut_edge")

        if not allowed:
            allowed.add("kill")
        if "cut_edge" in allowed and not self._candidate_edges(graph):
            allowed.discard("cut_edge")
        return allowed or {"kill"}

    def _ordered_nodes(self, graph: Graph) -> list[Node]:
        surviving = [node for node in graph.nodes if not node.phi]
        if self.mc_config.failure_model == "per_node":
            surviving.sort(
                key=lambda node: (self.mc_config.per_node_probs.get(node.id, 0.0), node.theta),
                reverse=True,
            )
            return surviving
        if self.mc_config.failure_model == "weighted_theta":
            surviving.sort(key=lambda node: (node.theta, node.r), reverse=True)
            return surviving
        surviving.sort(key=lambda node: (node.theta, node.r), reverse=True)
        return surviving

    def _ordered_edges(self, graph: Graph) -> list[Edge]:
        edges = self._candidate_edges(graph)
        edges.sort(key=lambda edge: (edge.weight, edge.from_id != edge.to_id), reverse=True)
        return edges

    @staticmethod
    def _candidate_edges(graph: Graph) -> list[Edge]:
        node_index = graph.node_index
        return [
            edge
            for edge in graph.edges
            if (
                not graph.nodes[node_index[edge.from_id]].phi
                and not graph.nodes[node_index[edge.to_id]].phi
            )
        ]

    @staticmethod
    def _event_key(event: Event) -> str:
        if event.action == "cut_edge":
            target = cast("dict[str, str]", event.target)
            return f"cut_edge:{target['from']}:{target['to']}"
        if isinstance(event.target, list):
            return f"{event.action}:{','.join(event.target)}:{event.magnitude:.3f}"
        return f"{event.action}:{event.target}:{event.magnitude:.3f}"

    @staticmethod
    def _event_targets_exist(graph: Graph, event: Event) -> bool:
        try:
            if event.action == "cut_edge":
                target = cast("dict[str, str]", event.target)
                return any(
                    edge.from_id == target["from"] and edge.to_id == target["to"]
                    for edge in graph.edges
                )
            for node_id in event.target_node_ids():
                graph.get_node(node_id)
            return True
        except KeyError:
            return False

    def _event_is_actionable(self, graph: Graph, event: Event) -> bool:
        if not self._event_targets_exist(graph, event):
            return False

        if event.action == "cut_edge":
            target = cast("dict[str, str]", event.target)
            return any(
                edge.from_id == target["from"] and edge.to_id == target["to"]
                for edge in graph.edges
            )

        for node_id in event.target_node_ids():
            if not graph.get_node(node_id).phi:
                return True
        return False
