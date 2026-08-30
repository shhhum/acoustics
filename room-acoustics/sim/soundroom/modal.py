"""Modal reduction of the room FEM and everything derived from a frequency sweep.

Reduced system (N×N dense, per frequency):
    (K̃ − k² M̃ + jk Σ β_i(ω) B̃_i) a = F̃ ,   p = Ψ a
with Ψ either the analytic rigid-box cosine modes sampled on the mesh nodes
(Rayleigh–Ritz on the FEM matrices — exact eigenfunctions for a box) or the
numerically computed Neumann eigenvectors (eigsh, general geometry).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import scipy.linalg as la
import scipy.sparse.linalg as spla

from .fem import RoomFEM, free_field_1m
from .geometry import box_modes, mode_type


@dataclass
class Reduced:
    Psi: np.ndarray  # ndof × N
    K: np.ndarray  # N × N
    M: np.ndarray
    B: dict[str, np.ndarray]
    f_rigid: np.ndarray  # rigid-wall mode frequencies (N,)
    indices: list[tuple[int, int, int]] | None  # (nx, ny, nz) per mode when known
    basis: str

    @property
    def N(self) -> int:
        return self.Psi.shape[1]


def analytic_basis(fem: RoomFEM, f_max: float, c: float = 343.0) -> tuple[np.ndarray, np.ndarray, list]:
    g = fem.geom
    modes = box_modes(g.Lx, g.Ly, g.Lz, f_max, c)
    x, y, z = fem.mesh.p
    Psi = np.empty((x.size, len(modes)))
    for n, (f, (i, j, k)) in enumerate(modes):
        Psi[:, n] = np.cos(i * np.pi * x / g.Lx) * np.cos(j * np.pi * y / g.Ly) * np.cos(k * np.pi * z / g.Lz)
    # M-normalise
    norms = np.sqrt(np.einsum("ij,ij->j", Psi, fem.M @ Psi))
    Psi /= norms
    return Psi, np.array([m[0] for m in modes]), [m[1] for m in modes]


def fem_basis(fem: RoomFEM, n_modes: int, c: float = 343.0) -> tuple[np.ndarray, np.ndarray]:
    w, v = spla.eigsh(fem.K, k=n_modes, M=fem.M, sigma=-1.0, which="LM")
    order = np.argsort(w)
    w, v = np.maximum(w[order], 0.0), v[:, order]
    return v, np.sqrt(w) * c / (2 * np.pi)


def reduce(fem: RoomFEM, basis: str = "analytic", f_max: float = 400.0, n_modes: int | None = None, c: float = 343.0) -> Reduced:
    if basis == "analytic":
        Psi, f_rigid, idx = analytic_basis(fem, f_max, c)
    elif basis == "fem":
        n = n_modes or max(20, len(box_modes(fem.geom.Lx, fem.geom.Ly, fem.geom.Lz, f_max, c)))
        Psi, f_rigid = fem_basis(fem, n, c)
        idx = _match_indices(fem, f_rigid, f_max * 1.2, c)
    else:
        raise ValueError(basis)
    K = Psi.T @ (fem.K @ Psi)
    M = Psi.T @ (fem.M @ Psi)
    B = {name: Psi.T @ (Bi @ Psi) for name, Bi in fem.B.items()}
    return Reduced(Psi, K, M, B, f_rigid, idx, basis)


def _match_indices(fem: RoomFEM, f_rigid: np.ndarray, f_max: float, c: float) -> list:
    an = box_modes(fem.geom.Lx, fem.geom.Ly, fem.geom.Lz, f_max, c)
    af = np.array([m[0] for m in an])
    out = []
    for f in f_rigid:
        j = int(np.argmin(np.abs(af - f)))
        out.append(an[j][1] if abs(af[j] - f) < 0.03 * max(f, 1.0) + 0.5 else (-1, -1, -1))
    return out


# ---------------------------------------------------------------- sweep

def sweep(red: Reduced, fem: RoomFEM, f: np.ndarray, beta: dict[str, np.ndarray], sources: list[np.ndarray],
          receivers: np.ndarray, c: float = 343.0, rho0: float = 1.204, progress=None) -> np.ndarray:
    """Pressure at receivers (nrec × 3 pts) for each source and frequency: array (nf, nsrc, nrec), complex."""
    Fs = np.stack([red.Psi.T @ fem.probe(s) for s in sources], axis=1)  # N × nsrc
    R = (fem.probes(np.asarray(receivers, dtype=float).T) @ red.Psi)  # nrec × N
    R = np.asarray(R)
    out = np.empty((f.size, len(sources), R.shape[0]), dtype=complex)
    names = [n for n in beta if n in red.B]
    for i, fi in enumerate(f):
        k = 2 * np.pi * fi / c
        A = red.K - k**2 * red.M
        A = A.astype(complex)
        for n in names:
            b = beta[n][i]
            if b != 0:
                A += 1j * k * b * red.B[n]
        rhs = 1j * 2 * np.pi * fi * rho0 * Fs
        a = la.solve(A, rhs)  # N × nsrc
        out[i] = (R @ a).T
        if progress is not None and (i % 50 == 0 or i == f.size - 1):
            progress(i / f.size)
    return out


def field_on_points(red: Reduced, fem: RoomFEM, f: float, beta_at_f: dict[str, complex], sources: list[np.ndarray],
                    pts: np.ndarray, c: float = 343.0, rho0: float = 1.204) -> np.ndarray:
    """Coherent-sum pressure of all sources on arbitrary points (3 × npts) at one frequency."""
    k = 2 * np.pi * f / c
    A = (red.K - k**2 * red.M).astype(complex)
    for n, b in beta_at_f.items():
        if n in red.B and b != 0:
            A += 1j * k * b * red.B[n]
    F = sum(red.Psi.T @ fem.probe(s) for s in sources) * (1j * 2 * np.pi * f * rho0)
    a = la.solve(A, F)
    P = fem.probes(np.asarray(pts, dtype=float)) @ red.Psi
    return np.asarray(P) @ a


def to_db_re_free_field(p: np.ndarray, f: np.ndarray) -> np.ndarray:
    """20 log10 |p| relative to the free-field level of one source at 1 m (per source)."""
    ref = free_field_1m(f)
    return 20 * np.log10(np.maximum(np.abs(p), 1e-30) / ref.reshape((-1,) + (1,) * (p.ndim - 1)))


# ---------------------------------------------------------------- impulse response and T60

def impulse_response(H: np.ndarray, f: np.ndarray, f_hp: float = 16.0) -> tuple[np.ndarray, float]:
    """Real impulse response from a one-sided transfer function on a uniform grid f = 0, Δf, …, f_max.

    The spectrum is shaped with *minimum-phase* (causal) Butterworth transfer
    functions: a 2nd-order high-pass at f_hp (the volume-velocity impulse leaves
    a 1/ω compliance drift from the (0,0,0) mode that never decays) and a
    4th-order low-pass at 0.9 f_max (band edge). Zero-phase real windows were
    tried first and put ~2 % of the energy at negative time, which wraps into
    the periodic IR and creates a false decay floor. Sampling rate = 2 f_max.
    """
    from scipy.signal import butter, freqs

    n = f.size
    w = 2 * np.pi * f
    b, a = butter(2, 2 * np.pi * f_hp, btype="highpass", analog=True)
    _, Hhp = freqs(b, a, w)
    b, a = butter(4, 2 * np.pi * 0.9 * f[-1], btype="lowpass", analog=True)
    _, Hlp = freqs(b, a, w)
    h = np.fft.irfft(H * Hhp * Hlp, n=2 * (n - 1))
    return h, 2 * f[-1]


def band_filter_ir(h: np.ndarray, fs: float, fc: float, fraction: int = 3, order: int = 2) -> np.ndarray:
    """1/`fraction`-octave Butterworth band-pass applied to the time-reversed IR (ISO 3382-style).

    Reverse-time filtering puts the filter's own ringing before the decay
    instead of on top of its tail; a zero-phase frequency-domain window was
    found to ring for ~0.1 s and wrap into the periodic IR, creating a false
    floor at −10 dB (docs/decisions.md, 2026-08-30).
    """
    from scipy.signal import butter, sosfilt

    lo, hi = fc * 2 ** (-1 / (2 * fraction)), fc * 2 ** (1 / (2 * fraction))
    hi = min(hi, 0.49 * fs)
    sos = butter(order, [lo, hi], btype="bandpass", fs=fs, output="sos")
    return sosfilt(sos, h[::-1])[::-1]


def schroeder_t60(h: np.ndarray, fs: float, start_db: float = -5.0, end_db: float = -25.0) -> tuple[float, np.ndarray]:
    """T60 from the backward-integrated energy decay (T20 extrapolated). Returns (T60, EDC in dB)."""
    e = h.astype(float) ** 2
    edc = np.cumsum(e[::-1])[::-1]
    edc_db = 10 * np.log10(np.maximum(edc / max(edc[0], 1e-300), 1e-30))
    t = np.arange(edc.size) / fs
    # adaptive range: stay 10 dB above the late floor (T20 → T10 fallback; NaN below 10 dB of range)
    floor = float(edc_db[int(0.8 * edc.size)])
    end_db = max(end_db, floor + 10.0)
    if end_db > start_db - 10.0:
        return float("nan"), edc_db
    m = (edc_db <= start_db) & (edc_db >= end_db)
    if m.sum() < 5:
        return float("nan"), edc_db
    slope, _ = np.polyfit(t[m], edc_db[m], 1)
    if slope >= 0:
        return float("nan"), edc_db
    return float(-60.0 / slope), edc_db


def t60_by_band(H: np.ndarray, f: np.ndarray, centres: np.ndarray, fraction: int = 3) -> np.ndarray:
    out = np.full(len(centres), np.nan)
    h, fs = impulse_response(H, f)
    for i, fc in enumerate(centres):
        hi = fc * 2 ** (1 / (2 * fraction))
        if hi > f[-1] * 0.9 or fc * 2 ** (-1 / (2 * fraction)) < f[1]:
            continue
        out[i], _ = schroeder_t60(band_filter_ir(h, fs, fc, fraction), fs)
    return out


# ---------------------------------------------------------------- modal damping (quadratic eigenproblem)

def modal_damping(red: Reduced, beta_fn, f_refs: np.ndarray, f_max: float, c: float = 343.0, n_max: int = 350) -> list[dict]:
    """Complex eigenfrequencies of the damped reduced system.

    β(ω) is frozen at each reference frequency in `f_refs`; every rigid mode
    takes its damped eigenvalue from the QEP solved with the nearest reference.
    Returns per rigid mode: f_rigid, f_damped, T60 = 1.10/Im f, indices, type.
    """
    n = min(red.N, n_max)
    # the reduced FEM matrices satisfy K a = k² M a with k = ω/c, so the QEP in ω uses M/c²
    K, M = red.K[:n, :n], red.M[:n, :n] / c**2
    Bs = {k: v[:n, :n] for k, v in red.B.items()}
    Minv = la.inv(M)
    results = {}
    refs = np.asarray(f_refs, dtype=float)
    assign = {i: int(np.argmin(np.abs(refs - fr))) for i, fr in enumerate(red.f_rigid[:n]) if fr <= f_max}
    for r, fr in enumerate(refs):
        members = [i for i, a in assign.items() if a == r]
        if not members:
            continue
        beta = beta_fn(np.array([fr]))
        C = sum((beta[name][0] / c) * Bs[name] for name in beta if name in Bs)
        # K + λ C + λ² M = 0, λ = jω  →  companion [[0, I], [−M⁻¹K, −M⁻¹C]]
        Z = np.zeros((n, n)); I = np.eye(n)
        comp = np.block([[Z, I], [-Minv @ K, -Minv @ C]])
        lam = la.eigvals(comp)
        w = -1j * lam  # ω
        w = w[w.real > 0]
        fd = w / (2 * np.pi)
        for i in members:
            j = int(np.argmin(np.abs(fd.real - red.f_rigid[i])))
            fdi = fd[j]
            zeta = 2 * np.pi * fdi.imag
            results[i] = {"f_rigid": float(red.f_rigid[i]), "f_damped": float(fdi.real),
                          "T60": float(6.91 / zeta) if zeta > 1e-9 else None,
                          "n": list(red.indices[i]) if red.indices else None,
                          "type": mode_type(red.indices[i]) if red.indices and red.indices[i][0] >= 0 else "unknown"}
    return [results[i] for i in sorted(results)]
