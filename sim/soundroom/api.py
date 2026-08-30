"""Local HTTP API (FastAPI) for the UI. All routes under /api; Vite proxies /api → :8765."""

from __future__ import annotations

import json
import time

import numpy as np
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import runs as rs
from .config import Scene, WallSolverSettings, WallStack
from .jobs import RUNNER
from .materials import data_dir, load_presets
from .wall import compute_wall

app = FastAPI(title="soundroom", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class WallRequest(BaseModel):
    wall: WallStack
    wall_solver: WallSolverSettings = WallSolverSettings()


class RunRequest(BaseModel):
    scene: Scene
    kinds: list[str] = ["wall"]
    note: str = ""
    tags: list[str] = []


class MetaPatch(BaseModel):
    note: str | None = None
    tags: list[str] | None = None


@app.get("/api/health")
def health():
    return {"ok": True, "provenance": rs.provenance()}


@app.post("/api/wall/compute")
def wall_compute(req: WallRequest):
    t0 = time.perf_counter()
    res = compute_wall(req.wall, req.wall_solver)
    res["elapsed_ms"] = (time.perf_counter() - t0) * 1e3
    return res


@app.get("/api/materials")
def materials():
    return load_presets()


@app.get("/api/presets")
def presets():
    d = data_dir() / "presets"
    # validate through the schema so presets written by older versions pick up new defaults
    return [{"name": p.stem, "scene": Scene.model_validate(json.loads(p.read_text())).model_dump(mode="json")} for p in sorted(d.glob("*.json"))]


@app.put("/api/presets/{name}")
def put_preset(name: str, scene: Scene):
    if not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "preset name must be alphanumeric/-/_")
    p = data_dir() / "presets" / f"{name}.json"
    if p.exists() and name == "default":
        raise HTTPException(403, "the default preset is versioned in git; save under another name")
    p.write_text(scene.model_dump_json(indent=1))
    return {"ok": True, "name": name}


@app.post("/api/runs")
def create_run(req: RunRequest):
    unknown = [k for k in req.kinds if k not in ("wall", "room", "isolation")]
    if unknown:
        raise HTTPException(400, f"unknown kinds {unknown}")
    meta = rs.new_run(req.scene, req.kinds, req.note, req.tags)
    rid = meta["id"]
    timings, summary = {}, {}
    if "wall" in req.kinds:
        t0 = time.perf_counter()
        res = compute_wall(req.scene.wall, req.scene.wall_solver)
        timings["wall_s"] = time.perf_counter() - t0
        rs.write_artifact(rid, "wall.json", res)
        summary.update(_wall_summary(res))
    pending = [k for k in req.kinds if k in ("room", "isolation")]
    if pending:
        meta = rs.update_meta(rid, status="queued", timings=timings, summary=summary)
        _submit_solver_jobs(rid, req.scene, pending)
    else:
        meta = rs.update_meta(rid, status="done", timings=timings, summary=summary)
    return meta


def _submit_solver_jobs(rid: str, scene: Scene, kinds: list[str]) -> None:
    from . import solvers

    solvers.submit(rid, scene, kinds)


def _wall_summary(res: dict) -> dict:
    import numpy as np

    f = np.array(res["f"])
    a = np.array(res["alpha_air"]["field"])
    tl = np.array(res["TL"]["field"])

    def at(x, arr):
        return float(arr[int(np.argmin(np.abs(f - x)))])

    return {"thickness_mm": res["thickness"] * 1e3, "alpha_field_125": at(125, a), "alpha_field_500": at(500, a),
            "TL_field_125": at(125, tl), "TL_field_500": at(500, tl),
            "sigma_d_over_rho_c": res["markers"].get("total_sigma_d_over_rho_c")}


@app.get("/api/runs")
def list_runs():
    return rs.list_runs()


@app.get("/api/runs/{rid}")
def get_run(rid: str):
    try:
        return rs.load_run(rid)
    except FileNotFoundError:
        raise HTTPException(404, rid)


@app.patch("/api/runs/{rid}")
def patch_run(rid: str, patch: MetaPatch):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    try:
        return rs.update_meta(rid, **fields)
    except FileNotFoundError:
        raise HTTPException(404, rid)


@app.get("/api/runs/{rid}/artifact/{name}")
def get_artifact(rid: str, name: str):
    p = Path(rs.runs_dir()) / rid / name
    if not p.exists() or name.endswith(".npz"):
        raise HTTPException(404, name)
    return json.loads(p.read_text())


@app.get("/api/runs/{rid}/slices")
def get_slices(rid: str):
    """Pressure-map slices from room.npz (kept out of room.json to keep it small)."""
    try:
        arr = rs.load_artifact(rid, "room.npz")
        room = rs.load_artifact(rid, "room.json")
    except FileNotFoundError:
        raise HTTPException(404, rid)
    return {"freqs": room["slices"]["freqs"], "slices_db": [np.round(s, 1).tolist() for s in arr["slices_db"]]}


@app.get("/api/runs/{rid}/progress")
def run_progress(rid: str):
    st = RUNNER.status(rid)
    if st is None:
        meta = rs.load_meta(rid)
        return {"id": rid, "status": meta["status"], "progress": 1.0 if meta["status"] == "done" else 0.0, "message": ""}
    return st


@app.post("/api/runs/{rid}/cancel")
def cancel_run(rid: str):
    ok = RUNNER.cancel(rid)
    if ok:
        rs.update_meta(rid, status="cancelled")
    return {"cancelled": ok}
