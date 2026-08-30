import numpy as np

from soundroom import statistical as stat


def test_sabine_eyring_basic():
    V, S = 4 * 6 * 2.9, 2 * (4 * 6 + 4 * 2.9 + 6 * 2.9)
    a = 0.3
    ts = stat.sabine_t60(V, S * a)
    te = stat.eyring_t60(V, S, a)
    assert 0.3 < ts < 0.6 and te < ts  # Eyring shorter than Sabine for the same ᾱ


def test_air_attenuation_iso9613_reasonable():
    m = stat.air_attenuation_coefficient(np.array([1000.0, 4000.0]))
    # ≈ 5 dB/km at 1 kHz and ≈ 25–30 dB/km at 4 kHz for 20 °C / 50 % RH
    db_per_m = m * 10 * np.log10(np.e)
    assert 0.003 < db_per_m[0] < 0.007
    assert 0.020 < db_per_m[1] < 0.035


def test_mass_air_mass_constant_60():
    f0 = stat.mass_air_mass_frequency(7.2, 7.2, 0.15)
    approx = 60 * np.sqrt((7.2 + 7.2) / (7.2 * 7.2 * 0.15))
    assert abs(f0 - approx) / approx < 0.02
    assert stat.mass_air_mass_frequency(7.2, 7.2, 0.15, filled=True) < f0


def test_composite_tl_with_opening_is_capped():
    S = np.array([14.5 - 1.8, 1.8])  # wall minus a 0.9×2 m opening, and the opening
    tl = stat.composite_tl(S, np.array([40.0, 0.0]))
    cap = stat.opening_limited_tl(1.8, 14.5)
    assert abs(tl - cap) < 0.1 and 8 < cap < 10


def test_band_average_constant_signal():
    f = np.geomspace(20, 10000, 500)
    y = np.full_like(f, 0.7)
    b = stat.band_average(f, y, stat.OCTAVE_CENTRES, 1)
    np.testing.assert_allclose(b, 0.7)
