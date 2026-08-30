"""Job wiring for the long solves (room now; isolation in M4)."""

from __future__ import annotations

import time

from . import runs as rs
from .config import Scene
from .jobs import RUNNER, Progress


def submit(rid: str, scene: Scene, kinds: list[str]) -> None:
    def job(progress: Progress) -> dict:
        summary, timings = {}, {}
        if "room" in kinds:
            from .room import compute_room

            rs.update_meta(rid, status="running")
            t0 = time.perf_counter()
            res, arrays = compute_room(scene, scene.room_solver, progress)
            timings["room_s"] = time.perf_counter() - t0
            rs.write_artifact(rid, "room.json", res)
            rs.write_artifact(rid, "room.npz", arrays)
            st = res["stats"]
            i = _nearest(res["t60"]["f"], 125)
            summary.update({"f_schroeder": st["f_schroeder"], "n_modes_below_cap": st["n_modes_below_cap"],
                            "t60_schroeder_125": res["t60"]["schroeder"][i], "t60_eyring_125": res["t60"]["eyring"][i],
                            "room_dofs": st["mesh"]["nodes"]})
        if "isolation" in kinds:
            from .isolation import compute_isolation

            rs.update_meta(rid, status="running")
            t0 = time.perf_counter()
            res, arrays = compute_isolation(scene, progress)
            timings["isolation_s"] = time.perf_counter() - t0
            rs.write_artifact(rid, "isolation.json", res)
            rs.write_artifact(rid, "isolation.npz", arrays)
            summary.update(res.get("summary", {}))
        rs.update_meta(rid, status="done", timings=timings, summary=summary)
        return summary

    def wrapped(progress: Progress) -> dict:
        try:
            return job(progress)
        except Exception as e:  # noqa: BLE001
            rs.update_meta(rid, status="failed", summary={"error": str(e)})
            raise

    RUNNER.submit(rid, "+".join(kinds), wrapped)


def _nearest(f, x) -> int:
    return min(range(len(f)), key=lambda i: abs(f[i] - x))
