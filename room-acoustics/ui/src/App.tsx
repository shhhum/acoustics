import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Card, Note } from "./primitives";

import { CostPage, CostRail } from "./pages/CostPage";

import { RoomPage, RoomRail } from "./pages/RoomPage";
import { SimulatePage, SimulateRail, type SimKinds } from "./pages/SimulatePage";
import { WallPage, WallRail } from "./pages/WallPage";
import { T, disp, mono } from "./theme";
import type { IsolationResult, MaterialPresets, RoomResult, SavedRoom, SavedWall, Scene, WallResult } from "./types";

type Tab = "wall" | "room" | "simulate" | "cost";

export default function App() {
  const [tab, setTab] = useState<Tab>("wall");
  const [scene, setScene] = useState<Scene | null>(null);
  const [materials, setMaterials] = useState<MaterialPresets | null>(null);
  const [wall, setWall] = useState<WallResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [runsKey, setRunsKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const [presets, setPresets] = useState<{ name: string; scene: Scene }[]>([]);
  const [walls, setWalls] = useState<SavedWall[]>([]);
  const refreshWalls = () => api.walls().then(setWalls).catch(() => {});
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const refreshRooms = () => api.rooms().then(setRooms).catch(() => {});
  useEffect(() => { refreshWalls(); refreshRooms(); }, []);
  const saveRoom = async (name: string) => {
    if (!scene) return;
    try { await api.saveRoom(name, scene.room); notify(`saved room "${name}"`); refreshRooms(); }
    catch (e) { setErr(String(e)); }
  };
  const loadRoom = (r: SavedRoom) => { if (!scene) return; setScene({ ...scene, room: r.room }); notify(`loaded room "${r.name}"`); };
  const deleteRoom = async (name: string) => { await api.deleteRoom(name); notify(`deleted room "${name}"`); refreshRooms(); };
  const saveWall = async (name: string) => {
    if (!scene) return;
    try { await api.saveWall(name, scene.wall); setScene({ ...scene, wall: { ...scene.wall, name } }); notify(`saved wall "${name}"`); refreshWalls(); }
    catch (e) { setErr(String(e)); }
  };
  const loadWall = (w: SavedWall) => { if (!scene) return; setScene({ ...scene, wall: w.wall }); notify(`loaded wall "${w.name}"`); };
  const deleteWall = async (name: string) => { await api.deleteWall(name); notify(`deleted wall "${name}"`); refreshWalls(); };
  const [presetName, setPresetName] = useState("");
  const notify = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 3000); };
  const refreshPresets = () => api.presets().then(setPresets).catch(() => {});
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
          if (full.room) setRoomSlices((await api.slices(roomRunId)).slices_db);
          if (full.isolation) { setIso(full.isolation); setIsoSlices((await api.isoSlices(roomRunId)).slices_db); }
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

  const runSim = async (note: string, kinds: SimKinds) => {
    if (!scene) return;
    if (kinds.room) { setRoom(null); setRoomSlices(null); }
    if (kinds.isolation) { setIso(null); setIsoSlices(null); }
    setRoomProgress({ status: "queued", progress: 0, message: "" });
    const ks = ["wall", ...(kinds.room ? ["room"] : []), ...(kinds.isolation ? ["isolation"] : [])];
    const meta = await api.createRun(scene, ks, note);
    setRoomRunId(meta.id);
  };

  const loadRun = async (id: string, s: Scene) => {
    setScene(s);
    try {
      const full = await api.run(id);
      if (full.isolation) { setIso(full.isolation); setIsoSlices((await api.isoSlices(id)).slices_db); setIsoProgress(null); }
      if (full.room) { setRoom(full.room); setRoomSlices((await api.slices(id)).slices_db); setRoomProgress(null); }
      if (full.room || full.isolation) { setTab("simulate"); notify(`loaded ${id}: inputs + results`); return; }
      const why = full.meta.status === "failed" ? `run failed${full.meta.error ? ` (${full.meta.error})` : ""} — no room results; re-run from the Room tab`
        : full.meta.status === "running" ? "run still in progress — results will appear when it finishes"
        : "run has wall results only";
      notify(`loaded ${id} inputs. ${why}`);
    } catch { notify(`loaded ${id} inputs (results unavailable)`); }
    setTab("wall");
  };

  useEffect(() => {
    Promise.all([api.presets(), api.materials()])
      .then(([p, m]) => { setPresets(p); setScene((p.find((x) => x.name === "default") ?? p[0]).scene); setMaterials(m); })
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
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <select value="" onChange={(e) => { const p = presets.find((x) => x.name === e.target.value); if (p) { setScene(p.scene); notify(`loaded preset ${p.name}`); } }}
            style={{ font: `600 9px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }}>
            <option value="">load preset…</option>
            {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="preset name" style={{ width: 110, font: `500 9px ${mono}`, padding: 4, border: `1px solid ${T.rule}`, background: T.paper }} />
          <button disabled={!presetName || !scene} onClick={async () => { try { await api.savePreset(presetName, { ...scene!, name: presetName }); notify(`saved preset ${presetName}`); setPresetName(""); refreshPresets(); } catch (e) { setErr(String(e)); } }}
            style={{ font: `600 9px ${mono}`, padding: "4px 8px", border: `1px solid ${T.rule}`, background: "transparent", cursor: "pointer", letterSpacing: ".1em", textTransform: "uppercase" }}>save</button>
        </div>
        <nav style={{ display: "flex", gap: 2 }}>
          {(["wall", "room", "simulate", "cost"] as Tab[]).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "6px 12px", border: `1px solid ${tab === k ? T.ink : T.rule}`, background: tab === k ? T.ink : "transparent", color: tab === k ? T.paper : T.ink2,
                font: `600 10px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 }}>{k}</button>
          ))}
        </nav>
      </header>

      {err && <div style={{ padding: "8px 22px" }}><Note tone={T.red}>{err}</Note></div>}

      {scene && (
        <main style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 20, padding: 20, maxWidth: 1800 }}>
          <aside style={{ background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 3, padding: 16, alignSelf: "start", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            {tab === "wall" && <WallRail scene={scene} setScene={setScene} materials={materials} walls={walls} onSaveWall={saveWall} onLoadWall={loadWall} onDeleteWall={deleteWall} />}
            {tab === "room" && <RoomRail scene={scene} setScene={setScene} rooms={rooms} onSaveRoom={saveRoom} onLoadRoom={loadRoom} onDeleteRoom={deleteRoom} />}
            {tab === "simulate" && <SimulateRail scene={scene} setScene={setScene} onRun={runSim} running={!!roomRunId || !!isoRunId} />}
            {tab === "cost" && <CostRail scene={scene} setScene={setScene} walls={walls} onLoadWall={loadWall} />}
          </aside>
          <section style={{ minWidth: 0 }}>
            {tab === "wall" && <WallPage scene={scene} result={wall} materials={materials} onSave={save} />}
            {tab === "room" && <RoomPage scene={scene} />}
            {tab === "simulate" && <SimulatePage scene={scene} room={room} roomSlices={roomSlices} iso={iso} isoSlices={isoSlices} progress={roomProgress ?? isoProgress} onLoadRun={loadRun} refreshKey={runsKey} />}
            {tab === "cost" && <CostPage scene={scene} />}
          </section>
        </main>
      )}
    </div>
  );
}
