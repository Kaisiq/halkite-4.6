"""Event model for cascade simulation triggers.

An event represents an external shock applied to the network graph.
Events are the inputs to the cascade engine (Module 2A).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Event:
    """An external event that triggers a cascade in the network.

    Parameters
    ----------
    target : str | list[str] | dict[str, str]
        For ``"kill"`` and ``"damage"`` actions: a single node id (``str``)
        or a list of node ids (``list[str]``).
        For ``"cut_edge"``: a dict with ``"from"`` and ``"to"`` keys
        identifying the edge to remove.
    action : str
        One of ``"kill"``, ``"damage"``, or ``"cut_edge"``.
    magnitude : float
        Severity of the event in the range ``[0, 1]``.  Used by the
        ``"damage"`` action (``h_target *= (1 - magnitude)``).  Ignored
        by ``"kill"`` (always sets ``h = 0``) and ``"cut_edge"``.
    """

    target: str | list[str] | dict[str, str]
    action: str
    magnitude: float = 1.0

    _VALID_ACTIONS: frozenset[str] = field(
        default=frozenset({"kill", "damage", "cut_edge"}),
        init=False,
        repr=False,
        compare=False,
    )

    def __post_init__(self) -> None:
        if self.action not in self._VALID_ACTIONS:
            raise ValueError(
                f"Invalid action {self.action!r}. "
                f"Must be one of {sorted(self._VALID_ACTIONS)}."
            )
        if not (0.0 <= self.magnitude <= 1.0):
            raise ValueError(
                f"Magnitude must be in [0, 1], got {self.magnitude}."
            )
        if self.action == "cut_edge":
            if not isinstance(self.target, dict):
                raise ValueError(
                    "cut_edge events require target to be a dict "
                    "with 'from' and 'to' keys."
                )
            if "from" not in self.target or "to" not in self.target:
                raise ValueError(
                    "cut_edge target dict must contain 'from' and 'to' keys."
                )
        else:
            if isinstance(self.target, dict):
                raise ValueError(
                    f"{self.action} events require target to be a str "
                    f"or list[str], not dict."
                )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def target_node_ids(self) -> list[str]:
        """Return a flat list of targeted node ids.

        For ``"cut_edge"`` events this returns the two endpoint ids.
        """
        if isinstance(self.target, str):
            return [self.target]
        if isinstance(self.target, list):
            return list(self.target)
        # dict for cut_edge
        return [self.target["from"], self.target["to"]]

    def to_dict(self) -> dict:
        """Serialize to a plain dict (JSON-safe)."""
        return {
            "target": self.target,
            "action": self.action,
            "magnitude": self.magnitude,
        }
