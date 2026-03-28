"""Monte Carlo configuration.

Defines :class:`MCConfig`, the single source of truth for all Monte Carlo
parameters used by both :class:`~nexus_api.agents.monte_carlo.MonteCarloAgent`
and :func:`~nexus_api.mc.resilience.run_resilience_analysis`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

_MAX_RESILIENCE_SAMPLES = 5000


@dataclass(slots=True)
class MCConfig:
    """Configuration for Monte Carlo simulation.

    Parameters
    ----------
    failure_model : str
        One of ``"uniform"``, ``"weighted_theta"``, or ``"per_node"``.
    kill_prob : float
        Probability of selecting a ``"kill"`` event.  ``damage_prob`` is the
        probability of a ``"damage"`` event.  The remainder
        ``1 - kill_prob - damage_prob`` is the probability of ``"cut_edge"``.
    damage_prob : float
        Probability of selecting a ``"damage"`` event.
    damage_magnitude_min : float
        Lower bound (inclusive) for random damage magnitude.
    damage_magnitude_max : float
        Upper bound (inclusive) for random damage magnitude.
    branching_factor : int
        Number of random events returned per ``select_events`` call.
    max_depth : int
        Maximum tree depth for the MC agent's branches.
    n_resilience_samples : int
        Number of independent cascade simulations for the post-tree
        resilience analysis.
    per_node_probs : dict[str, float]
        Explicit per-node selection weights.  Only used when
        ``failure_model="per_node"``.
    """

    failure_model: str = "uniform"
    kill_prob: float = 0.4
    damage_prob: float = 0.4
    damage_magnitude_min: float = 0.2
    damage_magnitude_max: float = 0.8
    branching_factor: int = 8
    max_depth: int = 4
    n_resilience_samples: int = 500
    per_node_probs: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.failure_model not in ("uniform", "weighted_theta", "per_node"):
            raise ValueError(
                f"Unknown failure_model {self.failure_model!r}. "
                "Must be 'uniform', 'weighted_theta', or 'per_node'."
            )
        if self.kill_prob + self.damage_prob > 1.0:
            raise ValueError(
                "kill_prob + damage_prob must be <= 1.0, "
                f"got {self.kill_prob} + {self.damage_prob}."
            )
        if not isinstance(self.per_node_probs, dict):
            raise ValueError("per_node_probs must be a dict[str, float].")
        self.n_resilience_samples = min(
            self.n_resilience_samples,
            _MAX_RESILIENCE_SAMPLES,
        )

    @classmethod
    def from_dict(cls, d: dict) -> MCConfig:
        """Parse an ``MCConfig`` from a JSON-compatible dict.

        Unknown keys are silently ignored so the API can evolve without
        breaking existing callers.
        """
        known = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in known}
        return cls(**filtered)
