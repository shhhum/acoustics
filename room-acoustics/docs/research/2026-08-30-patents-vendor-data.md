# Research report — Wilson patents, rockwool/plywood/fabric data, room-in-room guidance, open-source tools

- **Date:** 2026-08-30
- **Author:** Claude (Opus 5 research agent), commissioned by Andrew Shum; reviewed and condensed by Claude Fable 5
- **Status:** research input; material numbers here seed `data/materials.json` (each entry carries its source)
- **Verified vs estimated:** absorption-coefficient tables, patent claims, the MAM constant (60), and the coincidence formula are verified from primary sources. The flow-resistivity table for named Rockwool products is a *calculation* (±50 %), as are the plywood f_c / surface-density tables (arithmetic from cited E/ρ). Rod Gervais content is unverified.

---

## A. Willsingh Wilson patents

LinkedIn (`/in/willsingh-wilson-8b2a3732/details/patents/`) was inaccessible (HTTP 999, anti-scraping). The portfolio was recovered via Google Patents inventor search and each patent was verified on its own page. Justia returned 403. Nothing below is inferred from LinkedIn.

### 1. WO2007073732A2 — "Multi-layered porous sound absorber" (2005)
- Priority 2005-12-23 · Applicant WILSON-ACOUSTIX GmbH · Inventors Ullrich Donner, **Willsingh Wilson**, Stephan Schade
- https://patents.google.com/patent/WO2007073732A2/en
- **Most directly on topic.** Claims a two-layer porous absorber with deliberately *different* layers:
  - Layer 1 (front/facing): open-pored porous, **max 20 mm thick**
  - Layer 2 (rear): at least **1.5× thicker** than layer 1 and/or flow resistance **≤ 5 kN·s/m⁴**
  - Preferred front layer: **10 mm at 65 kN·s/m⁴** (±15 %)
  - Scaling rule claimed: halving thickness requires **×1.7 flow resistance** to compensate
  - Rear layer preferably ≥ 2× front thickness
- Applications: ceiling hangings, wall elements, freestanding room constructions.
- **Relevance:** a patented *flow-resistance gradient* — thin, high-resistance front skin over a thick, low-resistance body. Note this is the *opposite* ordering from "least dense first" in bulk-density terms only if the front skin is thin; the physics is that the total resistance is placed where it does most work. Our TMM should be able to evaluate both.

### 2. US9369805B2 — "Acoustic absorber, acoustic transducer, and method for producing…" (2009)
- Priority 2009-02-07 (DE) · Granted 2016-06-14 · Assignee Leena Rose Wilson (reassigned 2011)
- https://patents.google.com/patent/US9369805B2/en
- A **flexurally stiff** open-pore porous layer, so one layer absorbs by *two parallel mechanisms* — viscous air flow (HF) and panel-type flexural vibration (LF).
- Claimed numbers: bending stiffness 0.5–500 N·m² (B = E·t³/[12(1−μ²)]); flow resistivity 50–5000 Pa·s/m; areal mass 30 g/m² to 20 kg/m²; thickness 0.1–100 mm (pref. 3–20 mm); flexural natural frequency below 200–300 Hz.
- Multi-layer variants use **air gaps as acoustic springs** (mass-spring resonator) to extend LF absorption.

### 3. US10102841B2 — "Acoustic absorber and use of said type of acoustic absorber" (2014)
- Priority 2014-02-11 · Granted 2018-10-16 · Assignee Leena Rose Wilson
- https://patents.google.com/patent/US10102841B2/en
- Carrier plate with recesses covered by a lacquer coating leaving 0.1–0.2 mm gaps — micro-perforation by coating. No porous layer. Least relevant.
- Search-engine summaries describing "image-bearing perforation patterns computed from wave fronts" do not match the actual claims.

### 4. WO2026058278A1 — "Soundproofing device" (2024, pending)
- Priority 2024-09-10 · Published 2026-03-19 · Applicant Leena Rose Wilson
- https://patents.google.com/patent/WO2026058278A1/en
- Modular **isolation** system: non-porous plates with first bending eigenfrequency ≥ 50 Hz, stiffeners forming closed force loops around the perimeter (bending stiffness ≥ 10 N·m), viscoelastic interlayer at every joint (Shore 30A–80A; butyl 3 mm/60A) giving **loss factor ≥ 0.10 over 20–200 Hz**, elastic decoupling between adjacent panels (static stiffness ≤ 5 N/mm at 10 Hz).
- Claimed: 20–200 Hz airborne + structure-borne attenuation at markedly lower surface mass than mass-law solutions. Relevant if isolation becomes the priority (damped, decoupled plywood panels).

---

## B1. Rockwool — flow resistivity and absorption

### Verified absorption coefficients (manufacturer datasheets, ASTM C423)

| Product | Density | Thk | 125 | 250 | 500 | 1k | 2k | 4k | NRC |
|---|---|---|---|---|---|---|---|---|---|
| SAFE'n'SOUND | 40 kg/m³ | 3" | 0.52 | 0.96 | 1.18 | 1.07 | 1.05 | 1.05 | 1.05 |
| Rockboard 40 | 64 kg/m³ | 2" | 0.26 | 0.68 | 1.12 | 1.10 | 1.03 | 1.04 | 1.00 |
| Rockboard 40 | 64 | 3" | 0.63 | 0.95 | 1.14 | 1.01 | 1.03 | 1.04 | 1.05 |
| Rockboard 60 | 96 kg/m³ | 2" | 0.32 | 0.81 | 1.06 | 1.02 | 0.99 | 1.04 | 0.95 |
| Rockboard 60 | 96 | 3" | 0.78 | 0.89 | 1.04 | 0.98 | 1.01 | 1.02 | 1.00 |
| Rockboard 80 | 128 kg/m³ | 1" | 0.11 | 0.31 | 0.82 | 1.01 | 1.02 | 1.01 | 0.80 |
| Rockboard 80 | 128 | 2" | 0.43 | 0.78 | 0.90 | 0.97 | 0.97 | 1.00 | 0.90 |
| Rockboard 80 | 128 | 3" | 0.75 | 0.82 | 0.89 | 0.94 | 1.00 | 1.00 | 0.90 |

Sources: [Rockboard 40/60/80 brochure](https://www.spi-co.com/ASSETS/DOCUMENTS/CMS/EN/rockboard-40-60-80-multi-purpose-board-insulation-brochure.pdf) · [Rockboard 80 TDS](https://www.rockwool.com/syssiteassets/o2-rockwool/commerce-assets/roofs/commercial-rockboard-80_tech-data-sheet.pdf) · [Safe'n'Sound TDS](https://images.thdstatic.com/catalog/pdfImages/b6/b67433c9-db51-4dad-ae0f-d305d53b545d.pdf)

Gotchas to build into the tool:
1. **The Rockboard number is 10× lb/ft³, not kg/m³.** Rockboard 40 = 64 kg/m³, 60 = 96, 80 = 128.
2. **Rockwool re-tests and republishes.** The [Rockboard 60 TDS issued 04-2026](https://d-cdn.rockwool.com/syssiteassets/o2-rockwool/documentation/technical-data-sheets/commercial/rockboard-60-multi-purpose-board-insulation-techdata.pdf) gives 2": 0.28 / 0.75 / 1.11 / 1.08 / 1.05 / 1.07, NRC 1.00 — different from the brochure, and lists 2"–4" only. Version-stamp any ingested dataset.

UK RW-slab range ([rw-slabs.pdf](https://www.rockwool.com/siteassets/rw-uk/downloads/datasheets/rw-slabs.pdf)) publishes αw only: RWA45 = 45 kg/m³, RW3 = 60, RW4 = 80, RW5 = 100, RW6 = 140. At 100 mm all reach αw 1.00; at 25 mm RWA45/RW3 = 0.55(H), RW5 = 0.60(MH).

### Flow resistivity

Manufacturers essentially never publish σ. ROCKWOOL publishes EN 29053 floor classes: AF15 (> 15 kPa·s/m²), > 30, > 60 (e.g. ROCKWOOL 810 at 100 kg/m³ declares > 60).

**Verified measured values** ([Jochen Schulz](https://www.jochenschulz.me/en/blog/rockwool-glasswool-hemp-best-absorber-material)):

| Product | Density (kg/m³) | σ (Pa·s/m²) |
|---|---|---|
| Rockwool Sonorock 035 | 23 | 8,000 |
| Rockwool Airrock ND | 50 | 14,400 |
| Rockwool ProRox SL 950 | 80 | 42,000 |
| Owens Corning 703 | 48 | 27,000 |
| Isover TP-1 (glass) | 13 | 5,000 |
| Hemp Premium | 35 | 3,000 |

Also: [OC703 = 16,000 rayls/m per spec, ~23,600 measured; OC705 (96 kg/m³) ≈ 30,000](https://www.johnlsayersarchive.com/viewtopic.php?t=7014). ~50 % spread between spec sheet and measurement for the *same* product.

**Estimates for named products** (derived, ±50 %). Arup Strutt mineral-fibre relation σ = 4.4·η·(1−ε)^1.59 / a² with η = 1.84×10⁻⁵ Pa·s, fibre radius a = 3 µm, fibre density 2700 kg/m³ ([source](https://strutt.arup.com/help/Fundamentals/FlowResistivity.htm)):

| Product | Density | σ estimate (Pa·s/m²) |
|---|---|---|
| Safe'n'Sound | 40 | ~11,000 |
| RWA45 | 45 | ~13,000 |
| RW3 | 60 | ~21,000 |
| Rockboard 40 | 64 | ~23,000 |
| RW4 | 80 | ~33,000 |
| Rockboard 60 / RW5 | 96–100 | ~45,000–48,000 |
| Rockboard 80 | 128 | ~71,000 |
| RW6 | 140 | ~81,000 |

Calibration: spot-on at 50 kg/m³ (15,800 vs 14,400 measured) but ~1.3–1.7× low at 23 and 80 kg/m³. Bies & Hansen's σ = 3.18×10⁻⁹·ρ^1.53/d² (d = 8 µm) is the alternative used in `materials.py`; both are exposed.

**Design targets** (Schulz, empirical): optimum σ falls as depth grows — 5 cm → ~30,000; 10 cm → ~15,000; 20 cm → ~8,000; 30 cm → ~5,000; 40 cm → ~3,500 Pa·s/m². **For a deep wall build, the low-density product is correct; Rockboard 80 in a 30 cm cavity is the wrong material.**

Delany-Bazley / Miki are valid only for 0.01 < f/σ < 1.0 — gate and warn, or use JCA.

---

## B2. Plywood

Surface density m = ρ·h:

| Thickness | ρ = 550 | 600 | 700 kg/m³ |
|---|---|---|---|
| 6 mm | 3.3 | 3.6 | 4.2 kg/m² |
| 9 mm | 4.95 | 5.4 | 6.3 |
| 12 mm | 6.6 | 7.2 | 8.4 |
| 18 mm | 9.9 | 10.8 | 12.6 |

Coincidence: f_c = (c²/2π)·√(m/B), B = Eh³/12(1−ν²) — verified against [Irvine, *Vibroacoustic Critical and Coincidence Frequencies*](http://www.vibrationdata.com/tutorials_alt/critical_frequency.pdf) eq. 5a. It's the *critical* frequency (grazing); coincidence at angle θ is f_c/sin²θ.

f_c for plywood (c = 343, ρ = 600, ν = 0.3):

| Thickness | E = 6 GPa | 8 GPa | 10 GPa |
|---|---|---|---|
| 6 mm | 3260 Hz | 2820 | 2530 |
| 9 mm | 2170 | 1880 | 1680 |
| 12 mm | 1630 | 1410 | 1260 |
| 18 mm | 1090 | 940 | 840 |

Verified E: birch plywood edgewise MOE **10.6 GPa parallel to face grain**, dropping to **2.4 GPa at 45°**, mean density 693 kg/m³ ([KTH thesis, DiVA 1711342](https://kth.diva-portal.org/smash/get/diva2:1711342/FULLTEXT01.pdf), Table 8). The 4× anisotropy means plywood has a *smeared* coincidence region. Softwood ply 8.0–10.7 GPa. ν ≈ 0.3 conventional.

Mass law: TL ≈ 20log₁₀(m·f) − 47 (normal incidence); −5 dB for field incidence. Constants of 42.5/43/47/48 all appear in the literature — we use 47 (normal) / 42 (field) and document it.

---

## B3. Fabric facing

No manufacturer publishes rayl values for FR701 or Camira Cara (Camira: 260 g/m², 100 % PP).

Verified thresholds:
- Test method ASTM C522, valid 100–10,000 mks rayls (Pa·s/m) at 0.5–50 mm/s ([ASTM](https://www.astm.org/c0522-03.html)).
- **< 1,000 mks rayls** = acoustically transparent for panel work; purpose-made acoustic fabrics typically **200–600 rayls**; dense decorative fabrics 2,000–5,000+ ([NY Soundproofing](https://newyorksoundproofing.com/blog-category/best-fabric-for-acoustic-panels)). FR701 reduces panel NRC by no more than 0.02–0.05.
- Patent-literature tuning ranges for engineered facings: 245–2450 rayls, preferred 800–1200.

On the ρc rule: ρc = 415 rayl. A facing at Rs ≈ ρc is still transparent in practice because it sits in series with a much larger absorber impedance. Defensible statement: **Rs/ρc ≲ 1 transparent, ≳ 2.5 not.** Model the facing explicitly as a resistive screen rather than a threshold. SEO pages quoting "0.8–1.5 rayls" for grille cloth are almost certainly *normalized* (Rs/ρc).

---

## B4. Room within a room — why the gap matters

Two different mechanisms share the phrase "add an air gap", with **opposite failure modes**. See `2026-08-30-airgap-explained.md` for the plain-language version.

### Transmission loss: mass-air-mass
Two leaves + air = mass-spring-mass oscillator. The constant 60 is derived, not folklore ([Dutch building-acoustics text](https://klimapedia.nl/wp-content/uploads/2019/11/AE004-Sound-insulation-of-cavity-constructions.pdf), eq. 4.10c): √(1.21×343²)/2π = 60.05.

**f₀ ≈ 60·√((m₁+m₂)/(m₁·m₂·d))**, m in kg/m², d in m.

- Below f₀: single wall of combined mass, +6 dB/oct; the gap buys nothing.
- At f₀: symmetric wall TL → 0 dB theoretically.
- Above f₀: **+18 dB/octave**, flattening to 12 dB/oct above f_T = c/2πd ≈ 55/d Hz.

Design rule: *"cavity constructions should be designed such that f_ms < 200 Hz or better < 100 Hz."*

Small gap worse than none: CSIRO data (Pirozek, [Acoustics 2019](https://acoustics.asn.au/conference_proceedings/AAS2019/papers/p16.pdf)) — a 30 mm furring cavity with insulation *dropped* R_w+C_tr from 49 to 46 dB (f₀ at 125–130 Hz). Filling the cavity shifts adiabatic→isothermal, lowering f₀ ~15 % (constant ≈ 51). Fill must be less stiff than air (mineral fibre good, rigid foam bad). Rigid ties collapse the slope to 6 dB/oct. Quadrupling either mass or cavity depth halves f₀.

Everest & Pohlmann ([full text](https://s3.amazonaws.com/arena-attachments/559608/dd2eece63c4d53a0d1175925afdf17c4.pdf)): double wall gains +12 dB with 3.5" fill, +15 dB with 9"; staggered stud +7 dB. Fig. 16-9: same materials rearranged gives STC 48 vs 63 — arrangement beats quantity.

### Absorption: quarter-wave
Everest & Pohlmann p.191: *"Absorption is greatest when the porous material is placed at a distance of a quarter wavelength (λ/4) from a hard reflective surface (or odd multiples); this is the point where particle velocity is greatest."* and *"A spaced porous absorber can be as effective as a non-spaced absorber of the same thickness."* Rule of thumb f_eff ≈ c/(4·(t+d)); the porous layer slows the wave so the real cutoff is somewhat lower; performance is non-monotonic in gap (minima at even multiples of λ/4).

Rod Gervais numbers (6" gap etc.) — forum-reported only; not verified against the book ([archive.org lending copy](https://archive.org/details/homerecordingstu0000gerv)).

---

## B5. Open-source tools

- **acoustipy** (MIT) — https://github.com/jakep72/acoustipy — Delany-Bazley, DB-Miki, JCA/JCAL/JCAPL, Horoshenkov, Biot (limp/rigid), `Add_Air_Layer`, `Add_Resistive_Screen`, Maa MPP; TMM; normal and diffuse incidence; SAA/NRC/octave output; inverse fitting. **Install from git — PyPI is pinned at 0.1.0 (Jan 2024).** Used here as a test oracle.
- **rinaldipp/tmm** (MIT) — https://github.com/rinaldipp/tmm — resonator layers (perforated panel, slot, membrane), material CSV database; empirical fluid models only, no JCA. Not on PyPI (`pip install tmm` is an optics package).
- **Toktom/PyAbsorp** (MIT) — clean model formulas, single hard-backed layer, normal incidence, no TMM/air gap; oracle only.
- **ljaouen/gTMMa** (BSD-3, C) — includes Garai-Pompoli.
- **ChrisWhealy/porous_absorber** (Apache-2.0, Rust→WASM, http://whealy.com/acoustics/) — Cox & D'Antonio formulation; UI inspiration. acousticmodelling.com is proprietary.
- **pyroomacoustics** (MIT) — ISM + ray tracing; consumes tabulated α(f); downstream consumer only.
- **acoustic-toolbox** (BSD-3) — bands/RT/standards; use instead of archived `python-acoustics`.
- Avoid GPL-3.0 (PLANES, VIBRA) and AGPL (`acoustic-mcp`); `vyhyb/acoucalc` has no LICENSE file. AlphaCell commercial; ARTA freeware/closed; REW closed with scripting API; amroc closed but its backend openCFS is MIT.

Corrections to the original list: `rinaldipp/pyabsorp`, npm `porous-absorber`, "AcousticMaterial", "PolyTMM", "AcouPy" do not exist.
