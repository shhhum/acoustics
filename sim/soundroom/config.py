"""Input schema (pydantic) for the wall stack and the scene.

Units are SI throughout (m, kg, Pa·s/m², Hz). Layer order in ``WallStack``
runs from the sound-room side outward: fabric → rockwool[0..n] → air gap → plywood.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

SCHEMA_VERSION = 1


class RockwoolLayer(BaseModel):
    name: str | None = None
    density: float = Field(45.0, gt=0, description="bulk density kg/m³")
    thickness: float = Field(0.05, ge=0, description="m")
    model: Literal["jca", "jcal", "miki", "db"] = "jca"
    # optional overrides of the density-derived JCA parameters
    sigma: float | None = Field(None, gt=0, description="flow resistivity Pa·s/m²")
    phi: float | None = Field(None, gt=0, le=1)
    alpha_inf: float | None = Field(None, ge=1)
    Lambda: float | None = Field(None, gt=0)
    Lambda_p: float | None = Field(None, gt=0)
    k0p: float | None = Field(None, gt=0)
    d_fibre: float = Field(8e-6, gt=0, description="fibre diameter for the Bies–Hansen σ(ρ) fit")


class Fabric(BaseModel):
    thickness: float = Field(0.001, ge=0, description="m")
    sigma: float = Field(3e5, gt=0, description="cloth flow resistivity Pa·s/m² (Rs = σ·t)")
    Rs: float | None = Field(None, ge=0, description="direct flow resistance Pa·s/m; overrides σ·t")
    areal_mass: float = Field(0.3, ge=0, description="kg/m²")

    @property
    def flow_resistance(self) -> float:
        return self.Rs if self.Rs is not None else self.sigma * self.thickness


class AirGap(BaseModel):
    thickness: float = Field(0.0, ge=0, description="m; 0 = none")


class Plywood(BaseModel):
    thickness: float = Field(0.012, ge=0, description="m; 0 = no skin")
    density: float = Field(600.0, gt=0)
    E: float = Field(8e9, gt=0, description="Young's modulus Pa")
    nu: float = Field(0.3, ge=0, lt=0.5)
    loss: float = Field(0.03, ge=0, description="structural loss factor")
    model: Literal["plate", "limp"] = "plate"

    @property
    def surface_mass(self) -> float:
        return self.density * self.thickness


class WallStack(BaseModel):
    name: str = "wall"
    fabric: Fabric = Fabric()
    rockwool: list[RockwoolLayer] = Field(default_factory=lambda: [RockwoolLayer(name="Safe'n'Sound", density=40, thickness=0.05),
                                                                    RockwoolLayer(name="RW3", density=60, thickness=0.05)])
    airgap: AirGap = AirGap()
    plywood: Plywood = Plywood()

    @property
    def thickness(self) -> float:
        return (self.fabric.thickness + sum(r.thickness for r in self.rockwool)
                + self.airgap.thickness + self.plywood.thickness)


class WallSolverSettings(BaseModel):
    f_min: float = Field(20.0, gt=0)
    f_max: float = Field(10000.0, gt=0)
    n_freq: int = Field(400, ge=8)
    n_theta: int = Field(64, ge=4)
    theta_field_max: float = Field(78.0, gt=0, le=90, description="Paris integral limit for field incidence, deg")
    theta_random_max: float = Field(90.0, gt=0, le=90)

    @model_validator(mode="after")
    def _order(self):
        if self.f_max <= self.f_min:
            raise ValueError("f_max must exceed f_min")
        return self


# ---------------------------------------------------------------- scene (used from M3)

class Venue(BaseModel):
    length: float = Field(15.5, gt=0, description="x extent, m")
    width: float = Field(8.0, gt=0, description="y extent, m")
    height: float = Field(2.9, gt=0)
    # per-octave absorption of the venue shell, centres 63..8000 Hz
    alpha_floor: list[float] = Field(default_factory=lambda: [0.02, 0.02, 0.03, 0.03, 0.03, 0.04, 0.05, 0.05])
    alpha_walls: list[float] = Field(default_factory=lambda: [0.02, 0.03, 0.03, 0.03, 0.04, 0.05, 0.05, 0.05])
    alpha_ceiling: list[float] = Field(default_factory=lambda: [0.02, 0.03, 0.03, 0.03, 0.04, 0.05, 0.05, 0.05])


class Opening(BaseModel):
    width: float = Field(0.9, ge=0)
    height: float = Field(2.0, ge=0)


class SoundRoom(BaseModel):
    """Interior dimensions and placement (position of the interior's min corner in venue coordinates)."""

    length: float = Field(6.0, gt=0, description="x extent of the interior, m")
    width: float = Field(4.0, gt=0, description="y extent of the interior, m")
    x: float = Field(4.0, ge=0, description="venue x of the interior min corner")
    y: float = Field(2.0, ge=0)
    source_face: Literal["-x", "+x", "-y", "+y"] = "-x"
    source_height: float = Field(1.2, gt=0)
    source_inset: float = Field(0.3, ge=0, description="distance of each source from the two adjacent walls")
    # openings on the three non-source faces, keyed by face
    openings: dict[str, Opening] = Field(default_factory=lambda: {"+x": Opening(), "-y": Opening(), "+y": Opening()})


class Listener(BaseModel):
    x: float = Field(3.0, description="relative to the sound-room interior min corner, m")
    y: float = 2.0
    z: float = 1.2


class RoomSolverSettings(BaseModel):
    f_max: float = Field(300.0, gt=20, le=800, description="FEM cap, Hz")
    df: float = Field(0.5, gt=0, description="sweep resolution, Hz (sets IR length 1/df)")
    nodes_per_wavelength: float = Field(8.0, ge=4, description="trilinear hex mesh resolution at f_max")
    basis: Literal["analytic", "fem"] = "analytic"
    basis_margin: float = Field(1.6, ge=1.0, description="modes retained up to basis_margin × f_max (truncation error ≈ 4 % at 2×, 10–25 % at 1×)")
    n_modes: int | None = Field(None, description="override the number of modes (fem basis)")
    wall_angle_deg: float = Field(0.0, ge=0, le=80, description="incidence angle at which the wall's Z_s is taken for the Robin BC")


class IsolationSolverSettings(BaseModel):
    f_min: float = Field(20.0, gt=0)
    f_max: float = Field(200.0, gt=20, le=500, description="coupled FEM cap, Hz (direct solves: cost ∝ f³)")
    points_per_octave: int = Field(12, ge=3, le=48)
    nodes_per_wavelength: float = Field(6.0, ge=4)
    workers: int = Field(4, ge=1, le=16, description="parallel frequency solves (each holds an LU: ~0.5–1.5 GB)")
    receivers: list[list[float]] | None = Field(None, description="venue-coordinate receiver points; None = defaults")


class Scene(BaseModel):
    schema_version: int = SCHEMA_VERSION
    name: str = "default"
    wall: WallStack = WallStack()
    venue: Venue = Venue()
    room: SoundRoom = SoundRoom()
    listener: Listener = Listener()
    wall_solver: WallSolverSettings = WallSolverSettings()
    room_solver: RoomSolverSettings = RoomSolverSettings()
    isolation_solver: IsolationSolverSettings = IsolationSolverSettings()
