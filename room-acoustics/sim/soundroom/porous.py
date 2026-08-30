"""Equivalent-fluid models for rigid-frame porous media.

All functions are vectorised over frequency ``f`` (Hz, array-like) and return
complex arrays following the e^{+jωt} convention (Im{ρ̃} < 0, Im{k} < 0).

References: Allard & Atalla, *Propagation of Sound in Porous Media* (2009)
ch. 5; Matelys APMR formula pages (verified 2026-08-30, see
docs/research/2026-08-30-porous-absorber-physics.md §1).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import AIR, Air


@dataclass(frozen=True)
class JCAParams:
    """Johnson–Champoux–Allard(–Lafarge) parameters of one porous layer."""

    phi: float  # open porosity (-)
    sigma: float  # static air-flow resistivity (Pa·s/m²)
    alpha_inf: float  # high-frequency tortuosity (-)
    Lambda: float  # viscous characteristic length (m)
    Lambda_p: float  # thermal characteristic length (m)
    k0p: float | None = None  # static thermal permeability (m²); None → JCA (= φΛ'²/8)

    @property
    def k0p_effective(self) -> float:
        return self.k0p if self.k0p is not None else self.phi * self.Lambda_p**2 / 8.0


def jca_density(f, p: JCAParams, air: Air = AIR):
    """JCA effective density ρ̃(ω)."""
    w = 2 * np.pi * np.asarray(f, dtype=float)
    a, phi, s = p.alpha_inf, p.phi, p.sigma
    G = np.sqrt(1 + 1j * 4 * a**2 * air.eta * air.rho0 * w / (s**2 * p.Lambda**2 * phi**2))
    return (a * air.rho0 / phi) * (1 + (s * phi) / (1j * w * air.rho0 * a) * G)


def jca_bulk_modulus(f, p: JCAParams, air: Air = AIR, lafarge: bool = False):
    """JCA (or JCAL if ``lafarge``) effective bulk modulus K̃(ω)."""
    w = 2 * np.pi * np.asarray(f, dtype=float)
    g, phi = air.gamma, p.phi
    if lafarge:
        k0p = p.k0p_effective
        inner = np.sqrt(1 + 1j * 4 * k0p**2 * air.cp * air.rho0 * w / (air.kappa * p.Lambda_p**2 * phi**2))
        bracket = 1 - 1j * (phi * air.kappa) / (k0p * air.cp * air.rho0 * w) * inner
    else:
        inner = np.sqrt(1 + 1j * p.Lambda_p**2 * air.cp * air.rho0 * w / (16 * air.kappa))
        bracket = 1 - 1j * (8 * air.kappa) / (p.Lambda_p**2 * air.cp * air.rho0 * w) * inner
    return (g * air.P0 / phi) / (g - (g - 1) / bracket)


def characteristic(rho_eff, K_eff, f):
    """Characteristic impedance and wavenumber from (ρ̃, K̃)."""
    w = 2 * np.pi * np.asarray(f, dtype=float)
    Zc = np.sqrt(rho_eff * K_eff)
    k = w * np.sqrt(rho_eff / K_eff)
    # enforce the e^{+jωt} sign convention (decaying waves): Im k < 0, Re Zc > 0
    k = np.where(k.imag > 0, -k, k)
    Zc = np.where(Zc.real < 0, -Zc, Zc)
    return Zc, k


def jca(f, p: JCAParams, air: Air = AIR, lafarge: bool = False):
    """(Zc, k) of a JCA/JCAL equivalent fluid."""
    return characteristic(jca_density(f, p, air), jca_bulk_modulus(f, p, air, lafarge), f)


def miki(f, sigma: float, air: Air = AIR):
    """Miki (1990) empirical model. Valid for 0.01 < f/σ < 1 (f in Hz, σ in Pa·s/m²)."""
    f = np.asarray(f, dtype=float)
    X = np.maximum(f / sigma, 1e-12)
    w = 2 * np.pi * f
    Zc = air.Z0 * (1 + 0.0699 * X**-0.632 - 1j * 0.107 * X**-0.632)
    k = (w / air.c0) * (1 + 0.109 * X**-0.618 - 1j * 0.160 * X**-0.618)
    return Zc, k


def miki_jsx(f, sigma: float, air: Air = AIR):
    """Miki with the coefficients exactly as written in soundsystem-designer.jsx (0.070 / 0.107 / 0.109 / 0.160)."""
    f = np.asarray(f, dtype=float)
    X = np.maximum(f / sigma, 1e-9)
    w = 2 * np.pi * f
    p1, p2 = X**-0.632, X**-0.618
    Zc = air.Z0 * (1 + 0.070 * p1) - 1j * air.Z0 * 0.107 * p1
    k = (w / air.c0) * (1 + 0.109 * p2) - 1j * (w / air.c0) * 0.160 * p2
    return Zc, k


def delany_bazley(f, sigma: float, air: Air = AIR):
    """Delany–Bazley (1970). Valid for 0.01 < f/σ < 1; non-physical below."""
    f = np.asarray(f, dtype=float)
    X = np.maximum(1e3 * f / sigma, 1e-12)  # APMR form uses 10³ f/σ
    w = 2 * np.pi * f
    Zc = air.Z0 * (1 + 9.08 * X**-0.75 - 1j * 11.9 * X**-0.73)
    k = (w / air.c0) * (1 + 10.8 * X**-0.70 - 1j * 10.3 * X**-0.59)
    return Zc, k


def empirical_validity(f, sigma: float):
    """Fraction of the frequency grid inside the Delany–Bazley/Miki validity window 0.01 < f/σ < 1."""
    X = np.asarray(f, dtype=float) / sigma
    return float(np.mean((X > 0.01) & (X < 1.0)))
