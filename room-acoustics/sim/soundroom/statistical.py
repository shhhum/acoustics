"""Statistical room acoustics and building-acoustics relations.

Sabine / Eyring reverberation, ISO 9613-1 air absorption, mass law, mass–air–
mass resonance, composite transmission loss with openings, and the power-based
inside→outside level difference. See docs/research/2026-08-30-porous-absorber-
physics.md §5–6.
"""

from __future__ import annotations

import numpy as np

from .constants import AIR, Air

# ---------------------------------------------------------------- frequency bands

OCTAVE_CENTRES = np.array([31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000])
THIRD_OCTAVE_CENTRES = np.array(
    [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
     1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000], dtype=float)


def band_edges(centres, fraction: int):
    """Lower/upper edges of 1/`fraction`-octave bands."""
    c = np.asarray(centres, dtype=float)
    r = 2 ** (1 / (2 * fraction))
    return c / r, c * r


def band_average(f, y, centres, fraction: int):
    """Average y(f) inside each band (log-frequency uniform). NaN where no samples."""
    f = np.asarray(f, dtype=float)
    y = np.asarray(y, dtype=float)
    lo, hi = band_edges(centres, fraction)
    out = np.full(len(centres), np.nan)
    for i, (a, b) in enumerate(zip(lo, hi)):
        m = (f >= a) & (f < b)
        if m.any():
            out[i] = np.trapezoid(y[m], np.log(f[m])) / (np.log(f[m][-1]) - np.log(f[m][0])) if m.sum() > 1 else y[m][0]
    return out


# ---------------------------------------------------------------- air absorption (ISO 9613-1)

def air_attenuation_coefficient(f, temp_c: float = 20.0, rh: float = 50.0, pressure: float = 101325.0):
    """Energy attenuation coefficient m (1/m) so that intensity decays as e^{-m x}.

    ISO 9613-1 pure-tone absorption α_dB/m converted: m = α_dB / (10 log10 e).
    """
    f = np.asarray(f, dtype=float)
    T = temp_c + 273.15
    T0, T01, pr = 293.15, 273.16, 101325.0
    p = pressure / pr
    C = -6.8346 * (T01 / T) ** 1.261 + 4.6151
    h = rh * 10**C / p  # molar concentration of water vapour, %
    frO = p * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h))
    frN = p * (T / T0) ** -0.5 * (9 + 280 * h * np.exp(-4.170 * ((T / T0) ** (-1 / 3) - 1)))
    a = 8.686 * f**2 * (
        1.84e-11 / p * (T / T0) ** 0.5
        + (T / T0) ** -2.5 * (0.01275 * np.exp(-2239.1 / T) / (frO + f**2 / frO)
                              + 0.1068 * np.exp(-3352 / T) / (frN + f**2 / frN))
    )  # dB/m
    return a / (10 * np.log10(np.e))


# ---------------------------------------------------------------- reverberation

def sabine_t60(V: float, absorption_area, m_air=0.0):
    """T60 = 0.161 V / (A + 4 m V)."""
    A = np.asarray(absorption_area, dtype=float)
    return 0.161 * V / np.maximum(A + 4 * np.asarray(m_air) * V, 1e-9)


def eyring_t60(V: float, S: float, mean_alpha, m_air=0.0):
    """T60 = 0.161 V / (−S ln(1 − ᾱ) + 4 m V)."""
    a = np.clip(np.asarray(mean_alpha, dtype=float), 0.0, 0.999)
    return 0.161 * V / np.maximum(-S * np.log(1 - a) + 4 * np.asarray(m_air) * V, 1e-9)


def schroeder_frequency(T60: float, V: float) -> float:
    return 2000.0 * np.sqrt(T60 / V)


# ---------------------------------------------------------------- transmission

def mass_law_tl(f, m_s: float, field: bool = False, air: Air = AIR):
    """Normal-incidence mass law TL = 10 log10(1 + (π f m″/ρc)²); field incidence ≈ −5 dB."""
    f = np.asarray(f, dtype=float)
    tl = 10 * np.log10(1 + (np.pi * f * m_s / air.Z0) ** 2)
    return np.maximum(tl - 5.0, 0.0) if field else tl


def mass_air_mass_frequency(m1: float, m2: float, d: float, filled: bool = False, air: Air = AIR) -> float:
    """f0 = (1/2π) sqrt(ρ c² (1/m1 + 1/m2) / d); a porous fill makes the cavity isothermal (ρc² → P0)."""
    stiffness = air.P0 if filled else air.rho0 * air.c0**2
    return np.sqrt(stiffness * (1 / m1 + 1 / m2) / d) / (2 * np.pi)


def composite_tl(areas, tls):
    """TL of a partition made of patches (S_i, TL_i): −10 log10(Σ S_i 10^(−TL_i/10) / Σ S_i)."""
    S = np.asarray(areas, dtype=float)
    TL = np.asarray(tls, dtype=float)
    tau = np.sum(S[:, None] * 10 ** (-TL / 10), axis=0) / S.sum() if TL.ndim == 2 else np.sum(S * 10 ** (-TL / 10)) / S.sum()
    return -10 * np.log10(np.maximum(tau, 1e-30))


def opening_limited_tl(open_area: float, total_area: float) -> float:
    """Upper bound on composite TL set by openings alone: −10 log10(open fraction)."""
    if open_area <= 0:
        return np.inf
    return -10 * np.log10(open_area / total_area)


def room_constant(S_total: float, mean_alpha):
    a = np.clip(np.asarray(mean_alpha, dtype=float), 1e-6, 0.999)
    return S_total * a / (1 - a)


def level_difference_power_route(TL, S_partition: float, r: float, R_venue, Q: float = 2.0):
    """L_in − L_out for a receiver at distance r from the partition (power route).

    L_W,out = L_in − 6 + 10 log10(S) − TL;  L_out = L_W,out + 10 log10(Q/4πr² + 4/R_venue).
    Returns D = L_in − L_out.
    """
    TL = np.asarray(TL, dtype=float)
    return TL + 6 - 10 * np.log10(S_partition) - 10 * np.log10(Q / (4 * np.pi * r**2) + 4 / np.asarray(R_venue))


def level_difference_diffuse(TL, S_partition: float, A_receiving):
    """ISO field form: D = R − 10 log10(S/A2)."""
    return np.asarray(TL, dtype=float) - 10 * np.log10(S_partition / np.asarray(A_receiving))
