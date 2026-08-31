"""Composition sweep for the wall stack (multilayer schema, M7).

Sweeps single/graded wool with 0–2 air gaps for fixed total thicknesses,
mindful of total and face-layer normalised flow resistance (sigma*d/rho*c).
Scores venue-backed field-incidence absorption; reports low-band TL too.

Run:  cd sim && uv run python ../scripts/sweep_wall.py [total_mm ...]
Provenance: written 2026-09-01 (M7 multilayer stack); results in
docs/research/2026-09-01-multilayer-stack-sweeps.md
"""
import itertools
import sys

import numpy as np

from soundroom.config import AirGap, Fabric, Plywood, RockwoolLayer, WallSolverSettings, WallStack
from soundroom.wall import compute_wall

S = WallSolverSettings(f_min=31.5, f_max=8000, n_freq=160, n_theta=32)
BANDS = [63, 125, 250, 500, 1000, 2000]
PLY_MM, FAB_MM = 12, 1
DENS = [20, 30, 40, 60, 80, 100]


def octaves(r, which):
    o = r["alpha_air"]["octave"] if which == "a" else r["TL"]["octave"]
    return {int(fc): v for fc, v in zip(o["f"], o["field"]) if fc in BANDS and v is not None}


def evaluate(wools, gaps_after, gap_mm, budget_mm):
    """wools: density tuple; gaps_after: indices of wool layers followed by a gap."""
    wool_mm = budget_mm - gap_mm * len(gaps_after)
    if wool_mm < 40 * len(wools) or (gap_mm > 0 and not gaps_after):
        return None
    per = wool_mm // len(wools)
    layers = []
    for i, d in enumerate(wools):
        mm = wool_mm - per * (len(wools) - 1) if i == 0 else per  # remainder to the face layer
        layers.append(RockwoolLayer(density=d, thickness=mm / 1000))
        if i in gaps_after:
            layers.append(AirGap(thickness=gap_mm / 1000))
    st = WallStack(fabric=Fabric(thickness=FAB_MM / 1000), layers=layers, plywood=Plywood(thickness=PLY_MM / 1000))
    r = compute_wall(st, S)
    a, tl = octaves(r, "a"), octaves(r, "tl")
    face = next(row for row in r["layers"] if "density" in row)
    return {
        "desc": "|".join(f"{d}x{L.thickness*1e3:.0f}" for d, L in zip(wools, (l for l in layers if isinstance(l, RockwoolLayer))))
                + (f"|gap{gap_mm}@{sorted(gaps_after)}" if gaps_after and gap_mm else ""),
        "a": a, "tl": tl,
        "a_lo": np.mean([a[63], a[125], a[250]]), "a_mean": np.mean(list(a.values())),
        "tl_lo": np.mean([tl[63], tl[125], tl[250]]),
        "sd_total": r["markers"]["total_sigma_d_over_rho_c"],
        "sd_face": face["sigma_d_over_rho_c"],
    }


def sweep(total_mm):
    budget = total_mm - PLY_MM - FAB_MM
    combos = [(d,) for d in DENS] + [c for c in itertools.product(DENS, DENS) if c[0] <= c[1]]
    if total_mm >= 300:
        combos += list(itertools.product([20, 30], [40, 60], [80, 100, 140]))
    variants = {(frozenset(), 0)}
    for mm in (25, 50, 100):
        if mm > budget - 80:
            continue
        variants.add((frozenset({0}), mm))     # gap after first wool layer
        variants.add((frozenset({1}), mm))     # gap after second (2+ wools)
        if 2 * mm <= budget - 80:
            variants.add((frozenset({0, 1}), mm))
    rows = []
    for wools in combos:
        for gaps_after, gap_mm in variants:
            if gaps_after and max(gaps_after) >= len(wools):
                continue
            res = evaluate(wools, gaps_after, gap_mm, budget)
            if res:
                rows.append(res)
    rows.sort(key=lambda r: -(r["a_lo"] + 0.5 * r["a_mean"]))
    print(f"\n=== total {total_mm} mm (fabric {FAB_MM} + wool/gap {budget} + ply {PLY_MM}) — {len(rows)} stacks ===")
    hdr = "stack (room→venue)            | sd_tot sd_face | a63 a125 a250 a500 a1k a2k | aLo  aMean | TL63-250"
    print(hdr); print("-" * len(hdr))
    for r in rows[:8]:
        a = r["a"]
        print(f"{r['desc']:29s} | {r['sd_total']:5.1f} {r['sd_face']:6.1f} | "
              f"{a[63]:.2f} {a[125]:.2f} {a[250]:.2f} {a[500]:.2f} {a[1000]:.2f} {a[2000]:.2f} | "
              f"{r['a_lo']:.2f} {r['a_mean']:.3f} | {r['tl_lo']:4.0f} dB")
    hi_tl = sorted(rows, key=lambda r: -r["tl_lo"])[:3]
    print("highest low-band TL:")
    for r in hi_tl:
        print(f"{r['desc']:29s} | {r['sd_total']:5.1f} {r['sd_face']:6.1f} | aLo {r['a_lo']:.2f} | TL {r['tl_lo']:.0f} dB")
    return rows


if __name__ == "__main__":
    totals = [int(x) for x in sys.argv[1:]] or [200, 250, 400]
    for t in totals:
        sweep(t)
