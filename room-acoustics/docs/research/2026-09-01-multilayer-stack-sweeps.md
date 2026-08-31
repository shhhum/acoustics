# Multilayer stack sweeps: 20/25/40 cm compositions + Openground Wuppertal hypothesis

*2026-09-01 · Andrew Shum with Claude (M7 branch) · method: `scripts/sweep_wall.py` against the
TMM engine (JCA, Bies–Hansen σ(ρ) d=8 µm), venue-backed field-incidence α, field TL; fabric 1 mm
+ wool/gaps + ply 12 mm; densities 20–140 kg/m³, gaps 0–100 mm, up to 2 gaps, 213–354 stacks per total.*

## Context

The M7 schema change makes the wall a single ordered `layers` list (rockwool and air gaps, any
order, re-orderable), so gap-position questions are now expressible. A 30 kg/m³ preset ("30K")
was added after the 2026-08-31 density probe showed the σd/ρc = 2–4 optimum falls at
20–30 kg/m³ for ~185 mm depth (the σd/ρc > 6 warning fired at 40 kg/m³ × 185 mm = 6.3 and
proved directionally correct: computed penalty ~0.07 α in the 250–500 Hz bands).

## Results (top of each sweep)

| total | best-α stack (room→venue) | σd/ρc | α 63/125/250 | α mean | TL 63–250 |
|---|---|---|---|---|---|
| 200 mm | 20 kg × 187 | 2.2 | 0.41 / 0.73 / 0.95 | 0.83 | 18 dB |
| 250 mm | 20 kg × 237 | 2.8 | 0.48 / 0.84 / 0.96 | 0.86 | 20 dB |
| 400 mm | 20 kg × 387 | 4.6 | 0.71 / 0.92 / 0.95 | 0.91 | 25 dB |

Balanced picks (α within 0.01–0.02 of best, several dB more TL) — grade with a dense back half:

| total | stack | α lo | TL 63–250 |
|---|---|---|---|
| 200 mm | 20×94 → 40×93 → ply | 0.69 | 19 dB (+1) |
| 250 mm | 20×119 → 60×118 → ply | 0.75 | 23 dB (+3) |
| 400 mm | 20×194 → 40×193 → ply | 0.85 | 29 dB (+4) |

Isolation-first extreme: 100 kg/m³ full depth reaches TL 32/39/59 dB (200/250/400 mm) but caps
α_lo at ~0.50 — the σd/ρc ≈ 26–54 face reflects (in a room this trades absorption for isolation).

## Findings

1. **Light wool, full depth, still wins α at every total.** 20 kg/m³ topped all three sweeps;
   30 kg/m³ is within ~0.01. The added 30K preset is the practical face-layer choice
   (20 kg/m³ batts are floppy; 30 is buildable).
2. **σd/ρc 2–4 confirmed as the α optimum at 200–400 mm depth** (best stacks sit at 2.2–4.6).
   The >6 warning is a good amber line, not a cliff: penalties grow smoothly and stay confined
   to 250–500 Hz until σd/ρc ≈ 10+.
3. **Air gaps do not pay at these depths** (negative result). Every mm diverted from wool to gap
   lost low-band α (gap-at-face, gap-mid, gap-at-ply, double-gap all tested; best gap variant
   trails the all-wool stack). The classic "gap ≈ free depth" rule applies to *thin* absorbers
   (50–100 mm), not 187+ mm of wool; docs/research/2026-08-30-airgap-explained.md still holds
   for thin panels.
4. **Grading is the cheap TL lever**: face layer light (σd/ρc of the *face* ≤ ~2), back half
   40–100 kg/m³ buys +1…+5 dB low-band TL for ≤0.02 α. Dense-*first* remains the worst ordering
   (unchanged from 2026-08-30 grading-order finding).
5. **63 Hz is depth-limited, not resistance-limited**: α@63 ≈ 0.41 → 0.48 → 0.71 as total goes
   200 → 250 → 400 mm, nearly independent of density. Only thickness buys the bottom octave.

## Openground Wuppertal 40 cm wall — hypothesis

Openground (Wuppertal) report 40 cm walls, "various rockwool densities", PET acoustic fibre on
the outside. Candidate stacks at 400 mm (PET felt modelled as 9 mm porous, σ = 30 kPa·s/m²):

| hypothesis | α 63/125/250 (venue-backed) | TL 63–250 |
|---|---|---|
| H1 PET + 30/60/100 graded + ply | 0.61 / 0.75 / 0.86 | 42 dB |
| H3 PET + 30 full depth + ply | 0.66 / 0.79 / 0.86 | 31 dB |
| H4 PET + 30 → gap 50 → 100 + ply | 0.65 / 0.79 / 0.87 | 35 dB |
| H6 PET + 20/60/140 graded + ply | 0.63 / 0.79 / 0.90 | 44 dB |
| H5 control: H1 without PET | 0.59 / 0.74 / 0.86 | 42 dB |

**Best guess: a graded stack like H1/H6** — light wool at the room face stepping to dense
(≥100 kg/m³) at the back. Rationale: (a) "various densities" is exactly what a builder does when
they want absorption *and* isolation from one cavity — the sweep shows grading is the only
composition that gets both; (b) a club needs the TL: graded 40 cm gives ~42–44 dB low-band field
TL vs 31 dB all-light; (c) the PET fibre layer is consistent with a *facing*, not the absorber:
it adds ~0.02–0.05 α (H1 vs H5) and its real jobs are mechanical (fibre containment, durability,
looks) — PET felt is the standard self-supporting washable face for exactly this use. The gap
variant (H4) is possible but buys nothing the sweep values. Confidence: moderate on grading,
high on PET-as-facing; unverifiable without their build sheet.

## Provenance

Engine: `sim/soundroom/{tmm,porous,wall}.py` @ M7; sweep: `scripts/sweep_wall.py`
(213/213/354 stacks at 200/250/400 mm); Wuppertal candidates: one-off probe (same engine,
same settings), results quoted above. Negative results kept deliberately.

## Addendum (2026-09-01, later): energy budget and the reflection objective

`compute_wall` now emits `energy = {reflected, dissipated, transmitted}` (field incidence,
venue-backed; reflected = 1 − α_air.field exactly — asserted in tests), plotted as a new
"Energy budget" card. With "minimise reflection into the room" made explicit, the 40 cm
comparison sharpens:

| 40 cm stack | refl 50–300 Hz | diss | tran | refl 0.3–2 kHz | TL 63–250 |
|---|---|---|---|---|---|
| PET + 30 kg full depth (H3) | 0.23 | 0.77 | 0.01 | 0.06 | 31 dB |
| PET + 30/60/100 graded (H1) | 0.26 | 0.74 | 0.00 | 0.06 | 42 dB |
| PET + 20/60/140 graded (H6) | **0.22** | 0.78 | 0.00 | **0.04** | **44 dB** |
| 100 kg full depth | 0.52 | 0.48 | 0.00 | 0.23 | 59 dB |
| reversed 140/60/20 (control) | 0.60 | 0.40 | 0.00 | 0.30 | — |

**Correction to Finding 1's emphasis: at 40 cm depth, grading is Pareto-dominant, not a
trade-off.** H6 (20 face → 140 back) beats all-light H3 on *both* reflection (0.22 vs 0.23 low,
0.04 vs 0.06 mid) and TL (+13 dB). Mechanism: reflection is governed by the impedance the wave
meets *first* — a 20–30 kg/m³ face at 40 cm depth attenuates the wave so strongly before it
reaches the dense back layers that their impedance jump is barely visible from the room; the
dense back then reflects the *residual* energy back into the wool interior, where it is
dissipated on the second pass, and blocks transmission. The α-only single-density winner in the
main sweep tables was a 20/25 cm result and a ≤0.02 margin. The "wrong" version is only the
reversed order (dense first: refl 0.60) — face density, not back density, is what reflects.
Openground's various-density stack is therefore the *better* design, not a compromise.
