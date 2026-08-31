import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LogLineChart, rows } from "../charts";
import { Button, Card, Note } from "../primitives";
import { T, mono } from "../theme";
import type { RunFull, RunMeta, Scene } from "../types";
import { migrateScene, migrateWall } from "../types";

const COLOURS = [T.olive, T.slate, T.violet, T.red];

export function RunsPage({ onLoad, refreshKey }: { onLoad: (id: string, s: Scene) => void; refreshKey: number }) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [open, setOpen] = useState<RunFull | null>(null);
  const [compare, setCompare] = useState<RunFull[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [noteEdit, setNoteEdit] = useState("");

  useEffect(() => { api.runs().then(setRuns).catch((e) => setErr(String(e))); }, [refreshKey]);

  const toggleCompare = async (id: string) => {
    if (compare.some((r) => r.meta.id === id)) return setCompare(compare.filter((r) => r.meta.id !== id));
    if (compare.length >= 4) return;
    setCompare([...compare, await api.run(id)]);
  };
  const label = (r: RunFull) => `${r.meta.id.slice(0, 15)} ${r.meta.note}`.trim();

  const withWall = compare.filter((r) => r.wall);
  const withRoom = compare.filter((r) => r.room);
  const withIso = compare.filter((r) => r.isolation);
  const cmpAlpha = withWall.length ? rows(withWall[0].wall!.f, Object.fromEntries(withWall.map((r, i) => [`r${i}`, r.wall!.alpha_air.field]))) : [];
  const cmpTL = withWall.length ? rows(withWall[0].wall!.f, Object.fromEntries(withWall.map((r, i) => [`r${i}`, r.wall!.TL.field]))) : [];
  const cmpT60 = withRoom.length ? rows(withRoom[0].room!.t60.f, Object.fromEntries(withRoom.flatMap((r, i) => [[`r${i}`, r.room!.t60.schroeder], [`e${i}`, r.room!.t60.eyring]]))) : [];
  const cmpFRF = withRoom.length ? mergeByF(withRoom.map((r, i) => [`r${i}`, r.room!.f, r.room!.frf.sum_db])).filter((x) => (x.f as number) >= 20) : [];
  const cmpD = withIso.length ? mergeByF(withIso.flatMap((r, i) => [[`r${i}`, r.isolation!.fem.f, r.isolation!.fem.D_venue_avg], [`s${i}`, r.isolation!.statistical.f, r.isolation!.statistical.D_venue_avg]])) : [];
  const shown = runs.filter((r) => !filter || `${r.id} ${r.note} ${r.kinds.join(" ")} ${r.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      {err && <Note tone={T.red}>{err}</Note>}
      <Card title="Runs" note={`${runs.length} on disk · data/runs/ · append-only`}
        right={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter…" style={{ font: `500 10px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }} />}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", font: `500 11px ${mono}` }}>
            <thead><tr>{["cmp", "id", "note", "kinds", "status", "mm", "α125", "TL125", "σd/ρc", "T60@125", "D avg@125", ""].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${T.ink}`, font: `600 9px ${mono}`, letterSpacing: ".1em", color: T.ink2 }}>{h}</th>))}</tr></thead>
            <tbody>
              {shown.map((r) => {
                const idx = compare.findIndex((c) => c.meta.id === r.id);
                const s = r.summary ?? {};
                return (
                  <tr key={r.id} style={{ background: open?.meta.id === r.id ? T.panel : undefined }}>
                    <td style={td}><input type="checkbox" checked={idx >= 0} onChange={() => toggleCompare(r.id)} style={{ accentColor: idx >= 0 ? COLOURS[idx] : T.olive }} /></td>
                    <td style={td}><button onClick={async () => { const f = await api.run(r.id); setOpen(f); setNoteEdit(f.meta.note); }} style={{ border: "none", background: "none", font: `600 11px ${mono}`, cursor: "pointer", color: T.slate }}>{r.id}</button></td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 260 }}>{r.note}</td>
                    <td style={td}>{r.kinds.join(",")}</td>
                    <td style={{ ...td, color: r.status === "done" ? T.olive : r.status === "failed" ? T.red : T.amber }}>{r.status}</td>
                    <td style={td}>{s.thickness_mm?.toFixed(0)}</td>
                    <td style={td}>{s.alpha_field_125?.toFixed(2)}</td>
                    <td style={td}>{s.TL_field_125?.toFixed(1)}</td>
                    <td style={td}>{s.sigma_d_over_rho_c?.toFixed(1)}</td>
                    <td style={td}>{s.t60_schroeder_125 != null ? `${s.t60_schroeder_125.toFixed(2)} s` : ""}</td>
                    <td style={td}>{s.D_venue_avg_fem_125 != null ? `${s.D_venue_avg_fem_125.toFixed(1)} dB` : ""}</td>
                    <td style={td}><Button small onClick={async () => onLoad(r.id, migrateScene((await api.run(r.id)).inputs))}>load</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <Note>No runs yet — save one from the Wall page or run a solve.</Note>}
      </Card>

      {open && (
        <Card title={`Run ${open.meta.id}`} note={open.meta.created} right={<div style={{ display: "flex", gap: 6 }}>
          {open.wall && <Button small onClick={() => download(`${open.meta.id}-wall.csv`, wallCsv(open))}>wall csv</Button>}
          {open.room && <Button small onClick={() => download(`${open.meta.id}-room.csv`, roomCsv(open))}>room csv</Button>}
          {open.isolation && <Button small onClick={() => download(`${open.meta.id}-isolation.csv`, isoCsv(open))}>isolation csv</Button>}
          <Button small onClick={() => download(`${open.meta.id}-inputs.json`, JSON.stringify(open.inputs, null, 1))}>inputs json</Button>
          <Button small onClick={() => setOpen(null)}>close</Button>
        </div>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, font: `500 11px ${mono}` }}>
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <b>note</b>
                <input value={noteEdit} onChange={(e) => setNoteEdit(e.target.value)} style={{ flex: 1, font: `500 11px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }} />
                <Button small onClick={async () => { const m = await api.patchRun(open.meta.id, { note: noteEdit }); setOpen({ ...open, meta: m }); setRuns(runs.map((r) => (r.id === m.id ? { ...r, note: m.note } : r))); }}>save note</Button>
              </div>
              <div><b>status</b> {open.meta.status} · <b>kinds</b> {open.meta.kinds.join(", ")} · <b>hash</b> {open.meta.inputs_hash}</div>
              <div><b>timings</b> {Object.entries(open.meta.timings ?? {}).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(" · ")}</div>
              <div style={{ marginTop: 8 }}><b>provenance</b><pre style={{ font: `500 10px ${mono}`, margin: 0 }}>{JSON.stringify(open.meta.provenance, null, 1)}</pre></div>
            </div>
            <div>
              <div><b>wall</b> fabric {(open.inputs.wall.fabric.thickness * 1000).toFixed(1)}mm → {migrateWall(open.inputs.wall).layers.map((l) => l.kind === "airgap" ? `gap ${(l.thickness * 1000).toFixed(0)}mm` : `${l.density}kg/m³×${(l.thickness * 1000).toFixed(0)}mm`).join(" → ")} → ply {(open.inputs.wall.plywood.thickness * 1000).toFixed(0)}mm</div>
              <div><b>room</b> {open.inputs.room.length}×{open.inputs.room.width} m at ({open.inputs.room.x}, {open.inputs.room.y}) · sources on {open.inputs.room.source_face} · openings {Object.entries(open.inputs.room.openings).map(([f, o]) => `${f} ${o.width}×${o.height}`).join(", ")}</div>
              <div><b>listener</b> ({open.inputs.listener.x}, {open.inputs.listener.y}, {open.inputs.listener.z})</div>
              <div><b>summary</b><pre style={{ font: `500 10px ${mono}`, margin: 0 }}>{JSON.stringify(open.meta.summary, null, 1)}</pre></div>
              <div style={{ marginTop: 8 }}><Button primary onClick={() => onLoad(open.meta.id, migrateScene(open.inputs))}>load this run into the editor</Button></div>
            </div>
          </div>
        </Card>
      )}

      {compare.length > 0 && (
        <Card title="Compare" note={`${compare.length} runs · tick up to 4`}>
          {withWall.length > 0 && <>
            <div style={sub}>absorption, field incidence, venue-backed</div>
            <LogLineChart data={cmpAlpha} yDomain={[0, 1]} series={withWall.map((r, i) => ({ key: `r${i}`, name: label(r), color: COLOURS[compare.indexOf(r)] }))} />
            <div style={sub}>transmission loss, field incidence</div>
            <LogLineChart data={cmpTL} yLabel="dB" series={withWall.map((r, i) => ({ key: `r${i}`, name: label(r), color: COLOURS[compare.indexOf(r)] }))} />
          </>}
          {withRoom.length > 0 && <>
            <div style={sub}>frequency response at the listener (dB re free field 1 m)</div>
            <LogLineChart data={cmpFRF} yLabel="dB" xDomain={[20, 500]} series={withRoom.map((r, i) => ({ key: `r${i}`, name: label(r), color: COLOURS[compare.indexOf(r)] }))} />
            <div style={sub}>T60 — solid: FEM Schroeder · dashed: Eyring</div>
            <LogLineChart data={cmpT60} yLabel="s" yDomain={[0, 2]} series={withRoom.flatMap((r, i) => [
              { key: `r${i}`, name: label(r), color: COLOURS[compare.indexOf(r)], width: 2 },
              { key: `e${i}`, name: `${label(r)} (Eyring)`, color: COLOURS[compare.indexOf(r)], width: 1, dash: "4 3" }])} />
          </>}
          {withIso.length > 0 && <>
            <div style={sub}>inside → outside level difference, venue average — solid: FEM · dashed: statistical</div>
            <LogLineChart data={cmpD} yLabel="dB" series={withIso.flatMap((r, i) => [
              { key: `r${i}`, name: label(r), color: COLOURS[compare.indexOf(r)], width: 2 },
              { key: `s${i}`, name: `${label(r)} (stat)`, color: COLOURS[compare.indexOf(r)], width: 1, dash: "4 3" }])} />
          </>}
        </Card>
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: "4px 6px", borderBottom: `1px solid ${T.rule}`, whiteSpace: "nowrap" };
const sub: React.CSSProperties = { font: `600 9px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink2, margin: "10px 0 2px" };

/** Merge several (key, f[], y[]) series with different frequency grids into chart rows (nulls where absent). */
function mergeByF(series: [string, number[], (number | null)[]][]): Record<string, number | null>[] {
  const map = new Map<number, Record<string, number | null>>();
  for (const [key, f, y] of series) f.forEach((fv, i) => {
    const k = Math.round(fv * 1000) / 1000;
    const r = map.get(k) ?? { f: k };
    r[key] = y[i];
    map.set(k, r);
  });
  return [...map.values()].sort((a, b) => (a.f as number) - (b.f as number));
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const csv = (header: string[], cols: (number | null | undefined)[][]) =>
  [header.join(","), ...cols[0].map((_, i) => cols.map((c) => (c[i] == null ? "" : (c[i] as number).toPrecision(6))).join(","))].join("\n");

function wallCsv(r: RunFull) {
  const w = r.wall!;
  return csv(["f_Hz", "alpha_normal_venue", "alpha_field_venue", "alpha_random_venue", "alpha_field_rigid", "Z_re_rigid", "Z_im_rigid", "TL_normal_dB", "TL_field_dB"],
    [w.f, w.alpha_air.normal, w.alpha_air.field, w.alpha_air.random, w.alpha_rigid.field, w.Z_rigid.re, w.Z_rigid.im, w.TL.normal, w.TL.field]);
}
function roomCsv(r: RunFull) {
  const m = r.room!;
  const frf = csv(["f_Hz", "frf_sum_dB", "frf_src1_dB", "frf_src2_dB"], [m.f, m.frf.sum_db, m.frf.source_db[0], m.frf.source_db[1]]);
  const t60 = csv(["band_Hz", "T60_schroeder_s", "T60_sabine_s", "T60_eyring_s"], [m.t60.f, m.t60.schroeder, m.t60.sabine, m.t60.eyring]);
  const modes = ["f_rigid_Hz,f_damped_Hz,nx,ny,nz,type,T60_s", ...m.modes.map((x) => `${x.f_rigid.toFixed(2)},${x.f_damped.toFixed(2)},${x.n ? x.n.join(",") : ",,"},${x.type},${x.T60 ?? ""}`)].join("\n");
  return `# frequency response\n${frf}\n\n# T60 per 1/3 octave\n${t60}\n\n# modes\n${modes}\n`;
}
function isoCsv(r: RunFull) {
  const s = r.isolation!;
  const fem = csv(["f_Hz", "D_venue_avg_dB", ...s.receivers.map((_, j) => `D_R${j + 1}_dB`)], [s.fem.f, s.fem.D_venue_avg, ...s.fem.D_receivers]);
  const st = csv(["f_Hz", "D_venue_avg_stat_dB", "TL_wall_field_dB", "TL_composite_dB", ...s.receivers.map((_, j) => `D_R${j + 1}_stat_dB`)],
    [s.statistical.f, s.statistical.D_venue_avg, s.statistical.TL_wall_field, s.statistical.TL_composite, ...s.statistical.D_receivers]);
  return `# coupled FEM\n${fem}\n\n# statistical\n${st}\n\n# receivers (venue x,y,z)\n${s.receivers.map((p) => p.join(",")).join("\n")}\n`;
}
