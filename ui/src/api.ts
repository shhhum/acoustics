import type { MaterialPresets, RunFull, RunMeta, Scene, WallResult, WallSolverSettings, WallStack } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

export const api = {
  health: () => req<{ ok: boolean; provenance: Record<string, any> }>("/api/health"),
  wallCompute: (wall: WallStack, wall_solver: WallSolverSettings) =>
    req<WallResult>("/api/wall/compute", { method: "POST", body: JSON.stringify({ wall, wall_solver }) }),
  materials: () => req<MaterialPresets>("/api/materials"),
  presets: () => req<{ name: string; scene: Scene }[]>("/api/presets"),
  savePreset: (name: string, scene: Scene) => req(`/api/presets/${name}`, { method: "PUT", body: JSON.stringify(scene) }),
  runs: () => req<RunMeta[]>("/api/runs"),
  run: (id: string) => req<RunFull>(`/api/runs/${id}`),
  createRun: (scene: Scene, kinds: string[], note: string, tags: string[] = []) =>
    req<RunMeta>("/api/runs", { method: "POST", body: JSON.stringify({ scene, kinds, note, tags }) }),
  patchRun: (id: string, patch: { note?: string; tags?: string[] }) =>
    req<RunMeta>(`/api/runs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  progress: (id: string) => req<{ id: string; status: string; progress: number; message: string; error?: string }>(`/api/runs/${id}/progress`),
  cancel: (id: string) => req(`/api/runs/${id}/cancel`, { method: "POST" }),
};
