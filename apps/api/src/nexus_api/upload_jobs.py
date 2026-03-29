from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass
class UploadJob:
    job_id: str
    session_id: str
    status: str = "queued"
    progress: float = 0.0
    stage_message: str = "Queued"
    graph_preview: dict[str, Any] = field(
        default_factory=lambda: {"layers": [], "nodes": [], "edges": []}
    )
    metrics: dict[str, Any] = field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    finished_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "session_id": self.session_id,
            "status": self.status,
            "progress": self.progress,
            "stage_message": self.stage_message,
            "graph_preview": self.graph_preview,
            "metrics": self.metrics,
            "error": self.error,
        }


class UploadJobNotFoundError(Exception):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"Upload job not found: {job_id}")
        self.job_id = job_id


class UploadJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, UploadJob] = {}
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}

    def create(self, session_id: str) -> UploadJob:
        job = UploadJob(job_id=uuid.uuid4().hex, session_id=session_id)
        self._jobs[job.job_id] = job
        self._subscribers[job.job_id] = set()
        return job

    def get(self, job_id: str) -> UploadJob | None:
        return self._jobs.get(job_id)

    def require(self, job_id: str) -> UploadJob:
        job = self.get(job_id)
        if job is None:
            raise UploadJobNotFoundError(job_id)
        return job

    def subscribe(self, job_id: str) -> asyncio.Queue[dict[str, Any]]:
        self.require(job_id)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.setdefault(job_id, set()).add(queue)
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        subscribers = self._subscribers.get(job_id)
        if subscribers is not None:
            subscribers.discard(queue)

    def update(
        self,
        job_id: str,
        *,
        status: str | None = None,
        progress: float | None = None,
        stage_message: str | None = None,
        graph_preview: dict[str, Any] | None = None,
        metrics: dict[str, Any] | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> UploadJob:
        job = self.require(job_id)
        if job.started_at is None and status not in {"queued", None}:
            job.started_at = datetime.now(UTC)
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = progress
        if stage_message is not None:
            job.stage_message = stage_message
        if graph_preview is not None:
            job.graph_preview = graph_preview
        if metrics is not None:
            job.metrics = metrics
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        if job.status in {"completed", "failed"}:
            job.finished_at = datetime.now(UTC)
        return job

    def publish(self, job_id: str, event: dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(job_id, set())):
            queue.put_nowait(event)


upload_jobs = UploadJobStore()
