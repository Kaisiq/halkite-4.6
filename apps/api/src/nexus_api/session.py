from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any


class Session:
    def __init__(self, session_id: str | None = None) -> None:
        self.session_id: str = session_id or uuid.uuid4().hex
        self.graph: Any | None = None
        self.vulnerability_report: Any | None = None
        self.state_tree: Any | None = None
        self.final_report: Any | None = None
        self.r_unit: str = "days"
        self.created_at: datetime = datetime.now(UTC)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(self) -> Session:
        session = Session()
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def require(self, session_id: str) -> Session:
        session = self.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        return session

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        super().__init__(f"Session not found: {session_id}")


store = SessionStore()
