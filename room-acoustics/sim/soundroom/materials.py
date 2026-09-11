"""Material property estimators and presets.

Flow resistivity is the parameter that matters; everything else in JCA moves
absorption by a few percent. Both σ(ρ) fits used in the literature are exposed:

* Bies & Hansen: σ = 3.18e-9 · ρ^1.53 / d²  (d = fibre diameter, m). With
  d = 8 µm this reproduces manufacturer stone-wool data to ~10 %
  (14.0/26.1/57.1 vs 14.9/26.0/52.3 kPa·s/m² at 40/60/100 kg/m³).
* Arup Strutt: σ = 4.4·η·(1−ε)^1.59 / a²  (a = fibre radius, ε = 1 − ρ/ρ_fibre).
  Spot-on at 50 kg/m³, 1.3–1.7× low at 23 and 80 kg/m³.

Sources: docs/research/2026-08-30-porous-absorber-physics.md §1 and
docs/research/2026-08-30-patents-vendor-data.md §B1.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from .constants import AIR, Air
from .porous import JCAParams

RHO_FIBRE = 2600.0  # stone-wool fibre density, kg/m³ (2500–2700)
D_FIBRE_DEFAULT = 8e-6  # calibrated fibre diameter for Bies–Hansen, m


def sigma_bies_hansen(rho_bulk: float, d_fibre: float = D_FIBRE_DEFAULT) -> float:
    """Flow resistivity (Pa·s/m²) from bulk density (kg/m³), Bies & Hansen."""
    return 3.18e-9 * rho_bulk**1.53 / d_fibre**2


def sigma_strutt(rho_bulk: float, a_fibre: float = 3e-6, rho_fibre: float = 2700.0, air: Air = AIR) -> float:
    """Flow resistivity (Pa·s/m²) from bulk density, Arup Strutt mineral-fibre relation."""
    solid = rho_bulk / rho_fibre
    return 4.4 * air.eta * solid**1.59 / a_fibre**2


def porosity(rho_bulk: float, rho_fibre: float = RHO_FIBRE) -> float:
    return 1.0 - rho_bulk / rho_fibre


def viscous_length(sigma: float, phi: float, alpha_inf: float = 1.0, shape: float = 1.0, air: Air = AIR) -> float:
    """Λ = (1/c)·sqrt(8 α∞ η / (σ φ)); shape factor c ≈ 1 for fibrous media."""
    return (1.0 / shape) * np.sqrt(8 * alpha_inf * air.eta / (sigma * phi))


def jca_from_density(
    rho_bulk: float,
    *,
    sigma: float | None = None,
    phi: float | None = None,
    alpha_inf: float | None = None,
    Lambda: float | None = None,
    Lambda_p: float | None = None,
    k0p: float | None = None,
    d_fibre: float = D_FIBRE_DEFAULT,
    lambda_ratio: float = 2.0,
) -> JCAParams:
    """JCA parameters for rockwool of a given bulk density, with per-parameter overrides."""
    s = sigma if sigma is not None else sigma_bies_hansen(rho_bulk, d_fibre)
    ph = phi if phi is not None else porosity(rho_bulk)
    a = alpha_inf if alpha_inf is not None else (1.05 if rho_bulk >= 90 else 1.0)
    L = Lambda if Lambda is not None else viscous_length(s, ph, a)
    Lp = Lambda_p if Lambda_p is not None else lambda_ratio * L
    return JCAParams(phi=ph, sigma=s, alpha_inf=a, Lambda=L, Lambda_p=Lp, k0p=k0p)


def plate_bending_stiffness(E: float, h: float, nu: float = 0.3, loss: float = 0.0) -> complex:
    """D = E h³ (1 + jη) / (12 (1 − ν²))."""
    return E * h**3 * (1 + 1j * loss) / (12 * (1 - nu**2))


def critical_frequency(m_s: float, D: complex, air: Air = AIR) -> float:
    """Critical (grazing coincidence) frequency f_c = (c²/2π)·sqrt(m″/D)."""
    return (air.c0**2 / (2 * np.pi)) * np.sqrt(m_s / abs(D))


def data_dir() -> Path:
    """Repo `data/` directory (sim/soundroom/materials.py → repo root / data)."""
    return Path(__file__).resolve().parents[2] / "data"


@lru_cache(maxsize=1)
def load_presets() -> dict:
    with open(data_dir() / "materials.json") as fh:
        return json.load(fh)


def rockwool_preset(name: str) -> dict:
    for item in load_presets()["rockwool"]:
        if item["name"].lower() == name.lower():
            return item
    raise KeyError(f"no rockwool preset named {name!r}")
