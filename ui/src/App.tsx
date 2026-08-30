import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Card, Note } from "./primitives";
import { RunsPage } from "./pages/RunsPage";
import { IsolationPage, IsolationRail } from "./pages/IsolationPage";
import { RoomPage, RoomRail } from "./pages/RoomPage";
import { WallPage, WallRail } from "./pages/WallPage";
import { T, disp, mono } from "./theme";
import type { IsolationResult, MaterialPresets, RoomResult, Scene, WallResult } from "./types";

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
  const [room, setRoom] = useState<RoomResult | null>(null);
  const [roomSlices, setRoomSlices] = useState<number[][][] | null>(null);
  const [roomProgress, setRoomProgress] = useState<{ status: string; progress: number; message: string; error?: string } | null>(null);
  const [roomRunId, setRoomRunId] = useState<string | null>(null);
  const [iso, setIso] = useState<IsolationResult | null>(null);
  const [isoSlices, setIsoSlices] = useState<(number | null)[][][] | null>(null);
  const [isoProgress, setIsoProgress] = useState<{ status: string; progress: number; message: string; error?: string } | null>(null);
  const [isoRunId, setIsoRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!isoRunId) return;
    let alive = true;
    const tick = async () => {
      try {
        const p = await api.progress(isoRunId);
        if (!alive) return;
        setIsoProgress(p);
        if (p.status === "done") {
          const full = await api.run(isoRunId);
          setIso(full.isolation ?? null);
          setIsoSlices((await api.isoSlices(isoRunId)).slices_db);
          setRunsKey((k) => k + 1);
          setIsoRunId(null);
        } else if (p.status === "failed" || p.status === "cancelled") {
          setIsoRunId(null);
          setRunsKey((k) => k + 1);
        } else {
          window.setTimeout(tick, 1000);
        }
      } catch (e) { setErr(String(e)); setIsoRunId(null); }
    };
    tick();
    return () => { alive = false; };
  }, [isoRunId]);

  const runIso = async (note: string) => {
    if (!scene) return;
    setIso(null); setIsoSlices(null);
    setIsoProgress({ status: "queued", progress: 0, message: "" });
    const meta = await api.createRun(scene, ["wall", "isolation"], note);
    setIsoRunId(meta.id);
  };

  // poll a running room job
  useEffect(() => {
    if (!roomRunId) return;
    let alive = true;
    const tick = async () => {
      try {
        const p = await api.progress(roomRunId);
        if (!alive) return;
        setRoomProgress(p);
        if (p.status === "done") {
          const full = await api.run(roomRunId);
          setRoom(full.room ?? null);
          setRoomSlices((await api.slices(roomRunId)).slices_db);
          setRunsKey((k) => k + 1);
          setRoomRunId(null);
        } else if (p.status === "failed" || p.status === "cancelled") {
          setRoomRunId(null);
          setRunsKey((k) => k + 1);
        } else {
          window.setTimeout(tick, 700);
        }
      } catch (e) { setErr(String(e)); setRoomRunId(null); }
    };
    tick();
    return () => { alive = false; };
  }, [roomRunId]);

  const runRoom = async (note: string) => {
    if (!scene) return;
    setRoom(null); setRoomSlices(null);
    setRoomProgress({ status: "queued", progress: 0, message: "" });
    const meta = await api.createRun(scene, ["wall", "room"], note);
    setRoomRunId(meta.id);
  };

  const loadRun = async (id: string, s: Scene) => {
    setScene(s);
    try {
      const full = await api.run(id);
      if (full.isolation) { setIso(full.isolation); setIsoSlices((await api.isoSlices(id)).slices_db); setIsoProgress(null); }
      if (full.room) { setRoom(full.room); setRoomSlices((await api.slices(id)).slices_db); setRoomProgress(null); setTab("room"); return; }
      if (full.isolation) { setTab("isolation"); return; }
    } catch { /* wall-only run */ }
    setTab("wall");
  };

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
              {tab === "room" && <RoomRail scene={scene} setScene={setScene} onRun={runRoom} running={!!roomRunId} />}
              {tab === "isolation" && <IsolationRail scene={scene} setScene={setScene} onRun={runIso} running={!!isoRunId} />}
            </aside>
          )}
          <section style={{ minWidth: 0 }}>
            {tab === "wall" && <WallPage scene={scene} result={wall} materials={materials} onSave={save} />}
            {tab === "room" && <RoomPage scene={scene} result={room} progress={roomProgress} slices={roomSlices} />}
            {tab === "isolation" && <IsolationPage scene={scene} result={iso} progress={isoProgress} slices={isoSlices} />}
            {tab === "runs" && <RunsPage onLoad={loadRun} refreshKey={runsKey} />}
          </section>
        </main>
      )}
    </div>
  );
}
