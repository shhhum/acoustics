# Acoustics literature report — sound-room wall modelling (TMM + JCA/JCAL → FEM Robin BC)

- **Date:** 2026-08-30
- **Author:** Claude (Opus 5 research agent), commissioned by Andrew Shum; reviewed and condensed by Claude Fable 5
- **Status:** research input to the simulator design; equations here are the ones `sim/soundroom` implements (see `docs/physics.md` once written)
- **Convention:** time dependence **e^{+jωt}**, so lossy media have Im{ρ̃} < 0 and passive impedances have Re{Z} > 0. Flip every `j` for e^{−iωt} (FEniCSx demos often use that).

---

## 1. JCA / JCAL equivalent-fluid models

**JCA effective density** (Johnson, Koplik & Dashen 1987; Champoux & Allard 1991) — verified against [Matelys APMR](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/JohnsonChampouxAllardModel.html) and eq. (6) of [arXiv:2302.07527](https://arxiv.org/abs/2302.07527):

```
ρ̃(ω) = (α∞ ρ0/φ) · [ 1 + (σφ)/(jω ρ0 α∞) · sqrt(1 + j·4α∞²η ρ0 ω/(σ²Λ²φ²)) ]
```

**JCA bulk modulus:**
```
K̃(ω) = (γP0/φ) / { γ − (γ−1)·[ 1 − j·(8κ)/(Λ'²Cp ρ0 ω)·sqrt(1 + j·Λ'²Cp ρ0 ω/(16κ)) ]⁻¹ }
```

**JCAL** replaces only the thermal term with the static thermal permeability k₀′ (Lafarge et al. 1997):
```
K̃(ω) = (γP0/φ) / { γ − (γ−1)·[ 1 − j·(φκ)/(k₀′Cp ρ0 ω)·sqrt(1 + j·4k₀′²Cp ρ0 ω/(κΛ'²φ²)) ]⁻¹ }
```
JCA is the k₀′ = φΛ'²/8 special case. Then `Z_c = sqrt(ρ̃K̃)`, `k = ω·sqrt(ρ̃/K̃)`.

Air constants (13.6 °C, from arXiv:2302.07527): η = 1.8232e-5 kg/m·s, κ = 0.025684 W/m·K, γ = 1.4, Cp = 1006.8 J/kg·K, P0 = 100325 Pa.

**Rockwool parameter estimation.** Bies & Hansen: `σ = K1 · ρ_bulk^1.53 / d²` with K1 = 3.18e-9 (SI; ρ in kg/m³, fibre diameter d in m). Checked against manufacturer data (14.9 / 26.0 / 52.3 kPa·s/m² at 40 / 60 / 100 kg/m³): with **d = 8 μm** it predicts 14.0 / 26.1 / 57.1 kPa·s/m² — within ~10 %. Use d ≈ 8 μm as the calibrated stone-wool fibre diameter.

| ρ_bulk (kg/m³) | σ (kPa·s/m²) | φ = 1 − ρ/2600 | α∞ | Λ (μm) | Λ′ (μm) |
|---|---|---|---|---|---|
| 30 | ~9 | 0.988 | 1.0–1.05 | ~130 | ~260 |
| 45 | ~17 | 0.983 | 1.0–1.05 | ~93 | ~186 |
| 60 | ~26 | 0.977 | 1.0–1.05 | ~76 | ~152 |
| 100 | ~52 | 0.962 | 1.0–1.05 | ~54 | ~108 |

Λ from the standard estimate `Λ = (1/c)·sqrt(8 α∞ η /(σφ))` with shape factor c ≈ 1 for fibrous media (c ≈ 0.5–0.7 for foams); `Λ′ ≈ 2Λ` for cylindrical fibres (Allard & Atalla ch. 5). Cross-check for 60 kg/m³: the geometric form `Λ = r·ρ_fibre/(2ρ_bulk)` with r = 4 μm gives 87 μm vs 76 μm from the σ formula — agreement to ~15 %, which is about the honest accuracy here. Stone-wool fibre density ρ_fibre ≈ 2500–2700 kg/m³. Tortuosity: α∞ = 1.0 for loose wool; 1.05–1.1 only for compressed/needled product. **k₀′ ≈ φΛ′²/8** is a fine default (i.e. just use JCA — for fibrous wool the JCAL correction is small; JCAL matters for foams and below ~100 Hz).

**Sanity-check models.** Delany–Bazley ([APMR](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/DelanyBazleyModel.html)), with X = 10³f/σ:
`Z_c = ρ0c0[1 + 9.08 X^−0.75 − j 11.9 X^−0.73]`, `k = (ω/c0)[1 + 10.8 X^−0.70 − j 10.3 X^−0.59]`.
Miki (1990), same X: `Z_c = ρ0c0[1 + 5.50 X^−0.632 − j 8.43 X^−0.632]`, `k = (ω/c0)[1 + 7.81 X^−0.618 − j 11.41 X^−0.618]`. Validity 0.01 < f/σ < 1; Miki is causal/well-behaved below that, DB gives non-physical negative Re{Z_s} at low f. **Use Miki as the regression test for the JCA implementation** — for wool they should agree within a few percent over 100 Hz–5 kHz.

**Refs:** Allard & Atalla, *Propagation of Sound in Porous Media*, 2nd ed. (Wiley 2009), ch. 5; Bies & Hansen, *Engineering Noise Control*; [arXiv:2302.07527](https://arxiv.org/abs/2302.07527) (Kraxberger et al. 2023, JCAL fitted by GA to 4-mic tube data — worked fitting recipe and validated parameter set); [arXiv:2103.11368](https://arxiv.org/abs/2103.11368) (Cuenca et al., KTH — deterministic + Bayesian inverse identification of JCA/Biot parameters); [arXiv:2309.09388](https://arxiv.org/abs/2309.09388) (polydisperse fibrous microstructure → transport properties).

**Takeaway.** Implement JCA with (φ, σ, α∞, Λ, Λ′) derived per-layer from bulk density via Bies–Hansen + the Λ estimates above; expose all five as overridable. Validate against Miki, and treat σ as the only parameter you really trust — everything else moves α by a few percent, whereas σ moves it a lot.

---

## 2. TMM for the multilayer

State vector **V = [p, v_z]ᵀ**, with V(front) = **T** · V(back). Trace wavenumber `k_x = k0 sin θ` is conserved through every layer; in layer i, `k_{z,i} = sqrt(k_i² − k0² sin²θ)` and the normal-direction impedance is `Z_i = Z_{c,i}·k_i/k_{z,i}`.

**Fluid / equivalent-fluid layer, thickness d:**
```
T = [[ cos(k_z d),        j Z sin(k_z d) ],
     [ (j/Z) sin(k_z d),  cos(k_z d)     ]]
```
**Resistive screen (fabric), flow resistance R_s [rayl]:** `T = [[1, R_s],[0,1]]` — pressure jump R_s·v, velocity continuous. Include inertia as `Z = R_s + jω m″_fabric/φ_f` if the cloth is heavy.
**Limp plate (plywood), surface mass m″:** `T = [[1, jωm″],[0,1]]`.
**Elastic thin plate at oblique incidence:** `Z_plate(θ) = j[ω m″ − D k_x⁴/ω]`, with `D = E h³(1+jη)/(12(1−ν²))`. Coincidence at `f_c = (c0²/2π)·sqrt(m″/D)`; for 12 mm plywood f_c ≈ 2.0 kHz. Below ~f_c/2 the limp model is adequate.

**Surface impedance recursion (numerically stable — prefer this over multiplying T's):**
```
Z_n = (T11·Z_{n+1} + T12)/(T21·Z_{n+1} + T22)
```
Rigid backing Z_{N+1} = ∞ → Z = T11/T21. For a screen or plate this collapses to `Z_front = Z_back + Z_plate`.

**Absorption.** `R(θ) = (Z_s(θ) − ρ0c0/cos θ)/(Z_s(θ) + ρ0c0/cos θ)`, `α(θ) = 1 − |R|²`.
**Paris (random-incidence) formula:** `α_st = ∫₀^{π/2} α(θ) sin 2θ dθ`, in practice truncated at θ_max ≈ 78° for field incidence.

**Transmission loss, unbacked (air both sides)** — four-pole with anechoic termination, eq. (10)–(11) of Doutres & Atalla [arXiv:1008.0976](https://arxiv.org/abs/1008.0976):
```
t(θ) = 2 / [ T11 + T12/Z0(θ) + Z0(θ)·T21 + T22 ],   Z0(θ) = ρ0c0/cos θ
TL(θ) = −20 log10|t|
τ_d = ∫₀^{θlim} τ(θ) sin2θ dθ / ∫₀^{θlim} sin2θ dθ,  TL_d = −10 log10 τ_d
```

**For this stack (fabric / wool / gap / plywood, venue on the far side):** build the full unbacked T from interior air → fabric → wool layers → air gap → plywood → exterior air and apply the formula above. **TL is direction-independent** for reciprocal layers (det T = 1), so the plywood-outward orientation doesn't change TL — but α *does* differ from the two sides, and only the interior-facing α matters for room T60. Compute both from the same T. **This wall has only one impervious leaf**, so its TL is essentially plywood mass law (12 mm ply, m″ ≈ 7.2 kg/m² → normal-incidence TL ≈ 17 dB at 125 Hz, field-incidence ≈ 12 dB) plus a small contribution from the wool. Don't expect double-leaf performance from a single-skin wall.

**Numerical caution:** for thick lossy layers at high f, `k_z d` acquires a large imaginary part and cos/sin overflow. The impedance recursion above is stable; the T-product is not. If you need scattering quantities at high f, use a stiffness/scattering-matrix formulation — see [arXiv:2302.12868](https://arxiv.org/abs/2302.12868) (Imperial College, "Stiffness matrix method for modelling wave propagation in arbitrary multilayers").

**Refs:** Allard & Atalla ch. 11 (canonical TMM chapter, incl. finite-size/spatial-windowing correction); Song & Bolton, JASA 107(3):1131 (2000); Lauriks, Mees & Allard, JSV 155(1):125 (1992).

**Takeaway.** One `Layer` protocol returning a 2×2 T given (ω, k_x); assemble by list; two solvers — `surface_impedance()` via the stable recursion (for α and the FEM BC) and `transmission_loss()` via the four-pole product. Test against three analytics: rigid-backed air gap (`Z = −jρ0c0 cot kg`), bare mass law, and a Miki-modelled wool layer.

---

## 3. Density-graded / multilayer porous absorbers

**Does grading help? Yes, but modestly, and the ordering is not optional.** The mechanism is impedance matching: a low-σ front layer avoids the reflection at the air/absorber interface, while the high-σ rear layer supplies dissipation where the wave has already entered. Reversed ordering (dense facing the room) reflects at the surface and is strictly worse.

- **Boulvert et al., J. Appl. Phys. 126, 175101 (2019)**, "Optimally graded porous material for broadband perfect absorption of sound" ([HAL](https://hal.science/hal-02366295)): continuous-gradient optimisation via nonlinear conjugate gradient. Grading **shifts the perfect-absorption peak to lower frequency and widens the band** vs uniform; a 30 mm optimised sample achieves α > 99.7 % over 3.9–19.5 kHz. Optimal profiles are *sequences* of low/high porosity, not a monotone ramp.
- **Cavalieri et al., Materials 13(20):4605 (2020)**, "Graded and Anisotropic Porous Materials for Broadband and Angular Maximal Acoustic Absorption" ([open access](https://pmc.ncbi.nlm.nih.gov/articles/PMC7602802/)): *"graded properties appear to be crucial for optimal broadband **diffuse-field** absorption"* while anisotropy dominates single-frequency performance. Graded 25 mm designs gave two absorption peaks at α_dif = 0.93–0.96 vs a single peak for non-graded. Method: FE-homogenised unit-cell database + PCHIP interpolation + Nelder–Mead over a 5-node depth discretisation, TMM in the loop — the optimisation architecture we want later.
- **Double porosity** (Olny & Boutin, JASA 114:73, 2003; Atalla et al., JSV 2001/App. Acoust. 2004): meso-perforating a *highly resistive* layer adds a pressure-diffusion loss mechanism and raises low/mid α. Relevant if a very dense rear layer ends up in the design.

**Practical caveat the papers agree on:** for a rigid-backed layer of thickness d, the dominant design variable is the **total** normalised flow resistance `R = σd/(ρ0c0)`, with an optimum around **R ≈ 2–4** (±1 uncertainty). Grading buys a few hundredths of α on top of getting R right; getting R wrong (too dense) costs far more. With d = 100 mm you want σ_effective ≈ 8–17 kPa·s/m², i.e. **35–50 kg/m³ average density, not 100**.

**Takeaway.** Implement grading as an ordered list and *verify* the ordering effect numerically (run reversed as a control — negative results are results). Expect: grading gives a small broadband gain at equal mass, ordering matters a lot, total σd matters more than the profile.

---

## 4. Air gap behind the wool; mass–air–mass behind the plywood

**Absorption mechanism.** A rigid-backed air gap of depth g has `Z_gap = −j ρ0c0 cot(k g)` — a *velocity* maximum (Z → 0) at g = λ/4 and a *pressure* antinode (Z → ∞) at g = λ/2. Porous absorbers dissipate via particle velocity, so moving the wool back into the λ/4 region buys low-frequency absorption for free.

- **Rule of thumb:** absorption rolls off below `f ≈ c0/(4·(d_material + g))`. A 100 mm slab on a 100 mm gap behaves roughly like 200 mm of material at low frequency — about **one octave** of extra low-end reach for zero extra material.
- **Classic exact result:** a thin resistive sheet of R_s = ρ0c0 = 415 rayl at g = λ/4 gives α = 1.
- **Known downside:** dips near `f = n·c0/(2g)` (n = 1, 2, …) where the gap presents a near-rigid impedance and the absorber sits at a velocity node. With a *thick* wool layer these are heavily smeared and rarely a practical problem; with a thin facing over a deep gap they are.

**Mass–air–mass (transmission).** For a genuine double-leaf partition:
```
f_mam = (1/2π)·sqrt[ ρ0c0²·(1/m1 + 1/m2)/d ]
```
Below f_mam the pair acts as a single mass; at f_mam TL collapses toward ~0 dB; above it TL rises at ~18 dB/octave until the first cavity resonance (c0/2d). **Two effects of a porous filler**, both documented in [arXiv:1008.0976](https://arxiv.org/abs/1008.0976) (Doutres & Atalla, JASA): (i) the cavity becomes isothermal at low frequency so the air spring stiffness drops from ρ0c0² toward γP0 — `f_mam` falls by ~sqrt(γ) ≈ 18 % (~¼ octave); (ii) the standing-wave cavity resonance dips at n·c0/2d are **greatly attenuated** and high-frequency TL improves by 5–10 dB. The paper's decomposition `TL = TL_p1 + TL_p2 + TL_m + TL_u + TL_d` is a useful diagnostic.

**Warning from that paper:** a blanket with *poor* absorption in the cavity can make TL **worse than an empty cavity** (8 dB worse at 900 Hz for a high-σ foam). High density in the gap is not automatically better for transmission either.

**Applies to this wall:** fabric/wool/gap/plywood is a **single-leaf** construction — there is no MAM resonance within the wall itself. MAM appears only between the plywood and the venue's own wall (with the venue air volume as the spring, so f_mam is very low), or if a second impervious skin is added. If TL is a real requirement, adding a second mass layer (e.g. a plasterboard/OSB inner skin behind the wool) with the wool filling the cavity is the change that actually moves TL — and *then* the f_mam formula and the porous-damping mechanism above become the governing physics.

---

## 5. Room-acoustics FEM with impedance BCs

**Governing problem.** `∇·((1/ρ)∇p) + (ω²/K)p = −source`, which for air reduces to `∇²p + k²p = −jωρ0 Q δ(x−x_s)`.

**Robin (locally-reacting impedance) BC**, outward normal n:
```
∂p/∂n = −jωρ0 v_n = −jωρ0 p/Z_s = −j k β p,    β = ρ0c0/Z_s  (normalized admittance)
```
**Weak form:** `∫_Ω ∇p·∇w − k²∫_Ω p w + jk∫_Γ β p w = ∫ f w`.
**Sign check:** assemble, then verify the boundary term dissipates — `Re{p v_n*}/2 > 0` requires `Re{Z_s} > 0`. Getting the sign wrong gives a *gaining* boundary and blows up. This is the single most common bug in these solves.

**Two modelling caveats:**
1. **A thick absorber is not locally reacting.** A ~150 mm wool + gap stack has a surface impedance that depends strongly on incidence angle. Feeding the *normal-incidence* Z_s into a Robin BC misestimates absorption. Options: (a) use Z_s(θ) at a representative angle (~45–60°) — crude but cheap; (b) **model the absorber volumetrically as an equivalent-fluid subdomain** with JCA ρ̃(ω), K̃(ω), which is what Kraxberger et al. do and validate to 3.25–4.11 dB third-octave error against ISO 354 measurements ([arXiv:2302.07527](https://arxiv.org/abs/2302.07527)). For a sound room with thick walls, (b) is the more accurate choice; it costs the absorber volume in mesh and loses the modal-projection speed-up.
2. **Frequency-dependent Z_s breaks linear modal analysis.** You cannot form a standard quadratic eigenvalue problem with ω-dependent β. Options: rational/multipole fit of Z_s with auxiliary differential equations; a nonlinear eigensolver; or **simplest and recommended — sweep frequency, IFFT the transfer function to an impulse response, and Schroeder-backward-integrate for T20/T30**.

**T60 from modal damping** (Masovic, *Room Acoustics lecture notes*, [arXiv:2111.01900](https://arxiv.org/abs/2111.01900), §3.3): with `p ~ e^{−ζt}`, `T60 = ln(10³)/ζ = 6.91/ζ`. From a complex eigenfrequency `f_n = f_r + j f_i`: `ζ = 2π f_i` → **T60 = 1.10 / f_i**. Equivalently from modal half-power bandwidth Δf: **T60 = 2.2/Δf**.

**Statistical cross-checks** (same source, §5.2.2/5.3):
`Sabine: T60 = 0.161 V/(Σ α_i S_i)`; `Eyring: T60 = 0.161 V/(−S ln(1−ᾱ))`. Sabine over-predicts for heavily/unevenly damped small rooms — expect FEM and Sabine to diverge by tens of percent in a well-treated 35 m³ room, and trust the FEM below the Schroeder frequency.

**Sizing for a 3 × 4 × 2.9 m room** (V = 34.8 m³, S = 64.6 m², L_edges = 39.6 m):

- **Schroeder frequency** `f_s ≈ 2000·sqrt(T60/V)`: 186 Hz at T60 = 0.3 s, 240 Hz at 0.5 s. **Above ~250 Hz statistical/geometric methods are valid — FEM is not needed above ~300–500 Hz.**
- **Mode count below 300 Hz:** ≈ 140 (Kuttruff's three-term formula: 97 volume + 39 surface + 4 edge).
- **DOF estimate** with P2 Lagrange elements, node spacing λ/n → DOF ≈ V·(n f/c)³:

| f | λ (m) | DOF @ 6 nodes/λ | DOF @ 10 nodes/λ |
|---|---|---|---|
| 300 Hz | 1.14 | ~5 k | ~23 k |
| 500 Hz | 0.69 | ~23 k | ~108 k |
| 1 kHz | 0.34 | ~186 k | ~862 k |
| 2 kHz | 0.17 | ~1.5 M | ~6.9 M |

Kraxberger et al. found **λ/6 with second-order elements sufficient** (relative eigenfrequency error 8.7e-5); λ/12 cost 64× the wall time for negligible gain. Pollution error grows with kL, so pad the resolution going up in frequency. On a laptop with a sparse direct solver, 3-D Helmholtz is comfortable to ~150–300 k DOF and painful beyond ~1 M (LU fill-in is the wall). You pay this per frequency step.

**Python tooling.**
- **scikit-fem** — pure Python/NumPy, Helmholtz examples, trivial to add a Robin term, no compilation. Best fit here.
- **FEniCSx (DOLFINx)** — heavier install; natural if P2/P3, complex PETSc, MPI are wanted.
- **openCFS** — open-source C++ FE framework used in arXiv:2302.07527, JCAL equivalent-fluid material built in, Nitsche-type non-conforming meshing. Strongest *validated* precedent for exactly this problem.
- **pyroomacoustics** — image-source + ray tracing, **not** wave-based. Use for > f_s only.
- **Bempp / OptimUS** — BEM alternatives; coupling a volumetric JCA absorber is awkward.

**Validation refs for boundary data:** [arXiv:2509.08873](https://arxiv.org/abs/2509.08873), [arXiv:2602.11425](https://arxiv.org/abs/2602.11425), [arXiv:2604.07412](https://arxiv.org/abs/2604.07412) — in-situ surface impedance estimation.

**Takeaway.** Sweep 20–300 Hz at ≤ 1 Hz, IFFT → Schroeder → T20. Cross-check against Sabine/Eyring computed from the TMM's diffuse-field α, and expect them to disagree — that disagreement is the *reason* for doing FEM.

---

## 6. Room-within-a-room transmission

**Standard building-acoustics relation** (ISO 140 / ISO 16283 field form):
```
R' = L1 − L2 + 10 log10(S/A2)   ⟺   L2 = L1 − R + 10 log10(S/A2)
```
S = partition area, A2 = Σα_i S_i = equivalent absorption area of the **receiving** room.

**For a box inside a large venue, the diffuse-receiving-room assumption may fail.** The more honest route is via radiated power:
```
L_W2 = L_p1 − 6 dB + 10 log10(S/1 m²) − R
L_p2(r) = L_W2 + 10 log10[ Q/(4πr²) + 4/R_venue ]
```
with R_venue = Sᾱ/(1−ᾱ) the venue room constant. Sum incoherently over the four walls, each with its own S and R.

**Composite TL with openings:**
```
τ̄ = Σ S_i τ_i / Σ S_i ;   TL_comp = −10 log10[ Σ S_i·10^(−TL_i/10) / S_tot ]
```
An opening has TL ≈ 0 dB (τ = 1). **A fractional open area f caps the whole partition at TL_max = −10 log10(f)**. 1 % open → 20 dB max. 0.1 % → 30 dB. A 40 dB wall with a 10 mm gap around a 2 m² door (0.04 m² of 10 m² wall = 0.4 %) is a 24 dB wall.

**Open ceiling (not our case — walls run to the venue ceiling).** If the sound room had no ceiling, the ceiling *is* the opening and the correct model is barrier/diffraction attenuation (Maekawa: `Att ≈ 10 log10(3 + 20N)`, N = 2δ/λ), typically 5–15 dB. Flanking through a shared floor slab is the next-largest path and is outside the scope of a TMM wall model.

**Refs:** Beranek, *Acoustics*, sound transmission chapter; Bies & Hansen, *Engineering Noise Control*, ch. 8 (composite TL, field-incidence mass law `TL ≈ TL_normal − 5 dB`); Cox & D'Antonio, *Acoustic Absorbers and Diffusers*, 3rd ed.; Fahy, *Foundations of Engineering Acoustics*, double partitions.

**Takeaway.** Compute per-surface TL from the TMM, combine with the composite formula including every opening, then convert to a level difference with the power-based route. Report `TL_max` from openings alongside the wall TL — it will almost certainly be the binding constraint.

---

## Sources

- [arXiv:2302.07527](https://arxiv.org/abs/2302.07527) — Kraxberger, Kurz, Weselak, Kubin, Kaltenbacher, Schoder (2023), *A Validated Finite Element Model for Room Acoustic Treatments with Edge Absorbers* — closest published precedent to this pipeline
- [arXiv:1008.0976](https://arxiv.org/abs/1008.0976) — Doutres & Atalla (JASA), *Acoustic contributions of a sound absorbing blanket in a double panel structure: Absorption vs Transmission*
- [arXiv:2302.12868](https://arxiv.org/abs/2302.12868) — *Stiffness matrix method for modelling wave propagation in arbitrary multilayers*
- [arXiv:2103.11368](https://arxiv.org/abs/2103.11368) — Cuenca et al., JCA/Biot inverse characterisation
- [arXiv:2111.01900](https://arxiv.org/abs/2111.01900) — Masovic, *Room Acoustics (lecture notes)*, TU Berlin
- [arXiv:2309.09388](https://arxiv.org/abs/2309.09388) — polydispersity in fibrous structures → transport properties
- [arXiv:2509.08873](https://arxiv.org/abs/2509.08873), [arXiv:2602.11425](https://arxiv.org/abs/2602.11425), [arXiv:2604.07412](https://arxiv.org/abs/2604.07412) — in-situ surface impedance estimation
- [APMR/Matelys JCA](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/JohnsonChampouxAllardModel.html), [JCAL](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/JohnsonChampouxAllardLafargeModel.html), [Delany-Bazley](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/DelanyBazleyModel.html), [Miki](https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/DelanyBazleyMikiModel.html)
- [Boulvert et al. 2019, J. Appl. Phys. 126:175101](https://hal.science/hal-02366295)
- [Cavalieri et al. 2020, Materials 13:4605](https://pmc.ncbi.nlm.nih.gov/articles/PMC7602802/)
- Books: Allard & Atalla (2009) ch. 5 & 11; Beranek *Acoustics*; Cox & D'Antonio *Acoustic Absorbers and Diffusers* 3rd ed.; Bies & Hansen *Engineering Noise Control*; Kuttruff *Room Acoustics* 5th ed.
- [Rockwool flow resistivity data (Gearspace)](https://gearspace.com/threads/flow-resistivity-data-for-mineral-wool.498189/)

**Flagged uncertainties:** the σd/(ρ0c0) ≈ 2–4 optimum is a design heuristic to verify numerically in our own TMM; Λ′ ≈ 2Λ is a cylindrical-fibre idealisation good to maybe ±20 % for real wool; the Bies–Hansen d = 8 μm calibration is fitted to one manufacturer's published data and should be re-fitted if impedance-tube measurements become available; the DOF/laptop-ceiling figures are arithmetic, not benchmarks.
