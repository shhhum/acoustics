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

### Sub-band (20–50 Hz) behaviour of the dense cap (2026-09-01, later; user observation confirmed)

Andrew observed in the UI that 140 kg/m³ caps reflect 20–30 Hz noticeably more than 100 kg/m³.
Confirmed (30×200 + cap×25 + g15 + ply9, reflected fraction):

| cap | 20–30 Hz | 30–50 | 50–150 | 150–300 | tran 20–30 |
|---|---|---|---|---|---|
| 100×25 | 0.525 | 0.525 | 0.326 | 0.093 | 0.086 |
| 140×25 | 0.570 | 0.540 | 0.315 | 0.093 | 0.058 |
| 160×25 | 0.590 | 0.548 | 0.311 | 0.093 | 0.048 |
| no cap (30×225) | 0.447 | 0.517 | 0.357 | 0.094 | 0.162 |

Mechanism: the light-wool screen that silences the cap interface at 63+ Hz (14+ dB round trip)
thins to **8–9 dB at 20–30 Hz**, so the cap's impedance step becomes partially visible from the
room, and heavier caps reflect more. The cap trade is therefore real but band-split: 160 wins
50–300 Hz by ~0.015, 100 wins 20–50 Hz by ~0.05. A thicker lighter cap (100×50) is *not* the
fix — it displaces screen depth and lands worse than 100×25 at subs (0.585).

Perspective before optimising this: (a) every variant reflects 0.45–0.59 at 20–30 Hz — the
depth limit; no 250 mm wall absorbs subs meaningfully. (b) 20–30 Hz is at/below the room's
first axial mode: in-room sub response is mode/pressure-zone dominated, where plane-wave α is a
weak lever. (c) the "escape valve" reading of the lighter cap's higher transmission is partly
illusory — transmitted subs enter the hard venue shell and return through the openings
(2026-08-30: venue avg only 3–6 dB below room). Verdict: **cap density 100–160 is a taste knob,
not a correctness knob; 100–128 is the balanced listening choice** (gives back ~0.01 punch-band
reflection for ~0.05 at subs); sub control must come from geometry/placement/DSP, not wool.
160K preset added to materials.json regardless so the UI can express the sweep optimum.

### Near-brick wall section: 25 cm cavity to the venue's 10 cm brick wall (2026-09-01, later)

Part of the room wall stands 25 cm from the venue's cement-paved brick wall. Modelled as the
winner stack terminated by a 250 mm air cavity + rigid back (brick-as-190 kg/m² limp mass checks
the rigid approximation within a few %). Reflected fraction into the room:

| config | 20–30 | 30–50 | 50–150 | 150–300 |
|---|---|---|---|---|
| A rest of wall (venue-backed) | 0.59 | 0.55 | 0.31 | 0.09 |
| B as-built + cavity + brick | 0.65 | **0.49** | **0.28** | 0.09 |
| C no ply, open cavity | 0.65 | 0.49 | 0.26 | 0.10 |
| D no ply, cavity stuffed +30K×150 | **0.57** | **0.46** | **0.26** | 0.10 |

Findings: (1) the feared cavity resonances are a non-event — the 686/1372 Hz half-wave modes are
fully damped by the wool, and the ply-on-air-spring mass-air-mass resonance (predicted 51 Hz)
appears as an *absorption peak*, not a reflection spike (B beats A 0.42 vs 0.50 at 50 Hz);
(2) the as-built section is *better* than the free wall from 30–150 Hz (brick returns energy for
a second pass through the wool) and slightly worse only at 20–30 Hz (below the mass-air-mass
resonance the air cushion stiffens); (3) best use of the gap: **drop the ply on that section
(the brick already provides the isolation) and stuff ~150 mm of 30K against the brick** —
best or tied-best in every band, including the subs. Caveats: plane-wave TMM; lateral modes of
the sealed wall-to-wall channel and flanking are not modelled; D needs physical access to the
cavity during the build.

### Literature corroboration of the sharp-step-vs-gradient finding (2026-09-01, web search)

1. **US8631899B2 (Zickmantel / SilenceResearch GmbH) — direct corroboration.** Claims multi-layer
   porous absorbers built from deliberately LARGE impedance steps between adjacent layers —
   density steps ≥ 20 kg/m³, flow-resistance steps ≥ 5 kPa·s/m² — stating "the larger an
   impedance shift, the lower the frequencies which are absorbed as a result of said impedance
   shift", explicitly inverting the smooth-transition intuition, for 200–700 Hz absorption in
   thin (10 cm) build-ups. Our 30|160 step (Δρ = 130 kg/m³, Δσ ≈ 108 kPa·s/m²) is exactly this
   architecture.
2. **Boulvert et al., J. Appl. Phys. 2019 ("Optimally graded porous material for broadband
   perfect absorption") — corroborates the regime split.** Their optimal *continuous* grading is
   a monotonic resistivity increase — but on a 30 mm layer absorbing 3.9–19.5 kHz, i.e. a layer
   comparable to or thicker than λ/3: the regime where a taper IS resolvable. They state the
   gradient improves mid/high frequency but NOT low frequency — matching our finding that the
   gradient is cosmetic below the sub-wavelength limit. Gradients are a wavelength-scale tool;
   bass walls are not wavelength-scale.
3. **Anechoic-wedge literature** (e.g. Acoust. wedge design studies; empirical chamber cutoff
   work): the standard rule is treatment depth ≈ λ/4 at the cutoff for the taper to work —
   corroborating the adiabatic-length argument for why no 240 mm transition can "match" at
   50–300 Hz.
4. **Cox & D'Antonio, *Acoustic Absorbers and Diffusers*** (textbook): too-high flow resistance
   at the FRONT causes face reflection; the front layer's resistivity is the reflection-critical
   parameter — the mechanism behind every ordering result in this campaign.
5. Adjacent but distinct: Wilson WO2007073732A2 (thin high-resistance screen over low-resistance
   bulk) is another non-gradient two-element design; a 2026 automotive study (WEVJ 17(2):75) finds
   stacking sequence governs mid-high-frequency absorption (full text paywalled, not verified).

Verdict: the sharp light|dense step is patented practice (Zickmantel), and the graded-absorber
literature itself restricts smooth grading's benefit to wavelength-scale layers and mid/high
frequencies — consistent with, not contradicting, our sweep.

### Supplier substitution check: 32 kg/m³ glass fiber for the 30 kg/m³ stone front (2026-09-03)

Supplier has no 30 kg/m³ stone wool; offers 32 kg/m³ glass. Density does not transfer between
materials — glass fibres are finer (~5 µm vs 8 µm), so equal density means ~3× the flow
resistivity: σ(32 kg glass) ≈ 15–26 kPa·s/m² (fibre-diameter uncertainty) vs 9 for 30-stone.
Engine check, 250 mm winner architecture (front×200 | cap 160×25 | g15 | ply9), refl 50–300 Hz:

| front | refl 50–150 | 150–300 |
|---|---|---|
| stone 30 (baseline) | 0.31 | 0.09 |
| glass 32, σ=15k (optimistic) | 0.34 | 0.16 |
| stone 40 Safe'n'Sound (available) | 0.34 | 0.15 |
| glass 32, σ=26k (Bies–Hansen @5 µm) | 0.42 | 0.26 |
| glass 32 as thin screen + deep gap (best of 4 tried) | 0.44–0.47 mid | — |

Verdicts: (1) 32 kg glass as the full front is between "ties stone-40" and "clearly worse",
depending on its true σ — the deciding number is the datasheet airflow resistivity (EN 29053);
accept if ≤ ~10 kPa·s/m², reject if ≥ ~15. (2) Screen architectures (thin glass + deep gap)
all lose. (3) Light glass batts (12–16 kg/m³, common thermal insulation) ARE acoustically
equivalent to 30-stone (σ ≈ 6–9 kPa·s/m²) — the better ask is lighter glass, not denser.
(4) Fallback that needs no new sourcing: Safe'n'Sound 40 stone full front costs only +0.03
refl vs baseline. Glass caveats vs stone: similar acoustics at equal σ; worse fire rating
class and sag; fine inside a closed wall.

### 40K/160K-only thickness sweep (2026-09-03, supplier constraint)

Only 40 and 160 kg/m³ stone available. Same protocol (25 mm steps, ply 9, fabric 1,
reflection-first, gap position swept). Ranked by refl 50–300 Hz:

| total | winner | refl 50–300 | refl 20–50 | TL 63–250 | all-40 control |
|---|---|---|---|---|---|
| 200 | 40×150 → g15 → 160×25 | 0.302 | 0.61 | 22 dB | 0.331 / 19 dB |
| 250 | **40×175 → g15 → 160×50** | 0.265 | 0.63 | 27 dB | 0.287 / 22 dB |
| 400 | 40×275 → 160×100 → g15 | 0.244 | 0.54 | 43 dB | 0.249 / 32 dB |

Findings: (1) the light-front + dense-cap architecture survives the constraint; with a 40 face
the optimal cap grows (25→50 mm at 250 mm) because the relative σ step is smaller. (2) The
forced gap prefers the mid position (in front of the cap) as before, worth ~0.005. (3) At
250 mm, 40×200+160×25 ties the winner (0.266) with 2 dB less TL — one fewer dense panel if
price matters. (4) 40-vs-30 face costs ~0.036 refl at 250 mm — the price of the sourcing
constraint, consistent with the earlier density scan. (5) At 400 mm with the over-resistive
40 face, huge-gap variants (40×100 + g215!) tie the full-wool stacks on 50–300 (0.241 vs
0.244) — the first time gap-for-wool ever breaks even in this campaign, exactly as σd/ρc
theory predicts for an over-resistive fill — but they give up 10+ dB TL and 0.08 at 20–50 Hz,
so full wool still wins overall. (6) Sub-band trade unchanged: bigger caps cost 20–50 Hz
(0.60→0.67 as cap 25→75 at 250 mm); shrink the cap to 25 mm if sub reflection is the priority.

**Buildable picks (panels are 25 mm):** 200 mm: 6×40K + 1×160K · 250 mm: 7×40K + 2×160K
(or 8+1, −2 dB TL) · 400 mm: 11×40K + 4×160K. Gap in front of the cap in all cases.

### Final 235 mm candidates head-to-head, gap removed (2026-09-03)

Decision: drop the forced 15 mm gap and take the wall to 235 mm (fabric 1 + 225 wool + ply 9).
Cost of the thinning vs the 250 mm gapped winner: refl 50–300 goes 0.265 → 0.269 (negligible)
for 15 mm of room regained. Two builds, both 9 panels:

| | A: 40×200 + 160×25 (8+1) | B: 40×175 + 160×50 (7+2) |
|---|---|---|
| refl 20–30 / 30–50 Hz | **0.63 / 0.58** | 0.68 / 0.61 |
| refl 50–300 Hz | 0.269 | 0.269 |
| refl 0.3–4 kHz | identical | identical |
| α field 63/125/250 | 0.55 / 0.77 / 0.86 | 0.54 / 0.77 / 0.86 |
| TL 63 / 250 / 1k | 16.5 / 34.8 / 67.8 dB | **19.0 / 37.9 / 77.0 dB** |
| σd/ρc | 13.9 | 20.1 |

From 50 Hz up the two are indistinguishable (Δ ≤ 0.002 everywhere) — the extra 25 mm of 160
sits entirely behind the screen. They differ only where the screen thins: at 20–50 Hz the
smaller cap reflects less (−0.05 at 20–30), and in TL, where B is +2–3 dB low and up to +15 dB
high. Pure taste knob: **A for the listening room (subs), B for isolation.** Under the standing
reflection-first objective the pick is **A: 8 × 40K + 1 × 160K, dense panel at the ply.**
