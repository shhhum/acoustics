"""FEM assembly for the Helmholtz problem with locally-reacting (Robin) boundaries.

Weak form (e^{+jωt}, monopole of volume velocity Q at x_s):
    ∫∇p·∇w − k² ∫ p w + jk Σ_i β_i(ω) ∫_{Γ_i} p w  =  jωρ0 Q w(x_s)
with β = ρ0c0/Z_s the normalised admittance and ∂p/∂n = −jkβp on Γ_i.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import scipy.sparse as sp
from skfem import Basis, ElementHex1, FacetBasis, MeshHex1
from skfem.models.poisson import laplace, mass

from .geometry import RoomGeometry


@dataclass
class RoomFEM:
    geom: RoomGeometry
    mesh: MeshHex1
    basis: Basis
    K: sp.csr_matrix
    M: sp.csr_matrix
    B: dict[str, sp.csr_matrix] = field(default_factory=dict)  # patch name -> boundary mass matrix
    areas: dict[str, float] = field(default_factory=dict)

    @property
    def ndof(self) -> int:
        return self.basis.N

    def probe(self, x) -> np.ndarray:
        """Interpolation vector so that p(x) = probe · p_nodes."""
        return self.basis.point_source(np.asarray(x, dtype=float))

    def probes(self, pts: np.ndarray) -> sp.csr_matrix:
        """Interpolation matrix (npts × ndof) for points pts (3 × npts)."""
        return self.basis.probes(pts)

    def system(self, f: float, beta: dict[str, complex], c: float = 343.0) -> sp.csc_matrix:
        """Full sparse system matrix K − k²M + jk Σ β_i B_i at one frequency."""
        k = 2 * np.pi * f / c
        A = self.K - k**2 * self.M
        A = A.astype(complex)
        for name, b in beta.items():
            if name in self.B and b != 0:
                A = A + 1j * k * b * self.B[name]
        return A.tocsc()


def assemble_room(geom: RoomGeometry, mesh: MeshHex1) -> RoomFEM:
    e = ElementHex1()
    basis = Basis(mesh, e)
    K = laplace.assemble(basis).tocsr()
    M = mass.assemble(basis).tocsr()
    fem = RoomFEM(geom, mesh, basis, K, M)
    for p in geom.patches:
        facets = mesh.boundaries.get(p.name)
        if facets is None or len(facets) == 0:
            continue
        fb = FacetBasis(mesh, e, facets=facets)
        Bi = mass.assemble(fb).tocsr()
        fem.B[p.name] = Bi
        fem.areas[p.name] = float(Bi.sum())
    return fem


def source_vector(fem: RoomFEM, x_s, f: float, Q: float = 1.0, rho0: float = 1.204) -> np.ndarray:
    """Right-hand side jωρ0 Q ψ(x_s)."""
    return 1j * 2 * np.pi * f * rho0 * Q * fem.probe(x_s)


def free_field_1m(f, Q: float = 1.0, rho0: float = 1.204) -> np.ndarray:
    """|p| of the same monopole at 1 m in free field: ωρ0Q/(4π) — the dB reference."""
    return 2 * np.pi * np.asarray(f, dtype=float) * rho0 * Q / (4 * np.pi)
