import React, { useMemo, useState } from "react";
import { Button, Card, Note, SectionLabel, Slider, Stat, fmt } from "../primitives";
import { LogLineChart, rows } from "../charts";
import { PlanView } from "./RoomPage";
import { T, mono } from "../theme";
import type { IsolationResult, Scene } from "../types";

const OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const RCOL = [T.slate, T.violet, T.amber, T.red, T.ink2, T.olive];

export function IsolationRail({ scene, setScene, onRun, running }: { scene: Scene; setScene: (s: Scene) => void; onRun: (note: string) => void; running: boolean }) {
  const v = scene.venue, s = scene.isolation_solver;
  const setV = (patch: Partial<typeof v>) => setScene({ ...scene, venue: { ...v, ...patch } });
  const setS = (patch: Partial<typeof s>) => setScene({ ...scene, isolation_solver: { ...s, ...patch } });
  const [note, setNote] = useState("");
  const table = (key: "alpha_floor" | "alpha_walls" | "alpha_ceiling", label: string) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ font: `600 9.5px ${mono}`, letterSpacing: ".13em", textTransform: "uppercase", color: T.ink2, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
        {OCT.map((f, i) => (
          <div key={f} style={{ textAlign: "center" }}>
            <input type="number" step={0.01} min={0} max={0.99} value={v[key][i]}
              onChange={(e) => { const a = [...v[key]]; a[i] = Math.min(0.99, Math.max(0, parseFloat(e.target.value) || 0)); setV({ [key]: a } as any); }}
              style={{ width: "100%", font: `600 9px ${mono}`, padding: "3px 1px", border: `1px solid ${T.rule}`, background: T.paper, textAlign: "center" }} />
            <div style={{ font: `500 7px ${mono}`, color: T.ink2 }}>{f >= 1000 ? `${f / 1000}k` : f}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <SectionLabel>Venue shell absorption (octave α)</SectionLabel>
      {table("alpha_floor", "floor")}
      {table("alpha_walls", "walls")}
      {table("alpha_ceiling", "ceiling")}
      <Note>Hard shell defaults. The venue's own absorption sets its reverberant level — it dominates the "dB drop" at the venue average.</Note>

      <SectionLabel>Coupled solver</SectionLabel>
      <Slider label="FEM cap" unit="Hz" value={s.f_max} min={60} max={400} step={10} onChange={(x) => setS({ f_max: x })}
        hint={`direct sparse solves; cost ∝ f³ — 200 Hz ≈ 1 min, 300 Hz ≈ 5 min`} />
      <Slider label="Points / octave" value={s.points_per_octave} min={3} max={24} step={1} onChange={(x) => setS({ points_per_octave: x })} />
      <Slider label="Nodes / λ" value={s.nodes_per_wavelength} min={4} max={10} step={1} onChange={(x) => setS({ nodes_per_wavelength: x })} />
      <Slider label="Workers" value={s.workers} min={1} max={8} step={1} onChange={(x) => setS({ workers: x })} hint="parallel frequency solves; each holds an LU (0.5–1.5 GB)" />
      <Note>Receivers: 1 m outside each opening at listener height, venue centre, far corner (edit in a saved preset for custom points).</Note>
      <div style={{ marginTop: 12 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="run note"
          style={{ width: "100%", font: `500 11px ${mono}`, padding: 6, border: `1px solid ${T.rule}`, background: T.paper, marginBottom: 8 }} />
        <Button primary disabled={running} onClick={() => onRun(note)}>{running ? "running…" : "run isolation solve"}</Button>
      </div>
    </div>
  );
}

export function IsolationPage({ scene, result, progress, slices }: { scene: Scene; result: IsolationResult | null; progress: { status: string; progress: number; message: string; error?: string } | null; slices: (number | null)[][][] | null }) {
  const [sliceIdx, setSliceIdx] = useState(0);
  const st = result?.statistical, fe = result?.fem, sm = result?.summary;
  const recs = result?.receivers ?? [];

  const drows = useMemo(() => {
    if (!result) return [];
    const out: Record<string, number | null>[] = [];
    fe!.f.forEach((f, i) => {
      const r: Record<string, number | null> = { f, fem_avg: fe!.D_venue_avg[i] };
      recs.forEach((_, j) => { r[`fem_r${j}`] = fe!.D_receivers[j][i]; });
      out.push(r);
    });
    st!.f.forEach((f, i) => {
      const r: Record<string, number | null> = { f, stat_avg: st!.D_venue_avg[i] };
      recs.forEach((_, j) => { r[`stat_r${j}`] = st!.D_receivers[j][i]; });
      out.push(r);
    });
    return out.sort((a, b) => (a.f as number) - (b.f as number));
  }, [result]);
  const tlRows = useMemo(() => result ? rows(st!.f, { wall: st!.TL_wall_field, composite: st!.TL_composite, cap: st!.TL_max_openings != null ? st!.f.map(() => st!.TL_max_openings) : null }) : [], [result]);

  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Stat k="Open fraction" v={sm ? (sm.open_fraction * 100).toFixed(1) : "–"} u="%" />
        <Stat k="TL max (openings)" v={sm?.TL_max_openings != null ? sm.TL_max_openings.toFixed(1) : "∞"} u="dB" tone={T.red} />
        <Stat k="D venue avg @125 (FEM)" v={sm ? sm.D_venue_avg_fem_125.toFixed(1) : "–"} u="dB" />
        <Stat k="Coupled DOF" v={fe ? fe.dofs : "–"} />
        <Stat k="FEM cap" v={fe ? fe.f[fe.f.length - 1].toFixed(0) : "–"} u="Hz" />
      </div>
      {progress && progress.status !== "done" && (
        <Note tone={progress.status === "failed" ? T.red : T.amber}>
          {progress.status} · {(progress.progress * 100).toFixed(0)} % {progress.message}
          {progress.error && <pre style={{ whiteSpace: "pre-wrap" }}>{progress.error}</pre>}
        </Note>
      )}
      <Note>
        Level difference D = L_in − L_out, with L_in the room's mean level. Solid: coupled FEM (venue + room, wall as a TMM 2-port, openings as air) up to the cap.
        Dashed: statistical (composite field-incidence TL per face with openings at 0 dB, power route into the venue's reverberant field). Openings cap the whole partition at
        −10·log10(open fraction) regardless of the wall build.
      </Note>

      <Card title="Plan" note="receivers ×">
        <PlanView scene={scene}>
          {recs.map((r, j) => {
            const W = 760, S = W / scene.venue.length;
            const x = 10 + r[0] * S, y = 10 + (scene.venue.width - r[1]) * S;
            return <g key={j}><line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={RCOL[j % RCOL.length]} strokeWidth={2} /><line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke={RCOL[j % RCOL.length]} strokeWidth={2} />
              <text x={x + 8} y={y + 4} style={{ font: `600 9px ${mono}`, fill: RCOL[j % RCOL.length] }}>R{j + 1}</text></g>;
          })}
        </PlanView>
      </Card>

      {result && (
        <>
          <Card title="Inside → outside level difference" note="dB · FEM ≤ cap (solid) · statistical (dashed)">
            <LogLineChart data={drows} yLabel="dB" xDomain={[20, 10000]} height={300} series={[
              { key: "fem_avg", name: "venue average (FEM)", color: T.olive, width: 2.6 },
              { key: "stat_avg", name: "venue average (statistical)", color: T.olive, width: 1.4, dash: "5 3" },
              ...recs.map((_, j) => ({ key: `fem_r${j}`, name: `R${j + 1} (FEM)`, color: RCOL[j % RCOL.length], width: 1.4 })),
              ...recs.map((_, j) => ({ key: `stat_r${j}`, name: `R${j + 1} (stat)`, color: RCOL[j % RCOL.length], width: 1, dash: "3 3" })),
            ]} />
          </Card>

          <Card title="Transmission loss budget" note="field-incidence wall TL · composite with openings · opening-limited ceiling">
            <LogLineChart data={tlRows} yLabel="dB" series={[
              { key: "wall", name: "wall stack TL (field)", color: T.slate, width: 1.6 },
              { key: "composite", name: "composite (walls + openings)", color: T.olive, width: 2.4 },
              { key: "cap", name: "TL max from openings", color: T.red, width: 1, dash: "4 3" },
            ]} />
          </Card>

          <Card title="Venue pressure map" note={`|p| dB re room-average level · z = ${result.slices.z.toFixed(2)} m`}
            right={<select value={sliceIdx} onChange={(e) => setSliceIdx(parseInt(e.target.value))} style={{ font: `600 10px ${mono}`, padding: 3 }}>
              {result.slices.freqs.map((f, i) => <option key={i} value={i}>{f.toFixed(1)} Hz</option>)}
            </select>}>
            {slices && slices[sliceIdx] && <VenueHeatmap grid={slices[sliceIdx]} scene={scene} recs={recs} />}
          </Card>
        </>
      )}
      {!result && !progress && <Note>Set the venue absorption and solver cap in the rail and run the solve.</Note>}
    </div>
  );
}

function VenueHeatmap({ grid, scene, recs }: { grid: (number | null)[][]; scene: Scene; recs: number[][] }) {
  const ny = grid.length, nx = grid[0].length;
  const v = scene.venue, r = scene.room;
  const W = 760, S = W / v.length, H = v.width * S;
  const cw = W / nx, ch = H / ny;
  const hi = 10, lo = -50;
  const t = scene.wall.fabric.thickness + scene.wall.rockwool.reduce((a, b) => a + b.thickness, 0) + scene.wall.airgap.thickness + scene.wall.plywood.thickness;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {grid.map((row, j) => row.map((val, i) => (
          <rect key={`${i}-${j}`} x={i * cw} y={H - (j + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={val == null ? T.ink : colour((val - lo) / (hi - lo))} />
        )))}
        <rect x={(r.x - t) * S} y={H - (r.y + r.width + t) * S} width={(r.length + 2 * t) * S} height={(r.width + 2 * t) * S} fill="none" stroke={T.ink} strokeWidth={1} />
        {recs.map((p, j) => <circle key={j} cx={p[0] * S} cy={H - p[1] * S} r={4} fill="none" stroke={RCOL[j % RCOL.length]} strokeWidth={2} />)}
      </svg>
      <div style={{ font: `500 10px ${mono}`, color: T.ink2, marginTop: 4 }}>scale {lo} … {hi} dB re room average</div>
    </div>
  );
}

function colour(tt: number) {
  const x = Math.max(0, Math.min(1, tt));
  const stops: [number, number[]][] = [[0, [239, 237, 230]], [0.45, [44, 84, 104]], [0.75, [111, 110, 43]], [0.9, [184, 128, 31]], [1, [168, 58, 43]]];
  for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], u = (x - a) / (b - a);
    return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * u)).join(",")})`;
  }
  return "rgb(168,58,43)";
}
