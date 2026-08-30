import numpy as np

from soundroom import materials as mat
from soundroom import porous
from soundroom.constants import AIR


def test_bies_hansen_calibration_matches_manufacturer_sigma():
    # manufacturer σ 14.9 / 26.0 / 52.3 kPa·s/m² at 40 / 60 / 100 kg/m³ (docs/research §1)
    for rho, meas in ((40, 14.9e3), (60, 26.0e3), (100, 52.3e3)):
        est = mat.sigma_bies_hansen(rho)
        assert abs(est - meas) / meas < 0.12, (rho, est, meas)


def test_strutt_matches_airrock_anchor():
    assert abs(mat.sigma_strutt(50) - 14400) / 14400 < 0.15


def test_jca_sign_convention_and_limits():
    p = mat.jca_from_density(45)
    f = np.geomspace(20, 10000, 50)
    rho = porous.jca_density(f, p)
    K = porous.jca_bulk_modulus(f, p)
    assert np.all(rho.imag < 0)  # lossy for e^{+jωt}: Im ρ̃ < 0 ...
    assert np.all(K.imag > 0)  # ... and Im K̃ > 0 (so that Im k < 0)
    Zc, k = porous.jca(f, p)
    assert np.all(k.imag < 0) and np.all(Zc.real > 0)
    # low-f bulk modulus → isothermal P0/φ ; high-f → adiabatic γP0/φ
    K_lo = porous.jca_bulk_modulus(np.array([0.01]), p)[0]
    K_hi = porous.jca_bulk_modulus(np.array([1e8]), p)[0]
    assert abs(K_lo.real - AIR.P0 / p.phi) / (AIR.P0 / p.phi) < 0.02
    assert abs(K_hi.real - AIR.gamma * AIR.P0 / p.phi) / (AIR.gamma * AIR.P0 / p.phi) < 0.02
    # low-f density ~ σφ/(jω) dominated; high-f → α∞ρ0/φ
    rho_hi = porous.jca_density(np.array([1e9]), p)[0]
    assert abs(rho_hi.real - p.alpha_inf * AIR.rho0 / p.phi) / (AIR.rho0 / p.phi) < 0.02


def test_jcal_reduces_to_jca_with_default_k0p():
    p = mat.jca_from_density(60)
    f = np.geomspace(20, 10000, 30)
    K1 = porous.jca_bulk_modulus(f, p)
    K2 = porous.jca_bulk_modulus(f, p, lafarge=True)
    np.testing.assert_allclose(K1, K2, rtol=1e-6)


def test_jca_agrees_with_miki_for_wool():
    """Same σ → JCA and Miki characteristic impedance within ~20 % in the Miki validity window."""
    for rho in (40, 60, 100):
        p = mat.jca_from_density(rho)
        f = np.geomspace(0.02 * p.sigma, 0.9 * p.sigma, 40)  # inside 0.01<f/σ<1
        Zj, kj = porous.jca(f, p)
        Zm, km = porous.miki(f, p.sigma)
        assert np.max(np.abs(Zj - Zm) / np.abs(Zm)) < 0.25, rho
        assert np.max(np.abs(kj - km) / np.abs(km)) < 0.25, rho
