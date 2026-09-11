"""Append-only run store on disk.

Layout:  data/runs/<YYYYMMDD-HHMMSS>-<hash8>/{inputs.json, meta.json, wall.json, room.json, isolation.json, notes.md}
Index:   data/runs/index.jsonl  (one line per run, appended at creation, rewritten only for metadata edits)

Runs are never overwritten: re-running identical inputs creates a new id whose
hash8 matches the earlier one, which is how the UI offers the cached run.
"""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import __version__
from .config import Scene
from .materials import data_dir


def runs_dir() -> Path:
    d = data_dir() / "runs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def scene_hash(scene: Scene) -> str:
    canon = json.dumps(scene.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()[:8]


def _git_sha() -> str | None:
    try:
        root = data_dir().parent
        return subprocess.check_output(["git", "-C", str(root), "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def provenance() -> dict:
    import scipy
    import skfem

    return {
        "soundroom": __version__,
        "git_sha": _git_sha(),
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit_fem": skfem.__version__,
        "platform": platform.platform(),
        "machine": platform.machine(),
    }


def new_run(scene: Scene, kinds: list[str], note: str = "", tags: list[str] | None = None) -> dict:
    """Create the run directory, write inputs + initial meta, append to the index. Returns the record."""
    now = datetime.now(timezone.utc)
    h = scene_hash(scene)
    rid = f"{now.strftime('%Y%m%d-%H%M%S')}-{h}"
    d = runs_dir() / rid
    if d.exists():  # same second + same hash: disambiguate
        rid += "-" + now.strftime("%f")[:3]
        d = runs_dir() / rid
    d.mkdir(parents=True)
    (d / "inputs.json").write_text(scene.model_dump_json(indent=1))
    meta = {
        "id": rid, "created": now.isoformat(), "name": scene.name, "kinds": kinds, "note": note,
        "tags": tags or [], "status": "created", "inputs_hash": h, "provenance": provenance(),
        "timings": {}, "summary": {}, "artifacts": ["inputs.json"],
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    with open(runs_dir() / "index.jsonl", "a") as fh:
        fh.write(json.dumps(_index_record(meta)) + "\n")
    return meta


def _index_record(meta: dict) -> dict:
    keys = ("id", "created", "name", "kinds", "note", "tags", "status", "inputs_hash", "summary")
    return {k: meta.get(k) for k in keys}


def write_artifact(rid: str, name: str, obj) -> None:
    d = runs_dir() / rid
    if name.endswith(".npz"):
        np.savez_compressed(d / name, **obj)
    else:
        (d / name).write_text(json.dumps(obj, indent=1))
    meta = load_meta(rid)
    if name not in meta["artifacts"]:
        meta["artifacts"].append(name)
    save_meta(meta)


def load_meta(rid: str) -> dict:
    return json.loads((runs_dir() / rid / "meta.json").read_text())


def save_meta(meta: dict) -> None:
    (runs_dir() / meta["id"] / "meta.json").write_text(json.dumps(meta, indent=1))
    _rewrite_index_entry(meta)


def update_meta(rid: str, **fields) -> dict:
    meta = load_meta(rid)
    for k, v in fields.items():
        if k in ("timings", "summary") and isinstance(v, dict):
            meta[k].update(v)
        else:
            meta[k] = v
    save_meta(meta)
    return meta


def _rewrite_index_entry(meta: dict) -> None:
    idx = runs_dir() / "index.jsonl"
    if not idx.exists():
        return
    lines = idx.read_text().splitlines()
    out = []
    for ln in lines:
        if not ln.strip():
            continue
        rec = json.loads(ln)
        out.append(json.dumps(_index_record(meta)) if rec["id"] == meta["id"] else ln)
    idx.write_text("\n".join(out) + "\n")


def list_runs() -> list[dict]:
    idx = runs_dir() / "index.jsonl"
    if not idx.exists():
        return []
    recs = [json.loads(ln) for ln in idx.read_text().splitlines() if ln.strip()]
    return sorted(recs, key=lambda r: r["created"], reverse=True)


def load_run(rid: str, artifacts: bool = True) -> dict:
    d = runs_dir() / rid
    if not d.exists():
        raise FileNotFoundError(rid)
    meta = load_meta(rid)
    out = {"meta": meta, "inputs": json.loads((d / "inputs.json").read_text())}
    if artifacts:
        for name in meta["artifacts"]:
            if name.endswith(".json") and name not in ("inputs.json", "meta.json"):
                out[name[:-5]] = json.loads((d / name).read_text())
    return out


def load_artifact(rid: str, name: str):
    p = runs_dir() / rid / name
    if name.endswith(".npz"):
        with np.load(p) as z:
            return {k: z[k] for k in z.files}
    return json.loads(p.read_text())
