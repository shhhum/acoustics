"""Wall stack → TMM layer list → all wall-level results (JSON-serialisable)."""

from __future__ import annotations

import numpy as np

from . import materials as mat
from . import porous, statistical as stat, tmm
from .config import RockwoolLayer, WallSolverSettings, WallStack
from .constants import AIR, Air


def rockwool_model(layer: RockwoolLayer, air: Air = AIR):
    """(JCAParams | None, model function f -> (Zc, k)) for one rockwool layer."""
    p = mat.jca_from_density(layer.density, sigma=layer.sigma, phi=layer.phi, alpha_inf=layer.alpha_inf,
                             Lambda=layer.Lambda, Lambda_p=layer.Lambda_p, k0p=layer.k0p, d_fibre=layer.d_fibre)
    if layer.model == "jca":
        return p, (lambda f: porous.jca(f, p, air))
    if layer.model == "jcal":
        return p, (lambda f: porous.jca(f, p, air, lafarge=True))
    if layer.model == "miki":
        return p, (lambda f: porous.miki(f, p.sigma, air))
    if layer.model == "db":
        return p, (lambda f: porous.delany_bazley(f, p.sigma, air))
    raise ValueError(layer.model)


def build_layers(stack: WallStack, air: Air = AIR, force_model: str | None = None) -> tuple[list[tmm.Layer], list[dict]]:
    """TMM layers (sound-room side first) and a per-layer parameter table."""
    layers: list[tmm.Layer] = []
    table: list[dict] = []
    fab = stack.fabric
    if fab.thickness > 0 or fab.Rs:
        Rs = fab.flow_resistance
        layers.append(tmm.ScreenLayer(Rs=Rs, m_s=fab.areal_mass, name="fabric"))
        table.append({"layer": "fabric", "thickness": fab.thickness, "Rs": Rs, "Rs_over_rho_c": Rs / air.Z0})
    for i, rw in enumerate(stack.rockwool):
        if rw.thickness <= 0:
            continue
        if force_model is not None:
            rw = rw.model_copy(update={"model": force_model})
        p, fn = rockwool_model(rw, air)
        layers.append(tmm.FluidLayer(d=rw.thickness, model=fn, name=rw.name or f"rockwool {rw.density:g} kg/m³"))
        table.append({"layer": rw.name or f"rockwool[{i}]", "density": rw.density, "thickness": rw.thickness,
                      "model": rw.model, "sigma": p.sigma, "phi": p.phi, "alpha_inf": p.alpha_inf,
                      "Lambda": p.Lambda, "Lambda_p": p.Lambda_p, "k0p": p.k0p_effective,
                      "sigma_d_over_rho_c": p.sigma * rw.thickness / air.Z0})
    if stack.airgap.thickness > 0:
        layers.append(tmm.FluidLayer(d=stack.airgap.thickness, model=tmm.air_model(air), name="air gap"))
        table.append({"layer": "air gap", "thickness": stack.airgap.thickness})
    ply = stack.plywood
    if ply.thickness > 0:
        D = 0.0 if ply.model == "limp" else mat.plate_bending_stiffness(ply.E, ply.thickness, ply.nu, ply.loss)
        layers.append(tmm.PlateLayer(m_s=ply.surface_mass, D=D, name="plywood"))
        row = {"layer": "plywood", "thickness": ply.thickness, "surface_mass": ply.surface_mass, "model": ply.model}
        if ply.model == "plate":
            row["f_critical"] = mat.critical_frequency(ply.surface_mass, D, air)
        table.append(row)
    return layers, table


def frequency_grid(s: WallSolverSettings) -> np.ndarray:
    return np.geomspace(s.f_min, s.f_max, s.n_freq)


def compute_wall(stack: WallStack, settings: WallSolverSettings | None = None, air: Air = AIR) -> dict:
    """All wall-level outputs on a log frequency grid. Plain dict of lists for JSON."""
    s = settings or WallSolverSettings()
    f = frequency_grid(s)
    layers, table = build_layers(stack, air)
    th_f, w_f = tmm.paris_angles(s.n_theta, s.theta_field_max)
    th_r, w_r = tmm.paris_angles(s.n_theta, s.theta_random_max)
    zero = np.array([0.0])

    out: dict = {"f": f.tolist(), "layers": table, "thickness": stack.thickness}
    for backing in ("rigid", "air"):
        Zn = tmm.surface_impedance(layers, f, zero, backing, air)[:, 0]
        Zf = tmm.surface_impedance(layers, f, th_f, backing, air)
        Zr = tmm.surface_impedance(layers, f, th_r, backing, air)
        zn = np.where(np.isfinite(Zn), Zn / air.Z0, 1e9 + 0j)
        out[f"Z_{backing}"] = {"re": zn.real.tolist(), "im": zn.imag.tolist()}
        a_n = tmm.absorption(Zn[:, None], zero, air)[:, 0]
        a_f = tmm.paris_average(tmm.absorption(Zf, th_f, air), w_f)
        a_r = tmm.paris_average(tmm.absorption(Zr, th_r, air), w_r)
        out[f"alpha_{backing}"] = {
            "normal": a_n.tolist(), "field": a_f.tolist(), "random": a_r.tolist(),
            "octave": {"f": stat.OCTAVE_CENTRES.tolist(), "field": _nan_to_none(stat.band_average(f, a_f, stat.OCTAVE_CENTRES, 1))},
            "third_octave": {"f": stat.THIRD_OCTAVE_CENTRES.tolist(), "field": _nan_to_none(stat.band_average(f, a_f, stat.THIRD_OCTAVE_CENTRES, 3))},
        }

    tl_n = tmm.transmission_loss(layers, f, zero, air)[:, 0]
    # more angles for TL: the plate coincidence angle sweeps through the grid and is otherwise undersampled
    tl_f = tmm.field_transmission_loss(layers, f, max(s.n_theta, 256), s.theta_field_max, air)
    out["TL"] = {"normal": tl_n.tolist(), "field": tl_f.tolist(),
                 "octave": {"f": stat.OCTAVE_CENTRES.tolist(), "field": _nan_to_none(stat.band_average(f, tl_f, stat.OCTAVE_CENTRES, 1))}}
    m_ply = stack.plywood.surface_mass if stack.plywood.thickness > 0 else 0.0
    out["TL"]["mass_law_normal"] = stat.mass_law_tl(f, m_ply, False, air).tolist() if m_ply > 0 else None
    out["TL"]["mass_law_field"] = stat.mass_law_tl(f, m_ply, True, air).tolist() if m_ply > 0 else None

    # Miki cross-check (same stack, all rockwool layers forced to Miki)
    layers_miki, _ = build_layers(stack, air, force_model="miki")
    Zm = tmm.surface_impedance(layers_miki, f, th_f, "rigid", air)
    out["alpha_rigid_miki_field"] = tmm.paris_average(tmm.absorption(Zm, th_f, air), w_f).tolist()

    out["markers"] = markers(stack, table, air)
    out["warnings"] = warnings(stack, table, f, air)
    return out


def markers(stack: WallStack, table: list[dict], air: Air = AIR) -> dict:
    m: dict = {}
    wool = sum(r.thickness for r in stack.rockwool)
    depth = wool + stack.airgap.thickness
    if depth > 0:
        m["quarter_wave_f_low"] = air.c0 / (4 * depth)
    if stack.airgap.thickness > 0:
        m["gap_half_wave_dips"] = [n * air.c0 / (2 * stack.airgap.thickness) for n in (1, 2, 3)]
    for row in table:
        if "f_critical" in row:
            m["f_critical_plywood"] = row["f_critical"]
    total_R = sum(row.get("sigma_d_over_rho_c", 0.0) for row in table)
    m["total_sigma_d_over_rho_c"] = total_R
    # single impervious leaf → no mass-air-mass inside the wall; report None explicitly
    m["f_mass_air_mass"] = None
    return m


def warnings(stack: WallStack, table: list[dict], f: np.ndarray, air: Air = AIR) -> list[str]:
    w: list[str] = []
    for row in table:
        if row["layer"] == "fabric" and row["Rs_over_rho_c"] > 2.5:
            w.append(f"fabric flow resistance {row['Rs']:.0f} rayl is {row['Rs_over_rho_c']:.1f}×ρc — not acoustically transparent")
        if row.get("model") in ("miki", "db"):
            frac = porous.empirical_validity(f, row["sigma"])
            if frac < 0.9:
                w.append(f"{row['layer']}: {row['model']} valid only for 0.01<f/σ<1 ({frac:.0%} of grid inside)")
    total_R = sum(row.get("sigma_d_over_rho_c", 0.0) for row in table)
    if total_R > 6:
        w.append(f"total normalised flow resistance σd/ρc = {total_R:.1f} — well above the 2–4 optimum; the face will reflect")
    dens = [r.density for r in stack.rockwool if r.thickness > 0]
    if any(b < a for a, b in zip(dens, dens[1:])):
        w.append("rockwool densities are not increasing from the room side outward — the literature ordering is low σ first")
    return w


def _nan_to_none(a) -> list:
    return [None if (x is None or (isinstance(x, float) and np.isnan(x))) else float(x) for x in np.asarray(a, dtype=float)]
