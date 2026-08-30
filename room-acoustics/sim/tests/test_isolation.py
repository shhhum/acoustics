"""Coupled venue + room model checks (coarse meshes, few frequencies, single worker)."""

import numpy as np
import pytest

from soundroom import statistical as stat, tmm
from soundroom.config import IsolationSolverSettings, Listener, Opening, Plywood, Scene, SoundRoom, Venue
from soundroom.coupled import build_coupled, solve_sweep
from soundroom.isolation import compute_isolation, default_receivers, statistical_level_difference
from soundroom.wall import build_layers


def small_scene(**room):
    base = dict(length=3.0, width=2.5, x=1.5, y=1.0, openings={"+x": Opening(width=0.8, height=1.8)})
    base.update(room)
    return Scene(venue=Venue(length=8.0, width=5.0, height=2.5), room=SoundRoom(**base), listener=Listener(x=1.5, y=1.2, z=1.2))


def test_coupled_mesh_pairs_every_inner_facet():
    sc = small_scene()
    m = build_coupled(sc, 0.3)
    g_area = 2 * (3.0 + 2.5) * 2.5 - 0.8 * 1.8
    assert abs(m.areas["wall_paired"] - g_area) < 1e-6
    assert abs(m.areas["wall_total"] - m.areas["wall_paired"]) < 1e-9  # no unpaired inner facets
    assert m.room_nodes.size > 0 and m.venue_nodes.size > m.room_nodes.size


def _sweep(sc, f, workers=1):
    m = build_coupled(sc, 0.3)
    layers, _ = build_layers(sc.wall)
    T = tmm.normal_two_port(layers, f)
    beta = {"floor": np.full(f.size, 0.1 + 0j), "ceiling": np.full(f.size, 0.1 + 0j), "walls": np.full(f.size, 0.1 + 0j)}
    rec = np.array(default_receivers(sc))
    pts = np.array([[7.0], [4.0], [1.2]])
    res = solve_sweep(m, f, T, beta, rec, pts, workers=workers)
    return m, res


def test_no_openings_heavy_wall_isolates():
    f = np.array([60.0, 120.0])
    sealed = small_scene(openings={})
    sealed.wall.plywood = Plywood(thickness=0.05, density=2000)  # 100 kg/m² leaf
    m, res = _sweep(sealed, f)
    D = [10 * np.log10(r["room_ms"] / r["venue_ms"]) for r in res]
    assert min(D) > 25, D


def test_openings_dominate_over_heavy_wall():
    f = np.array([60.0, 120.0])
    sc = small_scene()
    sc.wall.plywood = Plywood(thickness=0.05, density=2000)
    m, res = _sweep(sc, f)
    D_open = [10 * np.log10(r["room_ms"] / r["venue_ms"]) for r in res]
    sealed = small_scene(openings={})
    sealed.wall.plywood = Plywood(thickness=0.05, density=2000)
    _, res2 = _sweep(sealed, f)
    D_sealed = [10 * np.log10(r["room_ms"] / r["venue_ms"]) for r in res2]
    assert all(a < b - 10 for a, b in zip(D_open, D_sealed)), (D_open, D_sealed)


def test_light_wall_transmits_more_than_heavy_wall():
    """Averaged over a few frequencies (single-frequency D has modal variance of several dB)."""
    f = np.array([60.0, 80.0, 120.0])
    light = small_scene(openings={})
    light.wall.plywood = Plywood(thickness=0.006, density=500)
    heavy = small_scene(openings={})
    heavy.wall.plywood = Plywood(thickness=0.025, density=700)
    _, r1 = _sweep(light, f)
    _, r2 = _sweep(heavy, f)
    D1 = np.mean([10 * np.log10(r["room_ms"] / r["venue_ms"]) for r in r1])
    D2 = np.mean([10 * np.log10(r["room_ms"] / r["venue_ms"]) for r in r2])
    assert D2 > D1 + 6, (D1, D2)  # 3 vs 17.5 kg/m² behind 100 mm wool: stack TL differs by ~10 dB


def test_statistical_model_shape():
    sc = small_scene()
    f = np.geomspace(20, 10000, 30)
    st = statistical_level_difference(sc, f, default_receivers(sc))
    assert len(st["D_receivers"]) == len(default_receivers(sc))
    assert st["TL_max_openings"] == pytest.approx(stat.opening_limited_tl(0.8 * 1.8, 2 * (3.0 + 2.5) * 2.5), rel=1e-6)
    assert np.all(np.array(st["TL_composite"]) <= st["TL_max_openings"] + 1e-6)


def test_compute_isolation_end_to_end_small():
    sc = small_scene()
    sc.isolation_solver = IsolationSolverSettings(f_max=80, points_per_octave=3, nodes_per_wavelength=4, workers=1)
    res, arr = compute_isolation(sc)
    assert len(res["fem"]["f"]) == len(res["fem"]["D_venue_avg"]) >= 4
    assert arr["slices_db"].shape[0] == len(res["fem"]["f"])
    assert res["summary"]["TL_max_openings"] is not None
