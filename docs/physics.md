# Physics as implemented

Living document: equations exactly as coded in `sim/soundroom`, with the file that implements each. Sources and derivations are in `docs/research/`.

**Sign convention.** Time dependence e^{+jωt}. Lossy media: Im{ρ̃} < 0, Im{k} < 0 (waves decay as e^{−jkx}). Passive impedances: Re{Z} > 0. Air (`constants.py`): ρ0 = 1.204 kg/m³, c0 = 343 m/s, η = 1.82e-5 Pa·s, κ = 0.0257 W/m·K, γ = 1.4, cp = 1006 J/kg·K, P0 = 101325 Pa.

## Wall (M1)

### Porous layers — `porous.py`, `materials.py`
JCA: ρ̃ = (α∞ρ0/φ)[1 + (σφ)/(jωρ0α∞)·√(1 + j4α∞²ηρ0ω/(σ²Λ²φ²))];
K̃ = (γP0/φ) / {γ − (γ−1)/[1 − j(8κ)/(Λ′²cpρ0ω)·√(1 + jΛ′²cpρ0ω/(16κ))]}.
JCAL replaces the thermal bracket with k0′: [1 − j(φκ)/(k0′cpρ0ω)·√(1 + j4k0′²cpρ0ω/(κΛ′²φ²))]; k0′ = φΛ′²/8 recovers JCA. Zc = √(ρ̃K̃), k = ω√(ρ̃/K̃).
Parameters from bulk density ρ: σ = 3.18e-9·ρ^1.53/d² (d = 8 µm), φ = 1 − ρ/2600, α∞ = 1 (1.05 if ρ ≥ 90), Λ = √(8α∞η/(σφ)), Λ′ = 2Λ. Every parameter can be overridden per layer.
Miki: Zc = ρc[1 + 0.0699X^−0.632 − j0.107X^−0.632], k = (ω/c)[1 + 0.109X^−0.618 − j0.160X^−0.618], X = f/σ. Delany–Bazley also available. Both flagged outside 0.01 < f/σ < 1.

### Layer matrices — `tmm.py`
V = [p, v_n]ᵀ, V_front = T·V_back, k_x = k0 sinθ conserved.
- Fluid (thickness d): k_z = √(k² − k_x²) (Im ≤ 0 branch), Z = Zc·k/k_z, T = [[cos k_z d, jZ sin k_z d],[(j/Z) sin k_z d, cos k_z d]].
- Screen (fabric, limp and permeable): T = [[1, Z_sc],[0, 1]], Z_sc = Rs·jωm_s/(Rs + jωm_s) (→ Rs when ωm ≫ Rs; → jωm when the cloth simply moves with the air), Rs = σ_fabric·t unless given directly.
- Plate (plywood): T = [[1, j(ωm″ − Dk_x⁴/ω)],[0, 1]], D = Eh³(1+jη)/(12(1−ν²)); limp: D = 0.
Surface impedance: Z_n = (T11Z_{n+1} + T12)/(T21Z_{n+1} + T22) from the back; backing rigid (Z = ∞ → T11/T21) or air (Z = ρc/cosθ, the venue side).
R(θ) = (Z_s cosθ − ρc)/(Z_s cosθ + ρc), α = 1 − |R|². Field incidence: Paris integral ∫α sin2θ dθ, midpoint rule, 64 angles to 78° (random: to 90°).
Transmission (air both sides): t = 2/[T11 + T12/Z0θ + Z0θT21 + T22], Z0θ = ρc/cosθ; TL = −10log10|t|²; field TL = −10log10 of the sin2θ-weighted τ average to 78°.

### Statistical relations — `statistical.py`
Sabine T60 = 0.161V/(A + 4mV); Eyring T60 = 0.161V/(−S ln(1−ᾱ) + 4mV); air attenuation m from ISO 9613-1 (20 °C, 50 % RH); Schroeder f_s = 2000√(T60/V).
Mass law TL = 10log10(1 + (πfm″/ρc)²), field ≈ −5 dB. Mass–air–mass f0 = (1/2π)√(ρc²(1/m1 + 1/m2)/d), filled cavity → P0 instead of ρc².
Composite TL = −10log10(ΣS_i10^(−TL_i/10)/ΣS_i); opening-limited TL_max = −10log10(open fraction).
Level difference, power route: D = TL + 6 − 10log10 S − 10log10(Q/4πr² + 4/R_venue), R_venue = Sᾱ/(1−ᾱ). Diffuse form: D = R − 10log10(S/A2).

### Outputs of `wall.compute_wall`
Per-layer σ, φ, α∞, Λ, Λ′, k0′, σd/ρc; Z_s/ρc (normal incidence) for rigid and venue backing; α normal/field/random for both backings with octave and 1/3-octave field averages; TL normal/field with mass-law reference; Miki cross-check curve; markers (quarter-wave f_low = c/4(d_wool + gap), gap half-wave dips, plywood f_c, total σd/ρc, f_mam = None for a single leaf); warnings (fabric opacity, empirical-model validity, over-resistive stack, non-monotonic density order).

## Room FEM (M3) — to be written with the code
## Coupled venue (M4) — to be written with the code
