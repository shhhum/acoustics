# speaker-design — sound-room acoustical simulator

Design tool for a sound room built inside a venue. Models the wall stack
(fabric / graded rockwool / optional air gap / plywood) with the transfer-matrix
method and the Johnson–Champoux–Allard equivalent-fluid model, then feeds the
wall impedance into a finite-element Helmholtz solver of the sound room and of
the coupled venue to predict modes, frequency response, T60 and the inside→
outside level difference. A React UI drives the Python engine; every run is
logged to disk with its inputs and provenance.

Status: **M5 — complete first version: wall engine, room FEM/modal solver, coupled venue isolation, run store with comparison, presets, CSV export. Next candidates: volumetric-wool FEM arm (locally-reacting error), door panels, second impervious leaf option.** See `docs/decisions.md`
for the dated decision log and `docs/research/` for the literature/patent
reports the design rests on.

## Layout

```
docs/research/      dated research reports (inputs to the design)
docs/decisions.md   decision log + negative results (append-only)
docs/physics.md     equations as implemented (written with M1)
sim/                Python engine (uv project, Python 3.12) — package `soundroom`
ui/                 Vite + React UI (from M2)
data/materials.json material presets with sources
data/presets/       saved input configurations
data/runs/          append-only run store (gitignored)
soundsystem-designer.jsx   earlier single-file design instrument (kept as-is; design language + Miki baseline)
```

## Setup

```
make setup     # uv sync (Python 3.12 venv in sim/.venv) + npm install
make test      # pytest (39 tests: analytic oracles, golden JSX baseline, FEM/modal, coupled model)
make dev       # API (uvicorn :8765) + UI (vite :5173) — open http://localhost:5173
```

CLI equivalents (results land in `out/…`, not the run store):

```
cd sim
uv run soundroom wall --png                 # TMM: impedance / absorption / TL
uv run soundroom room  [--fmax 300]         # room FEM/modal: FRF, T60, modes, maps  (~30 s)
uv run soundroom isolation [--fmax 200] [--workers 4]   # coupled venue: level difference (~1.5 min)
```

Runs saved from the UI go to `data/runs/<timestamp>-<hash>/` (inputs, results, provenance) and can be reopened, compared and reloaded from the Runs page.

## Physics in one paragraph

Each rockwool layer is an equivalent fluid (JCA: φ, σ, α∞, Λ, Λ′ derived from
bulk density, all overridable); the fabric is a resistive screen; the air gap is
a fluid layer; the plywood is a thin elastic plate. Layer 2×2 transfer matrices
are chained; the surface impedance is obtained by the numerically stable
impedance recursion (rigid-backed and venue-backed), absorption from the
reflection coefficient (normal, field and random incidence via Paris' integral),
and transmission loss from the four-pole formula. The room is solved as
∇²p + k²p = source with Robin boundaries ∂p/∂n = −jkβp, β = ρc/Zs, projected
onto rigid-wall modes for dense sweeps; T60 is derived from the impulse response
by Schroeder backward integration and cross-checked with Sabine/Eyring. The
venue is solved with the wall as a 2-port interface and the openings as air.
