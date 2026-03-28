"""Data Standardization Layer.

Defines the canonical Halkantir standard format — a validated intermediate
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

from nexus_api.ingestion.scoring import (
    build_default_scoring_policy,
    score_edge_weight,
    score_recovery,
    score_theta,
)

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
    theta: float | None = Field(default=None, ge=0.0, le=1.0)
    r: float | None = Field(default=None, ge=0.0)
    r_candidate: float | None = Field(default=None, ge=0.0)
    meta: str | dict[str, Any] = Field(default_factory=dict)


class StandardEdge(BaseModel):
    """A single edge in the standard format.

    Uses ``from_id`` / ``to_id`` in Python (since ``from`` is reserved)
    with aliases so JSON serialization uses ``"from"`` / ``"to"``.
    """

    model_config = ConfigDict(populate_by_name=True)

    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    weight: float | None = Field(default=None, ge=0.0, le=1.0)
    meta: str | dict[str, Any] | None = None


class StandardFormat(BaseModel):
    """The Halkantir standard intermediate format.

    This is the canonical representation that sits between raw input
    and graph construction.
    """

    company: str = ""
    r_unit: str = "days"
    layers: list[str]
    nodes: list[StandardNode]
    edges: list[StandardEdge]
    known_risks: list[str] = Field(default_factory=list)
    scoring_policy: dict[str, Any] = Field(default_factory=dict)


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
    except json.JSONDecodeError, UnicodeDecodeError:
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
    has_theta = "theta" in first
    has_scoring_features = isinstance(first.get("meta"), dict) and isinstance(
        first["meta"].get("scoring_features"), dict
    )
    if not {"id", "layer"}.issubset(first.keys()) or not (has_theta or has_scoring_features):
        return None

    # edges must be a non-empty list of dicts with key fields
    edges = parsed.get("edges", [])
    if not isinstance(edges, list) or not edges:
        return None
    first_edge = edges[0]
    if not isinstance(first_edge, dict):
        return None
    has_weight = "weight" in first_edge
    has_edge_scoring_features = isinstance(first_edge.get("meta"), dict) and isinstance(
        first_edge["meta"].get("scoring_features"), dict
    )
    if not {"from", "to"}.issubset(first_edge.keys()) or not (
        has_weight or has_edge_scoring_features
    ):
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
    r_unit = str(ai_dict.get("r_unit", "days"))
    scoring_policy = ai_dict.get("scoring_policy")
    if not isinstance(scoring_policy, dict) or not scoring_policy:
        scoring_policy = build_default_scoring_policy(r_unit=r_unit)

    nodes: list[dict[str, Any]] = []
    for raw_node in ai_dict.get("nodes", []):
        node = dict(raw_node)
        meta = node.get("meta")
        if not isinstance(meta, dict):
            meta = {}
        if node.get("theta") is None:
            node["theta"] = score_theta(meta.get("scoring_features"), meta)
        if node.get("r") is None:
            node["r"] = score_recovery(node.get("r_candidate"), meta, r_unit=r_unit)
        node["meta"] = meta
        nodes.append(node)

    edges: list[dict[str, Any]] = []
    for raw_edge in ai_dict.get("edges", []):
        edge = dict(raw_edge)
        meta = edge.get("meta")
        if not isinstance(meta, dict):
            meta = {} if meta is None else {"note": str(meta)}
        if edge.get("weight") is None:
            edge["weight"] = score_edge_weight(meta.get("scoring_features"), meta)
        edge["meta"] = meta
        edges.append(edge)

    data: dict[str, Any] = {
        "company": ai_dict.get("company", company),
        "r_unit": r_unit,
        "layers": ai_dict.get("layers", []),
        "nodes": nodes,
        "edges": edges,
        "known_risks": ai_dict.get("known_risks", known_risks or []),
        "scoring_policy": scoring_policy,
    }
    return StandardFormat.model_validate(data)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _data_dir() -> Path:
    """Return the base data directory, configurable via ``HALKANTIR_DATA_DIR``."""
    return Path(os.environ.get("HALKANTIR_DATA_DIR", os.environ.get("NEXUS_DATA_DIR", "data")))


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
        raise FileNotFoundError(f"No standard.json found for session {session_id}")
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
