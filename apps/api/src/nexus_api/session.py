"""Session management with MongoDB persistence and in-memory fallback.

When ``MONGODB_URI`` is set, sessions are persisted to MongoDB so they survive
API restarts.  When MongoDB is unavailable (local dev without Docker), the
store falls back to a plain dict -- identical to the original behaviour.

The store keeps live Python objects (Graph, VulnerabilityReport, etc.) in an
in-memory cache for fast access during active computation, and periodically
flushes serialised snapshots to MongoDB for durability.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------


class ChatMessage:
    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content
        self.timestamp: datetime = datetime.now(UTC)

    def to_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


class Session:
    """A single analysis session holding all pipeline state."""

    def __init__(self, session_id: str | None = None) -> None:
        self.session_id: str = session_id or uuid.uuid4().hex
        self.graph: Any | None = None
        self.vulnerability_report: Any | None = None
        self.state_tree: Any | None = None
        self.final_report: Any | None = None
        self.r_unit: str = "days"
        self.chat_history: list[ChatMessage] = []
        self.created_at: datetime = datetime.now(UTC)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        super().__init__(f"Session not found: {session_id}")


# ---------------------------------------------------------------------------
# In-memory store (fallback)
# ---------------------------------------------------------------------------


class _InMemoryStore:
    """Original dict-based session store -- zero dependencies."""

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

    def persist(self, session: Session) -> None:
        """No-op for in-memory store."""

    def close(self) -> None:
        """No-op."""


# ---------------------------------------------------------------------------
# MongoDB-backed store
# ---------------------------------------------------------------------------


class _MongoStore:
    """Session store backed by MongoDB.

    Live Python objects are cached in memory for fast access.  A ``persist``
    call serialises the session's graph to MongoDB so it survives restarts.
    Sessions are automatically persisted on create and on ``persist`` calls.
    """

    def __init__(self, uri: str) -> None:
        from pymongo import MongoClient

        self._client: Any = MongoClient(uri, serverSelectionTimeoutMS=5000)
        self._db = self._client.get_default_database()
        self._col = self._db["sessions"]

        # Ensure index on session_id
        self._col.create_index("session_id", unique=True)

        # In-memory cache of active sessions
        self._cache: dict[str, Session] = {}

        logger.info("MongoDB session store connected: %s", uri)

    def create(self) -> Session:
        session = Session()
        self._cache[session.session_id] = session

        # Write metadata to MongoDB
        self._col.insert_one({
            "session_id": session.session_id,
            "r_unit": session.r_unit,
            "created_at": session.created_at,
            "has_graph": False,
            "has_report": False,
        })

        return session

    def get(self, session_id: str) -> Session | None:
        # Check memory cache first
        if session_id in self._cache:
            return self._cache[session_id]

        # Try to restore from MongoDB
        doc = self._col.find_one({"session_id": session_id})
        if doc is None:
            return None

        session = Session(session_id=session_id)
        session.r_unit = doc.get("r_unit", "days")
        session.created_at = doc.get("created_at", datetime.now(UTC))

        # Restore graph from stored data if available
        graph_data = doc.get("graph_data")
        if graph_data is not None:
            try:
                from nexus_api.models.graph import Graph

                session.graph = Graph.from_dict(graph_data)
            except Exception as exc:
                logger.warning("Failed to restore graph for session %s: %s", session_id, exc)

        self._cache[session_id] = session
        return session

    def require(self, session_id: str) -> Session:
        session = self.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        return session

    def delete(self, session_id: str) -> None:
        self._cache.pop(session_id, None)
        self._col.delete_one({"session_id": session_id})

    def list_ids(self) -> list[str]:
        docs = self._col.find({}, {"session_id": 1, "_id": 0}).sort("created_at", -1)
        return [d["session_id"] for d in docs]

    def persist(self, session: Session) -> None:
        """Serialise current graph state to MongoDB for durability."""
        update: dict[str, Any] = {
            "r_unit": session.r_unit,
            "has_graph": session.graph is not None,
            "has_report": session.final_report is not None,
        }

        if session.graph is not None:
            try:
                update["graph_data"] = session.graph.to_dict()
            except Exception as exc:
                logger.warning("Failed to serialise graph for persist: %s", exc)

        self._col.update_one(
            {"session_id": session.session_id},
            {"$set": update},
            upsert=True,
        )

    def close(self) -> None:
        self._client.close()


# ---------------------------------------------------------------------------
# Store factory
# ---------------------------------------------------------------------------


def _create_store() -> _InMemoryStore | _MongoStore:
    """Create the appropriate session store based on environment."""
    uri = os.environ.get("MONGODB_URI", "")
    if not uri:
        logger.info("MONGODB_URI not set — using in-memory session store")
        return _InMemoryStore()

    try:
        mongo_store = _MongoStore(uri)
        # Verify the connection works
        mongo_store._client.admin.command("ping")
        return mongo_store
    except Exception as exc:
        logger.warning(
            "MongoDB unavailable (%s) — falling back to in-memory store", exc
        )
        return _InMemoryStore()


store = _create_store()
