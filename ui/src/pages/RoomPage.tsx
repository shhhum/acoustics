import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Note, SectionLabel, Seg, Slider, Stat, fmt } from "../primitives";
import { LogLineChart, rows } from "../charts";
import { T, mono } from "../theme";
import type { RoomResult, Scene } from "../types";

const FACES = ["-x", "+x", "-y", "+y"] as const;

export function RoomRail({ scene, setScene, onRun, running }: { scene: Scene; setScene: (s: Scene) => void; onRun: (note: string) => void; running: boolean }) {
  const r = scene.room, v = scene.venue, l = scene.listener, s = scene.room_solver;
  const setRoom = (patch: Partial<typeof r>) => setScene({ ...scene, room: { ...r, ...patch } });
  const setL = (patch: Partial<typeof l>) => setScene({ ...scene, listener: { ...l, ...patch } });
  const setS = (patch: Partial<typeof s>) => setScene({ ...scene, room_solver: { ...s, ...patch } });
  const [note, setNote] = useState("");
  const fits = r.x + r.length <= v.length + 1e-9 && r.y + r.width <= v.width + 1e-9;
  return (
    <div>
      <SectionLabel>Sound room (interior)</SectionLabel>
      <Slider label="Length (x)" unit="m" value={r.length} min={2} max={12} step={0.1} onChange={(x) => setRoom({ length: x })} fmt={(x) => x.toFixed(1)} />
      <Slider label="Width (y)" unit="m" value={r.width} min={2} max={7} step={0.1} onChange={(x) => setRoom({ width: x })} fmt={(x) => x.toFixed(1)} />
      <Slider label="Position x" unit="m" value={r.x} min={0} max={v.length} step={0.1} onChange={(x) => setRoom({ x })} fmt={(x) => x.toFixed(1)} />
      <Slider label="Position y" unit="m" value={r.y} min={0} max={v.width} step={0.1} onChange={(x) => setRoom({ y: x })} fmt={(x) => x.toFixed(1)} />
      {!fits && <Note tone={T.red}>room does not fit inside the venue at this position</Note>}
      <Field label="Source face"><Seg small value={r.source_face} options={[...FACES]} onChange={(f) => setRoom({ source_face: f })} /></Field>
      <Slider label="Source inset" unit="m" value={r.source_inset} min={0.1} max={1.5} step={0.05} onChange={(x) => setRoom({ source_inset: x })} fmt={(x) => x.toFixed(2)} />
      <Slider label="Source height" unit="m" value={r.source_height} min={0.2} max={v.height - 0.1} step={0.05} onChange={(x) => setRoom({ source_height: x })} fmt={(x) => x.toFixed(2)} />

      <SectionLabel>Openings (other three faces)</SectionLabel>
      {FACES.filter((f) => f !== r.source_face).map((f) => {
        const o = r.openings[f] ?? { width: 0, height: 0 };
        const setO = (p: Partial<typeof o>) => setRoom({ openings: { ...r.openings, [f]: { ...o, ...p } } });
        return (
          <div key={f} style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Slider label={`${f} width`} unit="m" value={o.width} min={0} max={3} step={0.05} onChange={(x) => setO({ width: x })} fmt={(x) => x.toFixed(2)} /></div>
            <div style={{ flex: 1 }}><Slider label="height" unit="m" value={o.height} min={0} max={v.height} step={0.05} onChange={(x) => setO({ height: x })} fmt={(x) => x.toFixed(2)} /></div>
          </div>
        );
      })}

      <SectionLabel>Listener (from room corner)</SectionLabel>
      <Slider label="x" unit="m" value={l.x} min={0.1} max={r.length - 0.1} step={0.05} onChange={(x) => setL({ x })} fmt={(x) => x.toFixed(2)} />
      <Slider label="y" unit="m" value={l.y} min={0.1} max={r.width - 0.1} step={0.05} onChange={(y) => setL({ y })} fmt={(x) => x.toFixed(2)} />
      <Slider label="height" unit="m" value={l.z} min={0.1} max={v.height - 0.1} step={0.05} onChange={(z) => setL({ z })} fmt={(x) => x.toFixed(2)} />

      <SectionLabel>Solver</SectionLabel>
      <Slider label="FEM cap" unit="Hz" value={s.f_max} min={100} max={500} step={10} onChange={(x) => setS({ f_max: x })}
        hint={`≈ ${Math.round((v.height * r.length * r.width) * 4.19 * Math.pow(s.f_max / 343, 3) + (2 * (r.length * r.width + (r.length + r.width) * v.height)) * 0.785 * Math.pow(s.f_max / 343, 2))} modes below cap`} />
      <Slider label="Δf" unit="Hz" value={s.df} min={0.25} max={2} step={0.25} onChange={(x) => setS({ df: x })} fmt={(x) => x.toFixed(2)} hint={`impulse response ${(1 / s.df).toFixed(1)} s`} />
      <Slider label="Nodes / λ" value={s.nodes_per_wavelength} min={4} max={12} step={1} onChange={(x) => setS({ nodes_per_wavelength: x })} />
      <Field label="Modal basis" hint="analytic: exact box modes on the FEM mesh (fast) · fem: eigsh on K,M (general)">
        <Seg small value={s.basis} options={["analytic", "fem"]} onChange={(b) => setS({ basis: b })} />
      </Field>
      <Slider label="Wall Zs angle" unit="°" value={s.wall_angle_deg} min={0} max={75} step={5} onChange={(x) => setS({ wall_angle_deg: x })}
        hint="incidence angle of the TMM impedance used for the locally-reacting wall BC" />
      <div style={{ marginTop: 12 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="run note"
          style={{ width: "100%", font: `500 11px ${mono}`, padding: 6, border: `1px solid ${T.rule}`, background: T.paper, marginBottom: 8 }} />
        <Button primary disabled={running || !fits} onClick={() => onRun(note)}>{running ? "running…" : "run room solve"}</Button>
      </div>
    </div>
  );
}

export function RoomPage({ scene, result, progress, slices }: { scene: Scene; result: RoomResult | null; progress: { status: string; progress: number; message: string; error?: string } | null; slices: number[][][] | null }) {
  const [sliceIdx, setSliceIdx] = useState(0);
  const [showSrc, setShowSrc] = useState(false);
  useEffect(() => { setSliceIdx(0); }, [result?.stats?.N_basis]);
  const st = result?.stats;
  const frfRows = useMemo(() => result ? rows(result.f, { sum: result.frf.sum_db, s1: showSrc ? result.frf.source_db[0] : null, s2: showSrc ? result.frf.source_db[1] : null }).filter((r) => (r.f as number) >= 20) : [], [result, showSrc]);
  const t60Rows = useMemo(() => result ? rows(result.t60.f, { schroeder: result.t60.schroeder, sabine: result.t60.sabine, eyring: result.t60.eyring }) : [], [result]);
  const modalRows = useMemo(() => result ? result.modes.filter((m) => m.T60 && m.f_damped > 5).map((m) => ({ f: m.f_damped, t60: m.T60 })) : [], [result]);

  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Stat k="Volume" v={st ? st.V.toFixed(1) : "–"} u="m³" />
        <Stat k="Schroeder f" v={st ? st.f_schroeder.toFixed(0) : "–"} u="Hz" />
        <Stat k="Modes < cap" v={st ? st.n_modes_below_cap : "–"} />
        <Stat k="T60 mid (Eyring)" v={st ? st.t60_mid_eyring.toFixed(2) : "–"} u="s" />
        <Stat k="DOF" v={st ? st.mesh.nodes : "–"} />
        <Stat k="Basis" v={st ? `${st.N_basis} ${st.basis}` : "–"} />
      </div>
      {progress && progress.status !== "done" && (
        <Note tone={progress.status === "failed" ? T.red : T.amber}>
          {progress.status} · {(progress.progress * 100).toFixed(0)} % {progress.message}
          {progress.error && <pre style={{ whiteSpace: "pre-wrap" }}>{progress.error}</pre>}
        </Note>
      )}

      <Card title="Plan" note="venue with the sound room · sources ● · openings ▭ · listener ◎">
        <PlanView scene={scene} />
      </Card>

      {result && (
        <>
          <Card title="Frequency response at the listener" note={result.frf.reference}
            right={<Button small onClick={() => setShowSrc(!showSrc)}>{showSrc ? "hide" : "show"} each source</Button>}>
            <LogLineChart data={frfRows} xDomain={[20, Math.max(100, result.f[result.f.length - 1])]} yLabel="dB" series={[
              { key: "sum", name: "both sources (coherent)", color: T.olive, width: 2.2 },
              ...(showSrc ? [{ key: "s1", name: "source 1", color: T.slate, width: 1, dash: "3 2" }, { key: "s2", name: "source 2", color: T.violet, width: 1, dash: "3 2" }] : []),
            ]} />
          </Card>

          <Card title="Reverberation time" note="Schroeder T20 from the FEM impulse response per 1/3 octave · Sabine / Eyring from the TMM absorption · modal T60 = 1.10 / Im f">
            <LogLineChart data={t60Rows} xDomain={[20, 10000]} yLabel="s" yDomain={[0, Math.max(1, ...result.t60.eyring.map((x) => Math.min(x, 3)), ...result.t60.schroeder.map((x) => x ? Math.min(x, 3) : 0)) * 1.1]} series={[
              { key: "schroeder", name: "FEM (Schroeder)", color: T.olive, width: 2.4 },
              { key: "eyring", name: "Eyring", color: T.slate, width: 1.4 },
              { key: "sabine", name: "Sabine", color: T.ink2, width: 1, dash: "4 3" },
            ]} />
            <ModalScatter points={modalRows} fmax={result.f[result.f.length - 1]} />
          </Card>

          <Card title="Pressure map at listener height" note={`|p| dB re free field 1 m · z = ${result.slices.z.toFixed(2)} m`}
            right={<select value={sliceIdx} onChange={(e) => setSliceIdx(parseInt(e.target.value))} style={{ font: `600 10px ${mono}`, padding: 3 }}>
              {result.slices.freqs.map((f, i) => <option key={i} value={i}>{f.toFixed(1)} Hz{modeLabel(result, f)}</option>)}
            </select>}>
            {slices && slices[sliceIdx] && <Heatmap grid={slices[sliceIdx]} xs={result.slices.x} ys={result.slices.y} scene={scene} />}
          </Card>

          <Card title="Modes" note="rigid-wall eigenfrequencies with damped frequency and modal T60 from the quadratic eigenproblem">
            <table style={{ width: "100%", borderCollapse: "collapse", font: `500 11px ${mono}` }}>
              <thead><tr>{["f rigid", "f damped", "(nx ny nz)", "type", "T60"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{result.modes.filter((m) => m.f_rigid > 1).slice(0, 40).map((m, i) => (
                <tr key={i}><td style={td}>{m.f_rigid.toFixed(1)}</td><td style={td}>{m.f_damped.toFixed(1)}</td><td style={td}>{m.n ? m.n.join(" ") : "?"}</td>
                  <td style={{ ...td, color: m.type === "axial" ? T.red : m.type === "tangential" ? T.amber : T.ink2 }}>{m.type}</td><td style={td}>{m.T60 ? m.T60.toFixed(2) : "–"}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        </>
      )}
      {!result && !progress && <Note>Set up the room in the rail and run the solve. Results are saved as a run.</Note>}
    </div>
  );
}

function modeLabel(r: RoomResult, f: number) {
  const m = r.modes.find((m) => Math.abs(m.f_damped - f) < 0.06);
  return m && m.n ? ` · (${m.n.join(" ")}) ${m.type}` : "";
}

const th: React.CSSProperties = { textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${T.ink}`, font: `600 9px ${mono}`, letterSpacing: ".1em", color: T.ink2 };
const td: React.CSSProperties = { padding: "3px 6px", borderBottom: `1px solid ${T.rule}` };

export function PlanView({ scene, children }: { scene: Scene; children?: React.ReactNode }) {
  const v = scene.venue, r = scene.room, l = scene.listener;
  const W = 760, S = W / v.length, H = v.width * S;
  const t = scene.wall.fabric.thickness + scene.wall.rockwool.reduce((a, b) => a + b.thickness, 0) + scene.wall.airgap.thickness + scene.wall.plywood.thickness;
  const ins = r.source_inset;
  const src = {
    "-x": [[ins, ins], [ins, r.width - ins]], "+x": [[r.length - ins, ins], [r.length - ins, r.width - ins]],
    "-y": [[ins, ins], [r.length - ins, ins]], "+y": [[ins, r.width - ins], [r.length - ins, r.width - ins]],
  }[r.source_face];
  const X = (x: number) => 10 + x * S, Y = (y: number) => 10 + (v.width - y) * S;
  return (
    <svg width="100%" viewBox={`0 0 ${W + 20} ${H + 30}`} style={{ display: "block" }}>
      <rect x={10} y={10} width={W} height={H} fill={T.panel} stroke={T.ink} strokeWidth={1.2} />
      <rect x={X(r.x - t)} y={Y(r.y + r.width + t)} width={(r.length + 2 * t) * S} height={(r.width + 2 * t) * S} fill="hsl(80 20% 60%)" stroke={T.ink} strokeWidth={0.8} />
      <rect x={X(r.x)} y={Y(r.y + r.width)} width={r.length * S} height={r.width * S} fill={T.paper} stroke={T.ink} strokeWidth={0.8} />
      {Object.entries(r.openings).filter(([f, o]) => f !== r.source_face && o.width > 0 && o.height > 0).map(([f, o]) => {
        const horiz = f[1] === "x";
        const cu = horiz ? r.y + r.width / 2 : r.x + r.length / 2;
        const coord = f === "-x" ? r.x : f === "+x" ? r.x + r.length : f === "-y" ? r.y : r.y + r.width;
        return horiz
          ? <rect key={f} x={X(coord - t)} y={Y(cu + o.width / 2)} width={2 * t * S} height={o.width * S} fill={T.paper} stroke={T.amber} strokeWidth={1.2} />
          : <rect key={f} x={X(cu - o.width / 2)} y={Y(coord + t)} width={o.width * S} height={2 * t * S} fill={T.paper} stroke={T.amber} strokeWidth={1.2} />;
      })}
      {src.map(([sx, sy], i) => {
        const cx = X(r.x + sx), cy = Y(r.y + sy);
        const ang = Math.atan2(Y(r.y + r.width / 2) - cy, X(r.x + r.length / 2) - cx);
        return <g key={i}><line x1={cx} y1={cy} x2={cx + 40 * Math.cos(ang)} y2={cy + 40 * Math.sin(ang)} stroke={T.violet} strokeWidth={1} strokeDasharray="3 2" /><circle cx={cx} cy={cy} r={5} fill={T.violet} /></g>;
      })}
      <circle cx={X(r.x + l.x)} cy={Y(r.y + l.y)} r={6} fill="none" stroke={T.ink} strokeWidth={1.5} /><circle cx={X(r.x + l.x)} cy={Y(r.y + l.y)} r={2} fill={T.ink} />
      <text x={W / 2 + 10} y={H + 26} textAnchor="middle" style={{ font: `600 10px ${mono}`, fill: T.ink2 }}>{v.length} m</text>
      <text x={X(r.x + r.length / 2)} y={Y(r.y) + 2 * t * S + 12} textAnchor="middle" style={{ font: `600 9px ${mono}`, fill: T.ink2 }}>{r.length} × {r.width} m · wall {fmt.mm(t)} mm</text>
      {children}
    </svg>
  );
}

function Heatmap({ grid, xs, ys, scene }: { grid: number[][]; xs: number[]; ys: number[]; scene: Scene }) {
  const ny = grid.length, nx = grid[0].length;
  let lo = Infinity, hi = -Infinity;
  for (const row of grid) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
  lo = Math.max(lo, hi - 40);
  const W = 600, S = W / scene.room.length, H = scene.room.width * S;
  const cw = W / nx, ch = H / ny;
  const l = scene.listener;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: 700 }}>
        {grid.map((row, j) => row.map((v, i) => (
          <rect key={`${i}-${j}`} x={i * cw} y={H - (j + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={colour((v - lo) / (hi - lo))} />
        )))}
        <circle cx={l.x * S} cy={H - l.y * S} r={5} fill="none" stroke={T.ink} strokeWidth={1.5} />
      </svg>
      <div style={{ font: `500 10px ${mono}`, color: T.ink2, marginTop: 4 }}>scale {lo.toFixed(0)} … {hi.toFixed(0)} dB (40 dB range)</div>
    </div>
  );
}

function colour(t: number) {
  const x = Math.max(0, Math.min(1, t));
  // paper → olive → amber → red
  const stops: [number, number[]][] = [[0, [239, 237, 230]], [0.4, [111, 110, 43]], [0.75, [184, 128, 31]], [1, [168, 58, 43]]];
  for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], u = (x - a) / (b - a);
    return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * u)).join(",")})`;
  }
  return "rgb(168,58,43)";
}

function ModalScatter({ points, fmax }: { points: { f: number; t60: number | null }[]; fmax: number }) {
  if (!points.length) return null;
  const W = 760, H = 90, x0 = 40;
  const lx = (f: number) => x0 + (Math.log(f / 20) / Math.log(10000 / 20)) * (W - x0 - 10);
  const tmax = Math.max(1, ...points.map((p) => Math.min(p.t60 ?? 0, 3)));
  const ly = (t: number) => H - 10 - (Math.min(t, 3) / tmax) * (H - 20);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <text x={2} y={12} style={{ font: `600 9px ${mono}`, fill: T.ink2 }}>modal T60 (s), FEM cap {fmax.toFixed(0)} Hz</text>
      <line x1={x0} y1={H - 10} x2={W - 10} y2={H - 10} stroke={T.rule} />
      {points.map((p, i) => <circle key={i} cx={lx(p.f)} cy={ly(p.t60!)} r={2.5} fill={T.violet} opacity={0.7} />)}
      <text x={x0 - 4} y={ly(tmax) + 3} textAnchor="end" style={{ font: `500 9px ${mono}`, fill: T.ink2 }}>{tmax.toFixed(1)}</text>
      <text x={x0 - 4} y={H - 8} textAnchor="end" style={{ font: `500 9px ${mono}`, fill: T.ink2 }}>0</text>
    </svg>
  );
}
