"""Data Standardization Layer.

Defines the canonical NEXUS standard format — a validated intermediate
representation between raw input and graph construction.  All ingestion
paths (AI extraction or direct JSON upload) produce this format; graph
construction reads from it.

The standard format is persisted to disk per session so it can be
inspected, re-ingested, or used for reproducible analysis.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic schema
# ---------------------------------------------------------------------------


class StandardNode(BaseModel):
    """A single node in the standard format."""

    id: str
    name: str
    layer: str
    h: float = Field(default=1.0, ge=0.0, le=1.0)
    theta: float = Field(ge=0.0, le=1.0)
    r: float = Field(ge=0.0)
    meta: str | dict[str, Any] = Field(default_factory=dict)


class StandardEdge(BaseModel):
    """A single edge in the standard format.

    Uses ``from_id`` / ``to_id`` in Python (since ``from`` is reserved)
    with aliases so JSON serialization uses ``"from"`` / ``"to"``.
    """

    model_config = ConfigDict(populate_by_name=True)

    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    weight: float = Field(ge=0.0, le=1.0)
    meta: str | dict[str, Any] | None = None


class StandardFormat(BaseModel):
    """The NEXUS standard intermediate format.

    This is the canonical representation that sits between raw input
    and graph construction.
    """

    company: str = ""
    r_unit: str = "days"
    layers: list[str]
    nodes: list[StandardNode]
    edges: list[StandardEdge]
    known_risks: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

_REQUIRED_KEYS = {"layers", "nodes", "edges"}


def detect_standard_format(data: bytes) -> StandardFormat | None:
    """Attempt to parse raw bytes as a StandardFormat JSON.

    Returns a validated ``StandardFormat`` if the input is already in the
    standard format, or ``None`` if it is not (meaning AI extraction is
    needed).
    """
    try:
        parsed = json.loads(data.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    if not isinstance(parsed, dict):
        return None

    # Must have all required top-level keys
    if not _REQUIRED_KEYS.issubset(parsed.keys()):
        return None

    # nodes must be a non-empty list of dicts with key fields
    nodes = parsed.get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        return None
    first = nodes[0]
    if not isinstance(first, dict):
        return None
    # theta is the key differentiator from raw business data
    if not {"id", "layer", "theta"}.issubset(first.keys()):
        return None

    # edges must be a non-empty list of dicts with key fields
    edges = parsed.get("edges", [])
    if not isinstance(edges, list) or not edges:
        return None
    first_edge = edges[0]
    if not isinstance(first_edge, dict):
        return None
    if not {"from", "to", "weight"}.issubset(first_edge.keys()):
        return None

    # Full Pydantic validation
    try:
        return StandardFormat.model_validate(parsed)
    except ValidationError:
        return None


# ---------------------------------------------------------------------------
# Normalization (AI output -> standard format)
# ---------------------------------------------------------------------------


def normalize_ai_output(
    ai_dict: dict[str, Any],
    company: str = "",
    known_risks: list[str] | None = None,
) -> StandardFormat:
    """Convert raw AI extraction output to the StandardFormat.

    The AI prompt already outputs ``layers``/``nodes``/``edges`` in roughly
    the right shape.  This function fills in missing top-level fields and
    validates through the Pydantic model.
    """
    data: dict[str, Any] = {
        "company": ai_dict.get("company", company),
        "r_unit": ai_dict.get("r_unit", "days"),
        "layers": ai_dict.get("layers", []),
        "nodes": ai_dict.get("nodes", []),
        "edges": ai_dict.get("edges", []),
        "known_risks": ai_dict.get("known_risks", known_risks or []),
    }
    return StandardFormat.model_validate(data)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _data_dir() -> Path:
    """Return the base data directory, configurable via ``NEXUS_DATA_DIR``."""
    return Path(os.environ.get("NEXUS_DATA_DIR", "data"))


def save_standard(session_id: str, standard: StandardFormat) -> Path:
    """Save the standard format JSON to disk.

    Creates ``data/{session_id}/standard.json``.
    Returns the path to the saved file.
    """
    session_dir = _data_dir() / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    path = session_dir / "standard.json"
    path.write_text(
        standard.model_dump_json(indent=2, by_alias=True),
        encoding="utf-8",
    )
    logger.info("Saved standard format to %s", path)
    return path


def load_standard(session_id: str) -> StandardFormat:
    """Load a previously saved standard format from disk.

    Raises ``FileNotFoundError`` if no ``standard.json`` exists for this
    session.
    """
    path = _data_dir() / session_id / "standard.json"
    if not path.exists():
        raise FileNotFoundError(
            f"No standard.json found for session {session_id}"
        )
    raw = path.read_text(encoding="utf-8")
    return StandardFormat.model_validate_json(raw)


# ---------------------------------------------------------------------------
# Graph construction from standard format
# ---------------------------------------------------------------------------


def build_graph_from_standard(
    standard: StandardFormat,
) -> tuple[Any, str]:
    """Build a :class:`Graph` from the validated standard format.

    Delegates to the existing ``build_graph_from_dict`` but ensures the
    input has been validated first.

    Returns ``(graph, r_unit)``.
    """
    from nexus_api.ingestion.extractor import build_graph_from_dict

    data = standard.model_dump(by_alias=True)
    graph = build_graph_from_dict(data)
    return graph, standard.r_unit
