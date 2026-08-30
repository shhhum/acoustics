"""Inside→outside level difference: coupled FEM up to the cap, statistical (composite TL + power route) above."""

from __future__ import annotations

import time

import numpy as np

from . import boundary, statistical as stat, tmm
from .config import IsolationSolverSettings, Scene
from .constants import AIR
from .coupled import build_coupled, solve_sweep
from .geometry import room_geometry
from .mesh import element_size
from .wall import build_layers


def default_receivers(scene: Scene) -> list[list[float]]:
    """1 m outside each opening at listener height, venue centre, far corner."""
    g = room_geometry(scene)
    x0, y0, t = scene.room.x, scene.room.y, scene.wall.thickness
    z = scene.listener.z
    pts = []
    for face, (u0, u1, v0, v1) in g.openings.items():
        cu = (u0 + u1) / 2
        if face == "-x":
            pts.append([x0 - t - 1.0, y0 + cu, z])
        elif face == "+x":
            pts.append([x0 + g.Lx + t + 1.0, y0 + cu, z])
        elif face == "-y":
            pts.append([x0 + cu, y0 - t - 1.0, z])
        else:
            pts.append([x0 + cu, y0 + g.Ly + t + 1.0, z])
    v = scene.venue
    pts.append([v.length / 2, v.width / 2, z])
    far = [v.length - 0.5, v.width - 0.5, z] if x0 < v.length / 2 else [0.5, 0.5, z]
    pts.append(far)
    # keep only receivers inside the venue and outside the room+wall
    out = []
    for p in pts:
        inside_room = (x0 - t <= p[0] <= x0 + g.Lx + t) and (y0 - t <= p[1] <= y0 + g.Ly + t)
        if 0 < p[0] < v.length and 0 < p[1] < v.width and not inside_room:
            out.append([round(float(x), 3) for x in p])
    return out


def frequency_grid(s: IsolationSolverSettings) -> np.ndarray:
    n = int(np.ceil(np.log2(s.f_max / s.f_min) * s.points_per_octave))
    return s.f_min * 2 ** (np.arange(n + 1) / s.points_per_octave)


def statistical_level_difference(scene: Scene, f: np.ndarray, receivers: list[list[float]]) -> dict:
    """D(f) = L_in − L_out via composite TL per face and the power route into the venue."""
    g = room_geometry(scene)
    layers, _ = build_layers(scene.wall)
    tl_wall = tmm.field_transmission_loss(layers, f, 128, 78.0)
    v = scene.venue
    S_venue = 2 * (v.length * v.width + (v.length + v.width) * v.height)
    a_v = (boundary.octave_table_interp(v.alpha_floor, f) * v.length * v.width
           + boundary.octave_table_interp(v.alpha_ceiling, f) * v.length * v.width
           + boundary.octave_table_interp(v.alpha_walls, f) * 2 * (v.length + v.width) * v.height) / S_venue
    R_venue = stat.room_constant(S_venue, a_v)
    x0, y0, t = scene.room.x, scene.room.y, scene.wall.thickness
    faces = []
    for p in g.patches:
        if p.kind not in ("wall", "opening"):
            continue
        face = p.face
        if face == "-x":
            centre = [x0 - t, y0 + g.Ly / 2]
        elif face == "+x":
            centre = [x0 + g.Lx + t, y0 + g.Ly / 2]
        elif face == "-y":
            centre = [x0 + g.Lx / 2, y0 - t]
        else:
            centre = [x0 + g.Lx / 2, y0 + g.Ly + t]
        tl = tl_wall if p.kind == "wall" else np.zeros_like(f)
        faces.append((p.name, p.area, np.array(centre), tl))
    # radiated power per face (relative to L_in = 0 dB): W_i ∝ S_i 10^(-TL_i/10) / 4  (power route: −6 dB + 10 log S − TL)
    per_face = {}
    D_rec = []
    for r in receivers:
        r = np.array(r[:2])
        total = np.zeros_like(f)
        for name, S, centre, tl in faces:
            dist = max(np.linalg.norm(r - centre), 0.5)
            w = S * 10 ** (-tl / 10) / 4
            total += w * (2 / (4 * np.pi * dist**2) + 4 / R_venue)
        D_rec.append((-10 * np.log10(np.maximum(total, 1e-30))).tolist())
    total_avg = np.zeros_like(f)
    for name, S, centre, tl in faces:
        w = S * 10 ** (-tl / 10) / 4
        per_face[name] = {"area": S, "tl_field": tl.tolist()}
        total_avg += w * (4 / R_venue)
    D_avg = -10 * np.log10(np.maximum(total_avg, 1e-30))
    S_tot = sum(S for _, S, _, _ in faces)
    S_open = sum(S for n, S, _, _ in faces if n.startswith("open"))
    tl_comp = stat.composite_tl(np.array([S for _, S, _, _ in faces]), np.array([tl for _, _, _, tl in faces]))
    return {"f": f.tolist(), "D_receivers": D_rec, "D_venue_avg": D_avg.tolist(), "per_face": per_face,
            "TL_wall_field": tl_wall.tolist(), "TL_composite": tl_comp.tolist(),
            "TL_max_openings": float(stat.opening_limited_tl(S_open, S_tot)) if S_open > 0 else None,
            "open_fraction": S_open / S_tot, "R_venue": R_venue.tolist()}


def compute_isolation(scene: Scene, progress=None) -> tuple[dict, dict]:
    s = scene.isolation_solver
    tick = lambda frac, msg="": progress.update(frac, msg) if progress else None  # noqa: E731
    t = {}
    receivers = s.receivers or default_receivers(scene)
    f_stat = np.geomspace(20.0, 10000.0, 200)
    st = statistical_level_difference(scene, f_stat, receivers)
    tick(0.03, "statistical model")

    t0 = time.perf_counter()
    h = element_size(s.f_max, s.nodes_per_wavelength)
    model = build_coupled(scene, h)
    t["mesh_assemble_s"] = time.perf_counter() - t0
    tick(0.1, f"coupled mesh {model.ndof} dofs")

    f = frequency_grid(s)
    layers, _ = build_layers(scene.wall)
    T = tmm.normal_two_port(layers, f)
    v = scene.venue
    beta_v = {"floor": boundary.alpha_to_real_admittance(boundary.octave_table_interp(v.alpha_floor, f)).astype(complex),
              "ceiling": boundary.alpha_to_real_admittance(boundary.octave_table_interp(v.alpha_ceiling, f)).astype(complex),
              "walls": boundary.alpha_to_real_admittance(boundary.octave_table_interp(v.alpha_walls, f)).astype(complex)}
    nx, ny = 78, 40
    xs = np.linspace(0.05, v.length - 0.05, nx)
    ys = np.linspace(0.05, v.width - 0.05, ny)
    X, Y = np.meshgrid(xs, ys)
    pts_all = np.vstack([X.ravel(), Y.ravel(), np.full(X.size, scene.listener.z)])
    # points inside the wall band are outside the mesh (holes); probe only the rest
    x0, y0, tw = scene.room.x, scene.room.y, scene.wall.thickness
    g = model.geom
    in_outer = (pts_all[0] > x0 - tw) & (pts_all[0] < x0 + g.Lx + tw) & (pts_all[1] > y0 - tw) & (pts_all[1] < y0 + g.Ly + tw)
    in_inner = (pts_all[0] > x0) & (pts_all[0] < x0 + g.Lx) & (pts_all[1] > y0) & (pts_all[1] < y0 + g.Ly)
    valid = ~(in_outer & ~in_inner)
    pts = pts_all[:, valid]
    t0 = time.perf_counter()
    res = solve_sweep(model, f, T, beta_v, np.array(receivers, dtype=float), pts, s.workers,
                      progress=lambda x: tick(0.1 + 0.85 * x, f"solving {model.ndof} dofs"))
    t["sweep_s"] = time.perf_counter() - t0
    tick(0.97, "writing")

    room_db = np.array([10 * np.log10(max(r["room_ms"], 1e-30)) for r in res])
    venue_db = np.array([10 * np.log10(max(r["venue_ms"], 1e-30)) for r in res])
    p_rec = np.array([r["p_rec"] for r in res])  # nf × nrec
    D_rec = room_db[:, None] - 20 * np.log10(np.maximum(np.abs(p_rec), 1e-30))
    slices = np.full((len(f), X.size), np.nan)
    for i, r in enumerate(res):
        slices[i, valid] = 20 * np.log10(np.maximum(r["slice"], 1e-30)) - room_db[i]  # 0 dB = room average; NaN = wall
    slices = slices.reshape(len(f), ny, nx)

    i125_fem = int(np.argmin(np.abs(f - 125))) if f[-1] >= 125 else len(f) - 1
    out = {
        "fem": {"f": f.tolist(), "D_receivers": D_rec.T.tolist(), "D_venue_avg": (room_db - venue_db).tolist(),
                "dofs": int(model.ndof), "h": h, "areas": model.areas, "workers": s.workers},
        "statistical": st,
        "receivers": receivers,
        "slices": {"x": xs.tolist(), "y": ys.tolist(), "z": scene.listener.z, "freqs": f.tolist(), "reference": "dB re room-average level"},
        "summary": {"D_venue_avg_fem_125": float((room_db - venue_db)[i125_fem]), "D_venue_avg_fem_max_f": float(f[-1]),
                    "TL_max_openings": st["TL_max_openings"], "open_fraction": st["open_fraction"], "coupled_dofs": int(model.ndof)},
        "timings": t,
    }
    arrays = {"slices_db": slices, "f": f, "p_rec": p_rec}
    return out, arrays
