import numpy as np

from soundroom import materials as mat
from soundroom import porous, statistical as stat, tmm
from soundroom.config import AirGap, Fabric, Plywood, RockwoolLayer, WallStack
from soundroom.constants import AIR
from soundroom.wall import build_layers, compute_wall

F = np.geomspace(20, 10000, 120)
ZERO = np.array([0.0])


def test_rigid_backed_air_gap_is_minus_j_rho_c_cot_kd():
    d = 0.3
    Z = tmm.surface_impedance([tmm.FluidLayer(d, tmm.air_model())], F, ZERO, "rigid")[:, 0]
    k = 2 * np.pi * F / AIR.c0
    np.testing.assert_allclose(Z, -1j * AIR.Z0 / np.tan(k * d), rtol=1e-9)


def test_screen_adds_in_series():
    Rs = 300.0
    gap = tmm.FluidLayer(0.1, tmm.air_model())
    Zg = tmm.surface_impedance([gap], F, ZERO, "rigid")[:, 0]
    Zs = tmm.surface_impedance([tmm.ScreenLayer(Rs), gap], F, ZERO, "rigid")[:, 0]
    np.testing.assert_allclose(Zs, Zg + Rs, rtol=1e-9)


def test_quarter_wave_screen_is_perfect_absorber():
    # R_s = ρc at g = λ/4 → α = 1 (classic exact result)
    f0 = 500.0
    g = AIR.c0 / (4 * f0)
    Z = tmm.surface_impedance([tmm.ScreenLayer(AIR.Z0), tmm.FluidLayer(g, tmm.air_model())], np.array([f0]), ZERO, "rigid")
    a = tmm.absorption(Z, ZERO)[0, 0]
    assert abs(a - 1.0) < 1e-6


def test_limp_mass_tl_is_mass_law_at_normal_incidence():
    m = 7.2
    tl = tmm.transmission_loss([tmm.PlateLayer(m_s=m, D=0.0)], F, ZERO)[:, 0]
    np.testing.assert_allclose(tl, stat.mass_law_tl(F, m), rtol=1e-9)


def test_tl_reciprocity_and_screen_over_air_backing():
    """TL of a reciprocal stack is the same from both sides; air-backed screen Z = ρc + Rs."""
    stack = WallStack(rockwool=[RockwoolLayer(density=45, thickness=0.05), RockwoolLayer(density=100, thickness=0.05)],
                      airgap=AirGap(thickness=0.05))
    layers, _ = build_layers(stack)
    th = np.deg2rad(np.array([0.0, 30.0, 60.0]))
    tl_fwd = tmm.transmission_loss(layers, F, th)
    tl_rev = tmm.transmission_loss(list(reversed(layers)), F, th)
    np.testing.assert_allclose(tl_fwd, tl_rev, rtol=1e-6, atol=1e-6)
    Z = tmm.surface_impedance([tmm.ScreenLayer(200.0)], F, ZERO, "air")[:, 0]
    np.testing.assert_allclose(Z, AIR.Z0 + 200.0, rtol=1e-12)


def test_absorption_in_unit_interval_and_energy_balance():
    """α + τ ≤ 1 for the venue-backed stack (absorbed + transmitted ≤ incident)."""
    stack = WallStack()
    layers, _ = build_layers(stack)
    th, w = tmm.paris_angles(32, 78.0)
    Z = tmm.surface_impedance(layers, F, th, "air")
    a = tmm.absorption(Z, th)  # 1 − |R|² = absorbed + transmitted fraction
    tau = np.abs(tmm.transmission_coefficient(layers, F, th)) ** 2
    assert np.all(a >= 0) and np.all(a <= 1)
    assert np.all(tau <= a + 1e-9)


def test_graded_ordering_low_sigma_first_is_better_broadband():
    """Negative-control check from the literature: dense-first ordering reflects at the face."""
    good = WallStack(rockwool=[RockwoolLayer(density=40, thickness=0.05), RockwoolLayer(density=100, thickness=0.10)])
    bad = WallStack(rockwool=[RockwoolLayer(density=100, thickness=0.10), RockwoolLayer(density=40, thickness=0.05)])
    ag, ab = (np.array(compute_wall(s)["alpha_rigid"]["field"]) for s in (good, bad))
    f = np.array(compute_wall(good)["f"])
    band = (f > 250) & (f < 5000)
    assert ag[band].mean() > ab[band].mean()


def test_air_gap_extends_low_frequency_absorption():
    base = WallStack(rockwool=[RockwoolLayer(density=45, thickness=0.1)], airgap=AirGap(thickness=0.0))
    gapped = WallStack(rockwool=[RockwoolLayer(density=45, thickness=0.1)], airgap=AirGap(thickness=0.1))
    r0, r1 = compute_wall(base), compute_wall(gapped)
    f = np.array(r0["f"])
    lf = (f > 80) & (f < 250)
    assert np.array(r1["alpha_rigid"]["field"])[lf].mean() > np.array(r0["alpha_rigid"]["field"])[lf].mean()


def test_plate_critical_frequency_marker():
    ply = Plywood(thickness=0.012, density=600, E=8e9)
    D = mat.plate_bending_stiffness(ply.E, ply.thickness, ply.nu)
    fc = mat.critical_frequency(ply.surface_mass, D)
    assert 1300 < fc < 1500  # table in docs/research: 1410 Hz for 12 mm, E = 8 GPa


def test_compute_wall_is_json_serialisable_and_has_expected_keys():
    import json

    res = compute_wall(WallStack(fabric=Fabric(thickness=0.001)))
    json.dumps(res)
    for k in ("f", "layers", "Z_rigid", "Z_air", "alpha_rigid", "alpha_air", "TL", "markers", "warnings"):
        assert k in res
    assert res["markers"]["f_mass_air_mass"] is None  # single impervious leaf
