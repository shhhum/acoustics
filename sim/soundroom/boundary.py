"""Frequency-dependent normalised admittances β(ω) = ρc/Z_s for each patch kind."""

from __future__ import annotations

import numpy as np
from scipy.special import j1, struve

from . import tmm
from .config import Scene
from .constants import AIR, Air
from .statistical import OCTAVE_CENTRES
from .wall import build_layers


def wall_admittance(scene: Scene, f: np.ndarray, angle_deg: float = 0.0, backing: str = "air", air: Air = AIR) -> np.ndarray:
    """β(f) of the wall stack seen from the room, venue-backed, at a fixed incidence angle (locally-reacting approximation)."""
    layers, _ = build_layers(scene.wall, air)
    th = np.array([np.deg2rad(angle_deg)])
    Z = tmm.surface_impedance(layers, f, th, backing, air)[:, 0]
    with np.errstate(divide="ignore", invalid="ignore"):
        beta = np.where(np.isfinite(Z), air.Z0 / Z, 0.0 + 0j)
    return beta


def piston_radiation_admittance(f: np.ndarray, area: float, air: Air = AIR) -> np.ndarray:
    """β = ρc/Z_rad of a baffled circular piston with the opening's area (Z_rad = ρc[R1 + jX1])."""
    a = np.sqrt(area / np.pi)
    ka = 2 * np.pi * np.asarray(f, dtype=float) / air.c0 * a
    x = 2 * ka
    with np.errstate(divide="ignore", invalid="ignore"):
        R1 = np.where(x > 1e-6, 1 - 2 * j1(x) / x, x**2 / 8)
        X1 = np.where(x > 1e-6, 2 * struve(1, x) / x, 4 * x / (3 * np.pi))
    return 1.0 / (R1 + 1j * X1)


def alpha_to_real_admittance(alpha: np.ndarray) -> np.ndarray:
    """Real β giving normal-incidence absorption α = 4β/(1+β)² (β ≤ 1 branch)."""
    a = np.clip(np.asarray(alpha, dtype=float), 1e-4, 0.999)
    q = 2 / a - 1
    return q - np.sqrt(q * q - 1)


def octave_table_interp(table: list[float], f: np.ndarray) -> np.ndarray:
    """Interpolate an 8-value table at 63..8000 Hz octave centres in log-frequency; clamped at the ends."""
    centres = OCTAVE_CENTRES[1:]  # 63 … 8000
    vals = np.asarray(table, dtype=float)
    return np.interp(np.log(np.asarray(f, dtype=float)), np.log(centres), vals)


def patch_admittances(scene: Scene, f: np.ndarray, areas: dict[str, float], angle_deg: float = 0.0) -> dict[str, np.ndarray]:
    """β_i(f) for every patch name present in `areas`."""
    out: dict[str, np.ndarray] = {}
    wall_beta = wall_admittance(scene, f, angle_deg)
    floor_beta = alpha_to_real_admittance(octave_table_interp(scene.venue.alpha_floor, f)).astype(complex)
    ceil_beta = alpha_to_real_admittance(octave_table_interp(scene.venue.alpha_ceiling, f)).astype(complex)
    for name, area in areas.items():
        if name.startswith("wall"):
            out[name] = wall_beta
        elif name.startswith("open"):
            out[name] = piston_radiation_admittance(f, area)
        elif name == "floor":
            out[name] = floor_beta
        elif name == "ceiling":
            out[name] = ceil_beta
    return out


def patch_alpha_field(scene: Scene, f: np.ndarray, areas: dict[str, float], air: Air = AIR) -> dict[str, np.ndarray]:
    """Field-incidence absorption per patch for the statistical (Sabine/Eyring) estimate."""
    layers, _ = build_layers(scene.wall, air)
    th, w = tmm.paris_angles(64, 78.0)
    Z = tmm.surface_impedance(layers, f, th, "air", air)
    a_wall = tmm.paris_average(tmm.absorption(Z, th, air), w)
    out = {}
    for name in areas:
        if name.startswith("wall"):
            out[name] = a_wall
        elif name.startswith("open"):
            out[name] = np.ones_like(f)
        elif name == "floor":
            out[name] = octave_table_interp(scene.venue.alpha_floor, f)
        elif name == "ceiling":
            out[name] = octave_table_interp(scene.venue.alpha_ceiling, f)
    return out
