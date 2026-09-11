// Mirrors sim/soundroom/config.py
export type PorousModel = "jca" | "jcal" | "miki" | "db";

export interface RockwoolLayer {
  name?: string | null;
  density: number;
  thickness: number;
  model: PorousModel;
  sigma?: number | null;
  phi?: number | null;
  alpha_inf?: number | null;
  Lambda?: number | null;
  Lambda_p?: number | null;
  k0p?: number | null;
  d_fibre: number;
}

export interface Fabric { thickness: number; sigma: number; Rs?: number | null; areal_mass: number }
export interface AirGap { thickness: number }
export interface Plywood { thickness: number; density: number; E: number; nu: number; loss: number; model: "plate" | "limp" }

export interface WallStack { name: string; fabric: Fabric; rockwool: RockwoolLayer[]; airgap: AirGap; plywood: Plywood }

export interface WallSolverSettings { f_min: number; f_max: number; n_freq: number; n_theta: number; theta_field_max: number; theta_random_max: number }

export interface Venue { length: number; width: number; height: number; alpha_floor: number[]; alpha_walls: number[]; alpha_ceiling: number[] }
export interface Opening { width: number; height: number }
export interface SoundRoom {
  length: number; width: number; x: number; y: number;
  source_face: "-x" | "+x" | "-y" | "+y"; source_height: number; source_inset: number;
  openings: Record<string, Opening>;
}
export interface Listener { x: number; y: number; z: number }

export interface RoomSolverSettings { f_max: number; df: number; nodes_per_wavelength: number; basis: "analytic" | "fem"; basis_margin: number; n_modes?: number | null; wall_angle_deg: number }

export interface Scene {
  schema_version: number; name: string; wall: WallStack; venue: Venue; room: SoundRoom; listener: Listener; wall_solver: WallSolverSettings; room_solver: RoomSolverSettings;
}

export interface RoomMode { f_rigid: number; f_damped: number; T60: number | null; n: number[] | null; type: string }
export interface RoomResult {
  f: number[];
  frf: { sum_db: number[]; source_db: number[][]; reference: string };
  t60: { f: number[]; schroeder: (number | null)[]; sabine: number[]; eyring: number[] };
  modes: RoomMode[];
  stats: { V: number; S: number; f_schroeder: number; t60_mid_eyring: number; n_modes_below_cap: number; N_basis: number; basis: string; h: number; mesh: { nodes: number }; areas: Record<string, number>; Lx: number; Ly: number; Lz: number };
  slices: { z: number; x: number[]; y: number[]; freqs: number[] };
  timings: Record<string, number>;
}

export interface AlphaSet {
  normal: number[]; field: number[]; random: number[];
  octave: { f: number[]; field: (number | null)[] };
  third_octave: { f: number[]; field: (number | null)[] };
}

export interface WallResult {
  f: number[];
  layers: Record<string, any>[];
  thickness: number;
  Z_rigid: { re: number[]; im: number[] };
  Z_air: { re: number[]; im: number[] };
  alpha_rigid: AlphaSet;
  alpha_air: AlphaSet;
  alpha_rigid_miki_field: number[];
  TL: { normal: number[]; field: number[]; mass_law_normal: number[] | null; mass_law_field: number[] | null; octave: { f: number[]; field: (number | null)[] } };
  markers: Record<string, any>;
  warnings: string[];
  elapsed_ms?: number;
}

export interface RunMeta {
  id: string; created: string; name: string; kinds: string[]; note: string; tags: string[]; status: string;
  inputs_hash: string; summary: Record<string, number>; provenance?: Record<string, any>; timings?: Record<string, number>; artifacts?: string[];
}

export interface RunFull { meta: RunMeta; inputs: Scene; wall?: WallResult; room?: RoomResult; isolation?: any }

export interface MaterialPresets {
  rockwool: { name: string; density: number; sigma_estimate: number; sigma_strutt: number; source: string }[];
  rockwool_measured: { name: string; density: number; sigma_measured: number }[];
  rockwool_datasheet_alpha: { name: string; density: number; thickness: number; f: number[]; alpha: number[]; issued: string | null }[];
  plywood: { name: string; density: number; E: number; nu: number; loss: number }[];
  fabric: { name: string; sigma: number; thickness: number; Rs_typical: number }[];
}
