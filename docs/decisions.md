# Decision log

Dated, append-only. Each entry: decision, evidence/mechanism, who. Negative results go here too.

## 2026-08-30 — Project kickoff (Andrew Shum + Claude Fable 5)

**Scope.** Acoustical simulator for a sound room inside a venue (8 × 15.5 × 2.9 m). Outputs: wall flow resistivity / impedance / absorption / TL; room modes, frequency response at listener, T60(f); inside→outside level difference.

**Constants confirmed by Andrew.**
- Sound-room walls run to the venue ceiling (no separate ceiling); H = 2.9 m.
- Two sources in the corners of one face, aimed at the room centre (monopoles in the FEM; aim used for drawing/statistical direct field only).
- Openings on the other three faces are open apertures centred on the face; height/width adjustable, 0 × 0 = closed. No doors in v1.
- Venue surfaces: hard shell with per-octave α editable in the UI.
- Timber frame ignored.

**Architecture.** Python engine (uv, Python 3.12, numpy/scipy/scikit-fem, FastAPI) + React/Vite/TS/recharts UI in the design language of `soundsystem-designer.jsx`. Chosen over an all-Python UI for chart quality and reuse of the existing look.

**Physics choices (evidence in `docs/research/2026-08-30-*.md`).**
- Wall: TMM with JCA per rockwool layer (JCAL optional; for fibrous wool the difference is negligible). Parameters from bulk density via Bies–Hansen σ(ρ) with d = 8 µm (calibrated ±10 % against manufacturer σ), φ = 1 − ρ/2600, α∞ = 1, Λ = √(8α∞η/(σφ)), Λ′ = 2Λ. All overridable. Miki retained as oracle.
- Surface impedance via the stable impedance recursion, with both rigid-backed and venue-backed terminations; TL via the four-pole formula; field incidence = Paris integral to 78°.
- Room FEM: trilinear hex on a structured grid (scikit-fem), Robin BC β = ρc/Zs from the TMM (locally-reacting approximation — known to misestimate for thick wool; a volumetric-JCA arm is scheduled as M6 to quantify the error), modal projection onto Neumann modes for dense sweeps, T60 from IFFT → Schroeder integration. Statistical Sabine/Eyring alongside.
- Coupled venue + room: single structured mesh with the wall volume removed and the wall applied as a 2-port interface from the TMM; openings meshed as air; direct per-frequency sparse solves at 1/12-octave to a 200 Hz default cap; statistical (composite TL + power route) above.
- FEM cap defaults: 300 Hz (room), 200 Hz (coupled). Schroeder frequency of the treated room is ~150–250 Hz so statistical methods are valid above.

**Findings already known before writing code (from the literature; to be verified numerically here).**
- The wall as specified is single-leaf: TL ≈ plywood mass law. No mass-air-mass resonance inside the wall.
- Open apertures cap isolation at TL_max = −10 log10(open fraction); this will be the binding constraint.
- Grading: low σ facing the room; grading helps modestly; total σd/ρc ≈ 2–4 dominates → 35–50 kg/m³ average for ~100 mm builds.
- The suggested air gap improves absorption (quarter-wave) but not isolation for a single-skin wall.

**Process.** Branch → PR → merge per milestone; research memorialized in-repo the day it lands; runs are append-only on disk with provenance; golden-baseline first (reproduce the existing JSX Miki curve before trusting the JCA implementation).

**Not accessible.** LinkedIn patents page (HTTP 999); patents recovered from Google Patents instead. Rod Gervais book not accessible; its numbers are not used.

## 2026-08-30 — Room solver (M3): what worked and what didn't (Claude Fable 5)

- **Modal projection works.** Analytic rigid-box cosine modes sampled on the FEM mesh (Rayleigh–Ritz on the assembled K, M, B) give a 970-mode reduced model for the default room at a 300 Hz cap; the full sweep (0–300 Hz at 0.5 Hz) takes ~25 s. FEM `eigsh` eigenfrequencies match the analytic ones to 0.1 % (0.14 m mesh). A direct complex sparse solve costs 17 s *per frequency* at 29k DOF (SuperLU fill-in) — sweeps must use the reduced model; M4 will need a better sparse solver or a reduced basis of its own.
- **Basis truncation:** listener pressure error vs. the direct FEM solve is 10–27 % with modes retained to 1× the cap and 3–4 % at 2×; default `basis_margin` = 1.6.
- **Modal damping via QEP:** with the reduced FEM matrices, K̃a = k²M̃a (k = ω/c), so the ω-QEP needs M̃/c². With that fix the modal T60s (0.4–0.55 s) agree with Eyring (0.47 s) for the default stack.
- **Negative result — zero-phase band windows for T60.** A frequency-domain 1/3-octave window (brick-wall with soft edges, then a Butterworth-magnitude |H|²) rings for ~0.1 s and, being symmetric in time, wraps into the periodic IR; the Schroeder curve floors at −10 dB and T60 comes out at 30–200 s even for a synthetic single mode with a known 0.5 s. Fix: causal Butterworth band-pass applied to the time-reversed IR (ISO 3382 practice).
- **Negative result — zero-phase high-pass.** The volume-velocity impulse leaves a 1/ω compliance drift ((0,0,0) mode) that never decays; removing it with a real spectral window put ~2 % of the energy at negative time (same wrap). Fix: shape the spectrum with *minimum-phase* analog Butterworth transfer functions (HP 2nd order at 16 Hz, LP 4th order at 0.9 f_max). Synthetic check now returns 0.50 s; room bands give 0.33–0.37 s at 63–100 Hz vs Eyring 0.46 s.
- Fit range is adaptive (T20 → T10 when the late floor is within 10 dB); bands with < 10 dB of range report no value rather than a wrong one.
