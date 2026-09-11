"""Background job runner for long solves (room / isolation), with progress reporting and cancellation.

Jobs run in a worker thread; the heavy numerical work releases the GIL inside
numpy/scipy, and per-frequency parallelism is handled inside the solvers with
multiprocessing. Progress is polled via ``status(job_id)``.
"""

from __future__ import annotations

import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"  # queued | running | done | failed | cancelled
    progress: float = 0.0
    message: str = ""
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    result: dict | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def to_dict(self) -> dict:
        return {"id": self.id, "kind": self.kind, "status": self.status, "progress": self.progress,
                "message": self.message, "started": self.started, "finished": self.finished, "error": self.error}


class Progress:
    """Handle passed to solvers: call .update(fraction, message); raises if cancelled."""

    def __init__(self, job: Job):
        self.job = job

    def update(self, fraction: float, message: str = "") -> None:
        if self.job.cancel_event.is_set():
            raise JobCancelled()
        self.job.progress = float(fraction)
        if message:
            self.job.message = message


class JobCancelled(Exception):
    pass


class JobRunner:
    def __init__(self, workers: int = 1):
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()

    def submit(self, job_id: str, kind: str, fn: Callable[[Progress], dict]) -> Job:
        job = Job(id=job_id, kind=kind)
        with self.lock:
            self.jobs[job_id] = job

        def run():
            job.status, job.started = "running", time.time()
            try:
                job.result = fn(Progress(job))
                job.status, job.progress = "done", 1.0
            except JobCancelled:
                job.status = "cancelled"
            except Exception as e:  # noqa: BLE001
                job.status, job.error = "failed", f"{e}\n{traceback.format_exc()}"
            finally:
                job.finished = time.time()

        self.pool.submit(run)
        return job

    def status(self, job_id: str) -> dict | None:
        job = self.jobs.get(job_id)
        return job.to_dict() if job else None

    def cancel(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job or job.status not in ("queued", "running"):
            return False
        job.cancel_event.set()
        return True


RUNNER = JobRunner(workers=1)
