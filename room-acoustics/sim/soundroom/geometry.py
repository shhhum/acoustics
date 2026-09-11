"""Scene → box geometry, surface patches, source/listener coordinates.

Sound-room coordinates: origin at the interior's min corner, x along `length`,
y along `width`, z up; height = venue height (walls run to the venue ceiling).
Faces are named "-x", "+x", "-y", "+y"; openings are doorway-style rectangles
centred horizontally on a face, from the floor up to `height`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import Scene

FACES = ("-x", "+x", "-y", "+y")


@dataclass(frozen=True)
class Patch:
    name: str
    kind: str  # wall | opening | floor | ceiling
    face: str  # -x +x -y +y floor ceiling
    area: float
    rect: tuple[float, float, float, float] | None = None  # (u0, u1, v0, v1) on the face, opening only


@dataclass
class RoomGeometry:
    Lx: float
    Ly: float
    Lz: float
    sources: list[np.ndarray]
    listener: np.ndarray
    patches: list[Patch] = field(default_factory=list)
    openings: dict[str, tuple[float, float, float, float]] = field(default_factory=dict)  # face -> (u0,u1,v0,v1)
    source_face: str = "-x"

    @property
    def volume(self) -> float:
        return self.Lx * self.Ly * self.Lz

    @property
    def surface(self) -> float:
        return 2 * (self.Lx * self.Ly + self.Lx * self.Lz + self.Ly * self.Lz)

    def face_axes(self, face: str) -> tuple[int, int]:
        """(tangential axis u, tangential axis v=z) index for a vertical face."""
        return (1, 2) if face[1] == "x" else (0, 2)

    def face_coord(self, face: str) -> tuple[int, float]:
        axis = 0 if face[1] == "x" else 1
        L = self.Lx if axis == 0 else self.Ly
        return axis, (0.0 if face[0] == "-" else L)

    def breakpoints(self) -> tuple[list[float], list[float], list[float]]:
        """Grid lines that must exist so opening edges coincide with mesh facets."""
        bx, by, bz = {0.0, self.Lx}, {0.0, self.Ly}, {0.0, self.Lz}
        for face, (u0, u1, v0, v1) in self.openings.items():
            (by if face[1] == "x" else bx).update((u0, u1))
            bz.update((v0, v1))
        return sorted(bx), sorted(by), sorted(bz)


def room_geometry(scene: Scene) -> RoomGeometry:
    r, v = scene.room, scene.venue
    Lx, Ly, Lz = r.length, r.width, v.height
    if r.x + Lx > v.length + 1e-9 or r.y + Ly > v.width + 1e-9:
        raise ValueError("sound room does not fit inside the venue at this position")

    ins, zs = r.source_inset, r.source_height
    corners = {
        "-x": [(ins, ins, zs), (ins, Ly - ins, zs)],
        "+x": [(Lx - ins, ins, zs), (Lx - ins, Ly - ins, zs)],
        "-y": [(ins, ins, zs), (Lx - ins, ins, zs)],
        "+y": [(ins, Ly - ins, zs), (Lx - ins, Ly - ins, zs)],
    }
    sources = [np.array(c, dtype=float) for c in corners[r.source_face]]
    listener = np.array([scene.listener.x, scene.listener.y, scene.listener.z], dtype=float)
    if not (0 < listener[0] < Lx and 0 < listener[1] < Ly and 0 < listener[2] < Lz):
        raise ValueError("listener is outside the sound room")

    g = RoomGeometry(Lx, Ly, Lz, sources, listener, source_face=r.source_face)
    for face in FACES:
        if face == r.source_face:
            continue
        op = r.openings.get(face)
        if op is None or op.width <= 0 or op.height <= 0:
            continue
        Lu = Ly if face[1] == "x" else Lx
        w, h = min(op.width, Lu), min(op.height, Lz)
        g.openings[face] = (Lu / 2 - w / 2, Lu / 2 + w / 2, 0.0, h)

    for face in FACES:
        Lu = Ly if face[1] == "x" else Lx
        full = Lu * Lz
        if face in g.openings:
            u0, u1, v0, v1 = g.openings[face]
            a_open = (u1 - u0) * (v1 - v0)
            g.patches.append(Patch(f"open{face}", "opening", face, a_open, (u0, u1, v0, v1)))
            g.patches.append(Patch(f"wall{face}", "wall", face, full - a_open))
        else:
            g.patches.append(Patch(f"wall{face}", "wall", face, full))
    g.patches.append(Patch("floor", "floor", "floor", Lx * Ly))
    g.patches.append(Patch("ceiling", "ceiling", "ceiling", Lx * Ly))
    return g


def box_modes(Lx: float, Ly: float, Lz: float, f_max: float, c: float = 343.0) -> list[tuple[float, tuple[int, int, int]]]:
    """Analytic rigid-wall modes (f, (nx, ny, nz)) with f ≤ f_max, sorted."""
    out = []
    nmax = [int(np.floor(2 * f_max * L / c)) for L in (Lx, Ly, Lz)]
    for i in range(nmax[0] + 1):
        for j in range(nmax[1] + 1):
            for k in range(nmax[2] + 1):
                f = (c / 2) * np.sqrt((i / Lx) ** 2 + (j / Ly) ** 2 + (k / Lz) ** 2)
                if f <= f_max:
                    out.append((float(f), (i, j, k)))
    out.sort(key=lambda t: t[0])
    return out


def mode_type(n: tuple[int, int, int]) -> str:
    nz = sum(1 for x in n if x > 0)
    return {0: "pressure", 1: "axial", 2: "tangential", 3: "oblique"}[nz]
