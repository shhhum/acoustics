"""Transfer-matrix method for plane multilayers.

State vector V = [p, v_n]ᵀ with V(front) = T · V(back). Layers are listed from
the incident (sound-room) side to the far (venue) side. All functions are
vectorised over frequency ``f`` (shape (nf,)) and incidence angle ``theta``
(shape (nt,)); matrices have shape (nf, nt, 2, 2).

Surface impedance uses the numerically stable impedance recursion; transmission
uses the four-pole product (fine at audio frequencies for the thicknesses in
play; see docs/research/2026-08-30-porous-absorber-physics.md §2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

import numpy as np

from .constants import AIR, Air

ModelFn = Callable[[np.ndarray], tuple[np.ndarray, np.ndarray]]  # f -> (Zc, k)


@dataclass(frozen=True)
class FluidLayer:
    """Fluid or equivalent-fluid layer of thickness d with (Zc, k) = model(f)."""

    d: float
    model: ModelFn
    name: str = "fluid"


@dataclass(frozen=True)
class ScreenLayer:
    """Thin limp permeable screen: transfer impedance Rs ∥ jω m_s (→ Rs when ωm ≫ Rs, → jωm when the cloth moves with the air)."""

    Rs: float
    m_s: float = 0.0
    name: str = "screen"


@dataclass(frozen=True)
class PlateLayer:
    """Thin impervious plate: limp (D = 0) or elastic with bending stiffness D (complex)."""

    m_s: float
    D: complex = 0.0
    name: str = "plate"


Layer = FluidLayer | ScreenLayer | PlateLayer


def air_model(air: Air = AIR) -> ModelFn:
    def fn(f):
        f = np.asarray(f, dtype=float)
        return np.full_like(f, air.Z0, dtype=complex), (2 * np.pi * f / air.c0).astype(complex)

    return fn


def _identity(nf: int, nt: int) -> np.ndarray:
    T = np.zeros((nf, nt, 2, 2), dtype=complex)
    T[..., 0, 0] = 1
    T[..., 1, 1] = 1
    return T


def layer_matrix(layer: Layer, f: np.ndarray, theta: np.ndarray, air: Air = AIR) -> np.ndarray:
    """2×2 transfer matrix of one layer, shape (nf, nt, 2, 2)."""
    f = np.atleast_1d(np.asarray(f, dtype=float))
    theta = np.atleast_1d(np.asarray(theta, dtype=float))
    nf, nt = f.size, theta.size
    w = 2 * np.pi * f
    k0 = w / air.c0
    kx = k0[:, None] * np.sin(theta)[None, :]  # (nf, nt)

    T = _identity(nf, nt)
    if isinstance(layer, FluidLayer):
        Zc, k = layer.model(f)
        Zc = np.asarray(Zc, dtype=complex)[:, None]
        k = np.asarray(k, dtype=complex)[:, None]
        kz = np.sqrt(k**2 - kx**2)
        kz = np.where(kz.imag > 0, -kz, kz)  # decaying branch
        Z = Zc * k / kz
        arg = kz * layer.d
        # clamp the hyperbolic growth to keep cos/sin finite for very lossy thick layers
        arg = arg.real + 1j * np.clip(arg.imag, -300.0, 300.0)
        c, s = np.cos(arg), np.sin(arg)
        T[..., 0, 0] = c
        T[..., 0, 1] = 1j * Z * s
        T[..., 1, 0] = 1j * s / Z
        T[..., 1, 1] = c
    elif isinstance(layer, ScreenLayer):
        if layer.m_s > 0:
            jwm = 1j * w[:, None] * layer.m_s
            T[..., 0, 1] = (layer.Rs * jwm / (layer.Rs + jwm)) * np.ones((1, nt))
        else:
            T[..., 0, 1] = layer.Rs
    elif isinstance(layer, PlateLayer):
        T[..., 0, 1] = 1j * (w[:, None] * layer.m_s - layer.D * kx**4 / w[:, None])
    else:
        raise TypeError(f"unknown layer type {type(layer)!r}")
    return T


def stack_matrix(layers: Sequence[Layer], f, theta, air: Air = AIR) -> np.ndarray:
    """Product of layer matrices, incident side first."""
    f = np.atleast_1d(np.asarray(f, dtype=float))
    theta = np.atleast_1d(np.asarray(theta, dtype=float))
    T = _identity(f.size, theta.size)
    for L in layers:
        T = T @ layer_matrix(L, f, theta, air)
    return T


def surface_impedance(layers: Sequence[Layer], f, theta, backing: str = "rigid", air: Air = AIR) -> np.ndarray:
    """Surface impedance Z_s(f, θ) seen from the incident side, shape (nf, nt).

    backing: "rigid" (Z → ∞) or "air" (anechoic far side, Z = ρc/cosθ).
    Uses Z_n = (T11 Z_{n+1} + T12) / (T21 Z_{n+1} + T22), back to front.
    """
    f = np.atleast_1d(np.asarray(f, dtype=float))
    theta = np.atleast_1d(np.asarray(theta, dtype=float))
    if backing == "rigid":
        Z = np.full((f.size, theta.size), np.inf + 0j, dtype=complex)
    elif backing == "air":
        Z = np.broadcast_to((air.Z0 / np.cos(theta))[None, :], (f.size, theta.size)).astype(complex)
    else:
        raise ValueError("backing must be 'rigid' or 'air'")
    for L in reversed(layers):
        T = layer_matrix(L, f, theta, air)
        T11, T12, T21, T22 = T[..., 0, 0], T[..., 0, 1], T[..., 1, 0], T[..., 1, 1]
        inf = ~np.isfinite(Z)
        with np.errstate(divide="ignore", invalid="ignore"):
            Zfin = (T11 * Z + T12) / (T21 * Z + T22)
            Zinf = np.where(T21 != 0, T11 / T21, np.inf + 0j)
        Z = np.where(inf, Zinf, Zfin)
    return Z


def reflection(Zs: np.ndarray, theta, air: Air = AIR) -> np.ndarray:
    theta = np.atleast_1d(np.asarray(theta, dtype=float))
    Z0t = (air.Z0 / np.cos(theta))[None, :]
    with np.errstate(invalid="ignore"):
        R = np.where(np.isfinite(Zs), (Zs - Z0t) / (Zs + Z0t), 1.0 + 0j)
    return R


def absorption(Zs: np.ndarray, theta, air: Air = AIR) -> np.ndarray:
    """α(f, θ) = 1 − |R|²."""
    return np.clip(1 - np.abs(reflection(Zs, theta, air)) ** 2, 0.0, 1.0)


def paris_angles(n: int = 64, theta_max_deg: float = 78.0):
    """Midpoint quadrature nodes and sin(2θ) weights for the Paris integral over [0, θ_max]."""
    lim = np.deg2rad(theta_max_deg)
    th = (np.arange(n) + 0.5) / n * lim
    wgt = np.sin(2 * th)
    return th, wgt / wgt.sum()


def paris_average(alpha_theta: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Weighted average over the angle axis (last axis)."""
    return alpha_theta @ weights


def transmission_coefficient(layers: Sequence[Layer], f, theta, air: Air = AIR) -> np.ndarray:
    """Pressure transmission coefficient t(f, θ) for the unbacked stack (air on both sides)."""
    theta = np.atleast_1d(np.asarray(theta, dtype=float))
    T = stack_matrix(layers, f, theta, air)
    Z0t = (air.Z0 / np.cos(theta))[None, :]
    den = T[..., 0, 0] + T[..., 0, 1] / Z0t + Z0t * T[..., 1, 0] + T[..., 1, 1]
    return 2.0 / den


def transmission_loss(layers: Sequence[Layer], f, theta, air: Air = AIR) -> np.ndarray:
    """TL(f, θ) = −10 log10 |t|², shape (nf, nt)."""
    tau = np.abs(transmission_coefficient(layers, f, theta, air)) ** 2
    return -10 * np.log10(np.maximum(tau, 1e-30))


def field_transmission_loss(layers: Sequence[Layer], f, n: int = 64, theta_max_deg: float = 78.0, air: Air = AIR):
    """Field-incidence TL: −10 log10 of the sin2θ-weighted average of τ(θ) up to θ_max."""
    th, wgt = paris_angles(n, theta_max_deg)
    tau = np.abs(transmission_coefficient(layers, f, th, air)) ** 2
    return -10 * np.log10(np.maximum(tau @ wgt, 1e-30))


def normal_two_port(layers: Sequence[Layer], f, air: Air = AIR) -> np.ndarray:
    """Normal-incidence 2×2 transfer matrix (nf, 2, 2) — the wall as a 2-port for the coupled FEM."""
    return stack_matrix(layers, f, np.array([0.0]), air)[:, 0]
