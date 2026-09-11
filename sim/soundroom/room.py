"""Room solve orchestration: scene → mesh → FEM → modal sweep → FRF / T60 / modes / pressure slices."""

from __future__ import annotations

import time

import numpy as np

from . import boundary, modal, statistical as stat
from .config import RoomSolverSettings, Scene
from .constants import AIR
from .fem import assemble_room
from .geometry import room_geometry
from .mesh import element_size, mesh_stats, room_mesh


def compute_room(scene: Scene, settings: RoomSolverSettings | None = None, progress=None) -> tuple[dict, dict]:
    """Returns (json-serialisable results, arrays for the .npz)."""
    s = settings or scene.room_solver
    t = {}
    tick = lambda frac, msg="": progress.update(frac, msg) if progress else None  # noqa: E731

    t0 = time.perf_counter()
    g = room_geometry(scene)
    h = element_size(s.f_max, s.nodes_per_wavelength)
    mesh = room_mesh(g, h)
    fem = assemble_room(g, mesh)
    t["mesh_assemble_s"] = time.perf_counter() - t0
    tick(0.05, f"assembled {fem.ndof} dofs")

    t0 = time.perf_counter()
    f_basis = s.f_max * s.basis_margin
    red = modal.reduce(fem, s.basis, f_basis, s.n_modes)
    t["basis_s"] = time.perf_counter() - t0
    tick(0.35, f"{red.N} modes ({s.basis} basis)")

    # frequency grid: uniform for the IR, starting at 0
    f = np.arange(0.0, s.f_max + s.df / 2, s.df)
    f_eval = np.maximum(f, 1e-3)
    beta = boundary.patch_admittances(scene, f_eval, fem.areas, s.wall_angle_deg)
    t0 = time.perf_counter()
    P = modal.sweep(red, fem, f_eval, beta, g.sources, g.listener[None, :], progress=lambda x: tick(0.35 + 0.4 * x, "sweeping"))
    t["sweep_s"] = time.perf_counter() - t0
    p_src = P[:, :, 0]  # nf × nsrc
    p_sum = p_src.sum(axis=1)
    db_src = modal.to_db_re_free_field(p_src, f_eval)
    db_sum = modal.to_db_re_free_field(p_sum, f_eval)
    tick(0.78, "impulse response")

    # T60: Schroeder per 1/3-octave, statistical, modal
    centres = stat.THIRD_OCTAVE_CENTRES
    H = p_sum / (2 * np.pi * f_eval * AIR.rho0)  # normalise the jω source factor → flat-spectrum excitation
    H[0] = 0
    t60_schroeder = modal.t60_by_band(H, f, centres)
    alpha = boundary.patch_alpha_field(scene, np.maximum(centres, 1.0), fem.areas)
    A = sum(fem.areas[n] * alpha[n] for n in fem.areas)
    S = sum(fem.areas.values())
    m_air = stat.air_attenuation_coefficient(centres)
    t60_sabine = stat.sabine_t60(g.volume, A, m_air)
    t60_eyring = stat.eyring_t60(g.volume, S, A / S, m_air)
    tick(0.85, "modal damping")
    t0 = time.perf_counter()
    refs = np.array([c for c in stat.OCTAVE_CENTRES if c <= s.f_max] or [s.f_max])
    beta_fn = lambda ff: boundary.patch_admittances(scene, ff, fem.areas, s.wall_angle_deg)  # noqa: E731
    modes = modal.modal_damping(red, beta_fn, refs, s.f_max)
    t["modal_damping_s"] = time.perf_counter() - t0
    tick(0.92, "pressure maps")

    # pressure slices at listener height at selected frequencies
    nx, ny = 60, 40
    xs = np.linspace(0.02, g.Lx - 0.02, nx)
    ys = np.linspace(0.02, g.Ly - 0.02, ny)
    X, Y = np.meshgrid(xs, ys)
    pts = np.vstack([X.ravel(), Y.ravel(), np.full(X.size, g.listener[2])])
    slice_freqs = sorted({round(m["f_damped"], 1) for m in modes if m["f_damped"] <= min(160.0, s.f_max)} | {63.0, 125.0}
                         | ({250.0} if s.f_max >= 250 else set()))
    slice_freqs = [x for x in slice_freqs if 0 < x <= s.f_max][:40]
    slices = np.empty((len(slice_freqs), ny, nx))
    for i, fs in enumerate(slice_freqs):
        b_at = {n: complex(boundary.patch_admittances(scene, np.array([fs]), fem.areas, s.wall_angle_deg)[n][0]) for n in fem.areas}
        p = modal.field_on_points(red, fem, fs, b_at, g.sources, pts)
        slices[i] = (20 * np.log10(np.maximum(np.abs(p), 1e-30) / (2 * np.pi * fs * AIR.rho0 / (4 * np.pi)))).reshape(ny, nx)
    tick(0.98, "writing")

    n_below = int(np.sum(red.f_rigid <= s.f_max))
    i500 = int(np.argmin(np.abs(centres - 500)))
    t60_mid = float(np.nanmean([t60_eyring[i500]]))
    f_schroeder = stat.schroeder_frequency(t60_mid, g.volume)
    out = {
        "f": f.tolist(),
        "frf": {"sum_db": db_sum.tolist(), "source_db": [db_src[:, j].tolist() for j in range(db_src.shape[1])],
                "reference": "dB re free-field level of one source at 1 m"},
        "t60": {"f": centres.tolist(), "schroeder": _nan_none(t60_schroeder), "sabine": t60_sabine.tolist(), "eyring": t60_eyring.tolist()},
        "modes": modes,
        "stats": {"V": g.volume, "S": S, "areas": fem.areas, "f_schroeder": float(f_schroeder), "t60_mid_eyring": t60_mid,
                  "n_modes_below_cap": n_below, "N_basis": red.N, "basis": red.basis, "h": h, "mesh": mesh_stats(mesh),
                  "sources": [x.tolist() for x in g.sources], "listener": g.listener.tolist(),
                  "openings": {k: list(v) for k, v in g.openings.items()}, "Lx": g.Lx, "Ly": g.Ly, "Lz": g.Lz},
        "slices": {"z": float(g.listener[2]), "x": xs.tolist(), "y": ys.tolist(), "freqs": slice_freqs},
        "timings": t,
    }
    arrays = {"slices_db": slices, "p_sum": p_sum, "p_src": p_src, "f": f}
    return out, arrays


def _nan_none(a) -> list:
    return [None if np.isnan(x) else float(x) for x in np.asarray(a, dtype=float)]
