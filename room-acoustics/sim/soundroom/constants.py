"""Physical constants and air properties.

Convention throughout the package: time dependence e^{+jωt}. Lossy media have
Im{ρ̃} < 0 and Im{k} < 0 (decay as e^{-jkx}); passive impedances have Re{Z} > 0.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Air:
    """Air at ~20 °C, 1 atm."""

    rho0: float = 1.204  # kg/m³
    c0: float = 343.0  # m/s
    eta: float = 1.82e-5  # dynamic viscosity, Pa·s
    kappa: float = 0.0257  # thermal conductivity, W/(m·K)
    gamma: float = 1.4  # ratio of specific heats
    cp: float = 1006.0  # J/(kg·K)
    P0: float = 101325.0  # Pa

    @property
    def Z0(self) -> float:
        """Characteristic impedance ρ0·c0 (rayl)."""
        return self.rho0 * self.c0

    @property
    def Pr(self) -> float:
        """Prandtl number η·cp/κ."""
        return self.eta * self.cp / self.kappa


AIR = Air()
