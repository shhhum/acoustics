import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Card, Note } from "./primitives";
import { RunsPage } from "./pages/RunsPage";
import { WallPage, WallRail } from "./pages/WallPage";
import { T, disp, mono } from "./theme";
import type { MaterialPresets, Scene, WallResult } from "./types";

type Tab = "wall" | "room" | "isolation" | "runs";

export default function App() {
  const [tab, setTab] = useState<Tab>("wall");
  const [scene, setScene] = useState<Scene | null>(null);
  const [materials, setMaterials] = useState<MaterialPresets | null>(null);
  const [wall, setWall] = useState<WallResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [runsKey, setRunsKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([api.presets(), api.materials()])
      .then(([p, m]) => { setScene((p.find((x) => x.name === "default") ?? p[0]).scene); setMaterials(m); })
      .catch((e) => setErr(`API not reachable (${e}). Start it with: make api`));
  }, []);

  // live wall compute, debounced
  useEffect(() => {
    if (!scene) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.wallCompute(scene.wall, scene.wall_solver).then((r) => { setWall(r); setErr(null); }).catch((e) => setErr(String(e)));
    }, 120);
  }, [scene?.wall, scene?.wall_solver]);

  const save = async (note: string) => {
    if (!scene) return;
    const meta = await api.createRun(scene, ["wall"], note);
    setRunsKey((k) => k + 1);
    setToast(`saved ${meta.id}`);
    window.setTimeout(() => setToast(null), 3000);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.panel, fontFamily: disp }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 20, padding: "12px 22px", borderBottom: `1px solid ${T.rule}`, background: T.paper }}>
        <div>
          <div style={{ font: `700 18px ${disp}`, letterSpacing: "-.01em" }}>soundroom</div>
          <div style={{ font: `500 10px ${mono}`, color: T.ink2, letterSpacing: ".12em", textTransform: "uppercase" }}>room-in-a-room acoustic design instrument</div>
        </div>
        <div style={{ font: `500 11px ${mono}`, color: T.ink2 }}>
          venue {scene?.venue.length}×{scene?.venue.width}×{scene?.venue.height} m · room {scene?.room.length}×{scene?.room.width} m
        </div>
        <div style={{ flex: 1 }} />
        {toast && <span style={{ font: `600 10px ${mono}`, color: T.olive }}>{toast}</span>}
        <nav style={{ display: "flex", gap: 2 }}>
          {(["wall", "room", "isolation", "runs"] as Tab[]).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "6px 12px", border: `1px solid ${tab === k ? T.ink : T.rule}`, background: tab === k ? T.ink : "transparent", color: tab === k ? T.paper : T.ink2,
                font: `600 10px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 }}>{k}</button>
          ))}
        </nav>
      </header>

      {err && <div style={{ padding: "8px 22px" }}><Note tone={T.red}>{err}</Note></div>}

      {scene && (
        <main style={{ display: "grid", gridTemplateColumns: tab === "runs" ? "minmax(0, 1fr)" : "320px minmax(0, 1fr)", gap: 20, padding: 20, maxWidth: 1800 }}>
          {tab !== "runs" && (
            <aside style={{ background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 3, padding: 16, alignSelf: "start", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              {tab === "wall" && <WallRail scene={scene} setScene={setScene} materials={materials} />}
              {tab === "room" && <Note>Room geometry controls arrive with M3 (FEM).</Note>}
              {tab === "isolation" && <Note>Isolation controls arrive with M4 (coupled venue FEM).</Note>}
            </aside>
          )}
          <section style={{ minWidth: 0 }}>
            {tab === "wall" && <WallPage scene={scene} result={wall} materials={materials} onSave={save} />}
            {tab === "room" && <Card title="Room"><Note>Modes, frequency response at the listener, T60 — M3.</Note></Card>}
            {tab === "isolation" && <Card title="Isolation"><Note>Inside→outside level difference — M4.</Note></Card>}
            {tab === "runs" && <RunsPage onLoad={(s) => { setScene(s); setTab("wall"); }} refreshKey={runsKey} />}
          </section>
        </main>
      )}
    </div>
  );
}
