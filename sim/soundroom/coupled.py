"""Coupled venue + sound-room FEM: one structured mesh, the wall as a 2-port interface, openings as air.

Mesh: tensor grid over the venue with grid planes at the room's inner and
outer wall surfaces and at opening edges; the elements inside the wall band
are removed except where an opening is (a short duct through the wall).
Inner-face nodes and venue-side outer-face nodes pair 1:1 across the wall.

Interface (normal-incidence TMM 2-port, v positive room→venue, det T = 1):
    v_in  = (T22/T12) p_in − (1/T12) p_out
    v_out = (1/T12)  p_in − (T11/T12) p_out
Weak form contributions (e^{+jωt}, ∂p/∂n = −jωρ0 v_n with the domain's outward normal):
    A += jωρ0 [ (T22/T12) B_in − (1/T12) B_in→out − (1/T12) B_out→in + (T11/T12) B_out ]
For a limp mass T12 = jωm″ this is (ρ0/m″)[B_in − B_x − B_xᵀ + B_out]: purely reactive coupling.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
import multiprocessing as mp

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from skfem import Basis, ElementHex1, FacetBasis, MeshHex1
from skfem.models.poisson import laplace, mass

from .config import Scene
from .constants import AIR
from .geometry import RoomGeometry, room_geometry
from .mesh import axis_grid


@dataclass
class CoupledModel:
    mesh: MeshHex1
    basis: Basis
    K: sp.csr_matrix
    M: sp.csr_matrix
    B_in: sp.csr_matrix  # surface mass on inner (room-side) wall facets
    B_out: sp.csr_matrix  # surface mass on paired outer (venue-side) facets
    B_x: sp.csr_matrix  # cross block: inner rows, outer columns
    B_venue: dict[str, sp.csr_matrix]  # venue shell patches: floor, ceiling, walls
    room_nodes: np.ndarray
    venue_nodes: np.ndarray
    sources: list[np.ndarray]  # venue coordinates
    geom: RoomGeometry
    origin: np.ndarray  # room interior min corner in venue coords
    wall_t: float
    areas: dict[str, float] = field(default_factory=dict)

    @property
    def ndof(self) -> int:
        return self.basis.N


def build_coupled(scene: Scene, h: float) -> CoupledModel:
    g = room_geometry(scene)
    v = scene.venue
    t = scene.wall.thickness
    if t <= 0:
        raise ValueError("wall stack has no thickness")
    x0, y0 = scene.room.x, scene.room.y
    x1, y1 = x0 + g.Lx, y0 + g.Ly
    if x0 - t < -1e-9 or y0 - t < -1e-9 or x1 + t > v.length + 1e-9 or y1 + t > v.width + 1e-9:
        raise ValueError("sound room (including wall thickness) does not fit inside the venue")

    bx = {0.0, v.length, x0 - t, x0, x1, x1 + t}
    by = {0.0, v.width, y0 - t, y0, y1, y1 + t}
    bz = {0.0, v.height}
    for face, (u0, u1, v0, v1) in g.openings.items():
        if face[1] == "x":
            by.update((y0 + u0, y0 + u1))
        else:
            bx.update((x0 + u0, x0 + u1))
        bz.update((v0, v1))
    xs, ys, zs = (axis_grid(sorted(b), h) for b in (bx, by, bz))
    m0 = MeshHex1.init_tensor(xs, ys, zs)

    # remove wall-band elements that are not inside an opening
    c = m0.p[:, m0.t].mean(axis=1)  # element centroids (3 × nel)
    tol = 1e-9
    in_outer = (c[0] > x0 - t - tol) & (c[0] < x1 + t + tol) & (c[1] > y0 - t - tol) & (c[1] < y1 + t + tol)
    in_inner = (c[0] > x0 - tol) & (c[0] < x1 + tol) & (c[1] > y0 - tol) & (c[1] < y1 + tol)
    band = in_outer & ~in_inner
    in_open = np.zeros_like(band)
    for face, (u0, u1, v0, v1) in g.openings.items():
        if face == "-x":
            sel = (c[0] < x0) & (c[1] > y0 + u0) & (c[1] < y0 + u1)
        elif face == "+x":
            sel = (c[0] > x1) & (c[1] > y0 + u0) & (c[1] < y0 + u1)
        elif face == "-y":
            sel = (c[1] < y0) & (c[0] > x0 + u0) & (c[0] < x0 + u1)
        else:
            sel = (c[1] > y1) & (c[0] > x0 + u0) & (c[0] < x0 + u1)
        in_open |= sel & (c[2] > v0) & (c[2] < v1)
    keep = ~(band & ~in_open)
    mesh = m0.remove_elements(np.nonzero(~keep)[0]) if (~keep).any() else m0

    e = ElementHex1()
    basis = Basis(mesh, e)
    K = laplace.assemble(basis).tocsr()
    M = mass.assemble(basis).tocsr()

    p = mesh.p
    eps = 1e-6

    def facets_where(fn):
        return mesh.facets_satisfying(fn, boundaries_only=True)

    inner = [
        lambda q: (np.abs(q[0] - x0) < eps) & (q[1] > y0 - eps) & (q[1] < y1 + eps),
        lambda q: (np.abs(q[0] - x1) < eps) & (q[1] > y0 - eps) & (q[1] < y1 + eps),
        lambda q: (np.abs(q[1] - y0) < eps) & (q[0] > x0 - eps) & (q[0] < x1 + eps),
        lambda q: (np.abs(q[1] - y1) < eps) & (q[0] > x0 - eps) & (q[0] < x1 + eps),
    ]
    outer = [
        lambda q: (np.abs(q[0] - (x0 - t)) < eps) & (q[1] > y0 - eps) & (q[1] < y1 + eps),
        lambda q: (np.abs(q[0] - (x1 + t)) < eps) & (q[1] > y0 - eps) & (q[1] < y1 + eps),
        lambda q: (np.abs(q[1] - (y0 - t)) < eps) & (q[0] > x0 - eps) & (q[0] < x1 + eps),
        lambda q: (np.abs(q[1] - (y1 + t)) < eps) & (q[0] > x0 - eps) & (q[0] < x1 + eps),
    ]
    shifts = [np.array([-t, 0, 0]), np.array([t, 0, 0]), np.array([0, -t, 0]), np.array([0, t, 0])]
    f_in = np.unique(np.concatenate([facets_where(fn) for fn in inner]))
    B_in = mass.assemble(FacetBasis(mesh, e, facets=f_in)).tocsr()
    f_out = np.unique(np.concatenate([facets_where(fn) for fn in outer]))
    B_out = mass.assemble(FacetBasis(mesh, e, facets=f_out)).tocsr()

    # node pairing inner -> outer by coordinates
    key = lambda pts: np.round(pts / 1e-6).astype(np.int64)  # noqa: E731
    lookup = {tuple(k): i for i, k in enumerate(key(p.T))}
    inner_nodes = np.unique(mesh.facets[:, f_in].ravel())
    pair = np.full(p.shape[1], -1, dtype=np.int64)
    for i in inner_nodes:
        q = p[:, i]
        for fn, sh in zip(inner, shifts):
            if fn(q[:, None])[0]:
                j = lookup.get(tuple(key(q + sh)))
                if j is not None:
                    pair[i] = j
                    break
    # cross block: B_in with columns remapped to the paired outer nodes (rows/cols without a partner dropped)
    Bc = B_in.tocoo()
    ok = (pair[Bc.row] >= 0) & (pair[Bc.col] >= 0)
    B_x = sp.coo_matrix((Bc.data[ok], (Bc.row[ok], pair[Bc.col[ok]])), shape=B_in.shape).tocsr()
    # keep B_in / B_out consistent with the paired set (unpaired corner strips stay rigid)
    B_in_p = sp.coo_matrix((Bc.data[ok], (Bc.row[ok], Bc.col[ok])), shape=B_in.shape).tocsr()
    B_out_p = sp.coo_matrix((Bc.data[ok], (pair[Bc.row[ok]], pair[Bc.col[ok]])), shape=B_in.shape).tocsr()

    B_venue = {
        "floor": mass.assemble(FacetBasis(mesh, e, facets=facets_where(lambda q: np.abs(q[2]) < eps))).tocsr(),
        "ceiling": mass.assemble(FacetBasis(mesh, e, facets=facets_where(lambda q: np.abs(q[2] - v.height) < eps))).tocsr(),
        "walls": mass.assemble(FacetBasis(mesh, e, facets=facets_where(
            lambda q: (np.abs(q[0]) < eps) | (np.abs(q[0] - v.length) < eps) | (np.abs(q[1]) < eps) | (np.abs(q[1] - v.width) < eps)))).tocsr(),
    }
    room_nodes = np.nonzero((p[0] > x0 + eps) & (p[0] < x1 - eps) & (p[1] > y0 + eps) & (p[1] < y1 - eps))[0]
    venue_nodes = np.nonzero((p[0] < x0 - t - eps) | (p[0] > x1 + t + eps) | (p[1] < y0 - t - eps) | (p[1] > y1 + t + eps))[0]
    origin = np.array([x0, y0, 0.0])
    sources = [s + origin for s in g.sources]
    model = CoupledModel(mesh, basis, K, M, B_in_p, B_out_p, B_x, B_venue, room_nodes, venue_nodes, sources, g, origin, t)
    model.areas = {"wall_paired": float(B_in_p.sum()), "wall_total": float(B_in.sum()), "outer": float(B_out.sum()),
                   **{k: float(b.sum()) for k, b in B_venue.items()}}
    return model


# ---------------------------------------------------------------- per-frequency solve (worker)

_G: dict = {}


def _init(payload: dict) -> None:
    _G.update(payload)


def _solve_one(args):
    f, T, beta_venue = args
    K, M, B_in, B_out, B_x, Bv = _G["K"], _G["M"], _G["B_in"], _G["B_out"], _G["B_x"], _G["B_venue"]
    rho0, c = AIR.rho0, AIR.c0
    w = 2 * np.pi * f
    k = w / c
    T11, T12, T22 = T
    A = (K - k**2 * M).astype(complex)
    A = A + 1j * w * rho0 * ((T22 / T12) * B_in - (1.0 / T12) * (B_x + B_x.T) + (T11 / T12) * B_out)
    for name, b in beta_venue.items():
        A = A + 1j * k * b * Bv[name]
    lu = spla.splu(A.tocsc(), permc_spec="COLAMD")
    p = lu.solve(1j * w * rho0 * _G["F"].astype(complex))
    out = {
        "f": f,
        "p_rec": (_G["P_rec"] @ p),
        "room_ms": float(np.mean(np.abs(p[_G["room_nodes"]]) ** 2)),
        "venue_ms": float(np.mean(np.abs(p[_G["venue_nodes"]]) ** 2)),
        "slice": np.abs(_G["P_slice"] @ p),
    }
    return out


def solve_sweep(model: CoupledModel, freqs: np.ndarray, two_port: np.ndarray, beta_venue: dict[str, np.ndarray],
                receivers: np.ndarray, slice_pts: np.ndarray, workers: int = 4, progress=None) -> list[dict]:
    """Direct solves at each frequency; two_port is (nf, 2, 2) normal-incidence T of the wall."""
    F = sum(model.basis.point_source(s) for s in model.sources)
    payload = {"K": model.K, "M": model.M, "B_in": model.B_in, "B_out": model.B_out, "B_x": model.B_x,
               "B_venue": model.B_venue, "F": F, "P_rec": model.basis.probes(receivers.T),
               "P_slice": model.basis.probes(slice_pts), "room_nodes": model.room_nodes, "venue_nodes": model.venue_nodes}
    tasks = [(float(f), (two_port[i, 0, 0], two_port[i, 0, 1], two_port[i, 1, 1]), {n: complex(b[i]) for n, b in beta_venue.items()})
             for i, f in enumerate(freqs)]
    results = []
    if workers <= 1:
        _init(payload)
        for i, t in enumerate(tasks):
            results.append(_solve_one(t))
            if progress:
                progress((i + 1) / len(tasks))
    else:
        ctx = mp.get_context("spawn")
        with ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=_init, initargs=(payload,)) as ex:
            for i, r in enumerate(ex.map(_solve_one, tasks)):
                results.append(r)
                if progress:
                    progress((i + 1) / len(tasks))
    return results
