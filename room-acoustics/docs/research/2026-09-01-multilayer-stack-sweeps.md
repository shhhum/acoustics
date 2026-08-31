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

### Depth-dependence of the grading dominance (250/200 mm re-check)

The 40 cm Pareto-dominance does **not** carry down unchanged — the original 250 mm sweep never
tried backs >100 kg/m³, so re-probed with the energy split (fabric 1 + wool + ply 12):

| 250 mm stack | refl 50–300 Hz | tran lo | TL 63–250 |
|---|---|---|---|
| 20 × 237 (α winner) | 0.236 | 0.037 | 20 dB |
| 20×119 → 140×118 (50/50) | 0.295 | 0.004 | 32 dB |
| **20×158 → 140×79 (⅔ light)** | **0.244** | 0.008 | **27 dB** |
| 20×79 → 60×79 → 140×79 | 0.277 | 0.005 | 30 dB |

At 250 mm a 50/50 heavy grade now costs real reflection (+0.06 low-band) — the light front is no
longer deep enough to hide a 118 mm dense back. But a *thin* dense back (~80 mm of 140 kg/m³
behind ~160 mm of light) is nearly free: +0.008 reflected for +7 dB TL. At 200 mm even that
costs ~0.03–0.05. Rule of thumb: the dense back is invisible from the room once ~150–200 mm of
light wool sits in front of it — grade as heavy as you like behind that screen; with less front
depth, thin the dense layer or accept the reflection cost. (Consistent with Wilson
WO2007073732A2's front/rear resistance split.)

### Reflection-first re-rank at 250 mm: 9 mm ply, mid-stack gap tested (2026-09-01, later)

Project decisions folded in: ply fixed at **9 mm** (now the schema/preset default), and the
objective made explicit — *minimise reflection; transmission secondary* (the room sits inside a
larger venue). 122 stacks: light front 20/30 × dense back 60/100/140 × back 40–100 mm × gap
0–60 mm between the two wool layers.

| 250 mm stack (room→venue) | refl 50–300 Hz | refl 0.3–2 kHz | TL 63–250 |
|---|---|---|---|
| **20×200 → 140×40 → ply9 (winner)** | **0.204** | 0.043 | 21 dB |
| 20×185 → gap 15 → 140×40 | 0.214 | 0.043 | 21 dB |
| 20×175 → gap 25 → 140×40 | 0.221 | 0.043 | 21 dB |
| 20×240 all-light (control) | 0.227 | 0.044 | 18 dB |
| 20×140 → gap 60 → 140×40 | 0.250 | 0.044 | 20 dB |
| prev. rec (12 mm ply): 20×158 → 140×79 | 0.241 | 0.041 | 27 dB |

1. **A thin dense back now beats all-light on reflection itself** (0.204 vs 0.227): behind
   200 mm of light wool the 140 kg/m³ × 40 mm layer is invisible from the room but reflects
   residual energy back through the wool for a second dissipation pass — it acts as an
   *absorption booster*, not a barrier. Reflection-first scoring therefore *shrinks* the dense
   back (79 → 40 mm) rather than deleting it.
2. **Mid-stack air gap: monotonically negative** (negative result). Every mm of gap between the
   wool layers costs low-band reflection (0.204 → 0.214 → 0.221 → 0.233 → 0.250 at
   0/15/25/40/60 mm); the gap displaces wool from the front screen and the λ/4 gain never
   compensates at this depth. Third gap-placement negative result in this campaign; mechanism
   consistent throughout: at ≥200 mm wool depth, wool always beats air.

**Standing 25 cm recommendation (reflection-first): fabric → 20–30 kg/m³ × 200 → 140 kg/m³ × 40
→ 9 mm ply.** If a few dB more isolation is ever wanted, thicken the dense back toward 80 mm and
pay ~0.04 reflection.

### Buildable-materials sweep (2026-09-01, later): densities {30,40,60,80,100,160}, 25 mm increments

Same objective (reflection-first, ply 9 mm, fabric 1 mm). Wool quantised to 25 mm; since the
240/190/390 mm cavities are not multiples of 25, every build carries a forced ≥15 mm leftover
gap — its position was swept too (behind the wool vs between the last two wool layers).
1244 / 322 / 9566 stacks at 250 / 200 / 400 mm.

| total | winner (room→venue) | refl 50–300 | TL 63–250 | all-30 control |
|---|---|---|---|---|
| 200 mm | 30×150 → 160×25 → gap15 → ply9 | 0.284 | 20 dB | 0.317 / 17 dB |
| 250 mm | 30×200 → 160×25 → gap15 → ply9 | 0.229 | 23 dB | 0.258 / 20 dB |
| 400 mm | 30×300 → 160×75 → gap15 → ply9 | 0.179 | 36 dB | 0.189 / 28 dB |

Findings:
1. **The same architecture wins at every total: max light wool + one thin dense cap.** With 20 kg/m³
   unavailable the face is 30; the absorption-booster back collapses to a single 25 mm panel of
   the *densest* available product (160) at 200/250 mm, growing to 75 mm at 400 mm. Quantisation
   costs ~0.025 refl_lo vs the unconstrained optimum (0.229 vs 0.204 at 250 mm), all of it from
   30-vs-20 face density.
2. **The forced leftover gap is least harmful between the light wool and the dense cap** (mid
   beats at-ply by 0.003–0.008 at 200/250 mm; a wash at 400 mm). Intuition: in front of the
   dense cap the gap sits where particle velocity is still high, adding a little λ/4 depth;
   behind the cap it is shielded and inert. Still a cost vs hypothetical non-quantised wool —
   the gap remains filler, never a feature.
3. Sensitivity is tiny around the winner (top ~10 stacks within 0.005): substituting a 40 or 60
   panel for part of the light run, or 100 for the 160 cap, loses almost nothing — build from
   whatever is cheapest per panel in that band.
4. Dense-cap thickness rule refined: ~10 % of cavity depth at 200–250 mm (one panel), ~20 % at
   400 mm — consistent with the "dense back invisible behind 150–200 mm light screen" rule.

**Buildable recommendations (reflection-first):**
- 20 cm: fabric → 30×150 (6 panels) → 160×25 (1 panel) → 15 gap → ply 9. 
- 25 cm: fabric → 30×200 (8 panels) → 160×25 (1 panel) → 15 gap → ply 9.
- 40 cm: fabric → 30×300 (12 panels) → 160×75 (3 panels) → 15 gap → ply 9.

### Why the sharp 30|160 step beats a smooth gradient (2026-09-01, later)

Head-to-head at 250 mm/ply 9 (reflected fraction): sharp 30×200|160×25 = **0.310** (50–150 Hz),
3-step 30/60/160 = 0.320, 5-step taper 30/40/60/100/160 = 0.332, all identical within 0.002
above 300 Hz. The smooth gradient is monotonically *worse* at bass, not just equal.

The impedance-matching (adiabatic taper) argument fails here for two quantitative reasons:

1. **The taper cannot be adiabatic where it matters.** Adiabatic matching needs a transition
   region ≳ λ/4. λ/4 = 1.36 m at 63 Hz, 0.34 m at 250 Hz — the entire 240 mm cavity is
   sub-wavelength across the design band, so the wave "sees" a lumped structure, not a ramp.
   The taper only becomes resolvable above ~400 Hz — exactly where all variants already tie.
2. **The buried step is screened into silence.** The 30|160 interface reflects strongly *locally*
   (|R| ≈ 0.56), but through 200 mm of 30 kg/m³ the round trip costs 14 dB at 63 Hz rising to
   42 dB at 2 kHz: the emerging reflection is 0.11 at 63 Hz, 0.03 at 250 Hz, 0.003 at 2 kHz.
   An anechoic wedge needs its taper because its transition starts at the *front*, in
   unattenuated air; a step buried behind an absorptive screen needs none.

What the gradient actually costs: the mid-density middle panels (40–100 kg/m³) displace light
wool from the front screen, raising the average flow resistivity of the section of the wall the
bass actually interacts with — the same mechanism as every other loss in this campaign. The
"smooth gradient" story is an appealing narrative for Wuppertal's wall, but the working
ingredients are (a) a low-σ face, (b) maximum light depth, (c) one screened dense cap; grading
smoothly between them is cosmetic above 300 Hz and mildly counterproductive below.
