"""Deterministic scoring helpers for evidence-backed graph construction."""

from __future__ import annotations

from typing import Any


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Clamp *value* into ``[lo, hi]``."""
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _float_or_none(value: Any) -> float | None:
    """Convert *value* to ``float`` when possible, otherwise ``None``."""
    if value is None:
        return None
    try:
        return float(value)
    except TypeError, ValueError:
        return None


def _feature(features: dict[str, Any] | None, key: str) -> float:
    """Read a normalized feature from a dict, defaulting to ``0.0``."""
    if not isinstance(features, dict):
        return 0.0
    value = _float_or_none(features.get(key))
    if value is None:
        return 0.0
    return clamp(value)


def build_default_scoring_policy(r_unit: str = "days") -> dict[str, Any]:
    """Return the default deterministic scoring policy."""
    return {
        "version": "v1",
        "theta_formula": {
            "blast_radius": 0.30,
            "irreplaceability": 0.25,
            "operational_criticality": 0.20,
            "recovery_penalty": 0.15,
            "historical_incident_impact": 0.10,
        },
        "edge_formula": {
            "operational": 0.25,
            "informational": 0.15,
            "control": 0.10,
            "physical": 0.15,
            "financial": 0.10,
            "substitutability_penalty": 0.15,
            "workaround_delay": 0.10,
        },
        "recovery_unit": r_unit,
    }


def score_theta(
    scoring_features: dict[str, Any] | None,
    meta: dict[str, Any] | None = None,
) -> float:
    """Deterministically score node importance in ``[0, 1]``."""
    meta = meta if isinstance(meta, dict) else {}
    features = scoring_features if isinstance(scoring_features, dict) else {}

    if "irreplaceability" not in features and "substitutability" in meta:
        substitutability = _float_or_none(meta.get("substitutability"))
        if substitutability is not None:
            features = dict(features)
            features["irreplaceability"] = clamp(1.0 - substitutability)

    return clamp(
        0.30 * _feature(features, "blast_radius")
        + 0.25 * _feature(features, "irreplaceability")
        + 0.20 * _feature(features, "operational_criticality")
        + 0.15 * _feature(features, "recovery_penalty")
        + 0.10 * _feature(features, "historical_incident_impact")
    )


def score_edge_weight(
    scoring_features: dict[str, Any] | None,
    meta: dict[str, Any] | None = None,
) -> float:
    """Deterministically score edge dependency strength in ``[0, 1]``."""
    meta = meta if isinstance(meta, dict) else {}
    features = scoring_features if isinstance(scoring_features, dict) else {}

    if "substitutability_penalty" not in features and meta.get("substitutes_available") is not None:
        substitutes = _float_or_none(meta.get("substitutes_available"))
        if substitutes is not None:
            features = dict(features)
            features["substitutability_penalty"] = 1.0 / (1.0 + max(substitutes, 0.0))

    if "workaround_delay" not in features and meta.get("time_to_substitute_hours") is not None:
        hours = _float_or_none(meta.get("time_to_substitute_hours"))
        if hours is not None:
            features = dict(features)
            features["workaround_delay"] = clamp(hours / 168.0)

    return clamp(
        0.25 * _feature(features, "operational")
        + 0.15 * _feature(features, "informational")
        + 0.10 * _feature(features, "control")
        + 0.15 * _feature(features, "physical")
        + 0.10 * _feature(features, "financial")
        + 0.15 * _feature(features, "substitutability_penalty")
        + 0.10 * _feature(features, "workaround_delay")
    )


def score_recovery(
    r_candidate: Any,
    meta: dict[str, Any] | None = None,
    r_unit: str = "days",
) -> float:
    """Deterministically derive recovery cost/time."""
    meta = meta if isinstance(meta, dict) else {}
    explicit = _float_or_none(r_candidate)
    if explicit is not None:
        return max(explicit, 0.0)

    downtime_hours = _float_or_none(meta.get("max_tolerable_downtime_hours"))
    if downtime_hours is not None:
        if r_unit == "hours":
            return max(downtime_hours, 0.0)
        return max(downtime_hours / 24.0, 0.0)

    return 0.0
