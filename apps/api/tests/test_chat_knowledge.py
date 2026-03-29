from __future__ import annotations

from types import SimpleNamespace

from achilles_api.chat.knowledge import build_knowledge_context


def test_build_knowledge_context_handles_multi_target_scenarios(small_graph) -> None:
    report = SimpleNamespace(
        worst_scenarios=[
            SimpleNamespace(
                rank=1,
                title="Compound failure",
                severity_label="Critical",
                severity=0.91,
                health_remaining=0.12,
                failed_nodes=["ceo", "cto"],
                recovery_cost=300.0,
                depth=2,
                agent="compound_exploiter",
                summary="Two leaders fail together.",
                path=[
                    {
                        "step": 1,
                        "event": SimpleNamespace(
                            action="kill",
                            target=["ceo", "cto"],
                        ),
                        "H_before": 1.0,
                        "H_after": 0.32,
                        "new_failures": ["ceo", "cto"],
                    },
                    {
                        "step": 2,
                        "event": SimpleNamespace(
                            action="cut_edge",
                            target={"from": "cto", "to": "server"},
                        ),
                        "H_before": 0.32,
                        "H_after": 0.12,
                        "new_failures": ["server"],
                    },
                ],
            )
        ],
        recommendations=[],
    )

    context = build_knowledge_context(graph=small_graph, final_report=report)

    assert "CEO + CTO" in context
    assert "CTO -> Main Server" in context
