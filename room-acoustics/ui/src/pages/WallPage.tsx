import React, { useMemo, useState } from "react";
import { Button, Card, Field, NumberInput, Note, SectionLabel, Seg, Slider, Stat, fmt } from "../primitives";
import { LogLineChart, rows } from "../charts";
import { T, mono } from "../theme";
import type { MaterialPresets, SavedWall, Scene, StackLayer, WallResult } from "../types";

type Backing = "rigid" | "air";

export function WallRail({ scene, setScene, materials, walls, onSaveWall, onLoadWall, onDeleteWall }: {
  scene: Scene; setScene: (s: Scene) => void; materials: MaterialPresets | null;
  walls: SavedWall[]; onSaveWall: (name: string) => Promise<void>; onLoadWall: (w: SavedWall) => void; onDeleteWall: (name: string) => Promise<void>;
}) {
  const w = scene.wall;
  const set = (patch: Partial<typeof w>) => setScene({ ...scene, wall: { ...w, ...patch } });
  const setLayer = (i: number, patch: Record<string, unknown>) =>
    set({ layers: w.layers.map((l, j) => (j === i ? ({ ...l, ...patch } as StackLayer) : l)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= w.layers.length) return;
    const arr = [...w.layers];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set({ layers: arr });
  };
  const presets = materials?.rockwool ?? [];
  const [wallName, setWallName] = useState(w.name && w.name !== "wall" ? w.name : "");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div>
      <SectionLabel>Wall library</SectionLabel>
      <Field label="Saved walls" hint={walls.length ? `${walls.length} in data/walls/` : "none saved yet"}>
        <select value="" onChange={(e) => { const s = walls.find((x) => x.name === e.target.value); if (s) { onLoadWall(s); setWallName(s.name); } }}
          style={{ width: "100%", font: `600 11px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }}>
          <option value="">{w.name && w.name !== "wall" ? `current: ${w.name}` : "current: unnamed"} — load…</option>
          {walls.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.thickness_mm.toFixed(0)} mm · {s.layers.join("→")}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <input value={wallName} onChange={(e) => setWallName(e.target.value)} placeholder="wall name"
          style={{ flex: 1, font: `500 11px ${mono}`, padding: 5, border: `1px solid ${T.rule}`, background: T.paper }} />
        <Button small primary disabled={!wallName.trim()} onClick={() => onSaveWall(wallName.trim())}>{walls.some((s) => s.name === wallName.trim()) ? "overwrite" : "save wall"}</Button>
      </div>
      {walls.some((s) => s.name === wallName.trim()) && (
        confirmDelete === wallName.trim()
          ? <div style={{ display: "flex", gap: 6 }}><Button small onClick={async () => { await onDeleteWall(wallName.trim()); setConfirmDelete(null); setWallName(""); }}>confirm delete</Button><Button small onClick={() => setConfirmDelete(null)}>cancel</Button></div>
          : <Button small onClick={() => setConfirmDelete(wallName.trim())}>delete "{wallName.trim()}"</Button>
      )}

      <SectionLabel>Fabric (room side)</SectionLabel>
      <Slider label="Thickness" unit="mm" value={w.fabric.thickness * 1000} min={0} max={5} step={0.1}
        onChange={(v) => set({ fabric: { ...w.fabric, thickness: v / 1000 } })} fmt={(v) => v.toFixed(1)}
        hint={`Rs = σ·t = ${(w.fabric.Rs ?? w.fabric.sigma * w.fabric.thickness).toFixed(0)} rayl (${((w.fabric.Rs ?? w.fabric.sigma * w.fabric.thickness) / 413).toFixed(2)} ρc)`} />
      <Field label="Cloth type">
        <Seg small value={String(w.fabric.sigma)} options={(materials?.fabric ?? []).map((f) => ({ v: String(f.sigma), l: f.name.split(" ")[0] }))}
          onChange={(v) => set({ fabric: { ...w.fabric, sigma: parseFloat(v), Rs: null } })} />
      </Field>
      <NumberInput label="Rs override" unit="Pa·s/m" value={w.fabric.Rs ?? null} step={50} min={0}
        onChange={(v) => set({ fabric: { ...w.fabric, Rs: v } })} />

      <SectionLabel>Stack (room side first)</SectionLabel>
      {w.layers.map((l, i) => (
        <div key={i} style={{ border: `1px solid ${T.rule}`, borderRadius: 2, padding: "8px 10px", marginBottom: 10, background: T.paper }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ font: `700 10px ${mono}`, letterSpacing: ".1em" }}>{l.kind === "airgap" ? "AIR GAP" : `WOOL ${w.layers.slice(0, i + 1).filter((x) => x.kind === "rockwool").length}`}</span>
            <span style={{ flex: 1 }} />
            <Button small onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button small onClick={() => move(i, 1)} disabled={i === w.layers.length - 1}>↓</Button>
            <Button small onClick={() => set({ layers: w.layers.filter((_, j) => j !== i) })} disabled={w.layers.length <= 1}>×</Button>
          </div>
          {l.kind === "airgap" ? (
            <Slider label="Gap" unit="mm" value={l.thickness * 1000} min={0} max={400} step={5} onChange={(v) => setLayer(i, { thickness: v / 1000 })} fmt={(v) => v.toFixed(0)} />
          ) : (<>
            <Field label="Product">
              <select value={presets.find((p) => p.density === l.density)?.name ?? "custom"}
                onChange={(e) => { const p = presets.find((q) => q.name === e.target.value); if (p) setLayer(i, { name: p.name, density: p.density, sigma: null }); }}
                style={{ width: "100%", font: `600 11px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }}>
                <option value="custom">custom density</option>
                {presets.map((p) => <option key={p.name} value={p.name}>{p.name} · {p.density} kg/m³</option>)}
              </select>
            </Field>
            <Slider label="Density" unit="kg/m³" value={l.density} min={20} max={160} step={1} onChange={(v) => setLayer(i, { density: v, name: null })} />
            <Slider label="Thickness" unit="mm" value={l.thickness * 1000} min={0} max={200} step={5} onChange={(v) => setLayer(i, { thickness: v / 1000 })} fmt={(v) => v.toFixed(0)} />
            <div style={{ display: "flex", gap: 10 }}>
              <NumberInput label="σ override" unit="Pa·s/m²" value={l.sigma ?? null} step={1000} min={100} onChange={(v) => setLayer(i, { sigma: v })} />
              <Field label="Model">
                <Seg small value={l.model} options={["jca", "jcal", "miki"]} onChange={(v) => setLayer(i, { model: v })} />
              </Field>
            </div>
          </>)}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <Button onClick={() => set({ layers: [...w.layers, { kind: "rockwool", density: 60, thickness: 0.05, model: "jca", d_fibre: 8e-6 }] })}>+ rockwool</Button>
        <Button onClick={() => set({ layers: [...w.layers, { kind: "airgap", thickness: 0.05 }] })}>+ air gap</Button>
      </div>

      <SectionLabel>Plywood (venue side)</SectionLabel>
      <Slider label="Thickness" unit="mm" value={w.plywood.thickness * 1000} min={0} max={25} step={1} onChange={(v) => set({ plywood: { ...w.plywood, thickness: v / 1000 } })} fmt={(v) => v.toFixed(0)}
        hint={`m″ = ${(w.plywood.thickness * w.plywood.density).toFixed(1)} kg/m²`} />
      <Slider label="Density" unit="kg/m³" value={w.plywood.density} min={400} max={800} step={10} onChange={(v) => set({ plywood: { ...w.plywood, density: v } })} />
      <Slider label="Young's modulus" unit="GPa" value={w.plywood.E / 1e9} min={2} max={14} step={0.2} onChange={(v) => set({ plywood: { ...w.plywood, E: v * 1e9 } })} fmt={(v) => v.toFixed(1)} />
      <Field label="Plate model" hint="plate: mass + bending stiffness (coincidence dip) · limp: mass only">
        <Seg small value={w.plywood.model} options={["plate", "limp"]} onChange={(v) => set({ plywood: { ...w.plywood, model: v } })} />
      </Field>
    </div>
  );
}

export function WallPage({ scene, result, materials, onSave }: { scene: Scene; result: WallResult | null; materials: MaterialPresets | null; onSave: (note: string) => Promise<void> }) {
  const [backing, setBacking] = useState<Backing>("air");
  const [showMiki, setShowMiki] = useState(false);
  const [datasheet, setDatasheet] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ds = materials?.rockwool_datasheet_alpha.find((d) => d.name === datasheet);

  const alphaRows = useMemo(() => {
    if (!result) return [];
    const a = result[`alpha_${backing}`];
    const base = rows(result.f, { normal: a.normal, field: a.field, random: a.random, miki: showMiki ? result.alpha_rigid_miki_field : null });
    if (!ds) return base;
    // datasheet points live on their own frequencies: add rows carrying only the `ds` key, then sort by f
    const extra = ds.f.map((f, i) => ({ f, ds: ds.alpha[i] } as Record<string, number | null>));
    return [...base, ...extra].sort((p, q) => (p.f as number) - (q.f as number));
  }, [result, backing, showMiki, ds]);
  const zRows = useMemo(() => result ? rows(result.f, { re: result[`Z_${backing}`].re, im: result[`Z_${backing}`].im }) : [], [result, backing]);
  const tlRows = useMemo(() => result ? rows(result.f, { field: result.TL.field, normal: result.TL.normal, mass: result.TL.mass_law_field }) : [], [result]);

  const m = result?.markers ?? {};
  const refs = [
    m.f_critical_plywood ? { x: m.f_critical_plywood, label: "f_c ply", color: T.amber } : null,
    m.quarter_wave_f_low ? { x: m.quarter_wave_f_low, label: "λ/4", color: T.slate } : null,
  ].filter(Boolean) as { x: number; label: string; color: string }[];

  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Stat k="Stack" v={result ? fmt.mm(result.thickness) : "–"} u="mm" />
        <Stat k="σd / ρc" v={result ? fmt.n(m.total_sigma_d_over_rho_c, 1) : "–"} tone={m.total_sigma_d_over_rho_c > 6 ? T.red : m.total_sigma_d_over_rho_c < 1.5 ? T.amber : T.olive} />
        <Stat k="λ/4 roll-off" v={m.quarter_wave_f_low ? fmt.hz(m.quarter_wave_f_low) : "–"} u="Hz" />
        <Stat k="Ply coincidence" v={m.f_critical_plywood ? fmt.hz(m.f_critical_plywood) : "–"} u="Hz" />
        <Stat k="α field @125" v={result ? fmt.n(at(result.f, result.alpha_air.field, 125)) : "–"} />
        <Stat k="TL field @125" v={result ? fmt.n(at(result.f, result.TL.field, 125), 1) : "–"} u="dB" />
        <Stat k="compute" v={result?.elapsed_ms ? result.elapsed_ms.toFixed(0) : "–"} u="ms" />
      </div>
      {result?.warnings.map((w) => <Note key={w} tone={T.amber}>{w}</Note>)}

      <Card title="Section" note="room side on the left · to scale">
        {result && <Section result={result} />}
      </Card>

      <Card title="Absorption coefficient" note={backing === "air" ? "venue-backed: 1 − |R|² = absorbed + transmitted" : "rigid-backed: classic absorber chart (lab mounting)"}
        right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Seg small value={backing} options={[{ v: "air", l: "venue-backed" }, { v: "rigid", l: "rigid" }]} onChange={setBacking} />
          <Button small onClick={() => setShowMiki(!showMiki)}>{showMiki ? "hide" : "show"} Miki</Button>
          <select value={datasheet} onChange={(e) => { setDatasheet(e.target.value); if (e.target.value) setBacking("rigid"); }} style={{ font: `600 9px ${mono}`, padding: 3 }}>
            <option value="">datasheet overlay…</option>
            {materials?.rockwool_datasheet_alpha.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>}>
        <LogLineChart data={alphaRows} yDomain={[0, 1.2]} yTicks={[0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]} refLines={refs} dots={["ds"]}
          series={[
            { key: "field", name: "field incidence (Paris to 78°)", color: T.olive, width: 2.4 },
            { key: "normal", name: "normal", color: T.slate, width: 1.4 },
            { key: "random", name: "random (to 90°)", color: T.ink2, width: 1, dash: "3 3" },
            ...(showMiki ? [{ key: "miki", name: "Miki (rigid, field)", color: T.violet, width: 1.2, dash: "4 2" }] : []),
            ...(ds ? [{ key: "ds", name: `datasheet: ${ds.name} (ASTM C423${ds.issued ? `, ${ds.issued}` : ""})`, color: T.red }] : []),
          ]} />
        {ds && <Note>
          Datasheet values are lab measurements (reverberation room, rigid backing, no fabric, no plywood — hence the rigid backing is selected) and can exceed 1.0 because of edge diffraction.
          Compare against the <b>field-incidence</b> curve of a stack made only of {ds.density} kg/m³ × {fmt.mm(ds.thickness)} mm.
        </Note>}
        <BandBars result={result} backing={backing} />
      </Card>

      <Card title="Normalized surface impedance" note={`${backing === "air" ? "venue-backed" : "rigid-backed"} · normal incidence · Z / ρc`}>
        <LogLineChart data={zRows} yDomain={[-10, 10]} series={[
          { key: "re", name: "Re", color: T.slate },
          { key: "im", name: "Im", color: T.red },
        ]} />
      </Card>

      <Card title="Transmission loss" note="unbacked stack, air both sides · single impervious leaf → no mass-air-mass resonance">
        <LogLineChart data={tlRows} yLabel="dB" refLines={refs.filter((r) => r.label === "f_c ply")} series={[
          { key: "field", name: "field incidence", color: T.olive, width: 2.4 },
          { key: "normal", name: "normal", color: T.slate, width: 1.2 },
          { key: "mass", name: "mass law (ply, field)", color: T.ink2, width: 1, dash: "3 3" },
        ]} />
      </Card>

      <Card title="Layer parameters">
        <LayerTable result={result} />
      </Card>

      <Card title="Save run" note="writes inputs + results + provenance to data/runs/">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (what are you testing?)"
            style={{ flex: 1, font: `500 12px ${mono}`, padding: 6, border: `1px solid ${T.rule}`, background: T.paper }} />
          <Button primary disabled={saving || !result} onClick={async () => { setSaving(true); try { await onSave(note); setNote(""); } finally { setSaving(false); } }}>
            {saving ? "saving…" : "save wall run"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function at(f: number[], y: number[], x: number) {
  let best = 0;
  for (let i = 1; i < f.length; i++) if (Math.abs(f[i] - x) < Math.abs(f[best] - x)) best = i;
  return y[best];
}

/** Fit a label into `px` pixels of 9 px monospace (≈5.6 px per char); ellipsise otherwise. */
function fitLabel(text: string, px: number): string {
  const maxChars = Math.floor(px / 5.3);
  if (text.length <= maxChars) return text;
  if (maxChars < 2) return "";
  return text.slice(0, Math.max(1, maxChars - 1)) + "…";
}

function Section({ result }: { result: WallResult }) {
  const W = 620, H = 120;
  const total = result.thickness || 1;
  const scale = (W - 20) / total;
  let x = 10;
  const colour = (r: Record<string, any>) =>
    r.layer === "fabric" ? T.ink : r.layer === "air gap" ? T.panel : r.layer === "plywood" ? T.amber
    : `hsl(80 20% ${Math.max(35, 80 - (r.density ?? 40) / 3)}%)`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <text x="10" y="12" style={{ font: `600 9px ${mono}`, fill: T.ink2, letterSpacing: ".1em" }}>ROOM</text>
      <text x={W - 10} y="12" textAnchor="end" style={{ font: `600 9px ${mono}`, fill: T.ink2, letterSpacing: ".1em" }}>VENUE</text>
      {result.layers.map((r, i) => {
        const w = Math.max(1.5, (r.thickness ?? 0) * scale);
        const full = `${r.layer.replace("rockwool", "wool")} ${fmt.mm(r.thickness)}mm${r.sigma ? ` · ${(r.sigma / 1000).toFixed(0)}k` : ""}`;
        const label = fitLabel(full, w - 2);
        const el = (
          <g key={i}>
            <rect x={x} y={20} width={w} height={70} fill={colour(r)} stroke={T.ink} strokeWidth={0.6}>
              <title>{full}</title>
            </rect>
            {label && <text x={x + w / 2} y={104} textAnchor="middle" style={{ font: `500 9px ${mono}`, fill: T.ink2 }}>{label}</text>}
          </g>
        );
        x += w;
        return el;
      })}
    </svg>
  );
}

function BandBars({ result, backing }: { result: WallResult | null; backing: Backing }) {
  if (!result) return null;
  const b = result[`alpha_${backing}`].third_octave;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70, marginTop: 10, borderBottom: `1px solid ${T.rule}` }}>
      {b.f.map((f, i) => {
        const v = b.field[i];
        return (
          <div key={f} title={`${f} Hz: ${v?.toFixed(2) ?? "–"}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ width: "100%", height: `${(v ?? 0) * 55}px`, background: v != null && v > 0.8 ? T.olive : T.slate, opacity: 0.85 }} />
            <span style={{ font: `500 7px ${mono}`, color: T.ink2, marginTop: 2 }}>{f >= 1000 ? `${f / 1000}k` : f}</span>
          </div>
        );
      })}
    </div>
  );
}

function LayerTable({ result }: { result: WallResult | null }) {
  if (!result) return null;
  const cols: [string, (r: any) => string][] = [
    ["layer", (r) => r.layer],
    ["mm", (r) => (r.thickness != null ? fmt.mm(r.thickness) : "")],
    ["ρ kg/m³", (r) => (r.density ?? "").toString()],
    ["σ Pa·s/m²", (r) => (r.sigma ? r.sigma.toFixed(0) : r.Rs ? `Rs ${r.Rs.toFixed(0)} Pa·s/m` : "")],
    ["φ", (r) => (r.phi ? r.phi.toFixed(3) : "")],
    ["α∞", (r) => (r.alpha_inf ? r.alpha_inf.toFixed(2) : "")],
    ["Λ µm", (r) => (r.Lambda ? (r.Lambda * 1e6).toFixed(0) : "")],
    ["Λ′ µm", (r) => (r.Lambda_p ? (r.Lambda_p * 1e6).toFixed(0) : "")],
    ["σd/ρc", (r) => (r.sigma_d_over_rho_c ? r.sigma_d_over_rho_c.toFixed(2) : "")],
    ["m″ kg/m²", (r) => (r.surface_mass ? r.surface_mass.toFixed(1) : "")],
    ["f_c Hz", (r) => (r.f_critical ? r.f_critical.toFixed(0) : "")],
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", font: `500 11px ${mono}` }}>
      <thead><tr>{cols.map(([h]) => <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${T.ink}`, font: `600 9px ${mono}`, letterSpacing: ".1em", color: T.ink2 }}>{h}</th>)}</tr></thead>
      <tbody>{result.layers.map((r, i) => <tr key={i}>{cols.map(([h, fn]) => <td key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${T.rule}` }}>{fn(r)}</td>)}</tr>)}</tbody>
    </table>
  );
}
