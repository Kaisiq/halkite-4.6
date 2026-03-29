"""C-Level Executive Knowledge System.

Compiles all session analysis data -- graph topology, vulnerability report,
worst-case scenarios, recommendations -- into a structured knowledge context
that the AI uses to answer executive questions with data-rich, concise answers.

The knowledge base is rebuilt on every chat request so it always reflects the
latest analysis state.
"""

from __future__ import annotations

from typing import Any

from achilles_api.models.graph import Graph


def build_knowledge_context(
    graph: Graph,
    vulnerability_report: Any | None = None,
    final_report: Any | None = None,
    r_unit: str = "days",
) -> str:
    """Build a comprehensive knowledge context string from session data.

    This is injected into the system prompt so the AI can reference concrete
    numbers, node names, layer health, and scenario details when answering.
    """
    sections: list[str] = []

    # -- 1. Organization topology overview ----------------------------------
    sections.append(_build_topology_section(graph, r_unit))

    # -- 2. Vulnerability report highlights ---------------------------------
    if vulnerability_report is not None:
        sections.append(_build_vulnerability_section(vulnerability_report, graph))

    # -- 3. Worst-case scenarios and recommendations ------------------------
    if final_report is not None:
        sections.append(_build_scenarios_section(final_report, graph))
        sections.append(_build_recommendations_section(final_report))

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _build_topology_section(graph: Graph, r_unit: str) -> str:
    lines = [
        "## ORGANIZATIONAL NETWORK TOPOLOGY",
        f"Total nodes: {len(graph.nodes)} | Total edges: {len(graph.edges)} "
        f"| Layers: {len(graph.layers)}",
        f"Recovery time unit: {r_unit}",
        f"Network health (H): {graph.network_health():.1%}",
        "",
        "### Layers",
    ]

    layer_nodes: dict[str, list[Any]] = {}
    for node in graph.nodes:
        layer_nodes.setdefault(node.layer, []).append(node)

    for layer in graph.layers:
        nodes = layer_nodes.get(layer, [])
        avg_health = sum(n.h for n in nodes) / len(nodes) if nodes else 0
        avg_importance = sum(n.theta for n in nodes) / len(nodes) if nodes else 0
        failed = sum(1 for n in nodes if n.phi)
        lines.append(
            f"- **{layer}**: {len(nodes)} nodes, "
            f"avg health {avg_health:.0%}, avg importance {avg_importance:.2f}, "
            f"{failed} failed"
        )

    lines.append("")
    lines.append("### All Nodes (sorted by importance)")
    sorted_nodes = sorted(graph.nodes, key=lambda n: n.theta, reverse=True)
    for n in sorted_nodes:
        status = "FAILED" if n.phi else f"health {n.h:.0%}"
        lines.append(
            f"- {n.name} [{n.layer}]: importance={n.theta:.2f}, "
            f"{status}, recovery={n.r:.1f} {r_unit}"
        )

    return "\n".join(lines)


def _build_vulnerability_section(vr: Any, graph: Graph) -> str:
    node_map = {n.id: n.name for n in graph.nodes}
    lines = [
        "## VULNERABILITY ANALYSIS",
        f"Network health: {vr.network_health:.1%}",
        "",
    ]

    # Top critical nodes
    lines.append("### Most Critical Nodes (by health impact if removed)")
    for nr in vr.node_rankings[:10]:
        name = node_map.get(nr.node_id, nr.node_id)
        lines.append(
            f"- **{name}**: {nr.health_loss:.1%} health loss, "
            f"cascade size {nr.cascade_size:.0f}, "
            f"depth {nr.cascade_depth}, "
            f"affects {nr.layers_affected} layers, "
            f"recovery cost {nr.recovery_cost:.1f}"
        )

    # Bridge nodes
    if vr.bridge_nodes:
        lines.append("")
        lines.append(
            "### Bridge Nodes (single points of failure that fragment the network)"
        )
        for bn in vr.bridge_nodes:
            name = node_map.get(bn.node_id, bn.node_id)
            lines.append(
                f"- **{name}** [{bn.layer}]: splits network into "
                f"{bn.splits_into} components, "
                f"fragmentation score {bn.fragmentation_score:.2f}"
            )

    # Critical edges
    if vr.critical_edges:
        lines.append("")
        lines.append("### Most Critical Dependencies (edges)")
        for ce in vr.critical_edges[:8]:
            from_name = node_map.get(ce.from_node, ce.from_node)
            to_name = node_map.get(ce.to_node, ce.to_node)
            cross = " [CROSS-LAYER]" if ce.crosses_layers else ""
            lines.append(
                f"- {from_name} -> {to_name}: "
                f"{ce.health_loss:.1%} health loss, "
                f"weight {ce.weight:.2f}{cross}"
            )

    # Compound pairs
    if vr.compound_pairs:
        lines.append("")
        lines.append("### Dangerous Pairs (combined failure synergy)")
        for cp in vr.compound_pairs[:5]:
            a_name = node_map.get(cp.node_a, cp.node_a)
            b_name = node_map.get(cp.node_b, cp.node_b)
            lines.append(
                f"- {a_name} + {b_name}: combined impact "
                f"{cp.impact_combined:.1%}, synergy {cp.synergy_ratio:.1f}x"
            )

    # Layer analysis
    if vr.layer_analysis:
        lines.append("")
        lines.append("### Layer Risk Analysis")
        sorted_layers = sorted(
            vr.layer_analysis.items(),
            key=lambda x: x[1].risk_score,
            reverse=True,
        )
        for layer, la in sorted_layers:
            lines.append(
                f"- **{layer}**: risk score {la.risk_score:.2f}, "
                f"health {la.layer_health:.0%}, "
                f"autonomy {la.autonomy:.0%}, "
                f"criticality {la.criticality:.2f}"
            )

    # Summary
    stats = vr.summary_stats
    lines.append("")
    lines.append("### Summary")
    most_critical = node_map.get(
        stats.most_critical_node, stats.most_critical_node
    )
    lines.append(f"- Most critical node: **{most_critical}**")
    lines.append(f"- Most fragile layer: **{stats.most_fragile_layer}**")
    lines.append(f"- Bridge nodes: {stats.bridge_count}")
    lines.append(f"- Clusters: {stats.cluster_count}")

    return "\n".join(lines)


def _build_scenarios_section(report: Any, graph: Graph) -> str:
    node_map = {n.id: n.name for n in graph.nodes}
    lines = [
        "## WORST-CASE ATTACK SCENARIOS",
        "",
    ]

    for s in report.worst_scenarios:
        failed_names = [node_map.get(nid, nid) for nid in s.failed_nodes[:8]]
        more = f" (+{len(s.failed_nodes) - 8} more)" if len(s.failed_nodes) > 8 else ""

        lines.append(f"### Scenario #{s.rank}: {s.title}")
        lines.append(f"- **Severity**: {s.severity_label} ({s.severity:.0%})")
        lines.append(f"- **Network health remaining**: {s.health_remaining:.0%}")
        lines.append(f"- **Failed nodes**: {', '.join(failed_names)}{more}")
        lines.append(f"- **Recovery cost**: {s.recovery_cost:.1f}")
        lines.append(f"- **Attack depth**: {s.depth} steps")
        lines.append(f"- **Agent type**: {s.agent}")
        if s.summary:
            lines.append(f"- **Summary**: {s.summary}")

        # Attack path
        if s.path:
            lines.append("- **Attack path**:")
            for step in s.path:
                event = step.get("event")
                if event:
                    target_name = _format_event_target(event.target, node_map)
                    new_fails = [
                        node_map.get(f, f) for f in step.get("new_failures", [])
                    ]
                    lines.append(
                        f"  Step {step['step']}: {event.action} {target_name} "
                        f"(H: {step['H_before']:.0%} -> {step['H_after']:.0%}"
                        f"{', fails: ' + ', '.join(new_fails) if new_fails else ''})"
                    )

        lines.append("")

    return "\n".join(lines)


def _format_event_target(
    target: str | list[str] | dict[str, str],
    node_map: dict[str, str],
) -> str:
    if isinstance(target, str):
        return node_map.get(target, target)
    if isinstance(target, list):
        return " + ".join(node_map.get(node_id, node_id) for node_id in target)
    from_name = node_map.get(target.get("from", ""), target.get("from", ""))
    to_name = node_map.get(target.get("to", ""), target.get("to", ""))
    return f"{from_name} -> {to_name}"


def _build_recommendations_section(report: Any) -> str:
    lines = [
        "## RECOMMENDATIONS",
        "",
    ]

    for r in report.recommendations:
        lines.append(
            f"### Priority {r.priority}: {r.action}"
        )
        lines.append(f"- **Type**: {r.type}")
        lines.append(f"- **Target**: {r.target}")
        lines.append(f"- **Reason**: {r.reason}")
        lines.append(
            f"- **Estimated resilience gain**: {r.estimated_resilience_gain}"
        )
        lines.append(f"- **Scenarios prevented**: {r.scenarios_prevented}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# System prompt for C-level chat
# ---------------------------------------------------------------------------

EXECUTIVE_SYSTEM_PROMPT = (
    "You are Achilles Executive Advisor -- a C-level intelligence "
    "briefing system for organizational resilience.\n\n"
    "You are speaking with a CEO or C-suite executive. "
    "Your responses must be:\n\n"
    "1. **Data-driven**: Always cite specific numbers, percentages, "
    "node names, and layer names from the knowledge base. "
    "Never give vague answers when you have exact data.\n"
    "2. **Concise but comprehensive**: Lead with the key insight "
    "in 1-2 sentences, then provide supporting data. "
    "Use bullet points for multiple data points.\n"
    "3. **Executive-appropriate**: Frame findings in business impact "
    "terms -- revenue risk, operational continuity, recovery time, "
    "strategic exposure.\n"
    "4. **Actionable**: Every answer should point to what can be done. "
    "Link observations to the specific recommendations.\n"
    "5. **Honest about uncertainty**: If the analysis doesn't cover "
    "something, say so. Don't fabricate data.\n\n"
    "When asked about:\n"
    "- **Overall health**: Give network health %, most fragile layer, "
    "most critical node, and #1 recommendation.\n"
    "- **Specific nodes/departments**: Health, importance, dependencies, "
    "cascade impact if they fail.\n"
    "- **Risks**: Rank by severity, cite scenarios, quantify damage.\n"
    "- **What to fix first**: Priority-ranked recommendations with "
    "estimated resilience gains.\n"
    "- **Scenarios**: Attack path step by step with health impact.\n"
    "- **Comparisons**: Use actual numbers to compare layers/nodes.\n\n"
    "Format rules:\n"
    "- Use **bold** for key metrics and names\n"
    "- Use percentages for health and severity values\n"
    "- Use short bullet lists for multiple data points\n"
    "- Keep total response under 300 words unless asked for detail\n"
    "- If referencing a scenario, include its rank number\n\n"
    "You have access to the complete analysis data below. "
    "Use it precisely."
)
