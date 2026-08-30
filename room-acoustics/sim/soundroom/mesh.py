"""Structured hexahedral mesh of the sound room with patch-tagged boundary facets.

Grid lines are snapped to opening edges so every boundary facet belongs to
exactly one patch (wall / opening / floor / ceiling).
"""

from __future__ import annotations

import numpy as np
from skfem import MeshHex1

from .geometry import RoomGeometry


def axis_grid(breaks: list[float], h: float) -> np.ndarray:
    """1-D grid through all `breaks`, each segment subdivided uniformly with spacing ≤ h."""
    pts = [breaks[0]]
    for a, b in zip(breaks[:-1], breaks[1:]):
        n = max(1, int(np.ceil((b - a) / h - 1e-9)))
        pts.extend(np.linspace(a, b, n + 1)[1:])
    return np.array(pts, dtype=float)


def element_size(f_max: float, nodes_per_wavelength: float, c: float = 343.0) -> float:
    return c / (f_max * nodes_per_wavelength)


def room_mesh(g: RoomGeometry, h: float) -> MeshHex1:
    bx, by, bz = g.breakpoints()
    x, y, z = axis_grid(bx, h), axis_grid(by, h), axis_grid(bz, h)
    m = MeshHex1.init_tensor(x, y, z)
    tol = 1e-6
    tests = {}
    for face in ("-x", "+x", "-y", "+y"):
        axis, coord = g.face_coord(face)
        u_axis = 1 if face[1] == "x" else 0
        on_face = (lambda p, a=axis, c=coord: np.abs(p[a] - c) < tol)
        if face in g.openings:
            u0, u1, v0, v1 = g.openings[face]
            in_open = (lambda p, ua=u_axis, u0=u0, u1=u1, v0=v0, v1=v1:
                       (p[ua] > u0 - tol) & (p[ua] < u1 + tol) & (p[2] > v0 - tol) & (p[2] < v1 + tol))
            tests[f"open{face}"] = (lambda p, f1=on_face, f2=in_open: f1(p) & f2(p))
            tests[f"wall{face}"] = (lambda p, f1=on_face, f2=in_open: f1(p) & ~f2(p))
        else:
            tests[f"wall{face}"] = on_face
    tests["floor"] = lambda p: np.abs(p[2]) < tol
    tests["ceiling"] = lambda p, L=g.Lz: np.abs(p[2] - L) < tol
    return m.with_boundaries(tests)


def mesh_stats(m: MeshHex1) -> dict:
    return {"nodes": int(m.p.shape[1]), "elements": int(m.t.shape[1]),
            "nx": int(len(np.unique(m.p[0]))), "ny": int(len(np.unique(m.p[1]))), "nz": int(len(np.unique(m.p[2])))}
