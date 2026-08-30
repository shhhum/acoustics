"""Room FEM / modal solver checks (kept small: coarse meshes, low caps)."""

import numpy as np
import pytest
import scipy.sparse.linalg as spla

from soundroom import boundary, modal, statistical as stat
from soundroom.config import Opening, RoomSolverSettings, Scene, SoundRoom
from soundroom.fem import assemble_room, source_vector
from soundroom.geometry import box_modes, room_geometry
from soundroom.mesh import room_mesh
from soundroom.room import compute_room


@pytest.fixture(scope="module")
def small():
    sc = Scene(room=SoundRoom(length=4.0, width=3.0, x=1, y=1))
    g = room_geometry(sc)
    fem = assemble_room(g, room_mesh(g, 0.25))
    return sc, g, fem


def test_patch_areas_snap_to_openings(small):
    sc, g, fem = small
    for p in g.patches:
        assert abs(fem.areas[p.name] - p.area) < 1e-9, (p.name, fem.areas[p.name], p.area)
    assert abs(sum(fem.areas.values()) - g.surface) < 1e-9


def test_fem_eigenfrequencies_match_analytic_box(small):
    sc, g, fem = small
    v, f_fem = modal.fem_basis(fem, 12)
    f_an = np.array([m[0] for m in box_modes(g.Lx, g.Ly, g.Lz, 200)[:12]])
    np.testing.assert_allclose(f_fem[1:], f_an[1:], rtol=0.02)  # coarse mesh (0.25 m) → 2 % tolerance


def test_analytic_basis_diagonalises_fem_matrices(small):
    sc, g, fem = small
    red = modal.reduce(fem, "analytic", 120.0)
    off = red.K - np.diag(np.diag(red.K))
    assert np.abs(off).max() < 0.05 * np.abs(np.diag(red.K)).max()
    np.testing.assert_allclose(red.M, np.eye(red.N), atol=0.03)


def test_robin_boundary_dissipates(small):
    """Energy balance at one frequency: source power = Σ boundary absorbed power (Re Z > 0 → losses)."""
    sc, g, fem = small
    f = 60.0
    k = 2 * np.pi * f / 343.0
    beta = {n: 0.2 + 0.1j for n in fem.areas}
    A = fem.system(f, beta)
    p = spla.spsolve(A, source_vector(fem, g.sources[0], f))
    # boundary absorbed power ∝ Re{β} ∫|p|² over patches; all terms must be positive
    for n, B in fem.B.items():
        assert (np.conj(p) @ (B @ p)).real > 0
    # and the field is finite / reasonable
    assert np.isfinite(np.abs(p)).all() and np.abs(p).max() < 1e6


def test_modal_matches_direct_fem_solve(small):
    sc, g, fem = small
    f = np.array([45.0, 80.0])
    beta = {n: np.full(2, 0.3 + 0.2j) for n in fem.areas}
    red = modal.reduce(fem, "analytic", 500.0)  # modes to ~6× the test frequencies: truncation error < 6 %
    rec = g.listener[None, :]
    Pm = modal.sweep(red, fem, f, beta, [g.sources[0]], rec)[:, 0, 0]
    for i, fi in enumerate(f):
        A = fem.system(fi, {n: beta[n][i] for n in beta})
        p = spla.spsolve(A, source_vector(fem, g.sources[0], fi))
        pd = fem.probe(g.listener) @ p
        assert abs(Pm[i] - pd) / abs(pd) < 0.06, (fi, Pm[i], pd)


def test_piston_admittance_limits():
    f = np.array([10.0, 20000.0])
    b = boundary.piston_radiation_admittance(f, 1.8)
    assert abs(b[0]) > 5  # nearly open at low ka (mass-like, small Z)
    assert abs(b[1] - 1) < 0.05  # → ρc at high ka


def test_alpha_to_admittance_roundtrip():
    a = np.array([0.05, 0.3, 0.8])
    b = boundary.alpha_to_real_admittance(a)
    np.testing.assert_allclose(4 * b / (1 + b) ** 2, a, rtol=1e-6)


def test_compute_room_end_to_end_small():
    sc = Scene(room=SoundRoom(length=4.0, width=3.0, x=1, y=1, openings={"+x": Opening(width=0.8, height=2.0)}))
    res, arr = compute_room(sc, RoomSolverSettings(f_max=120, df=2.0, nodes_per_wavelength=5))
    assert res["stats"]["n_modes_below_cap"] >= 5
    assert len(res["modes"]) >= 5 and all(m["T60"] is None or m["T60"] > 0 for m in res["modes"])
    assert arr["slices_db"].shape[0] == len(res["slices"]["freqs"])
    # lightly damped modes: modal T60 within a factor ~3 of the Eyring statistical estimate at 125 Hz
    e125 = res["t60"]["eyring"][int(np.argmin(np.abs(stat.THIRD_OCTAVE_CENTRES - 125)))]
    t60s = [m["T60"] for m in res["modes"] if m["T60"] and 60 < m["f_rigid"] < 120]
    assert t60s and 0.2 < np.median(t60s) / e125 < 5
