import json

import pytest
from fastapi.testclient import TestClient

from soundroom import runs as rs
from soundroom.api import app
from soundroom.config import Scene


@pytest.fixture
def client(tmp_path, monkeypatch):
    # isolate the run store in a temp dir
    monkeypatch.setattr(rs, "runs_dir", lambda: tmp_path)
    return TestClient(app)


def test_wall_compute_endpoint(client):
    r = client.post("/api/wall/compute", json={"wall": Scene().wall.model_dump(mode="json")})
    assert r.status_code == 200
    body = r.json()
    assert len(body["f"]) == 400 and "alpha_air" in body and body["elapsed_ms"] < 2000


def test_run_store_roundtrip(client, tmp_path):
    scene = Scene(name="t1")
    r = client.post("/api/runs", json={"scene": scene.model_dump(mode="json"), "kinds": ["wall"], "note": "first"})
    assert r.status_code == 200, r.text
    meta = r.json()
    rid = meta["id"]
    assert meta["status"] == "done" and "wall.json" in meta["artifacts"] and meta["provenance"]["numpy"]
    assert (tmp_path / rid / "wall.json").exists()
    lst = client.get("/api/runs").json()
    assert lst[0]["id"] == rid and lst[0]["note"] == "first"
    full = client.get(f"/api/runs/{rid}").json()
    assert full["inputs"]["name"] == "t1" and "alpha_air" in full["wall"]
    client.patch(f"/api/runs/{rid}", json={"note": "edited", "tags": ["a"]})
    assert client.get("/api/runs").json()[0]["note"] == "edited"
    # identical inputs → new id, same hash (append-only, never overwritten)
    r2 = client.post("/api/runs", json={"scene": scene.model_dump(mode="json"), "kinds": ["wall"]})
    assert r2.json()["id"] != rid and r2.json()["inputs_hash"] == meta["inputs_hash"]


def test_unknown_kind_rejected(client):
    r = client.post("/api/runs", json={"scene": Scene().model_dump(mode="json"), "kinds": ["bogus"]})
    assert r.status_code == 400


def test_rooms_crud_roundtrip(client):
    room = {"length": 5.8, "width": 6.2, "x": 1.0, "y": 0.9, "source_face": "-x",
            "source_height": 1.2, "source_inset": 0.5, "openings": {"+x": {"width": 1.2, "height": 2.0}}}
    r = client.put("/api/rooms/test room", json=room)
    assert r.status_code == 200
    rooms = client.get("/api/rooms").json()
    mine = next(x for x in rooms if x["name"] == "test room")
    assert mine["room"]["length"] == 5.8 and "5.8×6.2" in mine["dims"]
    assert client.delete("/api/rooms/test room").status_code == 200
    assert all(x["name"] != "test room" for x in client.get("/api/rooms").json())
