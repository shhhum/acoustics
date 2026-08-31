import React, { useState } from "react";
import { Button, Field, Note, SectionLabel, Seg, Slider } from "../primitives";
import { IsolationPage } from "./IsolationPage";
import { RoomResults } from "./RoomPage";
import { RunsPage } from "./RunsPage";
import { T, mono } from "../theme";
import type { IsolationResult, RoomResult, Scene } from "../types";

const FACES = ["-x", "+x", "-y", "+y"] as const;
const OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

export type SimKinds = { room: boolean; isolation: boolean };

export function SimulateRail({ scene, setScene, onRun, running }: {
  scene: Scene; setScene: (s: Scene) => void; onRun: (note: string, kinds: SimKinds) => void; running: boolean;
}) {
  const r = scene.room, v = scene.venue, l = scene.listener, s = scene.room_solver, iso = scene.isolation_solver;
  const setRoom = (patch: Partial<typeof r>) => setScene({ ...scene, room: { ...r, ...patch } });
  const setL = (patch: Partial<typeof l>) => setScene({ ...scene, listener: { ...l, ...patch } });
  const setS = (patch: Partial<typeof s>) => setScene({ ...scene, room_solver: { ...s, ...patch } });
  const setV = (patch: Partial<typeof v>) => setScene({ ...scene, venue: { ...v, ...patch } });
  const setI = (patch: Partial<typeof iso>) => setScene({ ...scene, isolation_solver: { ...iso, ...patch } });
  const [note, setNote] = useState("");
  const [kinds, setKinds] = useState<SimKinds>({ room: true, isolation: false });
  const fits = r.x + r.length <= v.length + 1e-9 && r.y + r.width <= v.width + 1e-9;

  const alphaTable = (key: "alpha_floor" | "alpha_walls" | "alpha_ceiling", label: string) => (
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
      <SectionLabel>Sources (pair, corners of one face)</SectionLabel>
      <Field label="Source face"><Seg small value={r.source_face} options={[...FACES]} onChange={(f) => setRoom({ source_face: f })} /></Field>
      <Slider label="Source inset" unit="m" value={r.source_inset} min={0.1} max={1.5} step={0.05} onChange={(x) => setRoom({ source_inset: x })} fmt={(x) => x.toFixed(2)} />
      <Slider label="Source height" unit="m" value={r.source_height} min={0.2} max={v.height - 0.1} step={0.05} onChange={(x) => setRoom({ source_height: x })} fmt={(x) => x.toFixed(2)} />

      <SectionLabel>Listener (from room corner)</SectionLabel>
      <Slider label="x" unit="m" value={l.x} min={0.1} max={r.length - 0.1} step={0.05} onChange={(x) => setL({ x })} fmt={(x) => x.toFixed(2)} />
      <Slider label="y" unit="m" value={l.y} min={0.1} max={r.width - 0.1} step={0.05} onChange={(y) => setL({ y })} fmt={(x) => x.toFixed(2)} />
      <Slider label="height" unit="m" value={l.z} min={0.1} max={v.height - 0.1} step={0.05} onChange={(z) => setL({ z })} fmt={(x) => x.toFixed(2)} />

      <SectionLabel>Room solver</SectionLabel>
      <Slider label="FEM cap" unit="Hz" value={s.f_max} min={100} max={500} step={10} onChange={(x) => setS({ f_max: x })}
        hint={`≈ ${Math.round((v.height * r.length * r.width) * 4.19 * Math.pow(s.f_max / 343, 3) + (2 * (r.length * r.width + (r.length + r.width) * v.height)) * 0.785 * Math.pow(s.f_max / 343, 2))} modes below cap`} />
      <Slider label="Δf" unit="Hz" value={s.df} min={0.25} max={2} step={0.25} onChange={(x) => setS({ df: x })} fmt={(x) => x.toFixed(2)} hint={`impulse response ${(1 / s.df).toFixed(1)} s`} />
      <Slider label="Nodes / λ" value={s.nodes_per_wavelength} min={4} max={12} step={1} onChange={(x) => setS({ nodes_per_wavelength: x })} />
      <Field label="Modal basis" hint="analytic: exact box modes on the FEM mesh (fast; matches fem to 0.1%) · fem: eigsh on K,M (general)">
        <Seg small value={s.basis} options={["analytic", "fem"]} onChange={(b) => setS({ basis: b })} />
      </Field>
      <Slider label="Wall Zs angle" unit="°" value={s.wall_angle_deg} min={0} max={75} step={5} onChange={(x) => setS({ wall_angle_deg: x })}
        hint="incidence angle of the TMM impedance used for the locally-reacting wall BC" />

      <SectionLabel>Venue shell absorption (octave α)</SectionLabel>
      {alphaTable("alpha_floor", "floor")}
      {alphaTable("alpha_walls", "walls")}
      {alphaTable("alpha_ceiling", "ceiling")}

      <SectionLabel>Isolation solver (coupled FEM)</SectionLabel>
      <Slider label="FEM cap" unit="Hz" value={iso.f_max} min={60} max={400} step={10} onChange={(x) => setI({ f_max: x })}
        hint="direct sparse solves; cost ∝ f³ — 200 Hz ≈ 1 min, 300 Hz ≈ 5 min" />
      <Slider label="Points / octave" value={iso.points_per_octave} min={3} max={24} step={1} onChange={(x) => setI({ points_per_octave: x })} />
      <Slider label="Workers" value={iso.workers} min={1} max={8} step={1} onChange={(x) => setI({ workers: x })} hint="each holds an LU (0.5–1.5 GB)" />

      <SectionLabel>Run</SectionLabel>
      <div style={{ display: "flex", gap: 14, marginBottom: 8, font: `600 11px ${mono}` }}>
        <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={kinds.room} onChange={(e) => setKinds({ ...kinds, room: e.target.checked })} style={{ accentColor: T.olive }} /> room
        </label>
        <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={kinds.isolation} onChange={(e) => setKinds({ ...kinds, isolation: e.target.checked })} style={{ accentColor: T.olive }} /> isolation
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="run note (what are you testing?)"
        style={{ width: "100%", font: `500 11px ${mono}`, padding: 6, border: `1px solid ${T.rule}`, background: T.paper, marginBottom: 8, boxSizing: "border-box" }} />
      <Button primary disabled={running || !fits || (!kinds.room && !kinds.isolation)} onClick={() => onRun(note, kinds)}>
        {running ? "running…" : "run simulation"}</Button>
      {!fits && <Note tone={T.red}>room does not fit inside the venue — fix it in the Room tab</Note>}
    </div>
  );
}

export function SimulatePage({ scene, room, roomSlices, iso, isoSlices, progress, onLoadRun, refreshKey }: {
  scene: Scene; room: RoomResult | null; roomSlices: number[][][] | null;
  iso: IsolationResult | null; isoSlices: (number | null)[][][] | null;
  progress: { status: string; progress: number; message: string; error?: string } | null;
  onLoadRun: (id: string, s: Scene) => void; refreshKey: number;
}) {
  return (
    <div>
      {progress && progress.status !== "done" && (
        <Note tone={progress.status === "failed" ? T.red : T.amber}>
          {progress.status} · {(progress.progress * 100).toFixed(0)} % {progress.message}
          {progress.error && <pre style={{ whiteSpace: "pre-wrap" }}>{progress.error}</pre>}
        </Note>
      )}
      {!room && !iso && !progress && <Note>Pick sources, listener and solver settings in the rail, then run. Results land here and are saved as a run below.</Note>}
      <RoomResults scene={scene} result={room} slices={roomSlices} />
      {iso && <IsolationPage scene={scene} result={iso} progress={null} slices={isoSlices} />}
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Run history</SectionLabel>
        <RunsPage onLoad={onLoadRun} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
