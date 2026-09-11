import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LogLineChart, rows } from "../charts";
import { Button, Card, Note } from "../primitives";
import { T, mono } from "../theme";
import type { RunFull, RunMeta, Scene } from "../types";

const COLOURS = [T.olive, T.slate, T.violet, T.red];

export function RunsPage({ onLoad, refreshKey }: { onLoad: (id: string, s: Scene) => void; refreshKey: number }) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [open, setOpen] = useState<RunFull | null>(null);
  const [compare, setCompare] = useState<RunFull[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.runs().then(setRuns).catch((e) => setErr(String(e))); }, [refreshKey]);

  const toggleCompare = async (id: string) => {
    if (compare.some((r) => r.meta.id === id)) return setCompare(compare.filter((r) => r.meta.id !== id));
    if (compare.length >= 4) return;
    setCompare([...compare, await api.run(id)]);
  };

  const cmpRows = compare.length && compare[0].wall
    ? rows(compare[0].wall.f, Object.fromEntries(compare.map((r, i) => [`r${i}`, r.wall?.alpha_air.field ?? null])))
    : [];
  const cmpTL = compare.length && compare[0].wall
    ? rows(compare[0].wall.f, Object.fromEntries(compare.map((r, i) => [`r${i}`, r.wall?.TL.field ?? null])))
    : [];

  return (
    <div>
      {err && <Note tone={T.red}>{err}</Note>}
      <Card title="Runs" note={`${runs.length} on disk · data/runs/`}>
        <table style={{ width: "100%", borderCollapse: "collapse", font: `500 11px ${mono}` }}>
          <thead><tr>{["", "id", "note", "kinds", "status", "mm", "α125", "TL125", "σd/ρc", "T60@125", ""].map((h, i) => (
            <th key={i} style={{ textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${T.ink}`, font: `600 9px ${mono}`, letterSpacing: ".1em", color: T.ink2 }}>{h}</th>))}</tr></thead>
          <tbody>
            {runs.map((r) => {
              const idx = compare.findIndex((c) => c.meta.id === r.id);
              return (
                <tr key={r.id} style={{ background: open?.meta.id === r.id ? T.panel : undefined }}>
                  <td style={td}><input type="checkbox" checked={idx >= 0} onChange={() => toggleCompare(r.id)} style={{ accentColor: idx >= 0 ? COLOURS[idx] : T.olive }} /></td>
                  <td style={td}><button onClick={async () => setOpen(await api.run(r.id))} style={{ border: "none", background: "none", font: `600 11px ${mono}`, cursor: "pointer", color: T.slate }}>{r.id}</button></td>
                  <td style={td}>{r.note}</td>
                  <td style={td}>{r.kinds.join(",")}</td>
                  <td style={{ ...td, color: r.status === "done" ? T.olive : r.status === "failed" ? T.red : T.amber }}>{r.status}</td>
                  <td style={td}>{r.summary?.thickness_mm?.toFixed(0)}</td>
                  <td style={td}>{r.summary?.alpha_field_125?.toFixed(2)}</td>
                  <td style={td}>{r.summary?.TL_field_125?.toFixed(1)}</td>
                  <td style={td}>{r.summary?.sigma_d_over_rho_c?.toFixed(1)}</td>
                  <td style={td}>{r.summary?.t60_schroeder_125 != null ? `${r.summary.t60_schroeder_125.toFixed(2)} s` : ""}</td>
                  <td style={td}><Button small onClick={async () => onLoad(r.id, (await api.run(r.id)).inputs)}>load inputs</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {runs.length === 0 && <Note>No runs yet — save one from the Wall page.</Note>}
      </Card>

      {open && (
        <Card title={`Run ${open.meta.id}`} note={open.meta.created} right={<Button small onClick={() => setOpen(null)}>close</Button>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, font: `500 11px ${mono}` }}>
            <div>
              <div><b>note</b> {open.meta.note || "—"}</div>
              <div><b>status</b> {open.meta.status} · <b>kinds</b> {open.meta.kinds.join(", ")}</div>
              <div><b>inputs hash</b> {open.meta.inputs_hash}</div>
              <div><b>timings</b> {JSON.stringify(open.meta.timings)}</div>
              <div style={{ marginTop: 8 }}><b>provenance</b><pre style={{ font: `500 10px ${mono}`, margin: 0 }}>{JSON.stringify(open.meta.provenance, null, 1)}</pre></div>
            </div>
            <div>
              <div><b>wall</b> {open.inputs.wall.rockwool.map((r) => `${r.density}kg/m³×${(r.thickness * 1000).toFixed(0)}mm`).join(" → ")}
                {open.inputs.wall.airgap.thickness > 0 ? ` → gap ${(open.inputs.wall.airgap.thickness * 1000).toFixed(0)}mm` : ""} → ply {(open.inputs.wall.plywood.thickness * 1000).toFixed(0)}mm</div>
              <div><b>room</b> {open.inputs.room.length}×{open.inputs.room.width} m at ({open.inputs.room.x}, {open.inputs.room.y}) · sources on {open.inputs.room.source_face}</div>
              <div><b>summary</b><pre style={{ font: `500 10px ${mono}`, margin: 0 }}>{JSON.stringify(open.meta.summary, null, 1)}</pre></div>
              <div style={{ marginTop: 8 }}><Button primary onClick={() => onLoad(open.meta.id, open.inputs)}>load these inputs into the editor</Button></div>
            </div>
          </div>
        </Card>
      )}

      {compare.length > 0 && (
        <Card title="Compare" note="field-incidence absorption (venue-backed) and transmission loss">
          <LogLineChart data={cmpRows} yDomain={[0, 1]} series={compare.map((r, i) => ({ key: `r${i}`, name: `${r.meta.id.slice(0, 15)} ${r.meta.note}`.trim(), color: COLOURS[i] }))} />
          <LogLineChart data={cmpTL} yLabel="dB" series={compare.map((r, i) => ({ key: `r${i}`, name: `${r.meta.id.slice(0, 15)} ${r.meta.note}`.trim(), color: COLOURS[i] }))} />
        </Card>
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: "4px 6px", borderBottom: `1px solid ${T.rule}`, whiteSpace: "nowrap" };
