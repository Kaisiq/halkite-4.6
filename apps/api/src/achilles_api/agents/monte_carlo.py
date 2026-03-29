"""Agent 6 -- AI-guided scenario explorer.

The state tree keeps a compact set of realistic worst-case branches. Instead of
inventing arbitrary event sequences, this agent first builds deterministic,
graph-grounded scenario candidates from actual dependency paths, bridge cuts,
and converging failure pairs. Gemini is then used only to select the clearest
candidate branches and write business-readable titles, summaries, outcomes, and
step descriptions.

The cascade engine remains the source of truth for all math. AI does not alter
the branch mechanics; it only chooses among coherent graph-derived scenarios and
explains them.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from achilles_api.agents.base import Agent, AgentBrief, BranchMetadata
from achilles_api.engine.cascade import cascade
from achilles_api.models.events import Event

if TYPE_CHECKING:
    from achilles_api.engine.weakpoint import VulnerabilityReport
    from achilles_api.mc.config import MCConfig
    from achilles_api.models.graph import Edge, Graph, Node

logger = logging.getLogger(__name__)

_SCENARIO_SYSTEM_PROMPT = """\
You are writing realistic stress-test scenario cards for an organizational
dependency graph.

Important rules:
- Choose only from the provided candidate_id values.
- Do not invent new steps, nodes, edges, or actions.
- Keep the exact event order from the chosen candidate.
- Every scenario must describe one clear business outcome.
- Every step description must explain the causal logic of that step.
- Prefer a few severe, easy-to-follow branches over broad coverage.
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


@dataclass(slots=True)
class ScenarioCandidate:
    candidate_id: str
    kind: str
    title_hint: str
    summary_hint: str
    outcome_hint: str
    causal_path: list[str]
    events: list[Event]
    step_outcomes: list[str]
    score: float


class MonteCarloAgent(Agent):
    """AI-guided scenario agent that keeps only coherent worst-case branches."""

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
        current_path = list(path or [])
        plans = self._get_or_build_plans(graph)
        if not plans:
            return []

        events: list[Event] = []
        seen: set[str] = set()
        for plan in self._matching_plans(current_path):
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

        candidates = self._build_candidate_catalog(source_graph)
        plans = self._generate_ai_scenario_plans(source_graph, candidates)
        if not plans:
            plans = self._build_fallback_plans(candidates)

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

    def _generate_ai_scenario_plans(
        self,
        graph: Graph,
        candidates: list[ScenarioCandidate],
    ) -> list[ScenarioPlan]:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key or not candidates:
            return []

        try:
            import google.genai as genai
            from google.genai import types
        except Exception as exc:
            logger.warning("Gemini client unavailable for scenario planning: %s", exc)
            return []

        prompt = self._build_planning_prompt(graph, candidates)

        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=_SCENARIO_SYSTEM_PROMPT,
                    temperature=0.15,
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

        return self._parse_scenario_payload(payload, candidates)

    def _build_planning_prompt(self, graph: Graph, candidates: list[ScenarioCandidate]) -> str:
        report_lines: list[str] = []
        if self._vulnerability_report is not None:
            report = self._vulnerability_report
            top_nodes = ", ".join(n.node_id for n in report.node_rankings[:5]) or "none"
            top_pairs = ", ".join(
                f"{p.node_a}+{p.node_b}({p.synergy:.2f})" for p in report.compound_pairs[:3]
            ) or "none"
            risky_layers = ", ".join(
                f"{layer}({analysis.risk_score:.2f})"
                for layer, analysis in sorted(
                    report.layer_analysis.items(),
                    key=lambda item: item[1].risk_score,
                    reverse=True,
                )[:4]
            ) or "none"
            report_lines = [
                f"Top critical nodes: {top_nodes}",
                f"High-synergy pairs: {top_pairs}",
                f"Risky layers: {risky_layers}",
            ]

        candidate_blocks = []
        for candidate in candidates:
            step_lines = [
                f"  - Step {idx + 1}: {self._summarize_event(event, graph)}"
                for idx, event in enumerate(candidate.events)
            ]
            path_labels = " -> ".join(self._node_name(graph, node_id) for node_id in candidate.causal_path)
            candidate_blocks.append(
                "\n".join(
                    [
                        f"candidate_id: {candidate.candidate_id}",
                        f"kind: {candidate.kind}",
                        f"score: {candidate.score:.3f}",
                        f"causal_path: {path_labels}",
                        f"title_hint: {candidate.title_hint}",
                        f"summary_hint: {candidate.summary_hint}",
                        f"outcome_hint: {candidate.outcome_hint}",
                        "events:",
                        *step_lines,
                    ]
                )
            )

        return (
            f"MAX_SCENARIOS: {self.brief.branching_factor}\n"
            f"MAX_DEPTH: {self.mc_config.max_depth}\n"
            "DEPENDENCY SEMANTICS: edge A -> B means B depends on A.\n\n"
            "VULNERABILITY SIGNALS:\n"
            + ("\n".join(report_lines) if report_lines else "- none")
            + "\n\nCANDIDATE SCENARIOS:\n"
            + "\n\n".join(candidate_blocks)
            + "\n\nReturn JSON in this shape:\n"
            + '{"scenarios": ['
            + '{"candidate_id": "...", "title": "...", "summary": "...", '
            + '"outcome": "...", "step_descriptions": ["...", "..."]}'
            + "]}"
        )

    def _parse_scenario_payload(
        self,
        payload: Any,
        candidates: list[ScenarioCandidate],
    ) -> list[ScenarioPlan]:
        candidate_lookup = {candidate.candidate_id: candidate for candidate in candidates}
        raw_scenarios = payload.get("scenarios", []) if isinstance(payload, dict) else []
        plans: list[ScenarioPlan] = []
        used_ids: set[str] = set()

        for idx, raw in enumerate(raw_scenarios, start=1):
            if not isinstance(raw, dict):
                continue

            candidate_id = str(raw.get("candidate_id", "")).strip()
            candidate = candidate_lookup.get(candidate_id)
            if candidate is None or candidate_id in used_ids:
                continue

            descriptions = raw.get("step_descriptions", [])
            if not isinstance(descriptions, list):
                descriptions = []

            steps: list[PlannedStep] = []
            for step_index, event in enumerate(candidate.events):
                description = ""
                if step_index < len(descriptions) and isinstance(descriptions[step_index], str):
                    description = descriptions[step_index].strip()
                if not description:
                    description = self._default_step_description(candidate, step_index)
                steps.append(
                    PlannedStep(
                        event=event,
                        description=description,
                        expected_outcome=candidate.step_outcomes[step_index],
                    )
                )

            plans.append(
                ScenarioPlan(
                    scenario_id=candidate_id or f"scenario-{idx}",
                    title=str(raw.get("title", candidate.title_hint)).strip() or candidate.title_hint,
                    summary=str(raw.get("summary", candidate.summary_hint)).strip()
                    or candidate.summary_hint,
                    outcome=str(raw.get("outcome", candidate.outcome_hint)).strip()
                    or candidate.outcome_hint,
                    steps=steps,
                )
            )
            used_ids.add(candidate_id)

        return plans

    def _build_fallback_plans(self, candidates: list[ScenarioCandidate]) -> list[ScenarioPlan]:
        plans: list[ScenarioPlan] = []
        for candidate in candidates[: self.brief.branching_factor]:
            plans.append(
                ScenarioPlan(
                    scenario_id=candidate.candidate_id,
                    title=candidate.title_hint,
                    summary=candidate.summary_hint,
                    outcome=candidate.outcome_hint,
                    steps=[
                        PlannedStep(
                            event=event,
                            description=self._default_step_description(candidate, idx),
                            expected_outcome=candidate.step_outcomes[idx],
                        )
                        for idx, event in enumerate(candidate.events)
                    ],
                )
            )
        return plans

    def _build_candidate_catalog(self, graph: Graph) -> list[ScenarioCandidate]:
        allowed = self._allowed_actions(graph)
        candidates: list[ScenarioCandidate] = []
        if "kill" in allowed or "damage" in allowed:
            candidates.extend(self._build_dependency_candidates(graph))
            candidates.extend(self._build_compound_candidates(graph))
        if "cut_edge" in allowed:
            candidates.extend(self._build_edge_isolation_candidates(graph))

        cut_edge_only = allowed == {"cut_edge"}
        rescored: list[ScenarioCandidate] = []
        for candidate in candidates:
            impact = self._candidate_health_loss(graph, candidate.events)
            if impact <= 1e-6 and not cut_edge_only:
                continue
            candidate.score += impact * 5.0
            rescored.append(candidate)

        deduped: list[ScenarioCandidate] = []
        seen_signatures: set[tuple[str, ...]] = set()
        for candidate in sorted(rescored, key=lambda item: item.score, reverse=True):
            signature = tuple(self._event_key(event) for event in candidate.events)
            if signature in seen_signatures:
                continue
            seen_signatures.add(signature)
            deduped.append(candidate)

        diversified: list[ScenarioCandidate] = []
        overflow: list[ScenarioCandidate] = []
        seen_openers: set[str] = set()
        for candidate in deduped:
            opener = self._event_key(candidate.events[0]) if candidate.events else candidate.candidate_id
            if opener in seen_openers:
                overflow.append(candidate)
                continue
            seen_openers.add(opener)
            diversified.append(candidate)

        deduped = diversified + overflow

        catalog_size = max(self.brief.branching_factor * 3, 8)
        return deduped[:catalog_size]

    @staticmethod
    def _candidate_health_loss(graph: Graph, events: list[Event]) -> float:
        graph_copy = graph.deep_copy()
        for event in events:
            _cascade_log, state, _metrics = cascade(graph_copy, event)
            graph_copy = graph_copy.deep_copy()
            if state.H <= 0.05:
                break
        return max(0.0, 1.0 - graph_copy.network_health())

    def _build_dependency_candidates(self, graph: Graph) -> list[ScenarioCandidate]:
        adjacency = self._adjacency(graph)
        node_priority = self._node_priority_map(graph)
        starts = self._ordered_nodes(graph)[: min(6, len(graph.nodes))]
        path_limit = max(2, self.mc_config.max_depth)
        seen_paths: set[tuple[str, ...]] = set()
        candidates: list[ScenarioCandidate] = []

        for start in starts:
            all_paths = self._enumerate_paths(adjacency, start.id, path_limit)
            if not all_paths:
                all_paths = [[start.id]]
            ranked_paths = sorted(
                all_paths,
                key=lambda path: self._path_score(path, adjacency, graph, node_priority),
                reverse=True,
            )[:3]
            for path in ranked_paths:
                if len(path) < 2:
                    continue
                path_tuple = tuple(path)
                if path_tuple in seen_paths:
                    continue
                seen_paths.add(path_tuple)
                candidates.append(self._candidate_from_dependency_path(path, adjacency, graph, node_priority))

        return candidates

    def _build_edge_isolation_candidates(self, graph: Graph) -> list[ScenarioCandidate]:
        adjacency = self._adjacency(graph)
        node_priority = self._node_priority_map(graph)
        candidates: list[ScenarioCandidate] = []
        for edge in self._ordered_edges(graph)[:4]:
            downstream_path = self._best_downstream_path(adjacency, edge.to_id, graph, node_priority)
            path = [edge.from_id] + downstream_path
            candidates.append(
                ScenarioCandidate(
                    candidate_id=f"edge-{edge.from_id}-{edge.to_id}",
                    kind="edge_isolation",
                    title_hint=f"{self._node_name(graph, edge.to_id)} becomes isolated",
                    summary_hint=(
                        f"The dependency link from {self._node_name(graph, edge.from_id)} to "
                        f"{self._node_name(graph, edge.to_id)} is severed, isolating a key downstream path."
                    ),
                    outcome_hint=(
                        f"{self._node_name(graph, path[-1])} loses upstream support and the dependent capability degrades."
                    ),
                    causal_path=path,
                    events=[Event(target={"from": edge.from_id, "to": edge.to_id}, action="cut_edge")],
                    step_outcomes=[
                        f"The support path into {self._node_name(graph, edge.to_id)} is broken, exposing downstream operations."
                    ],
                    score=self._path_score(path, adjacency, graph, node_priority) + edge.weight,
                )
            )
        return candidates

    def _build_compound_candidates(self, graph: Graph) -> list[ScenarioCandidate]:
        if self._vulnerability_report is None or not self._vulnerability_report.compound_pairs:
            return []

        adjacency = self._adjacency(graph)
        node_priority = self._node_priority_map(graph)
        candidates: list[ScenarioCandidate] = []
        for pair in self._vulnerability_report.compound_pairs[:3]:
            path_a = self._reachable_nodes(adjacency, pair.node_a, self.mc_config.max_depth)
            path_b = self._reachable_nodes(adjacency, pair.node_b, self.mc_config.max_depth)
            shared = sorted(
                path_a.intersection(path_b),
                key=lambda node_id: node_priority.get(node_id, 0.0),
                reverse=True,
            )
            terminal = shared[0] if shared else None
            causal_path = [pair.node_a, pair.node_b]
            step_outcomes = [
                f"Simultaneous failure removes two reinforcing supports from the organization.",
            ]
            events = [Event(target=[pair.node_a, pair.node_b], action="kill")]

            if terminal and terminal not in {pair.node_a, pair.node_b} and len(events) < self.mc_config.max_depth:
                events.append(self._make_node_event(graph, terminal, preferred_action="kill"))
                causal_path.append(terminal)
                step_outcomes.append(
                    f"{self._node_name(graph, terminal)} becomes the shared downstream bottleneck and tips into failure."
                )

            score = pair.synergy + sum(node_priority.get(node_id, 0.0) for node_id in causal_path)
            candidates.append(
                ScenarioCandidate(
                    candidate_id=f"compound-{pair.node_a}-{pair.node_b}",
                    kind="compound_convergence",
                    title_hint="Reinforcing failures converge on one capability",
                    summary_hint=(
                        f"{self._node_name(graph, pair.node_a)} and {self._node_name(graph, pair.node_b)} fail together, "
                        "stacking pressure on the same downstream capability."
                    ),
                    outcome_hint=(
                        f"The combined shock produces a sharper collapse than either failure would create on its own."
                    ),
                    causal_path=causal_path,
                    events=events,
                    step_outcomes=step_outcomes,
                    score=score,
                )
            )

        return candidates

    def _candidate_from_dependency_path(
        self,
        path: list[str],
        adjacency: dict[str, list[tuple[str, float]]],
        graph: Graph,
        node_priority: dict[str, float],
    ) -> ScenarioCandidate:
        events = [
            self._make_node_event(graph, node_id, preferred_action="kill")
            for node_id in path[: self.mc_config.max_depth]
        ]
        causal_path = path[: len(events)]
        terminal_id = causal_path[-1]
        start_id = causal_path[0]
        step_outcomes = []
        for idx, node_id in enumerate(causal_path):
            if idx + 1 < len(causal_path):
                next_id = causal_path[idx + 1]
                step_outcomes.append(
                    f"Pressure moves from {self._node_name(graph, node_id)} into {self._node_name(graph, next_id)}, which depends on it."
                )
            else:
                step_outcomes.append(
                    f"{self._node_name(graph, terminal_id)} loses enough support to become the terminal business failure in this branch."
                )

        title = f"{self._node_name(graph, start_id)} disruption cascades to {self._node_name(graph, terminal_id)}"
        summary = (
            f"This branch follows the real dependency path from {self._node_name(graph, start_id)} to "
            f"{self._node_name(graph, terminal_id)} instead of mixing unrelated node failures."
        )
        outcome = (
            f"The disruption reaches {self._node_name(graph, terminal_id)} and causes a clear "
            f"{graph.get_node(terminal_id).layer.lower()}-layer operating failure."
        )

        return ScenarioCandidate(
            candidate_id="path-" + "-".join(causal_path),
            kind="dependency_chain",
            title_hint=title,
            summary_hint=summary,
            outcome_hint=outcome,
            causal_path=causal_path,
            events=events,
            step_outcomes=step_outcomes,
            score=self._path_score(causal_path, adjacency, graph, node_priority),
        )

    def _default_step_description(self, candidate: ScenarioCandidate, step_index: int) -> str:
        event = candidate.events[step_index]
        if event.action == "cut_edge":
            target = cast("dict[str, str]", event.target)
            return (
                f"Sever the support link from {target['from']} to {target['to']} so the downstream path loses a real dependency."
            )

        target_ids = event.target if isinstance(event.target, list) else [cast("str", event.target)]
        target_label = ", ".join(target_ids)
        if step_index == 0:
            return f"Trigger the branch at {target_label}, the start of the selected causal path."

        previous_ids = candidate.events[step_index - 1].target_node_ids()
        previous_label = ", ".join(previous_ids)
        return f"Follow the pressure from {previous_label} into {target_label}, which sits next on the dependency path."

    def _make_node_event(self, graph: Graph, node_id: str, *, preferred_action: str) -> Event:
        allowed = self._allowed_actions(graph)
        if preferred_action == "kill" and "kill" in allowed:
            return Event(target=node_id, action="kill")
        if "damage" in allowed:
            return Event(
                target=node_id,
                action="damage",
                magnitude=max(self.mc_config.damage_magnitude_min, self.mc_config.damage_magnitude_max),
            )
        return Event(target=node_id, action="kill")

    def _allowed_actions(self, graph: Graph) -> set[str]:
        allowed: set[str] = set()
        if self.mc_config.kill_prob > 0.0:
            allowed.add("kill")
        if self.mc_config.damage_prob > 0.0:
            allowed.add("damage")
        if (1.0 - self.mc_config.kill_prob - self.mc_config.damage_prob) > 0.0 and self._candidate_edges(graph):
            allowed.add("cut_edge")
        return allowed or {"kill"}

    def _ordered_nodes(self, graph: Graph) -> list[Node]:
        surviving = [node for node in graph.nodes if not node.phi]
        priority = self._node_priority_map(graph)
        surviving.sort(key=lambda node: priority.get(node.id, 0.0), reverse=True)
        return surviving

    def _ordered_edges(self, graph: Graph) -> list[Edge]:
        edges = self._candidate_edges(graph)
        priority = self._node_priority_map(graph)
        edges.sort(
            key=lambda edge: (
                edge.weight + priority.get(edge.from_id, 0.0) + priority.get(edge.to_id, 0.0)
            ),
            reverse=True,
        )
        return edges

    @staticmethod
    def _candidate_edges(graph: Graph) -> list[Edge]:
        if not getattr(graph, "edges", None):
            return []
        node_index = graph.node_index
        return [
            edge
            for edge in graph.edges
            if (
                not graph.nodes[node_index[edge.from_id]].phi
                and not graph.nodes[node_index[edge.to_id]].phi
            )
        ]

    def _node_priority_map(self, graph: Graph) -> dict[str, float]:
        priority = {node.id: node.theta for node in graph.nodes}
        if self._vulnerability_report is not None:
            for rank in self._vulnerability_report.node_rankings:
                priority[rank.node_id] = priority.get(rank.node_id, 0.0) + rank.health_loss * 2.0
            for bridge in self._vulnerability_report.bridge_nodes:
                priority[bridge.node_id] = priority.get(bridge.node_id, 0.0) + bridge.fragmentation_score
        return priority

    @staticmethod
    def _adjacency(graph: Graph) -> dict[str, list[tuple[str, float]]]:
        adjacency: dict[str, list[tuple[str, float]]] = {node.id: [] for node in graph.nodes}
        for edge in graph.edges:
            adjacency.setdefault(edge.from_id, []).append((edge.to_id, edge.weight))
        for targets in adjacency.values():
            targets.sort(key=lambda item: item[1], reverse=True)
        return adjacency

    def _enumerate_paths(
        self,
        adjacency: dict[str, list[tuple[str, float]]],
        start: str,
        max_nodes: int,
    ) -> list[list[str]]:
        paths: list[list[str]] = []

        def dfs(current: str, path: list[str]) -> None:
            outgoing = adjacency.get(current, [])
            extended = False
            for next_id, _weight in outgoing:
                if next_id in path or len(path) >= max_nodes:
                    continue
                extended = True
                next_path = path + [next_id]
                paths.append(next_path)
                dfs(next_id, next_path)
            if not extended and len(path) > 1:
                paths.append(path)

        dfs(start, [start])
        deduped: list[list[str]] = []
        seen: set[tuple[str, ...]] = set()
        for path in paths:
            key = tuple(path)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(path)
        return deduped

    def _best_downstream_path(
        self,
        adjacency: dict[str, list[tuple[str, float]]],
        start: str,
        graph: Graph,
        node_priority: dict[str, float],
    ) -> list[str]:
        paths = self._enumerate_paths(adjacency, start, max(2, self.mc_config.max_depth))
        if not paths:
            return [start]
        return max(paths, key=lambda path: self._path_score(path, adjacency, graph, node_priority))

    def _reachable_nodes(
        self,
        adjacency: dict[str, list[tuple[str, float]]],
        start: str,
        max_depth: int,
    ) -> set[str]:
        seen: set[str] = set()
        frontier: list[tuple[str, int]] = [(start, 0)]
        while frontier:
            current, depth = frontier.pop(0)
            if depth >= max_depth:
                continue
            for next_id, _weight in adjacency.get(current, []):
                if next_id in seen:
                    continue
                seen.add(next_id)
                frontier.append((next_id, depth + 1))
        return seen

    def _path_score(
        self,
        path: list[str],
        adjacency: dict[str, list[tuple[str, float]]],
        graph: Graph,
        node_priority: dict[str, float],
    ) -> float:
        node_score = 0.0
        for index, node_id in enumerate(path):
            node_score += node_priority.get(node_id, 0.0) * (0.82**index)

        edge_score = 0.0
        for left, right in zip(path, path[1:], strict=False):
            edge_score += next(
                (weight for candidate, weight in adjacency.get(left, []) if candidate == right),
                0.0,
            )

        layers = {graph.get_node(node_id).layer for node_id in path}
        return node_score + (0.35 * edge_score) + (0.2 * len(layers)) + (0.1 * len(path))

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

    def _summarize_event(self, event: Event, graph: Graph) -> str:
        if event.action == "cut_edge":
            target = cast("dict[str, str]", event.target)
            return (
                f"Cut edge {self._node_name(graph, target['from'])} -> "
                f"{self._node_name(graph, target['to'])}"
            )

        node_names = [self._node_name(graph, node_id) for node_id in event.target_node_ids()]
        if event.action == "damage":
            return f"Damage {' + '.join(node_names)}"
        return f"Kill {' + '.join(node_names)}"

    @staticmethod
    def _node_name(graph: Graph, node_id: str) -> str:
        try:
            return graph.get_node(node_id).name
        except KeyError:
            return node_id
