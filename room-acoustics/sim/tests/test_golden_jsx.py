"""Golden baseline: reproduce the wall absorption of soundsystem-designer.jsx exactly.

The fixture is produced by `node sim/tests/jsx_oracle.mjs` (committed alongside).
The JSX model is Miki + impedance translation at normal incidence, with the Paris
integral applied to the *normal-incidence* impedance (locally-reacting), 60
midpoint angles to 83°, ρ0 = 1.2. We rebuild the identical stack with our TMM.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from soundroom import porous, tmm
from soundroom.constants import Air

FIX = Path(__file__).parent / "fixtures" / "jsx_default_envelope.json"


@pytest.fixture(scope="module")
def fixture():
    return json.loads(FIX.read_text())


def _layers(env, air):
    L = [tmm.FluidLayer(d=env["skinT"], model=lambda f, s=env["skinSigma"]: porous.miki_jsx(f, s, air), name="skin")]
    for w in env["wool"]:
        L.append(tmm.FluidLayer(d=w["t"], model=lambda f, s=w["sigma"]: porous.miki_jsx(f, s, air)))
    L.append(tmm.PlateLayer(m_s=env["plyT"] * env["plyRho"], D=0.0))
    L.append(tmm.FluidLayer(d=env["gap"], model=tmm.air_model(air), name="gap"))
    return L


def test_normal_incidence_impedance_and_alpha_match_jsx(fixture):
    air = Air(rho0=1.2, c0=343.0)
    f = np.array(fixture["f"])
    Zn = tmm.surface_impedance(_layers(fixture["env"], air), f, np.array([0.0]), "rigid", air)[:, 0]
    Zj = np.array(fixture["Z_norm"])
    np.testing.assert_allclose(Zn.real / air.Z0, Zj[:, 0], rtol=1e-6, atol=1e-9)
    np.testing.assert_allclose(Zn.imag / air.Z0, Zj[:, 1], rtol=1e-6, atol=1e-9)
    a_n = tmm.absorption(Zn[:, None], np.array([0.0]), air)[:, 0]
    np.testing.assert_allclose(a_n, fixture["normal"], atol=1e-9)


def test_random_incidence_alpha_matches_jsx_locally_reacting(fixture):
    air = Air(rho0=1.2, c0=343.0)
    f = np.array(fixture["f"])
    Zn = tmm.surface_impedance(_layers(fixture["env"], air), f, np.array([0.0]), "rigid", air)[:, 0]
    th, w = tmm.paris_angles(60, 83.0)
    a = tmm.paris_average(tmm.absorption(np.broadcast_to(Zn[:, None], (f.size, th.size)), th, air), w)
    np.testing.assert_allclose(a, fixture["random"], atol=1e-9)
