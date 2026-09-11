# The air gap, explained — two mechanisms, opposite failure modes

- **Date:** 2026-08-30 · **Author:** Claude Fable 5, from the research in `2026-08-30-porous-absorber-physics.md` §4 and `2026-08-30-patents-vendor-data.md` §B4
- **For:** Andrew — "an airgap was suggested to me; I believe it works with the rockwool but I don't understand the physics"

There are two completely different reasons people say "add an air gap", and they apply to two different questions about your wall.

## 1. Absorption (how dead the *inside* of the sound room is)

Porous material only absorbs where air is actually *moving* through it. Right at a hard surface the air can't move (particle velocity is zero — it's a pressure maximum), and the velocity only reaches its peak a quarter-wavelength out. At 100 Hz that's 86 cm; at 250 Hz, 34 cm.

So a slab of wool pressed directly against a hard backing is wasting its rearmost centimetres at low frequency. Pulling it *off* the backing by a gap g moves it into faster-moving air. Rule of thumb: the absorber stops working below roughly

    f_low ≈ c / (4 · (wool thickness + gap))

A 100 mm slab on a 100 mm gap behaves at low frequency about like 200 mm of wool — roughly one extra octave of bass absorption for no extra material. This is never harmful; a small gap is simply a small benefit. (There are shallow dips at frequencies where the gap depth is a whole number of half-wavelengths, but a thick wool layer smears them out.)

In your wall the "hard backing" the gap works against is the plywood skin. Because plywood is heavy compared to air, it acts nearly rigid above ~100 Hz, so the quarter-wave benefit applies. The simulator computes this exactly (TMM, venue-backed termination) rather than by rule of thumb.

**What the gradient does, by contrast:** the low-density wool facing the room lets sound *enter* the absorber instead of reflecting off its surface; the denser wool behind then dissipates it. That's impedance matching, and the literature confirms the order (light first, dense behind) matters a lot. It also says the total resistance of the stack, σ·d, matters more than how it's distributed: for ~100 mm builds the optimum is around 35–50 kg/m³ *average*, and very dense boards (100+ kg/m³) in a deep build make absorption *worse* by reflecting at the face.

## 2. Isolation (how much quieter the *venue* is)

This is the mechanism the person who suggested the gap was probably thinking of, and it only exists if the wall has **two** impervious skins with air between them (drywall–air–drywall, plywood–air–plywood). Two masses with an air spring between them form a resonator at

    f₀ ≈ 60 · √( (m₁ + m₂) / (m₁ · m₂ · d) )      [m in kg/m², d in m]

- Below f₀ the two skins move together: you get the isolation of one wall of their combined mass, +6 dB/octave, and the gap buys nothing.
- At f₀ the wall goes nearly transparent.
- Above f₀ isolation climbs at ~18 dB/octave — that's the whole prize.

The gap's only job is to push f₀ *below* everything you care about. Two 12 mm plywood skins (7.2 kg/m² each) with a 25 mm gap resonate at ~250 Hz — right in the music — and measured data shows a small filled gap can make isolation *worse* than no gap. With a 150 mm gap f₀ drops to ~100 Hz; 300 mm → ~70 Hz. Filling the gap with wool lowers f₀ a further ~15 % and damps the cavity resonances, but the filler must be soft (mineral wool yes, rigid foam no).

**Your wall as specified has only one impervious skin (the plywood).** So there is no mass-air-mass resonance inside it, and its isolation is just the plywood's mass law (~12–17 dB at 125 Hz for 12 mm) plus a little from the wool. The air gap contributes to absorption but not to isolation. If isolation turns out to matter, the change that moves the number is a *second* impervious layer (e.g. OSB or plasterboard on the room side, behind the wool) — and then f₀ becomes the governing design equation. The simulator will show f₀ automatically when two impervious layers are present.

## 3. The thing that will actually dominate isolation

The three open apertures. An opening has 0 dB of transmission loss, so a partition with fraction f of its area open can never do better than

    TL_max = −10 · log10(f)

1 % open → 20 dB ceiling; 10 % open → 10 dB. A 2 m × 1 m doorway in a 5 m × 2.9 m wall is 14 % of that wall — TL_max ≈ 8.5 dB regardless of what the wall is made of. The UI reports this number prominently for that reason.
