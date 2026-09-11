import React from "react";
import { Card, Field, Note, NumberInput, SectionLabel, Slider, Stat } from "../primitives";
import { T, mono } from "../theme";
import type { SavedWall, Scene } from "../types";
import { woolLayers } from "../types";

/** Bill of materials for the sound-room walls: rockwool panels per layer, fabric area, plywood sheets. Pure arithmetic, saved with the scene. */
export function costModel(scene: Scene) {
  const r = scene.room, v = scene.venue, w = scene.wall, c = scene.cost;
  const H = v.height;
  const openArea = Object.entries(r.openings).filter(([f]) => f !== r.source_face).reduce((a, [, o]) => a + o.width * o.height, 0);
  const grossWall = 2 * (r.length + r.width) * H;
  const netWall = grossWall - openArea;
  const panelArea = c.panel_w * c.panel_h;
  const waste = 1 + c.waste_fraction;
  const layers = woolLayers(w).filter((l) => l.thickness > 0).map((l, i) => {
    const pt = c.rockwool_panel_thickness?.[i] || l.thickness; // m; 0/missing → layer bought as one panel through its depth
    const through = Math.max(1, Math.ceil(l.thickness / pt - 1e-9));
    const panels = Math.ceil((netWall * waste) / panelArea) * through;
    const price = c.rockwool_price_per_panel[i] ?? c.rockwool_price_per_panel_default;
    return { i, name: l.name ?? `${l.density} kg/m³`, density: l.density, thickness_mm: l.thickness * 1000,
             panel_mm: pt * 1000, through, panels, price, cost: panels * price };
  });
  const fabricArea = w.fabric.thickness > 0 ? netWall * waste : 0;
  const fabricCost = fabricArea * c.fabric_price_per_m2;
  const sheetArea = c.ply_sheet_w * c.ply_sheet_h;
  const plySheets = w.plywood.thickness > 0 ? Math.ceil((netWall * waste) / sheetArea) : 0;
  const plyCost = plySheets * c.ply_price_per_sheet;
  const rockwoolCost = layers.reduce((a, l) => a + l.cost, 0);
  const subtotal = rockwoolCost + fabricCost + plyCost;
  const labour = subtotal * c.labour_fraction;
  return { grossWall, openArea, netWall, panelArea, layers, fabricArea, fabricCost, plySheets, plyCost, rockwoolCost, subtotal, labour, total: subtotal + labour + c.fixed_costs };
}

export function CostRail({ scene, setScene, walls, onLoadWall }: {
  scene: Scene; setScene: (s: Scene) => void; walls: SavedWall[]; onLoadWall: (w: SavedWall) => void;
}) {
  const c = scene.cost;
  const set = (patch: Partial<typeof c>) => setScene({ ...scene, cost: { ...c, ...patch } });
  const layers = woolLayers(scene.wall).filter((l) => l.thickness > 0);
  return (
    <div>
      <SectionLabel>Wall</SectionLabel>
      <Field label="Load saved wall" hint="costs below are per wool layer of the loaded wall">
        <select value="" onChange={(e) => { const s = walls.find((x) => x.name === e.target.value); if (s) onLoadWall(s); }}
          style={{ width: "100%", font: `600 11px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }}>
          <option value="">{scene.wall.name && scene.wall.name !== "wall" ? `current: ${scene.wall.name}` : "current: unnamed"} — load…</option>
          {walls.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.thickness_mm.toFixed(0)} mm · {s.layers.join("→")}</option>)}
        </select>
      </Field>
      <SectionLabel>Panels</SectionLabel>
      <div style={{ display: "flex", gap: 10 }}>
        <NumberInput label="Panel width" unit="m" value={c.panel_w} step={0.1} min={0.1} onChange={(v) => v && set({ panel_w: v })} />
        <NumberInput label="Panel height" unit="m" value={c.panel_h} step={0.1} min={0.1} onChange={(v) => v && set({ panel_h: v })} />
      </div>
      <Slider label="Waste / offcuts" unit="%" value={c.waste_fraction * 100} min={0} max={30} step={1} onChange={(v) => set({ waste_fraction: v / 100 })} />
      <SectionLabel>Prices ({c.currency})</SectionLabel>
      <Field label="Currency"><input value={c.currency} onChange={(e) => set({ currency: e.target.value })} style={{ width: 70, font: `600 12px ${mono}`, padding: "4px 6px", border: `1px solid ${T.rule}`, background: T.paper }} /></Field>
      {layers.map((l, i) => (
        <div key={i} style={{ border: `1px solid ${T.rule}`, borderRadius: 2, padding: "6px 8px", marginBottom: 8 }}>
          <div style={{ font: `600 10px ${mono}`, letterSpacing: ".08em", marginBottom: 4 }}>
            LAYER {i + 1} · {l.name ?? `${l.density} kg/m³`} · {(l.thickness * 1000).toFixed(0)} mm</div>
          <div style={{ display: "flex", gap: 10 }}>
            <NumberInput label="Panel thickness" unit="mm" value={(c.rockwool_panel_thickness?.[i] ?? 0) > 0 ? c.rockwool_panel_thickness[i] * 1000 : null} step={5} min={5}
              onChange={(v) => { const a = [...(c.rockwool_panel_thickness ?? [])]; a[i] = v ? v / 1000 : 0; set({ rockwool_panel_thickness: a.map((x) => x ?? 0) }); }}
              hint={(c.rockwool_panel_thickness?.[i] ?? 0) > 0 ? `${Math.max(1, Math.ceil(l.thickness / c.rockwool_panel_thickness[i] - 1e-9))}× through the layer` : "blank = one panel through"} />
            <NumberInput label="Price" unit="per panel" value={c.rockwool_price_per_panel[i] ?? null} step={1} min={0}
              onChange={(v) => { const a = [...c.rockwool_price_per_panel]; a[i] = v as number; set({ rockwool_price_per_panel: a.map((x) => (x == null ? c.rockwool_price_per_panel_default : x)) }); }}
              hint={c.rockwool_price_per_panel[i] == null ? `default ${c.rockwool_price_per_panel_default}` : undefined} />
          </div>
        </div>
      ))}
      <NumberInput label="Default rockwool price" unit="per panel" value={c.rockwool_price_per_panel_default} step={1} min={0} onChange={(v) => v != null && set({ rockwool_price_per_panel_default: v })} />
      <NumberInput label="Fabric" unit="per m²" value={c.fabric_price_per_m2} step={1} min={0} onChange={(v) => v != null && set({ fabric_price_per_m2: v })} />
      <div style={{ display: "flex", gap: 10 }}>
        <NumberInput label="Ply sheet W" unit="m" value={c.ply_sheet_w} step={0.1} min={0.1} onChange={(v) => v && set({ ply_sheet_w: v })} />
        <NumberInput label="Ply sheet H" unit="m" value={c.ply_sheet_h} step={0.1} min={0.1} onChange={(v) => v && set({ ply_sheet_h: v })} />
      </div>
      <NumberInput label="Plywood" unit="per sheet" value={c.ply_price_per_sheet} step={1} min={0} onChange={(v) => v != null && set({ ply_price_per_sheet: v })} />
      <Slider label="Labour" unit="% of materials" value={c.labour_fraction * 100} min={0} max={200} step={5} onChange={(v) => set({ labour_fraction: v / 100 })} />
      <NumberInput label="Fixed costs" unit={c.currency} value={c.fixed_costs} step={10} min={0} onChange={(v) => v != null && set({ fixed_costs: v })} hint="framing, fixings, delivery…" />
      <Note>Prices are inputs — enter your supplier's quotes. Everything here is saved with the scene and with every run.</Note>
    </div>
  );
}

export function CostPage({ scene }: { scene: Scene }) {
  const m = costModel(scene);
  const cur = scene.cost.currency;
  const money = (x: number) => `${cur} ${x.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Stat k="Net wall area" v={m.netWall.toFixed(1)} u="m²" />
        <Stat k="Rockwool panels" v={m.layers.reduce((a, l) => a + l.panels, 0)} u={`× ${scene.cost.panel_w}×${scene.cost.panel_h} m`} />
        <Stat k="Plywood sheets" v={m.plySheets} />
        <Stat k="Materials" v={money(m.subtotal)} />
        <Stat k="Total" v={money(m.total)} tone={T.olive} />
      </div>
      <Card title="Bill of materials" note={`walls only (ceiling is the venue's) · ${m.grossWall.toFixed(1)} m² gross − ${m.openArea.toFixed(1)} m² openings · ${(scene.cost.waste_fraction * 100).toFixed(0)} % waste`}>
        <table style={{ width: "100%", borderCollapse: "collapse", font: `500 11px ${mono}` }}>
          <thead><tr>{["item", "spec", "quantity", "unit price", "cost"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {m.layers.map((l) => (
              <tr key={l.i}><td style={td}>rockwool layer {l.i + 1}</td><td style={td}>{l.name} · {l.density} kg/m³ · {l.thickness_mm.toFixed(0)} mm</td>
                <td style={td}>{l.panels} × {l.panel_mm.toFixed(0)} mm panels{l.through > 1 ? ` (${l.through} through)` : ""} ({(l.panels * m.panelArea).toFixed(1)} m²)</td><td style={td}>{money(l.price)}</td><td style={td}>{money(l.cost)}</td></tr>
            ))}
            {m.fabricArea > 0 && <tr><td style={td}>fabric</td><td style={td}>{(scene.wall.fabric.thickness * 1000).toFixed(1)} mm cloth</td><td style={td}>{m.fabricArea.toFixed(1)} m²</td><td style={td}>{money(scene.cost.fabric_price_per_m2)}/m²</td><td style={td}>{money(m.fabricCost)}</td></tr>}
            {m.plySheets > 0 && <tr><td style={td}>plywood</td><td style={td}>{(scene.wall.plywood.thickness * 1000).toFixed(0)} mm · {scene.cost.ply_sheet_w}×{scene.cost.ply_sheet_h} m sheets</td><td style={td}>{m.plySheets} sheets</td><td style={td}>{money(scene.cost.ply_price_per_sheet)}</td><td style={td}>{money(m.plyCost)}</td></tr>}
            <tr><td style={td}><b>materials</b></td><td style={td} /><td style={td} /><td style={td} /><td style={td}><b>{money(m.subtotal)}</b></td></tr>
            <tr><td style={td}>labour</td><td style={td}>{(scene.cost.labour_fraction * 100).toFixed(0)} % of materials</td><td style={td} /><td style={td} /><td style={td}>{money(m.labour)}</td></tr>
            <tr><td style={td}>fixed</td><td style={td}>framing, fixings, delivery</td><td style={td} /><td style={td} /><td style={td}>{money(scene.cost.fixed_costs)}</td></tr>
            <tr><td style={td}><b>total</b></td><td style={td} /><td style={td} /><td style={td} /><td style={{ ...td, color: T.olive }}><b>{money(m.total)}</b></td></tr>
          </tbody>
        </table>
        <Note>Panel count per layer = ⌈net wall area × (1 + waste) / panel area⌉ × ⌈layer thickness / panel thickness⌉. Set each layer's purchasable panel thickness in the rail (e.g. a 200 mm layer of 50 mm panels = 4 through); blank = the layer is bought as one panel of its full depth.</Note>
      </Card>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${T.ink}`, font: `600 9px ${mono}`, letterSpacing: ".1em", color: T.ink2 };
const td: React.CSSProperties = { padding: "4px 6px", borderBottom: `1px solid ${T.rule}` };
