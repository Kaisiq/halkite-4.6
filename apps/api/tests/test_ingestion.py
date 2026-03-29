from __future__ import annotations

from achilles_api.ingestion.extractor import build_draft_graph, _chunk_single_large_file
from achilles_api.ingestion.parser import ParsedFile


def test_build_draft_graph_seeds_nodes_and_edges() -> None:
    parsed = [
        ParsedFile(
            filename="org_chart.txt",
            file_type="txt",
            content=(
                "CEO oversees CTO and Finance Team\n"
                "Headers: Manager | System | Supplier\n"
                "Manager: Alice Johnson\n"
                "System: Billing Platform\n"
            ),
        )
    ]

    draft = build_draft_graph(parsed, description="Acme")

    assert draft["company"] == "Acme"
    assert len(draft["nodes"]) >= 3
    assert len(draft["edges"]) >= 1
    assert any(node["layer"] == "People" for node in draft["nodes"])


def test_chunk_single_large_file_splits_long_text(monkeypatch) -> None:
    monkeypatch.setattr(
        "achilles_api.ingestion.extractor._SINGLE_FILE_CHUNK_THRESHOLD_CHARS",
        100,
    )
    monkeypatch.setattr(
        "achilles_api.ingestion.extractor._SINGLE_FILE_CHUNK_TARGET_CHARS",
        80,
    )

    parsed = [
        ParsedFile(
            filename="large_notes.txt",
            file_type="txt",
            content="\n\n".join(
                [
                    "CEO leads the company and manages strategy.",
                    "CTO owns the platform and infrastructure roadmap.",
                    "Finance Team controls billing workflows and approvals.",
                    "Warehouse Operations depend on supplier schedules daily.",
                ]
            ),
        )
    ]

    chunked = _chunk_single_large_file(parsed)

    assert chunked is not None
    assert len(chunked) >= 2
    assert all("[chunk " in chunk.filename for chunk in chunked)
