from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)

_EMAIL_PATTERN = re.compile(
    r"^(?=.{3,254}$)(?=.{1,64}@)[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$",
    re.IGNORECASE,
)


def normalize_email(email: str) -> str:
    return unicodedata.normalize("NFKC", email).strip().lower()


def is_valid_email(email: str) -> bool:
    normalized = normalize_email(email)
    if ".." in normalized:
        return False
    return _EMAIL_PATTERN.fullmatch(normalized) is not None


class WaitlistEntry(BaseModel):
    email: str
    normalized_email: str
    company: str = ""
    created_at: datetime
    source_ip: str | None = None
    user_agent: str = ""


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self._limit = limit
        self._window_seconds = window_seconds
        self._events: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        window_start = now - self._window_seconds

        with self._lock:
            bucket = [ts for ts in self._events.get(key, []) if ts >= window_start]
            if len(bucket) >= self._limit:
                self._events[key] = bucket
                return False

            bucket.append(now)
            self._events[key] = bucket
            return True

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


class _FileWaitlistStore:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def create_or_get(self, entry: WaitlistEntry) -> bool:
        with self._lock:
            existing = self._read_entries()
            if any(
                item.get("normalized_email") == entry.normalized_email for item in existing
            ):
                return False

            payload = entry.model_dump(mode="json")
            existing.append(payload)
            self._path.parent.mkdir(parents=True, exist_ok=True)

            tmp_path = self._path.with_suffix(".tmp")
            tmp_path.write_text(
                json.dumps(existing, indent=2),
                encoding="utf-8",
            )
            tmp_path.replace(self._path)
            return True

    def _read_entries(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []

        raw = self._path.read_text(encoding="utf-8").strip()
        if not raw:
            return []

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Waitlist file %s is invalid JSON. Reinitializing.", self._path)
            return []

        return data if isinstance(data, list) else []


class _MongoWaitlistStore:
    def __init__(self, uri: str) -> None:
        from pymongo import MongoClient

        self._client: Any = MongoClient(uri, serverSelectionTimeoutMS=5000)
        self._db = self._client.get_default_database()
        self._col = self._db["waitlist_entries"]
        self._col.create_index("normalized_email", unique=True)

    def create_or_get(self, entry: WaitlistEntry) -> bool:
        result = self._col.update_one(
            {"normalized_email": entry.normalized_email},
            {"$setOnInsert": entry.model_dump(mode="python")},
            upsert=True,
        )
        return result.upserted_id is not None


def _data_dir() -> Path:
    return Path(os.environ.get("HALKANTIR_DATA_DIR", "data"))


class WaitlistStore:
    def __init__(self) -> None:
        uri = os.environ.get("MONGODB_URI", "").strip()
        if uri:
            try:
                mongo_store = _MongoWaitlistStore(uri)
                mongo_store._client.admin.command("ping")
                self._store: _MongoWaitlistStore | _FileWaitlistStore = mongo_store
                return
            except Exception as exc:
                logger.warning(
                    "MongoDB waitlist store unavailable (%s). Falling back to file store.",
                    exc,
                )

        path = _data_dir() / "waitlist" / "launch-interest.json"
        self._store = _FileWaitlistStore(path)

    def create_or_get(
        self,
        *,
        email: str,
        company: str,
        source_ip: str | None,
        user_agent: str,
    ) -> bool:
        normalized_email = normalize_email(email)
        entry = WaitlistEntry(
            email=normalized_email,
            normalized_email=normalized_email,
            company=company[:160].strip(),
            created_at=datetime.now(UTC),
            source_ip=source_ip,
            user_agent=user_agent[:512],
        )
        return self._store.create_or_get(entry)
