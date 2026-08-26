import React, { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from "recharts";

/* ============================================================
   TOKENS
   ============================================================ */
const T = {
  paper: "#EFEDE6",
  panel: "#E6E3DA",
  ink: "#15171A",
  ink2: "#4A4E52",
  rule: "#C7C3B7",
  olive: "#6F6E2B",
  slate: "#2C5468",
  violet: "#8A3FA8",
  red: "#A83A2B",
  amber: "#B8801F",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
`;

const mono = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const disp = "'Space Grotesk', 'Helvetica Neue', system-ui, sans-serif";

/* ============================================================
   PHYSICS
   ============================================================ */
const C = 343, RHO = 1.2, Z0 = RHO * C;

// -- complex helpers
const K = (re, im = 0) => ({ re, im });
const cadd = (a, b) => K(a.re + b.re, a.im + b.im);
const cmul = (a, b) => K(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => {
  const d = b.re * b.re + b.im * b.im || 1e-30;
  return K((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cscl = (a, s) => K(a.re * s, a.im * s);
const cabs2 = (a) => a.re * a.re + a.im * a.im;
const jmul = (a) => K(-a.im, a.re); // multiply by j
const ctan = (z) => {
  const a = z.re, b = Math.max(-20, Math.min(20, z.im));
  const ch = Math.cosh(b), sh = Math.sinh(b);
  const sn = K(Math.sin(a) * ch, Math.cos(a) * sh);
  const cs = K(Math.cos(a) * ch, -Math.sin(a) * sh);
  return cdiv(sn, cs);
};

// -- Miki model for a rigid-frame porous layer
function miki(f, sigma) {
  const X = Math.max(f / sigma, 1e-9);
  const p1 = Math.pow(X, -0.632), p2 = Math.pow(X, -0.618);
  const Zc = K(Z0 * (1 + 0.070 * p1), -Z0 * 0.107 * p1);
  const w = 2 * Math.PI * f;
  const k = K((w / C) * (1 + 0.109 * p2), -(w / C) * 0.160 * p2);
  return { Zc, k };
}
const airLayer = (f) => ({ Zc: K(Z0, 0), k: K((2 * Math.PI * f) / C, 0) });

// -- transmission-line impedance translation through one layer
function translate(Zc, k, d, ZL, rigid) {
  const t = ctan(cscl(k, d));
  if (rigid) return cdiv(Zc, jmul(t));                 // ZL -> infinity
  const num = cadd(ZL, jmul(cmul(Zc, t)));
  const den = cadd(Zc, jmul(cmul(ZL, t)));
  return cmul(Zc, cdiv(num, den));
}

/**
 * Surface impedance of the wall sandwich, seen from inside the room.
 * layers listed inside -> outside; we build from the back.
 */
function wallSurfaceZ(f, cfg) {
  let Z = K(0, 0), rigid = true;

  // outermost: concrete-paved brick treated as rigid termination
  // 1.2 m air cavity (optionally part-filled)
  if (cfg.gap > 0) {
    if (cfg.gapFill > 0) {
      const fillD = (cfg.gapFill / 100) * cfg.gap;
      const { Zc, k } = miki(f, cfg.gapFillSigma);
      Z = translate(Zc, k, fillD, Z, rigid); rigid = false;
      const rest = cfg.gap - fillD;
      if (rest > 0.001) { const a = airLayer(f); Z = translate(a.Zc, a.k, rest, Z, false); }
    } else {
      const a = airLayer(f);
      Z = translate(a.Zc, a.k, cfg.gap, Z, rigid); rigid = false;
    }
  }
  // plywood: limp mass in series
  if (cfg.plyT > 0) {
    const m = cfg.plyT * cfg.plyRho;
    Z = cadd(Z, K(0, 2 * Math.PI * f * m));
    rigid = false;
  }
  // rockwool layers, back to front
  for (let i = cfg.wool.length - 1; i >= 0; i--) {
    const L = cfg.wool[i];
    if (L.t <= 0) continue;
    const { Zc, k } = miki(f, L.sigma);
    Z = translate(Zc, k, L.t, Z, rigid); rigid = false;
  }
  // acoustic skin
  if (cfg.skinT > 0) {
    const { Zc, k } = miki(f, cfg.skinSigma);
    Z = translate(Zc, k, cfg.skinT, Z, rigid); rigid = false;
  }
  return Z;
}

function alphaAtAngle(Z, theta) {
  const ct = Math.cos(theta);
  const num = K(Z.re * ct - Z0, Z.im * ct);
  const den = K(Z.re * ct + Z0, Z.im * ct);
  const R = cdiv(num, den);
  return Math.max(0, Math.min(1, 1 - cabs2(R)));
}

function absorptionCurve(cfg, freqs) {
  return freqs.map((f) => {
    const Z = wallSurfaceZ(f, cfg);
    const a0 = alphaAtAngle(Z, 0);
    // Paris: random incidence
    let num = 0, den = 0, N = 60, lim = (83 * Math.PI) / 180;
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * lim;
      const w = Math.sin(2 * th);
      num += alphaAtAngle(Z, th) * w;
      den += w;
    }
    return { f, normal: a0, random: num / den };
  });
}

/* ---------- transmission through the inner leaf (TMM) ---------- */
const csqrt = (z) => {
  const r = Math.hypot(z.re, z.im);
  const a = Math.sqrt(Math.max((r + z.re) / 2, 0));
  const b = Math.sign(z.im || 1) * Math.sqrt(Math.max((r - z.re) / 2, 0));
  return K(a, b);
};
const clampIm = (z) => K(z.re, Math.max(-90, Math.min(90, z.im)));
const ccos = (z0) => { const z = clampIm(z0); return K(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im)); };
const csin = (z0) => { const z = clampIm(z0); return K(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im)); };
const mat = (a, b, c, d) => [a, b, c, d];
const mmul = (X, Y) => [
  cadd(cmul(X[0], Y[0]), cmul(X[1], Y[2])), cadd(cmul(X[0], Y[1]), cmul(X[1], Y[3])),
  cadd(cmul(X[2], Y[0]), cmul(X[3], Y[2])), cadd(cmul(X[2], Y[1]), cmul(X[3], Y[3])),
];
const fluidMat = (Zc, k, d, kx) => {
  const kz = csqrt(K(k.re * k.re - k.im * k.im - kx * kx, 2 * k.re * k.im));
  const Ze = cmul(Zc, cdiv(k, kz));
  const arg = cscl(kz, d);
  const co = ccos(arg), si = csin(arg);
  return mat(co, jmul(cmul(Ze, si)), jmul(cdiv(si, Ze)), co);
};
const massMat = (w, m) => mat(K(1, 0), K(0, w * m), K(0, 0), K(1, 0));

// pressure transmission coefficient of the inner leaf at one angle
function leafTau(f, theta, cfg) {
  const w = 2 * Math.PI * f, k0 = w / C, kx = k0 * Math.sin(theta);
  let T = mat(K(1, 0), K(0, 0), K(0, 0), K(1, 0));
  if (cfg.skinT > 0) { const { Zc, k } = miki(f, cfg.skinSigma); T = mmul(T, fluidMat(Zc, k, cfg.skinT, kx)); }
  for (const L of cfg.wool) {
    if (L.t <= 0) continue;
    const { Zc, k } = miki(f, L.sigma);
    T = mmul(T, fluidMat(Zc, k, L.t, kx));
  }
  if (cfg.plyT > 0) T = mmul(T, massMat(w, cfg.plyT * cfg.plyRho));
  const Za = Z0 / Math.cos(theta);
  const den = cadd(cadd(T[0], cscl(T[1], 1 / Za)), cadd(cscl(T[2], Za), T[3]));
  return cabs2(cdiv(K(2, 0), den));
}

function leafTL(f, cfg) {
  const N = 34, lim = (78 * Math.PI) / 180;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * lim, wgt = Math.sin(2 * th);
    num += leafTau(f, th, cfg) * wgt; den += wgt;
  }
  let tl = -10 * Math.log10(Math.max(num / den, 1e-30));

  // mass-air-mass / panel resonance against the cavity
  if (cfg.plyT > 0 && cfg.gap > 0) {
    const m = cfg.plyT * cfg.plyRho;
    const k = cfg.gapFill > 25 ? 60 : 80;
    const f0 = k / Math.sqrt(m * cfg.gap);
    const depth = cfg.gapFill > 25 ? 6 : 13;
    tl -= depth * Math.exp(-Math.pow(Math.log(f / f0) / 0.42, 2));
  }
  // coincidence dip of the plywood leaf
  if (cfg.plyT > 0) {
    const fc = 20 / (cfg.plyT * 1000) * 1000; // ~2 kHz for 10 mm
    tl -= 9 * Math.exp(-Math.pow(Math.log(f / fc) / 0.30, 2));
  }
  return tl;
}

// combine the airborne path with a flanking ceiling
const compositeTL = (tlAir, cap) =>
  -10 * Math.log10(Math.pow(10, -tlAir / 10) + Math.pow(10, -cap / 10));

const OCT = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
const A_WT = { 16: -56.7, 31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6, 500: -3.2, 1000: 0, 2000: 1.2, 4000: 1.0, 8000: -1.1 };
const C_WT = { 16: -8.5, 31.5: -3.0, 63: -0.8, 125: -0.2, 250: 0, 500: 0, 1000: 0, 2000: -0.2, 4000: -0.8, 8000: -3.0 };
const SHAPES = {
  Club: { 16: 2, 31.5: 6, 63: 14, 125: 9, 250: 4, 500: 1, 1000: 0, 2000: -2, 4000: -5, 8000: -10 },
  "Hi-fi": { 16: -6, 31.5: -1, 63: 6, 125: 4, 250: 2, 500: 1, 1000: 0, 2000: -1, 4000: -4, 8000: -9 },
};
const weighted = (spec, wt) =>
  10 * Math.log10(OCT.reduce((s, f) => s + Math.pow(10, (spec[f] + wt[f]) / 10), 0));

// -- air absorption coefficient m (1/m), 20C 50%RH, rough
const AIR_M = { 125: 0.0001, 250: 0.0003, 500: 0.0009, 1000: 0.0025, 2000: 0.0062, 4000: 0.0165, 8000: 0.045 };
const airM = (f) => {
  const ks = Object.keys(AIR_M).map(Number);
  if (f <= ks[0]) return AIR_M[ks[0]];
  if (f >= ks[ks.length - 1]) return AIR_M[ks[ks.length - 1]];
  for (let i = 0; i < ks.length - 1; i++) {
    if (f >= ks[i] && f <= ks[i + 1]) {
      const t = Math.log(f / ks[i]) / Math.log(ks[i + 1] / ks[i]);
      return AIR_M[ks[i]] * (1 - t) + AIR_M[ks[i + 1]] * t;
    }
  }
  return 0.002;
};

const FLOORS = {
  "Sealed concrete": { 63: .02, 125: .02, 250: .03, 500: .03, 1000: .03, 2000: .04, 4000: .05, 8000: .05 },
  "Hardwood on joists": { 63: .15, 125: .12, 250: .10, 500: .07, 1000: .06, 2000: .06, 4000: .07, 8000: .07 },
  "Vinyl on screed": { 63: .02, 125: .02, 250: .03, 500: .04, 1000: .05, 2000: .05, 4000: .10, 8000: .10 },
  "Heavy carpet": { 63: .08, 125: .10, 250: .25, 500: .50, 1000: .60, 2000: .70, 4000: .72, 8000: .72 },
};
const floorAlpha = (kind, f) => {
  const tab = FLOORS[kind], ks = Object.keys(tab).map(Number);
  if (f <= ks[0]) return tab[ks[0]];
  if (f >= ks[ks.length - 1]) return tab[ks[ks.length - 1]];
  for (let i = 0; i < ks.length - 1; i++)
    if (f >= ks[i] && f <= ks[i + 1]) {
      const t = Math.log(f / ks[i]) / Math.log(ks[i + 1] / ks[i]);
      return tab[ks[i]] * (1 - t) + tab[ks[i + 1]] * t;
    }
  return .05;
};

/* ============================================================
   HELPERS
   ============================================================ */
const logSpace = (a, b, n) =>
  Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const IN = 0.0254;
const sdOf = (dIn) => Math.PI * Math.pow((0.83 * dIn * IN) / 2, 2);
const SPACE_GAIN = { full: -6, half: 0, quarter: 6, eighth: 12 };

// displacement-limited SPL at 1 m, half space
const splDisp = (f, VdM3) =>
  db((7.54 * f * f * VdM3) / Math.SQRT2 / 2e-5);

// nth-order Butterworth high-pass magnitude in dB
const hp = (f, fc, order) => -10 * Math.log10(1 + Math.pow(fc / Math.max(f, 1e-6), 2 * order));
const lp = (f, fc, order) => -10 * Math.log10(1 + Math.pow(Math.max(f, 1e-6) / fc, 2 * order));

// horn geometry
const mouthDim = (f, deg) => (0.6 * (C / f)) / Math.sin((deg * Math.PI) / 180 / 2);
const hornQ = (h, v) => (180 * 360) / (h * v);

/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function Field({ label, unit, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ font: `600 9.5px ${mono}`, letterSpacing: ".13em", textTransform: "uppercase", color: T.ink2 }}>{label}</span>
        {unit && <span style={{ font: `400 9.5px ${mono}`, color: T.ink2, opacity: .65 }}>{unit}</span>}
      </div>
      {children}
      {hint && <div style={{ font: `400 10px ${mono}`, color: T.ink2, opacity: .7, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Slider({ label, unit, value, min, max, step = 1, onChange, fmt, hint }) {
  return (
    <Field label={label} unit={unit} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: T.olive, height: 3 }} />
        <span style={{ font: `700 12px ${mono}`, minWidth: 56, textAlign: "right", color: T.ink, fontVariantNumeric: "tabular-nums" }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
    </Field>
  );
}

function Seg({ options, value, onChange, small }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${T.rule}`, borderRadius: 2, overflow: "hidden", flexWrap: "wrap" }}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.v;
        const l = typeof o === "string" ? o : o.l;
        const on = v === value;
        return (
          <button key={v} onClick={() => onChange(v)}
            style={{
              flex: 1, minWidth: small ? 40 : 60, padding: small ? "5px 6px" : "7px 8px", border: "none", cursor: "pointer",
              background: on ? T.ink : "transparent", color: on ? T.paper : T.ink2,
              font: `600 ${small ? 9 : 10}px ${mono}`, letterSpacing: ".08em", textTransform: "uppercase",
              transition: "background .12s",
            }}>{l}</button>
        );
      })}
    </div>
  );
}

function Stat({ k, v, u, tone }) {
  return (
    <div style={{ borderTop: `1px solid ${T.rule}`, paddingTop: 7, marginBottom: 12 }}>
      <div style={{ font: `600 9px ${mono}`, letterSpacing: ".14em", textTransform: "uppercase", color: T.ink2, marginBottom: 3 }}>{k}</div>
      <div style={{ font: `700 19px ${mono}`, color: tone || T.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {v}<span style={{ font: `400 11px ${mono}`, color: T.ink2, marginLeft: 4 }}>{u}</span>
      </div>
    </div>
  );
}

function Card({ title, note, children, pad = 16 }) {
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 3, marginBottom: 16 }}>
      {title && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.rule}`, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ font: `700 11px ${mono}`, letterSpacing: ".16em", textTransform: "uppercase" }}>{title}</span>
          {note && <span style={{ font: `400 10px ${mono}`, color: T.ink2 }}>{note}</span>}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

const OCT_TICKS = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const tickFmt = (v) => (v >= 1000 ? `${v / 1000}k` : `${v}`);


/* ============================================================
   ENCLOSURE / ALIGNMENT PHYSICS
   ============================================================ */
const L_PER_M3 = 1000;
// empirical driver displaced volume, litres, from nominal diameter in inches
const driverDisp = (dIn) => 0.00975 * Math.pow(dIn, 2.41);

function portGeom(port) {
  const n = Math.max(1, port.n);
  const one = port.shape === "round"
    ? Math.PI * Math.pow(port.dia / 2000, 2)
    : (port.pw / 1000) * (port.ph / 1000);
  const req = Math.sqrt(one / Math.PI);
  return { n, one, total: n * one, req, Leff: port.len + 1.463 * req };
}

function boxCalc(sec) {
  const { drv, box, port } = sec;
  const gross = box.W * box.H * box.D * L_PER_M3;
  const vDrv = drv.n * driverDisp(drv.dia);
  const pg = port ? portGeom(port) : null;
  const vPort = box.type === "reflex" && pg ? pg.total * port.len * L_PER_M3 : 0;
  const net = Math.max(gross * (1 - box.brace / 100) - vDrv - vPort, 1);

  const alpha = (drv.n * drv.vas) / net;
  const sdTot = drv.n * (drv.sd / 1e4);

  let fb = null, fc = null, qtc = null;
  if (box.type === "reflex" && pg) {
    fb = (C / (2 * Math.PI)) * Math.sqrt(pg.total / ((net / L_PER_M3) * pg.Leff));
  } else {
    qtc = drv.qts * Math.sqrt(alpha + 1);
    fc = drv.fs * Math.sqrt(alpha + 1);
  }

  const splRef = drv.sens + 10 * Math.log10(drv.pe) + 20 * Math.log10(drv.n);
  const refF = box.type === "reflex" ? drv.fs : fc;
  const x0 = (Math.pow(10, splRef / 20) * Math.SQRT2 * 2e-5) / (7.54 * sdTot * refF * refF);

  const stand = [box.W, box.H, box.D].map((d) => C / (2 * d));
  const baffleStep = C / (Math.PI * box.W);
  const pipe = pg ? C / (2 * pg.Leff) : null;

  return { gross, net, vDrv, vPort, alpha, sdTot, fb, fc, qtc, splRef, x0, pg, stand, baffleStep, pipe };
}

// vented-box (Small) and sealed responses; returns dB, cone excursion mm, port velocity m/s
function alignResponse(sec, f) {
  const { drv, box } = sec;
  const bc = boxCalc(sec);
  const w = 2 * Math.PI * f;
  if (box.type === "reflex" && bc.fb) {
    const h = bc.fb / drv.fs, a = bc.alpha, ql = box.ql, q = drv.qts;
    const f0 = Math.sqrt(drv.fs * bc.fb);
    const a1 = Math.sqrt(h) / ql + 1 / (Math.sqrt(h) * q);
    const a2 = h + (a + 1) / h + 1 / (ql * q);
    const a3 = 1 / (Math.sqrt(h) * ql) + Math.sqrt(h) / q;
    const s = K(0, f / f0);
    const s2 = cmul(s, s), s3 = cmul(s2, s), s4 = cmul(s2, s2);
    const D = cadd(cadd(s4, cscl(s3, a3)), cadd(cadd(cscl(s2, a2), cscl(s, a1)), K(1, 0)));
    const G = cdiv(s4, D);
    const sb = K(0, f / bc.fb);
    const N = cadd(cadd(cmul(sb, sb), cscl(sb, 1 / ql)), K(1, 0));
    const xc = bc.x0 * Math.sqrt(cabs2(cdiv(N, D))) * 1000;
    const vp = bc.pg && bc.pg.total > 0
      ? (w * bc.sdTot * bc.x0 * Math.sqrt(cabs2(cdiv(K(1, 0), D)))) / bc.pg.total : 0;
    return { spl: bc.splRef + db(Math.sqrt(cabs2(G))), xc, vp };
  }
  // sealed / horn rear chamber
  const x = f / bc.fc;
  const mag2 = Math.pow(x, 4) / (Math.pow(x * x - 1, 2) + Math.pow(x / bc.qtc, 2));
  const xc = bc.x0 * Math.sqrt(1 / (Math.pow(x * x - 1, 2) + Math.pow(x / bc.qtc, 2))) * 1000;
  return { spl: bc.splRef + db(Math.sqrt(mag2)), xc, vp: 0 };
}

const SPEC = {
  sub: { name: "Sub", col: "#8A3FA8", horn: false },
  low: { name: "Low", col: "#2C5468", horn: false },
  mid: { name: "Mid", col: "#6F6E2B", horn: true },
  hf: { name: "Tweeter", col: "#A83A2B", horn: true, cd: true },
};

/* ============================================================
   MAIN
   ============================================================ */
const INIT_SPK = {
  sub: {
    drv: { dia: 21, n: 2, sd: 1537, fs: 33, qts: 0.35, vas: 280, xmax: 15, sens: 99, pe: 1500 },
    box: { type: "reflex", W: 0.62, H: 1.15, D: 0.80, brace: 8, ql: 10, space: "eighth" },
    port: { shape: "slot", n: 2, dia: 150, pw: 500, ph: 120, len: 0.95 },
  },
  low: {
    drv: { dia: 12, n: 2, sd: 522, fs: 45, qts: 0.32, vas: 90, xmax: 9, sens: 98, pe: 500 },
    box: { type: "reflex", W: 0.45, H: 0.78, D: 0.44, brace: 7, ql: 10, space: "quarter" },
    port: { shape: "slot", n: 1, dia: 100, pw: 380, ph: 70, len: 0.30 },
  },
  mid: {
    drv: { dia: 10, n: 1, sd: 349, fs: 70, qts: 0.35, vas: 28, xmax: 5, sens: 96, pe: 250 },
    box: { type: "sealed", W: 0.42, H: 0.42, D: 0.34, brace: 6, ql: 10, space: "half" },
    port: { shape: "round", n: 1, dia: 80, pw: 200, ph: 50, len: 0.15 },
    horn: { throat: 210, ctrl: 650, h: 90, v: 60, profile: "conical" },
  },
  hf: {
    drv: { dia: 1.75, n: 1, sd: 15, fs: 600, qts: 0.9, vas: 0.1, xmax: 0.5, sens: 110, pe: 60 },
    box: { type: "sealed", W: 0.30, H: 0.44, D: 0.28, brace: 0, ql: 10, space: "half" },
    horn: { throat: 25.4, ctrl: 1400, h: 60, v: 40, profile: "os" },
  },
};

export default function SoundsystemDesigner() {
  const [tab, setTab] = useState("room");

  const [room, setRoom] = useState({ L: 7, W: 5, H: 2.9, floor: "Sealed concrete", treatWalls: 100, treatCeil: 80, spkFromFront: 0.0, spkFromSide: 0.9, lp: 3.6, toeIn: 20 });

  const [env, setEnv] = useState({
    skinT: 0.003, skinSigma: 6000,
    wool: [
      { t: 0.05, rho: 40, sigma: 12000 },
      { t: 0.10, rho: 100, sigma: 38000 },
      { t: 0.10, rho: 140, sigma: 55000 },
    ],
    plyT: 0.01, plyRho: 600,
    gap: 1.2, gapFill: 0, gapFillSigma: 9000,
  });

  const [spk, setSpk] = useState(INIT_SPK);
  const [way, setWay] = useState("sub");

  const [sys, setSys] = useState({ stacks: "pair", x1: 32, x2: 90, x3: 340, x4: 1700, target: 112 });

  const [iso, setIso] = useState({ inRoom: 105, shape: "Club", wallLen: 7, lining: 0, flank: 50 });

  /* ---------- room ---------- */
  const V = room.L * room.W * room.H;
  const Sfloor = room.L * room.W;
  const Swall = 2 * (room.L + room.W) * room.H;

  const freqs = useMemo(() => logSpace(20, 16000, 90), []);
  const absCurve = useMemo(() => absorptionCurve(env, freqs), [env, freqs]);

  const rtCurve = useMemo(() => absCurve.map(({ f, random }) => {
    const At = (Swall * room.treatWalls / 100 + Sfloor * room.treatCeil / 100) * random;
    const Au = (Swall * (1 - room.treatWalls / 100) + Sfloor * (1 - room.treatCeil / 100)) * 0.06;
    const Af = Sfloor * floorAlpha(room.floor, f);
    const Stot = Swall + 2 * Sfloor;
    const abar = Math.min(0.97, (At + Au + Af) / Stot);
    return {
      f,
      eyring: (0.161 * V) / (-Stot * Math.log(1 - abar) + 4 * airM(f) * V),
      sabine: (0.161 * V) / (Stot * abar + 4 * airM(f) * V),
    };
  }), [absCurve, room, V, Swall, Sfloor]);

  const rtMid = useMemo(() => {
    const b = rtCurve.filter((d) => d.f >= 400 && d.f <= 1600);
    return b.reduce((s, d) => s + d.eyring, 0) / (b.length || 1);
  }, [rtCurve]);
  const schroeder = 2000 * Math.sqrt(rtMid / V);

  const modes = useMemo(() => {
    const out = [];
    for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let c = 0; c <= 6; c++) {
      if (!a && !b && !c) continue;
      const f = (C / 2) * Math.hypot(a / room.L, b / room.W, c / room.H);
      if (f > 250) continue;
      const o = [a, b, c].filter(Boolean).length;
      out.push({ f, a, b, c, type: o === 1 ? "axial" : o === 2 ? "tangential" : "oblique" });
    }
    return out.sort((x, y) => x.f - y.f);
  }, [room]);

  const modeSpacing = useMemo(() => {
    const ax = modes.filter((m) => m.type === "axial" && m.f < 160);
    const g = [];
    for (let i = 1; i < ax.length; i++) g.push(ax[i].f - ax[i - 1].f);
    return { list: ax, max: Math.max(...g, 0) };
  }, [modes]);

  const sbir = {
    front: room.spkFromFront > 0.02 ? C / (4 * room.spkFromFront) : null,
    side: C / (4 * room.spkFromSide),
  };
  // straight-line path from one stack to the listener — "lp" is the axial distance
  const listenDist = Math.hypot(room.lp, room.W / 2 - room.spkFromSide);

  /* ---------- speaker ---------- */
  const boxes = useMemo(() => ({
    sub: boxCalc(spk.sub), low: boxCalc(spk.low), mid: boxCalc(spk.mid),
  }), [spk]);

  const hornCalc = (h) => {
    const Wm = mouthDim(h.ctrl, h.h), Hm = mouthDim(h.ctrl, h.v);
    const Sm = Wm * Hm, tM = h.throat / 1000;
    const St = Math.PI * Math.pow(tM / 2, 2);
    const Lcon = (Wm / 2 - tM / 2) / Math.tan((h.h * Math.PI) / 180 / 2);
    const m = (4 * Math.PI * h.ctrl * 0.55) / C;
    const Lexp = Math.log(Sm / St) / m;
    const L = h.profile === "conical" ? Lcon : h.profile === "exp" ? Lexp : Lcon * 0.8 + Lexp * 0.2;
    const Q = hornQ(h.h, h.v);
    return { Wm, Hm, Sm, St, L, fLoad: C / (2 * Math.sqrt(Math.PI * Sm)), Q, DI: 10 * Math.log10(Q), gain: 10 * Math.log10(Q / 2) };
  };
  const hfH = hornCalc(spk.hf.horn);
  const midH = hornCalc(spk.mid.horn);

  const waySpan = { sub: [sys.x1, sys.x2], low: [sys.x2, sys.x3], mid: [sys.x3, sys.x4], hf: [sys.x4, 19000] };

  const wayCurve = useMemo(() => {
    const sec = spk[way];
    const [lo, hi] = waySpan[way];
    const fs = logSpace(Math.max(lo / 4, 12), Math.min(hi * 4, 24000), 140);
    if (way === "hf") {
      const g = hfH.gain;
      return fs.map((f) => ({
        f,
        spl: sec.drv.sens + 10 * Math.log10(sec.drv.pe) + hp(f, Math.max(sec.drv.fs, hfH.fLoad), 2) + lp(f, 16000, 2),
        xc: null, vp: null,
        band: f >= lo && f <= hi ? 1 : 0, gain: g,
      }));
    }
    const hornGain = SPEC[way].horn ? midH.gain : 0;
    const hornHP = SPEC[way].horn ? midH.fLoad : 0;
    return fs.map((f) => {
      const r = alignResponse(sec, f);
      return {
        f,
        spl: r.spl + SPACE_GAIN[sec.box.space] + hornGain + (hornHP ? hp(f, hornHP, 3) : 0),
        xc: r.xc, vp: r.vp, band: f >= lo && f <= hi ? 1 : 0,
      };
    });
  }, [spk, way, sys, hfH, midH]);

  const wayLimits = useMemo(() => {
    const sec = spk[way];
    const [lo, hi] = waySpan[way];
    const inBand = wayCurve.filter((d) => d.f >= lo * 0.9 && d.f <= hi * 1.1);
    if (way === "hf" || !inBand.length) return null;
    const xPeak = Math.max(...inBand.map((d) => d.xc));
    const vPeak = Math.max(...inBand.map((d) => d.vp));
    const fx = inBand.reduce((a, b) => (b.xc > a.xc ? b : a));
    const ratio = xPeak / sec.drv.xmax;
    const pLim = sec.drv.pe / Math.max(ratio * ratio, 1e-6);
    return { xPeak, vPeak, fx: fx.f, pLim: Math.min(pLim, sec.drv.pe), vAtLim: vPeak * Math.sqrt(Math.min(pLim, sec.drv.pe) / sec.drv.pe) };
  }, [wayCurve, spk, way, sys]);

  /* ---------- whole system ---------- */
  const splCurve = useMemo(() => {
    const gs = sys.stacks === "pair" ? 6 : 0;
    const dist = -20 * Math.log10(Math.max(listenDist, 1));
    const band = (key, lo, hi) => (f) => {
      const sec = spk[key];
      let base;
      if (key === "hf") {
        base = sec.drv.sens + 10 * Math.log10(sec.drv.pe) + hp(f, Math.max(sec.drv.fs, hfH.fLoad), 2) + lp(f, 16000, 2);
      } else {
        const r = alignResponse(sec, f);
        const hg = SPEC[key].horn ? midH.gain : 0;
        const hh = SPEC[key].horn ? hp(f, midH.fLoad, 3) : 0;
        const Vd = sec.drv.n * (sec.drv.sd / 1e4) * (sec.drv.xmax / 1000);
        const exc = splDisp(f, Vd) + SPACE_GAIN[sec.box.space] + hg;
        const relief = sec.box.type === "reflex" && boxes[key].fb
          ? 8 * Math.exp(-Math.pow(Math.log(f / boxes[key].fb) / 0.3, 2)) : 0;
        base = Math.min(r.spl + SPACE_GAIN[sec.box.space] + hg + hh, exc + relief);
      }
      return base + hp(f, lo, 4) + (hi < 19000 ? lp(f, hi, 4) : 0) + gs + dist;
    };
    const fns = [band("sub", sys.x1, sys.x2), band("low", sys.x2, sys.x3), band("mid", sys.x3, sys.x4), band("hf", sys.x4, 19000)];
    return logSpace(18, 19000, 130).map((f) => {
      const p = fns.map((fn) => fn(f));
      return { f, sub: p[0], low: p[1], mid: p[2], hf: p[3], total: 10 * Math.log10(p.reduce((s, v) => s + Math.pow(10, v / 10), 0)) };
    });
  }, [spk, sys, listenDist, boxes, hfH, midH]);

  const splAt = (hz) => splCurve.reduce((b, d) => (Math.abs(Math.log(d.f / hz)) < Math.abs(Math.log(b.f / hz)) ? d : b)).total;
  const worstInBand = useMemo(() =>
    splCurve.filter((d) => d.f >= 40 && d.f <= 12000).reduce((m, d) => Math.min(m, d.total), 999), [splCurve]);

  const dirCurve = useMemo(() => {
    const beam = (f, W, nom) => {
      const s = (0.6 * (C / f)) / W;
      return s >= 1 ? 180 : Math.max(nom, (2 * Math.asin(s) * 180) / Math.PI);
    };
    return logSpace(100, 18000, 90).map((f) => {
      const [Wc, Hc, nh, nv] = f < sys.x4
        ? [midH.Wm, midH.Hm, spk.mid.horn.h, spk.mid.horn.v]
        : [hfH.Wm, hfH.Hm, spk.hf.horn.h, spk.hf.horn.v];
      const h = Math.min(beam(f, Wc, nh), 180), v = Math.min(beam(f, Hc, nv), 180);
      return { f, h, v, di: 10 * Math.log10(hornQ(h, v)) };
    });
  }, [midH, hfH, spk, sys.x4]);

  const Dc = 0.0566 * Math.sqrt(hfH.Q * V / Math.max(rtMid, 0.05));

  /* ---------- isolation ---------- */
  const plenum = useMemo(() => {
    const gapW = env.gap > 0.05 ? env.gap : 0.05;
    const S = iso.wallLen * room.H;
    const surf = {
      ply: [S, 0.10], brick: [S, 0.04 + (iso.lining / 100) * 0.72],
      floor: [iso.wallLen * gapW, 0.05], ceil: [iso.wallLen * gapW, 0.05 + (iso.lining / 100) * 0.55],
      ends: [2 * gapW * room.H, 0.05 + (iso.lining / 100) * 0.70],
    };
    const A = Object.values(surf).reduce((s, [a, al]) => s + a * al, 0);
    const corr = 10 * Math.log10(S / Math.max(A, 0.5));
    const base = SHAPES[iso.shape];
    const raw = Object.fromEntries(OCT.map((f) => [f, base[f]]));
    const offs = iso.inRoom - weighted(raw, A_WT);
    const roomSpec = Object.fromEntries(OCT.map((f) => [f, raw[f] + offs]));
    const rows = OCT.map((f) => {
      const tlAir = leafTL(f, env);
      const tl = compositeTL(tlAir, iso.flank);
      return { f, room: roomSpec[f], tlAir: Math.min(tlAir, 130), tl, gap: roomSpec[f] - tl + corr };
    });
    const gapSpec = Object.fromEntries(rows.map((r) => [r.f, r.gap]));
    const m = env.plyT * env.plyRho;
    return {
      rows, corr, A, S, gapW,
      roomA: weighted(roomSpec, A_WT), roomC: weighted(roomSpec, C_WT),
      gapA: weighted(gapSpec, A_WT), gapC: weighted(gapSpec, C_WT),
      crossMode: C / (2 * gapW),
      mam: (env.gapFill > 25 ? 60 : 80) / Math.sqrt(Math.max(m * env.gap, 1e-3)),
    };
  }, [env, iso, room.H]);

  /* ---------- setters ---------- */
  const setWool = (i, k, v) => setEnv((e) => ({ ...e, wool: e.wool.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const setPart = (w, part, k, v) => setSpk((s) => ({ ...s, [w]: { ...s[w], [part]: { ...s[w][part], [k]: v } } }));

  const sec = spk[way];

  return (
    <div style={{ background: T.panel, minHeight: "100vh", color: T.ink, fontFamily: disp }}>
      <style>{FONTS}</style>
      <style>{`
        input[type=range]{ -webkit-appearance:none; background:${T.rule}; border-radius:2px; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:13px;height:13px;border-radius:50%;background:${T.ink};cursor:pointer; }
        input[type=range]::-moz-range-thumb{ width:13px;height:13px;border-radius:50%;background:${T.ink};border:none;cursor:pointer; }
        *:focus-visible{ outline:2px solid ${T.violet}; outline-offset:2px; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none!important; } }
      `}</style>

      <div style={{ borderBottom: `1px solid ${T.rule}`, background: T.paper, padding: "16px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ font: `600 9.5px ${mono}`, letterSpacing: ".22em", textTransform: "uppercase", color: T.ink2, marginBottom: 5 }}>
              Room + system design instrument
            </div>
            <div style={{ font: `700 27px ${disp}`, letterSpacing: "-.02em", lineHeight: 1 }}>
              {room.W}<span style={{ color: T.ink2 }}>×</span>{room.L}<span style={{ color: T.ink2 }}>×</span>{room.H} m
              <span style={{ font: `400 13px ${mono}`, color: T.ink2, marginLeft: 12 }}>{V.toFixed(1)} m³ · two-point 4-way</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, font: `400 11px ${mono}`, color: T.ink2 }}>
            <span>RT<sub>mid</sub> <b style={{ color: T.olive, fontSize: 14 }}>{rtMid.toFixed(2)}s</b></span>
            <span>f<sub>S</sub> <b style={{ color: T.slate, fontSize: 14 }}>{schroeder.toFixed(0)} Hz</b></span>
            <span>SPL<sub>40Hz</sub> <b style={{ color: T.violet, fontSize: 14 }}>{splAt(40).toFixed(0)} dB</b></span>
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", borderBottom: `2px solid ${T.ink}`, maxWidth: 700, flexWrap: "wrap" }}>
          {[["room", "Room"], ["envelope", "Envelope"], ["speaker", "Speaker"], ["system", "System"], ["isolation", "Isolation"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                padding: "9px 18px", border: "none", cursor: "pointer",
                background: tab === k ? T.ink : "transparent", color: tab === k ? T.paper : T.ink2,
                font: `700 11px ${mono}`, letterSpacing: ".14em", textTransform: "uppercase",
              }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 300px) 1fr" }}>
        <div style={{ padding: "18px 18px 60px", borderRight: `1px solid ${T.rule}`, background: T.panel }}>
          {tab === "room" && (
            <>
              <SectionLabel>Dimensions</SectionLabel>
              <Slider label="Length" unit="m" value={room.L} min={4} max={12} step={0.1} onChange={(v) => setRoom({ ...room, L: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Width" unit="m" value={room.W} min={3} max={9} step={0.1} onChange={(v) => setRoom({ ...room, W: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Height" unit="m" value={room.H} min={2.2} max={5} step={0.05} onChange={(v) => setRoom({ ...room, H: v })} fmt={(v) => v.toFixed(2)} />
              <SectionLabel>Surfaces</SectionLabel>
              <Field label="Floor"><Seg small options={Object.keys(FLOORS).map((k) => ({ v: k, l: k.split(" ")[0] }))} value={room.floor} onChange={(v) => setRoom({ ...room, floor: v })} /></Field>
              <Slider label="Walls treated" unit="%" value={room.treatWalls} min={0} max={100} step={5} onChange={(v) => setRoom({ ...room, treatWalls: v })} />
              <Slider label="Ceiling treated" unit="%" value={room.treatCeil} min={0} max={100} step={5} onChange={(v) => setRoom({ ...room, treatCeil: v })} />
              <SectionLabel>Placement</SectionLabel>
              <Slider label="Baffle off front wall" unit="m" value={room.spkFromFront} min={0} max={2} step={0.05} onChange={(v) => setRoom({ ...room, spkFromFront: v })} fmt={(v) => v.toFixed(2)} hint={room.spkFromFront < 0.05 ? "flush / soffit — no SBIR notch" : `SBIR notch ${sbir.front.toFixed(0)} Hz`} />
              <Slider label="Stack off side wall" unit="m" value={room.spkFromSide} min={0.2} max={2.4} step={0.05} onChange={(v) => setRoom({ ...room, spkFromSide: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label="Listener from baffle" unit="m" value={room.lp} min={1.5} max={6.5} step={0.1} onChange={(v) => setRoom({ ...room, lp: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Toe-in" unit="°" value={room.toeIn} min={0} max={40} onChange={(v) => setRoom({ ...room, toeIn: v })}
                hint={`aim straight at the listener = ${(Math.atan2(room.W / 2 - room.spkFromSide, room.lp) * 180 / Math.PI).toFixed(0)}°`} />
            </>
          )}

          {tab === "envelope" && (
            <>
              <SectionLabel>Acoustic skin</SectionLabel>
              <Slider label="Thickness" unit="mm" value={env.skinT * 1000} min={0} max={20} step={1} onChange={(v) => setEnv({ ...env, skinT: v / 1000 })} />
              <Slider label="Flow resistivity" unit="Pa·s/m²" value={env.skinSigma} min={1000} max={40000} step={500} onChange={(v) => setEnv({ ...env, skinSigma: v })} fmt={(v) => (v / 1000).toFixed(1) + "k"} />
              <SectionLabel>Rockwool layers</SectionLabel>
              {env.wool.map((l, i) => (
                <div key={i} style={{ marginBottom: 14, paddingLeft: 10, borderLeft: `3px solid ${["#B9B45E", "#8F8B3A", "#66631F"][i]}` }}>
                  <div style={{ font: `700 10px ${mono}`, letterSpacing: ".1em", marginBottom: 6 }}>L{i + 1} · {l.rho} kg/m³</div>
                  <Slider label="Thickness" unit="cm" value={l.t * 100} min={0} max={30} step={1} onChange={(v) => setWool(i, "t", v / 100)} />
                  <Slider label="Density" unit="kg/m³" value={l.rho} min={30} max={200} step={5} onChange={(v) => { setWool(i, "rho", v); setWool(i, "sigma", Math.round(65 * Math.pow(v, 1.5) / 100) * 100); }} />
                  <Slider label="σ" unit="Pa·s/m²" value={l.sigma} min={5000} max={90000} step={1000} onChange={(v) => setWool(i, "sigma", v)} fmt={(v) => (v / 1000).toFixed(0) + "k"} />
                </div>
              ))}
              <SectionLabel>Backing</SectionLabel>
              <Slider label="Plywood" unit="mm" value={env.plyT * 1000} min={0} max={30} step={1} onChange={(v) => setEnv({ ...env, plyT: v / 1000 })} hint={env.plyT > 0 ? `membrane f₀ ≈ ${(60 / Math.sqrt(env.plyT * env.plyRho * Math.max(env.gap, .01))).toFixed(0)} Hz` : "omitted"} />
              <Slider label="Air gap" unit="m" value={env.gap} min={0} max={2} step={0.05} onChange={(v) => setEnv({ ...env, gap: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label="Gap fill" unit="%" value={env.gapFill} min={0} max={100} step={5} onChange={(v) => setEnv({ ...env, gapFill: v })} hint="loose wool in the cavity damps the membrane" />
            </>
          )}

          {tab === "speaker" && <SpeakerRail {...{ way, sec, spk, setPart, setSpk, boxes }} />}

          {tab === "system" && (
            <>
              <SectionLabel>Topology</SectionLabel>
              <Field label="Summation"><Seg options={[{ v: "pair", l: "Both stacks" }, { v: "single", l: "One stack" }]} value={sys.stacks} onChange={(v) => setSys({ ...sys, stacks: v })} /></Field>
              <Slider label="Target SPL @ listener" unit="dB" value={sys.target} min={95} max={125} onChange={(v) => setSys({ ...sys, target: v })} />
              <SectionLabel>Crossover</SectionLabel>
              <Slider label="Sub high-pass" unit="Hz" value={sys.x1} min={18} max={45} onChange={(v) => setSys({ ...sys, x1: v })} />
              <Slider label="Sub → Low" unit="Hz" value={sys.x2} min={50} max={160} onChange={(v) => setSys({ ...sys, x2: v })} />
              <Slider label="Low → Mid" unit="Hz" value={sys.x3} min={150} max={800} step={10} onChange={(v) => setSys({ ...sys, x3: v })} />
              <Slider label="Mid → Tweeter" unit="Hz" value={sys.x4} min={900} max={3500} step={50} onChange={(v) => setSys({ ...sys, x4: v })} />
              <SectionLabel>Sections</SectionLabel>
              <div style={{ font: `400 11px ${mono}`, color: T.ink2, lineHeight: 1.7 }}>
                {["sub", "low", "mid", "hf"].map((k) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.rule}`, padding: "4px 0" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: SPEC[k].col, marginRight: 6 }} />{SPEC[k].name}</span>
                    <span style={{ color: T.ink }}>{spk[k].drv.n} × {k === "hf" ? "CD" : `${spk[k].drv.dia}"`}</span>
                  </div>
                ))}
              </div>
              <Note tone={T.ink2}>Driver and enclosure parameters live on the Speaker tab. Everything here reads from them.</Note>
            </>
          )}

          {tab === "isolation" && (
            <>
              <SectionLabel>Source in the room</SectionLabel>
              <Field label="Programme"><Seg options={Object.keys(SHAPES)} value={iso.shape} onChange={(v) => setIso({ ...iso, shape: v })} /></Field>
              <Slider label="Level in room" unit="dB(A)" value={iso.inRoom} min={70} max={115} onChange={(v) => setIso({ ...iso, inRoom: v })} />
              <SectionLabel>Plenum</SectionLabel>
              <Slider label="Wall length" unit="m" value={iso.wallLen} min={2} max={14} step={0.5} onChange={(v) => setIso({ ...iso, wallLen: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Outer face lined" unit="%" value={iso.lining} min={0} max={100} step={5} onChange={(v) => setIso({ ...iso, lining: v })} hint="50 mm wool on brick, ends and soffit" />
              <Slider label="Flanking limit" unit="dB" value={iso.flank} min={30} max={70} onChange={(v) => setIso({ ...iso, flank: v })} hint="slab, soffit, doors, conduit" />
              <Note tone={T.ink2}>Leaf build-up comes from the Envelope tab.</Note>
            </>
          )}
        </div>

        <div style={{ padding: "18px 22px 80px", minWidth: 0 }}>
          {tab === "room" && <RoomTab {...{ room, modes, modeSpacing, rtCurve, rtMid, schroeder, V, sbir, Dc, midHorn: spk.mid.horn, hfHorn: spk.hf.horn, listenDist }} />}
          {tab === "envelope" && <EnvelopeTab {...{ env, absCurve, rtCurve, rtMid }} />}
          {tab === "speaker" && <SpeakerTab {...{ way, setWay, spk, sec, boxes, wayCurve, wayLimits, waySpan, hfH, midH, hornCalc, dirCurve, sys, Dc }} />}
          {tab === "system" && <SystemTab {...{ sys, spk, boxes, splCurve, splAt, worstInBand, room, listenDist }} />}
          {tab === "isolation" && <IsolationTab {...{ plenum, iso, env, room }} />}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ font: `700 9.5px ${mono}`, letterSpacing: ".2em", textTransform: "uppercase", color: T.ink, borderBottom: `2px solid ${T.ink}`, paddingBottom: 5, margin: "22px 0 12px" }}>
      {children}
    </div>
  );
}

/* ============================================================
   ROOM TAB
   ============================================================ */
function RoomTab({ room, modes, modeSpacing, rtCurve, rtMid, schroeder, V, sbir, Dc, midHorn, hfHorn, listenDist }) {
  const modeData = modes.filter((m) => m.f <= 200);
  const rtPlot = rtCurve.filter((d) => d.f >= 40 && d.f <= 12000);

  // plan-view geometry
  const PW = 620, scale = PW / room.W, PH = room.L * scale;
  const sx1 = room.spkFromSide * scale, sx2 = (room.W - room.spkFromSide) * scale;
  const sy = room.spkFromFront * scale + 10;
  const ly = sy + room.lp * scale;
  const lx = PW / 2;
  const covMid = (midHorn.h * Math.PI) / 180 / 2;
  const covHf = (hfHorn.h * Math.PI) / 180 / 2;
  const toe = (room.toeIn * Math.PI) / 180;
  // one sign convention for everything: -1 = left stack, +1 = right stack.
  // In SVG (y down) a positive rotate() is clockwise, so the left stack needs
  // a negative angle to swing its baffle normal toward the centreline.
  const STACKS = [{ x: sx1, s: -1 }, { x: sx2, s: +1 }];

  // aim geometry. Positive toe rotates each stack toward the centreline.
  const halfBase = room.W / 2 - room.spkFromSide;
  const reqToe = (Math.atan2(halfBase, room.lp) * 180) / Math.PI;   // axes meet exactly at the LP
  const crossDist = room.toeIn > 0.4 ? halfBase / Math.tan(toe) : Infinity;
  const offAxis = reqToe - room.toeIn;                              // + = listener outside the axis

  // sign: -1 for the left stack, +1 for the right, so both rotate inwards
  const aimAngle = (sign) => Math.PI / 2 + sign * toe;   // sign matches STACKS
  const beamPath = (x, sign, cov) => {
    const R = room.L * scale * 1.6;
    const a0 = aimAngle(sign), a1 = a0 - cov, a2 = a0 + cov;
    return `M ${x} ${sy} L ${x + R * Math.cos(a1)} ${sy + R * Math.sin(a1)} L ${x + R * Math.cos(a2)} ${sy + R * Math.sin(a2)} Z`;
  };
  const axisEnd = (x, sign) => {
    const R = room.L * scale * 1.6, a0 = aimAngle(sign);
    return [x + R * Math.cos(a0), sy + R * Math.sin(a0)];
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, marginBottom: 18 }}>
        <Stat k="Volume" v={V.toFixed(1)} u="m³" />
        <Stat k="Schroeder" v={schroeder.toFixed(0)} u="Hz" tone={T.slate} />
        <Stat k="RT₆₀ mid" v={rtMid.toFixed(2)} u="s" tone={T.olive} />
        <Stat k="Critical dist." v={Dc.toFixed(1)} u="m" tone={T.violet} />
        <Stat k="Widest axial gap" v={modeSpacing.max.toFixed(1)} u="Hz" tone={modeSpacing.max > 22 ? T.red : T.ink} />
      </div>

      <Card title="Plan" note={`filled cone = ${midHorn.h}° mid horn · dashed = ${hfHorn.h}° tweeter · dotted = first side reflections`}>
        <svg viewBox={`0 0 ${PW + 20} ${PH + 40}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <pattern id="wool" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="7" stroke={T.olive} strokeWidth="2.4" opacity=".5" />
            </pattern>
            <clipPath id="roomclip"><rect x="10" y="10" width={PW} height={PH} /></clipPath>
          </defs>
          {/* envelope */}
          <rect x="0" y="0" width={PW + 20} height={PH + 30} fill="url(#wool)" opacity=".55" />
          <rect x="10" y="10" width={PW} height={PH} fill={T.paper} stroke={T.ink} strokeWidth="1.5" />
          {/* coverage + aim axes, clipped to the room */}
          <g clipPath="url(#roomclip)">
            <g opacity=".16">
              {STACKS.map((st, i) => <path key={i} d={beamPath(10 + st.x, st.s, covMid)} fill={T.violet} />)}
            </g>
            {STACKS.map((st, i) => (
              <path key={`h${i}`} d={beamPath(10 + st.x, st.s, covHf)} fill="none" stroke={T.red} strokeWidth="1" strokeDasharray="5 4" opacity=".75" />
            ))}
            {STACKS.map((st, i) => {
              const [ex, ey] = axisEnd(10 + st.x, st.s);
              return <line key={`a${i}`} x1={10 + st.x} y1={sy} x2={ex} y2={ey} stroke={T.violet} strokeWidth="1.4" strokeDasharray="7 4" />;
            })}
          </g>
          {/* where the axes cross */}
          {isFinite(crossDist) && crossDist * scale < PH * 1.02 && (
            <g>
              <circle cx={lx} cy={sy + crossDist * scale} r="4" fill="none" stroke={T.violet} strokeWidth="1.6" />
              <text x={lx + 9} y={sy + crossDist * scale - 6} style={{ font: `600 9px ${mono}`, fill: T.violet }}>
                axes cross {crossDist.toFixed(1)} m
              </text>
            </g>
          )}
          {/* mirror reflection points on side walls */}
          {[[10, 10 + sx1, 1], [10 + PW, 10 + sx2, -1]].map(([wall, spk, s], i) => {
            const t = Math.abs(wall - spk) / (Math.abs(wall - spk) + Math.abs(wall - lx));
            const ry = sy + t * (ly - sy);
            return <g key={i}>
              <line x1={spk} y1={sy} x2={wall} y2={ry} stroke={T.slate} strokeWidth="1" strokeDasharray="3 3" />
              <line x1={wall} y1={ry} x2={lx} y2={ly} stroke={T.slate} strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={wall} cy={ry} r="5" fill={T.slate} />
            </g>;
          })}
          {/* direct */}
          <line x1={10 + sx1} y1={sy} x2={lx} y2={ly} stroke={T.ink} strokeWidth="1.2" />
          <line x1={10 + sx2} y1={sy} x2={lx} y2={ly} stroke={T.ink} strokeWidth="1.2" />
          {/* stacks — baffles rotate toward the centreline */}
          {STACKS.map((st, i) => (
            <g key={i} transform={`translate(${10 + st.x} ${sy}) rotate(${st.s * room.toeIn})`}>
              <rect x="-32" y="-14" width="64" height="28" fill={T.ink} />
              <rect x="-22" y="-9" width="44" height="8" fill={T.violet} />
            </g>
          ))}
          {/* listener */}
          <circle cx={lx} cy={ly} r="9" fill="none" stroke={T.ink} strokeWidth="2" />
          <circle cx={lx} cy={ly} r="2.5" fill={T.ink} />
          {/* dims */}
          <text x={PW / 2 + 10} y={PH + 26} textAnchor="middle" style={{ font: `600 11px ${mono}`, fill: T.ink2 }}>{room.W.toFixed(1)} m</text>
          <text x={PW + 16} y={PH / 2} textAnchor="middle" transform={`rotate(90 ${PW + 16} ${PH / 2})`} style={{ font: `600 11px ${mono}`, fill: T.ink2 }}>{room.L.toFixed(1)} m</text>
          <text x={lx + 14} y={ly + 4} style={{ font: `600 10px ${mono}`, fill: T.ink }}>LP {room.lp.toFixed(1)} m</text>
        </svg>
        <div style={{ marginTop: 12, display: "flex", gap: 22, flexWrap: "wrap", font: `400 11px ${mono}`, color: T.ink2 }}>
          <span>toe-in <b style={{ color: T.violet }}>{room.toeIn}°</b> · aim-at-LP would be <b style={{ color: T.ink }}>{reqToe.toFixed(0)}°</b></span>
          <span>listener <b style={{ color: Math.abs(offAxis) > 15 ? T.amber : T.ink }}>{Math.abs(offAxis).toFixed(0)}° {offAxis >= 0 ? "outside" : "inside"}</b> the axis</span>
          <span>included angle <b style={{ color: T.ink }}>{(2 * reqToe).toFixed(0)}°</b></span>
          <span>path length <b style={{ color: T.ink }}>{listenDist.toFixed(2)} m</b></span>
          <span>side SBIR <b style={{ color: T.ink }}>{sbir.side.toFixed(0)} Hz</b></span>
          <span>front <b style={{ color: sbir.front ? T.red : T.olive }}>{sbir.front ? `${sbir.front.toFixed(0)} Hz notch` : "flush — none"}</b></span>
        </div>
        <Note tone={offAxis > 12 || offAxis < -6 ? T.amber : T.olive}>
          {offAxis > 12
            ? `The axes cross ${isFinite(crossDist) ? `${crossDist.toFixed(1)} m out` : "at infinity"} — you sit ${offAxis.toFixed(0)}° off-axis on both stacks, which pulls the top end down and blurs the centre. Add toe-in.`
            : offAxis < -6
              ? `The axes cross ${crossDist.toFixed(1)} m, in front of the listener. The image will feel narrow and collapse into the near speaker as soon as you move sideways. Back the toe-in off.`
              : `Axes cross ${isFinite(crossDist) ? `${crossDist.toFixed(1)} m out` : "at infinity"}${offAxis > 1 ? `, ${(crossDist - room.lp).toFixed(1)} m behind the listener` : ""} — the useful compromise. Move off-centre and you gain on-axis energy from the far stack as you lose it from the near one, so the image holds instead of snapping sideways.`}
        </Note>
      </Card>

      <Card title="Modal distribution" note="axial modes carry the audible peaks · gaps > 20 Hz below 150 Hz leave holes">
        <svg viewBox="0 0 900 190" style={{ width: "100%", height: "auto" }}>
          {[20, 30, 40, 60, 80, 100, 150, 200].map((f) => {
            const x = 40 + (Math.log(f / 18) / Math.log(200 / 18)) * 840;
            return <g key={f}>
              <line x1={x} y1="20" x2={x} y2="150" stroke={T.rule} strokeWidth="1" />
              <text x={x} y="168" textAnchor="middle" style={{ font: `400 10px ${mono}`, fill: T.ink2 }}>{f}</text>
            </g>;
          })}
          {modeData.map((m, i) => {
            const x = 40 + (Math.log(Math.max(m.f, 18) / 18) / Math.log(200 / 18)) * 840;
            const h = m.type === "axial" ? 110 : m.type === "tangential" ? 62 : 32;
            const col = m.type === "axial" ? T.ink : m.type === "tangential" ? T.slate : T.rule;
            return <line key={i} x1={x} y1="150" x2={x} y2={150 - h} stroke={col} strokeWidth={m.type === "axial" ? 2.4 : 1.4} />;
          })}
          <line x1="40" y1="150" x2="880" y2="150" stroke={T.ink} strokeWidth="1.5" />
          <text x="40" y="184" style={{ font: `600 10px ${mono}`, fill: T.ink2 }}>Hz</text>
        </svg>
        <div style={{ display: "flex", gap: 20, marginTop: 6, font: `400 10.5px ${mono}`, color: T.ink2 }}>
          <Legendo c={T.ink} l="axial" /><Legendo c={T.slate} l="tangential" /><Legendo c={T.rule} l="oblique" />
          <span style={{ marginLeft: "auto" }}>{modes.filter(m => m.f < 200).length} modes below 200 Hz</span>
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
          {modeSpacing.list.slice(0, 12).map((m, i) => (
            <span key={i} style={{ font: `600 10px ${mono}`, padding: "3px 7px", background: T.panel, border: `1px solid ${T.rule}` }}>
              {m.f.toFixed(1)}<span style={{ color: T.ink2, marginLeft: 5 }}>{m.a}{m.b}{m.c}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card title="Reverberation time" note="Eyring, with air absorption · target band shaded">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rtPlot} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <ReferenceArea y1={0.28} y2={0.45} fill={T.olive} fillOpacity={0.10} />
            <XAxis dataKey="f" scale="log" type="number" domain={[40, 12000]} ticks={OCT_TICKS.filter(t => t >= 40)} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[0, "auto"]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} label={{ value: "s", angle: 0, position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(2)} s`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
            <ReferenceLine x={schroeder} stroke={T.violet} strokeDasharray="4 3" label={{ value: "fS", fill: T.violet, fontSize: 10 }} />
            <Line type="monotone" dataKey="eyring" stroke={T.olive} strokeWidth={2.4} dot={false} name="Eyring" />
            <Line type="monotone" dataKey="sabine" stroke={T.ink2} strokeWidth={1} strokeDasharray="4 3" dot={false} name="Sabine" />
          </LineChart>
        </ResponsiveContainer>
        <Note tone={rtMid < 0.25 ? T.red : rtMid > 0.55 ? T.amber : T.olive}>
          {rtMid < 0.25
            ? `RT ${rtMid.toFixed(2)} s is drier than a mastering room. Great for the dancefloor, but hi-fi listening loses envelopment. Pull ceiling treatment back or hard-face part of the rear wall as a diffuser.`
            : rtMid > 0.55
              ? `RT ${rtMid.toFixed(2)} s is long for this volume — the club use case will smear at high level. Add treated area.`
              : `RT ${rtMid.toFixed(2)} s sits in the useful window for a dual-purpose room.`}
        </Note>
      </Card>
    </>
  );
}

const Legendo = ({ c, l }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <span style={{ width: 14, height: 3, background: c, display: "inline-block" }} />{l}
  </span>
);
const Note = ({ children, tone }) => (
  <div style={{ marginTop: 12, paddingLeft: 10, borderLeft: `3px solid ${tone || T.ink2}`, font: `400 12px ${disp}`, lineHeight: 1.5, color: T.ink2 }}>{children}</div>
);


/* ============================================================
   ENVELOPE TAB
   ============================================================ */
function EnvelopeTab({ env, absCurve, rtCurve, rtMid }) {
  const total = env.skinT + env.wool.reduce((s, l) => s + l.t, 0) + env.plyT;
  // Section drawing, scaled
  const layers = [
    { t: env.skinT, fill: "#3A3A3A", label: "skin" },
    ...env.wool.map((l, i) => ({ t: l.t, fill: ["#B9B45E", "#8F8B3A", "#66631F"][i], label: `${l.rho}` })),
    { t: env.plyT, fill: "#D8C08A", label: "ply" },
    { t: env.gap, fill: T.paper, label: "gap", hatch: true },
    { t: 0.10, fill: "#9A9A96", label: "brick" },
  ].filter((l) => l.t > 0);
  const depth = layers.reduce((s, l) => s + l.t, 0);
  const SW = 880, PX = SW / depth;

  const a500 = absCurve.reduce((b, d) => (Math.abs(d.f - 500) < Math.abs(b.f - 500) ? d : b));
  const a125 = absCurve.reduce((b, d) => (Math.abs(d.f - 125) < Math.abs(b.f - 125) ? d : b));
  const a63 = absCurve.reduce((b, d) => (Math.abs(d.f - 63) < Math.abs(b.f - 63) ? d : b));
  const membrane = env.plyT > 0 && env.gap > 0 ? 60 / Math.sqrt(env.plyT * env.plyRho * env.gap) : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, marginBottom: 18 }}>
        <Stat k="Absorber depth" v={(total * 100).toFixed(1)} u="cm" />
        <Stat k="Total build-up" v={(depth * 100).toFixed(0)} u="cm" />
        <Stat k="α random 63 Hz" v={a63.random.toFixed(2)} u="" tone={T.slate} />
        <Stat k="α random 125 Hz" v={a125.random.toFixed(2)} u="" tone={T.slate} />
        <Stat k="α random 500 Hz" v={a500.random.toFixed(2)} u="" tone={T.olive} />
      </div>

      <Card title="Section" note="inside ← → outside · drawn to scale">
        <svg viewBox={`0 0 ${SW} 150`} style={{ width: "100%", height: "auto" }}>
          <defs>
            <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="8" stroke={T.rule} strokeWidth="1.2" />
            </pattern>
          </defs>
          {(() => { let x = 0; return layers.map((l, i) => {
            const w = l.t * PX; const el = (
              <g key={i}>
                <rect x={x} y="14" width={w} height="86" fill={l.hatch ? "url(#hatch)" : l.fill} stroke={T.ink} strokeWidth="1" />
                {w > 26 && <text x={x + w / 2} y="118" textAnchor="middle" style={{ font: `600 10px ${mono}`, fill: T.ink }}>{(l.t * 100).toFixed(l.t < 0.02 ? 1 : 0)}</text>}
                {w > 40 && <text x={x + w / 2} y="132" textAnchor="middle" style={{ font: `400 9px ${mono}`, fill: T.ink2 }}>{l.label}</text>}
              </g>); x += w; return el; }); })()}
          <text x="2" y="9" style={{ font: `600 9px ${mono}`, fill: T.ink2, letterSpacing: ".1em" }}>ROOM</text>
          <text x={SW - 2} y="9" textAnchor="end" style={{ font: `600 9px ${mono}`, fill: T.ink2, letterSpacing: ".1em" }}>OUTSIDE</text>
        </svg>
      </Card>

      <Card title="Absorption coefficient" note="Miki model, transfer-matrix through the stack, rigid brick termination">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={absCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <XAxis dataKey="f" scale="log" type="number" domain={[20, 16000]} ticks={OCT_TICKS} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[0, 1.05]} ticks={[0, .25, .5, .75, 1]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => v.toFixed(3)} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
            <Legend wrapperStyle={{ font: `400 11px ${mono}` }} />
            {membrane && <ReferenceLine x={membrane} stroke={T.violet} strokeDasharray="4 3" label={{ value: `panel f₀ ${membrane.toFixed(0)}`, fill: T.violet, fontSize: 10, position: "top" }} />}
            <Line type="monotone" dataKey="random" stroke={T.olive} strokeWidth={2.6} dot={false} name="random incidence" />
            <Line type="monotone" dataKey="normal" stroke={T.slate} strokeWidth={1.3} strokeDasharray="4 3" dot={false} name="normal incidence" />
          </LineChart>
        </ResponsiveContainer>
        <Note tone={T.slate}>
          The density gradient is doing the right thing: the low-σ 40 kg/m³ face lets energy in, the 140 kg/m³ backing dissipates it.
          The 10 mm plywood on {(env.gap * 100).toFixed(0)} cm of air adds a membrane at ≈{membrane ? membrane.toFixed(0) : "–"} Hz, which is why α stays high through the modal region — that cavity is the single most valuable part of this build. Fill 20–40 % of it with loose wool to damp the panel's own ringing.
        </Note>
      </Card>

      <Card title="Resulting decay" note="how the envelope maps onto RT₆₀">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rtCurve.filter(d => d.f >= 40 && d.f <= 12000)} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <XAxis dataKey="f" scale="log" type="number" domain={[40, 12000]} ticks={OCT_TICKS.filter(t => t >= 40)} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[0, "auto"]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(2)} s`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
            <Line type="monotone" dataKey="eyring" stroke={T.olive} strokeWidth={2.4} dot={false} name="RT60" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}


/* ============================================================
   SPEAKER — RAIL
   ============================================================ */
function SpeakerRail({ way, sec, spk, setPart, setSpk, boxes }) {
  const isHF = way === "hf";
  const bc = boxes[way];
  const d = sec.drv, b = sec.box, p = sec.port;
  const set = (part, k) => (v) => setPart(way, part, k, v);

  return (
    <>
      <SectionLabel>{SPEC[way].name} — driver</SectionLabel>
      {!isHF && <>
        <Slider label="Nominal Ø" unit="in" value={d.dia} min={5} max={21} onChange={(v) => { setPart(way, "drv", "dia", v); setPart(way, "drv", "sd", Math.round(sdOf(v) * 1e4)); }} />
        <Slider label="Count per stack" unit="" value={d.n} min={1} max={6} onChange={set("drv", "n")} />
        <Slider label="Sd" unit="cm²" value={d.sd} min={50} max={2200} step={5} onChange={set("drv", "sd")} />
        <Slider label="Fs" unit="Hz" value={d.fs} min={18} max={200} onChange={set("drv", "fs")} />
        <Slider label="Qts" unit="" value={d.qts} min={0.15} max={0.7} step={0.01} onChange={set("drv", "qts")} fmt={(v) => v.toFixed(2)} />
        <Slider label="Vas" unit="L" value={d.vas} min={2} max={600} step={1} onChange={set("drv", "vas")} />
        <Slider label="Xmax" unit="mm" value={d.xmax} min={1} max={25} step={0.5} onChange={set("drv", "xmax")} fmt={(v) => v.toFixed(1)} />
      </>}
      <Slider label="Sensitivity" unit="dB/W/m" value={d.sens} min={85} max={118} onChange={set("drv", "sens")} />
      <Slider label="Power / driver" unit="W" value={d.pe} min={20} max={2000} step={10} onChange={set("drv", "pe")} />
      {isHF && <Slider label="Driver Fs / low limit" unit="Hz" value={d.fs} min={300} max={1600} step={25} onChange={set("drv", "fs")} />}

      {!isHF && <>
        <SectionLabel>Enclosure</SectionLabel>
        <Field label="Type"><Seg small options={[{ v: "reflex", l: "Reflex" }, { v: "sealed", l: "Sealed" }]} value={b.type} onChange={set("box", "type")} /></Field>
        <Slider label="Internal width" unit="mm" value={Math.round(b.W * 1000)} min={150} max={1400} step={5} onChange={(v) => setPart(way, "box", "W", v / 1000)} />
        <Slider label="Internal height" unit="mm" value={Math.round(b.H * 1000)} min={150} max={1600} step={5} onChange={(v) => setPart(way, "box", "H", v / 1000)} />
        <Slider label="Internal depth" unit="mm" value={Math.round(b.D * 1000)} min={100} max={1200} step={5} onChange={(v) => setPart(way, "box", "D", v / 1000)} />
        <Slider label="Bracing + fill loss" unit="%" value={b.brace} min={0} max={20} onChange={set("box", "brace")} />
        <Slider label="Box leakage Q" unit="" value={b.ql} min={3} max={30} onChange={set("box", "ql")} hint="7 typical, 15+ for a heavily braced sealed build" />
        <Field label="Boundary loading"><Seg small options={[{ v: "half", l: "2π" }, { v: "quarter", l: "π" }, { v: "eighth", l: "π/2" }]} value={b.space} onChange={set("box", "space")} /></Field>
      </>}

      {!isHF && b.type === "reflex" && <>
        <SectionLabel>Port</SectionLabel>
        <Field label="Shape"><Seg small options={[{ v: "slot", l: "Slot" }, { v: "round", l: "Round" }]} value={p.shape} onChange={set("port", "shape")} /></Field>
        <Slider label="Count" unit="" value={p.n} min={1} max={4} onChange={set("port", "n")} />
        {p.shape === "round"
          ? <Slider label="Diameter" unit="mm" value={p.dia} min={40} max={300} step={5} onChange={set("port", "dia")} />
          : <>
            <Slider label="Slot width" unit="mm" value={p.pw} min={60} max={900} step={5} onChange={set("port", "pw")} />
            <Slider label="Slot height" unit="mm" value={p.ph} min={20} max={300} step={5} onChange={set("port", "ph")} />
          </>}
        <Slider label="Tunnel length" unit="mm" value={Math.round(p.len * 1000)} min={40} max={1400} step={5} onChange={(v) => setPart(way, "port", "len", v / 1000)}
          hint={bc && bc.fb ? `tunes to ${bc.fb.toFixed(1)} Hz` : ""} />
      </>}

      {SPEC[way].horn && <>
        <SectionLabel>{isHF ? "Waveguide" : "Horn"}</SectionLabel>
        <Slider label="Throat Ø" unit="mm" value={sec.horn.throat} min={isHF ? 19 : 80} max={isHF ? 51 : 340} step={isHF ? 0.1 : 5} onChange={set("horn", "throat")} fmt={(v) => v.toFixed(isHF ? 1 : 0)} />
        <Slider label="Pattern control to" unit="Hz" value={sec.horn.ctrl} min={isHF ? 700 : 300} max={isHF ? 2500 : 1400} step={25} onChange={set("horn", "ctrl")} />
        <Slider label="Horizontal" unit="°" value={sec.horn.h} min={40} max={120} step={5} onChange={set("horn", "h")} />
        <Slider label="Vertical" unit="°" value={sec.horn.v} min={20} max={90} step={5} onChange={set("horn", "v")} />
        <Field label="Profile"><Seg small options={[{ v: "os", l: "OS" }, { v: "conical", l: "Conical" }, { v: "exp", l: "Exp" }]} value={sec.horn.profile} onChange={set("horn", "profile")} /></Field>
      </>}

      <div style={{ marginTop: 22 }}>
        <button onClick={() => setSpk((s) => ({ ...s, [way]: JSON.parse(JSON.stringify(INIT_SPK[way])) }))}
          style={{ width: "100%", padding: "8px", border: `1px solid ${T.rule}`, background: "transparent", color: T.ink2, cursor: "pointer", font: `600 10px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase" }}>
          Reset {SPEC[way].name}
        </button>
      </div>
    </>
  );
}

/* ============================================================
   SPEAKER — CANVAS
   ============================================================ */
function SpeakerTab({ way, setWay, spk, sec, boxes, wayCurve, wayLimits, waySpan, hfH, midH, dirCurve, sys, Dc }) {
  const isHF = way === "hf";
  const bc = boxes[way];
  const [lo, hi] = waySpan[way];
  const hcalc = way === "hf" ? hfH : way === "mid" ? midH : null;
  const d = sec.drv;

  const passband = wayCurve.filter((r) => r.f >= lo && r.f <= hi);
  const meanSPL = passband.length ? passband.reduce((s, r) => s + r.spl, 0) / passband.length : 0;

  return (
    <>
      {/* way selector */}
      <div style={{ display: "flex", gap: 0, marginBottom: 18, border: `1px solid ${T.rule}`, background: T.paper, borderRadius: 3, overflow: "hidden" }}>
        {["sub", "low", "mid", "hf"].map((k) => (
          <button key={k} onClick={() => setWay(k)}
            style={{
              flex: 1, padding: "12px 8px", border: "none", cursor: "pointer",
              borderBottom: way === k ? `3px solid ${SPEC[k].col}` : "3px solid transparent",
              background: way === k ? T.panel : "transparent", color: way === k ? T.ink : T.ink2,
              font: `700 12px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase",
            }}>
            {SPEC[k].name}
            <div style={{ font: `400 9px ${mono}`, letterSpacing: 0, textTransform: "none", marginTop: 3, opacity: .7 }}>
              {k === "hf" ? `${sys.x4}–20k` : `${waySpan[k][0]}–${waySpan[k][1]} Hz`}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, marginBottom: 18 }}>
        {!isHF && <Stat k="Net volume" v={bc.net.toFixed(0)} u="L" />}
        {!isHF && sec.box.type === "reflex" && <Stat k="Tuning fb" v={bc.fb.toFixed(1)} u="Hz" tone={SPEC[way].col} />}
        {!isHF && sec.box.type === "sealed" && <Stat k="Qtc / Fc" v={`${bc.qtc.toFixed(2)}`} u={`@ ${bc.fc.toFixed(0)} Hz`} tone={SPEC[way].col} />}
        <Stat k="Passband SPL" v={meanSPL.toFixed(0)} u="dB @1m" />
        {wayLimits && <Stat k="Peak excursion" v={wayLimits.xPeak.toFixed(1)} u={`mm / ${d.xmax} max`} tone={wayLimits.xPeak > d.xmax ? T.red : T.olive} />}
        {wayLimits && sec.box.type === "reflex" && <Stat k="Port velocity" v={wayLimits.vAtLim.toFixed(1)} u="m/s" tone={wayLimits.vAtLim > 20 ? T.red : wayLimits.vAtLim > 15 ? T.amber : T.olive} />}
        {isHF && <Stat k="Horn gain" v={`+${hfH.gain.toFixed(1)}`} u="dB" tone={T.red} />}
      </div>

      {/* geometry */}
      <div style={{ display: "grid", gridTemplateColumns: SPEC[way].horn ? "repeat(auto-fit,minmax(300px,1fr))" : "1fr", gap: 16 }}>
        {!isHF && <BoxView sec={sec} bc={bc} col={SPEC[way].col} />}
        {SPEC[way].horn && <HornProfile h={sec.horn} calc={hcalc} title={isHF ? "Waveguide profile" : "Horn profile"} col={SPEC[way].col} />}
      </div>

      {/* response */}
      <Card title="Response" note={`half space + boundary · ${d.n} × ${isHF ? "compression driver" : `${d.dia}"`} at ${d.pe} W each · passband shaded`}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={wayCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <ReferenceArea x1={lo} x2={hi} fill={SPEC[way].col} fillOpacity={0.08} />
            <XAxis dataKey="f" scale="log" type="number" domain={["dataMin", "dataMax"]} ticks={OCT_TICKS} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[Math.round(meanSPL) - 35, Math.round(meanSPL) + 12]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} label={{ value: "dB", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(1)} dB`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
            {!isHF && sec.box.type === "reflex" && <ReferenceLine x={bc.fb} stroke={T.violet} strokeDasharray="4 3" label={{ value: `fb ${bc.fb.toFixed(0)}`, fill: T.violet, fontSize: 10 }} />}
            {!isHF && <ReferenceLine x={bc.baffleStep} stroke={T.ink2} strokeDasharray="2 4" label={{ value: "baffle step", fill: T.ink2, fontSize: 9, position: "insideTopRight" }} />}
            <Line type="monotone" dataKey="spl" stroke={SPEC[way].col} strokeWidth={2.6} dot={false} name="SPL" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {!isHF && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
          <Card title="Cone excursion" note={`at full rated power · Xmax ${d.xmax} mm`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={wayCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
                <ReferenceArea x1={lo} x2={hi} fill={SPEC[way].col} fillOpacity={0.08} />
                <XAxis dataKey="f" scale="log" type="number" domain={["dataMin", "dataMax"]} ticks={OCT_TICKS} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
                <YAxis domain={[0, Math.max(d.xmax * 2.5, 8)]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={40} label={{ value: "mm", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(2)} mm`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
                <ReferenceLine y={d.xmax} stroke={T.red} strokeDasharray="5 3" label={{ value: "Xmax", fill: T.red, fontSize: 10 }} />
                <Line type="monotone" dataKey="xc" stroke={T.ink} strokeWidth={2.2} dot={false} name="excursion" />
              </LineChart>
            </ResponsiveContainer>
            {wayLimits && (
              <Note tone={wayLimits.xPeak > d.xmax ? T.amber : T.olive}>
                {wayLimits.xPeak > d.xmax
                  ? `Excursion-limited, not power-limited. Worst point is ${wayLimits.fx.toFixed(0)} Hz. You can only use ${wayLimits.pLim.toFixed(0)} W of the ${d.pe} W rating before the cone leaves Xmax — size the amp for that, or add cone area.`
                  : `Stays inside Xmax on full rated power. There is headroom to raise the amplifier or lower the high-pass.`}
              </Note>
            )}
          </Card>

          {sec.box.type === "reflex" ? (
            <Card title="Port air velocity" note="chuffing starts around 17 m/s, audible by 25">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={wayCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
                  <ReferenceArea y1={17} y2={200} fill={T.red} fillOpacity={0.07} />
                  <XAxis dataKey="f" scale="log" type="number" domain={["dataMin", "dataMax"]} ticks={OCT_TICKS} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
                  <YAxis domain={[0, "auto"]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={40} label={{ value: "m/s", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(1)} m/s`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
                  <ReferenceLine y={17} stroke={T.amber} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="vp" stroke={T.slate} strokeWidth={2.2} dot={false} name="port velocity" />
                </LineChart>
              </ResponsiveContainer>
              <Note tone={wayLimits && wayLimits.vAtLim > 20 ? T.red : T.olive}>
                Peak {wayLimits ? wayLimits.vPeak.toFixed(1) : "–"} m/s at full power, {wayLimits ? wayLimits.vAtLim.toFixed(1) : "–"} m/s at the excursion-limited power you can actually use.
                Port area {bc.pg ? (bc.pg.total * 1e4).toFixed(0) : "–"} cm². Widen the slot before you shorten it — length sets the tuning.
              </Note>
            </Card>
          ) : (
            <Card title="Sealed alignment">
              <table style={{ width: "100%", borderCollapse: "collapse", font: `400 11.5px ${mono}` }}>
                <tbody>
                  {[
                    ["Qtc", bc.qtc.toFixed(2), bc.qtc > 0.9 ? T.amber : bc.qtc < 0.5 ? T.amber : T.olive],
                    ["Fc", `${bc.fc.toFixed(1)} Hz`],
                    ["F3", `${(bc.fc * Math.sqrt((1 / (2 * bc.qtc * bc.qtc) - 1) + Math.sqrt(Math.pow(1 / (2 * bc.qtc * bc.qtc) - 1, 2) + 1))).toFixed(0)} Hz`],
                    ["Vas / Vb (α)", bc.alpha.toFixed(2)],
                  ].map(([k, v, tone], i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.rule}` }}>
                      <td style={{ padding: "9px 4px", color: T.ink2 }}>{k}</td>
                      <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: 700, color: tone || T.ink }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Note tone={T.ink2}>
                Qtc 0.58 is critically damped and the tightest transient; 0.71 is maximally flat; above 0.9 you get a resonant hump.
                For a horn-loaded midrange the rear chamber only has to hold the cone still — aim low.
              </Note>
            </Card>
          )}
        </div>
      )}

      {/* build sheet */}
      {!isHF && (
        <Card title="Build sheet" pad={0}>
          <table style={{ width: "100%", borderCollapse: "collapse", font: `400 11.5px ${mono}` }}>
            <tbody>
              {[
                ["Internal dimensions", `${(sec.box.W * 1000).toFixed(0)} × ${(sec.box.H * 1000).toFixed(0)} × ${(sec.box.D * 1000).toFixed(0)} mm`],
                ["Gross volume", `${bc.gross.toFixed(0)} L`],
                ["Less drivers", `−${bc.vDrv.toFixed(1)} L (${sec.drv.n} × ${sec.drv.dia}")`],
                ["Less port + bracing", `−${(bc.vPort + bc.gross * sec.box.brace / 100).toFixed(1)} L`],
                ["Net volume", `${bc.net.toFixed(0)} L`, SPEC[way].col],
                ...(sec.box.type === "reflex" ? [
                  ["Port", sec.port.shape === "round"
                    ? `${sec.port.n} × Ø${sec.port.dia} mm, ${(sec.port.len * 1000).toFixed(0)} mm long`
                    : `${sec.port.n} × ${sec.port.pw} × ${sec.port.ph} mm slot, ${(sec.port.len * 1000).toFixed(0)} mm long`],
                  ["Port area", `${(bc.pg.total * 1e4).toFixed(0)} cm² (${(bc.pg.total / bc.sdTot * 100).toFixed(0)} % of Sd)`],
                  ["Effective length", `${(bc.pg.Leff * 1000).toFixed(0)} mm incl. end correction`],
                  ["Tuning", `${bc.fb.toFixed(1)} Hz`, SPEC[way].col],
                  ["Port pipe resonance", `${bc.pipe.toFixed(0)} Hz`, bc.pipe < waySpan[way][1] * 2 ? T.red : T.ink],
                ] : []),
                ["Internal standing waves", bc.stand.map((s) => `${s.toFixed(0)}`).join(" / ") + " Hz",
                  bc.stand.some((s) => s < waySpan[way][1] * 1.5) ? T.amber : T.ink],
                ["Baffle step", `${bc.baffleStep.toFixed(0)} Hz`],
              ].map(([k, v, tone], i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.rule}` }}>
                  <td style={{ padding: "8px 12px", color: T.ink2, width: "50%" }}>{k}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: tone || T.ink }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 14 }}>
            <Note tone={bc.pipe && bc.pipe < waySpan[way][1] * 2 ? T.red : T.ink2}>
              {bc.pipe && bc.pipe < waySpan[way][1] * 2
                ? `The port's half-wave pipe resonance at ${bc.pipe.toFixed(0)} Hz falls close to the passband — it will leak a hard coloration through the port mouth. Shorten the tunnel and shrink the area to keep the same tuning, or line the tunnel walls.`
                : `Port pipe resonance and internal standing waves both sit clear of the passband. Line the internal walls opposite the driver anyway — ${bc.stand.map((s) => s.toFixed(0)).join(" / ")} Hz will otherwise ring through the cone.`}
            </Note>
          </div>
        </Card>
      )}

      {/* directivity for horn ways */}
      {SPEC[way].horn && (
        <Card title="Directivity" note="pattern loses control where the mouth stops being large against λ">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dirCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
              <ReferenceArea x1={lo} x2={Math.min(hi, 18000)} fill={SPEC[way].col} fillOpacity={0.08} />
              <XAxis dataKey="f" scale="log" type="number" domain={[100, 18000]} ticks={OCT_TICKS.filter((t) => t >= 125)} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
              <YAxis yAxisId="a" domain={[0, 190]} ticks={[0, 45, 90, 135, 180]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={40} label={{ value: "°", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
              <YAxis yAxisId="b" orientation="right" domain={[0, 22]} tick={{ fill: T.violet, fontSize: 11, fontFamily: mono }} stroke={T.violet} width={38} />
              <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v, n) => (n === "DI" ? `${v.toFixed(1)} dB` : `${v.toFixed(0)}°`)} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
              <Legend wrapperStyle={{ font: `400 11px ${mono}` }} />
              <ReferenceLine yAxisId="a" x={sys.x4} stroke={T.ink} strokeDasharray="4 3" label={{ value: "mid→tweeter", fill: T.ink, fontSize: 9 }} />
              <Line yAxisId="a" type="monotone" dataKey="h" stroke={T.slate} strokeWidth={2.2} dot={false} name="horizontal" />
              <Line yAxisId="a" type="monotone" dataKey="v" stroke={T.olive} strokeWidth={2.2} dot={false} name="vertical" />
              <Line yAxisId="b" type="monotone" dataKey="di" stroke={T.violet} strokeWidth={1.4} strokeDasharray="4 3" dot={false} name="DI" />
            </LineChart>
          </ResponsiveContainer>
          <Note tone={T.violet}>
            Critical distance is <b style={{ color: T.ink }}>{Dc.toFixed(1)} m</b> — larger than the room, so this polar response is the room's tonality.
            Keep the mid and tweeter coverage angles within about 15° of each other or the step at {sys.x4} Hz reads as a change in the room, not the speaker.
          </Note>
        </Card>
      )}
    </>
  );
}

/* ---------- enclosure drawing ---------- */
function BoxView({ sec, bc, col }) {
  const { box, drv, port } = sec;
  const wall = 0.021;
  const oW = box.W + 2 * wall, oH = box.H + 2 * wall, oD = box.D + 2 * wall;
  const S = 300 / Math.max(oW, oH, 0.01);
  const w = oW * S, h = oH * S, dd = oD * S;
  const gapX = 34, VW = w + dd + gapX + 24, VH = h + 46;

  // driver layout: stack vertically, or 2 across if they fit
  const dEff = 0.83 * drv.dia * IN * 1.12;
  const perRow = Math.max(1, Math.min(drv.n, Math.floor(box.W / dEff)));
  const rows = Math.ceil(drv.n / perRow);
  const isReflex = box.type === "reflex";
  const portH = isReflex && port.shape === "slot" ? (port.ph / 1000) * S : (port.dia / 1000) * S;
  const portW = isReflex && port.shape === "slot" ? (port.pw / 1000) * S : (port.dia / 1000) * S;
  const drvZoneH = h - (isReflex ? portH + 18 : 0);

  return (
    <Card title="Enclosure" note={`${(box.W * 1000).toFixed(0)} × ${(box.H * 1000).toFixed(0)} × ${(box.D * 1000).toFixed(0)} internal · ${bc.net.toFixed(0)} L net`}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", height: "auto" }}>
        {/* front elevation */}
        <rect x="12" y="10" width={w} height={h} fill={T.panel} stroke={T.ink} strokeWidth="1.6" />
        <rect x={12 + wall * S} y={10 + wall * S} width={w - 2 * wall * S} height={h - 2 * wall * S} fill="none" stroke={T.rule} strokeDasharray="3 3" />
        {Array.from({ length: drv.n }, (_, i) => {
          const r = Math.floor(i / perRow), c = i % perRow;
          const nThis = Math.min(perRow, drv.n - r * perRow);
          const cx = 12 + w / 2 + (c - (nThis - 1) / 2) * (w / perRow);
          const cy = 10 + (drvZoneH / (rows + 1)) * (r + 1);
          const rad = Math.min((0.83 * drv.dia * IN * S) / 2, w / (2 * perRow) - 3, drvZoneH / (2 * rows) - 3);
          return <g key={i}>
            <circle cx={cx} cy={cy} r={rad} fill="none" stroke={col} strokeWidth="2" />
            <circle cx={cx} cy={cy} r={rad * 0.34} fill={col} opacity=".28" />
          </g>;
        })}
        {isReflex && Array.from({ length: port.n }, (_, i) => {
          const pw = Math.min(portW, (w - 16) / port.n - 6);
          const cx = 12 + w / 2 + (i - (port.n - 1) / 2) * (pw + 8);
          return port.shape === "slot"
            ? <rect key={i} x={cx - pw / 2} y={10 + h - portH - 10} width={pw} height={portH} fill={T.ink} opacity=".82" />
            : <circle key={i} cx={cx} cy={10 + h - portH / 2 - 10} r={portH / 2} fill={T.ink} opacity=".82" />;
        })}
        <text x={12 + w / 2} y={VH - 24} textAnchor="middle" style={{ font: `600 10px ${mono}`, fill: T.ink2 }}>front</text>

        {/* side section */}
        <g transform={`translate(${12 + w + gapX} 0)`}>
          <rect x="0" y="10" width={dd} height={h} fill={T.paper} stroke={T.ink} strokeWidth="1.6" />
          <rect x={wall * S} y={10 + wall * S} width={dd - 2 * wall * S} height={h - 2 * wall * S} fill={T.panel} stroke={T.rule} strokeDasharray="3 3" />
          {/* driver in section */}
          <path d={`M ${wall * S} ${10 + drvZoneH / (rows + 1) - (0.83 * drv.dia * IN * S) / 2}
                    L ${wall * S + 0.28 * dd} ${10 + drvZoneH / (rows + 1)}
                    L ${wall * S} ${10 + drvZoneH / (rows + 1) + (0.83 * drv.dia * IN * S) / 2}`}
            fill="none" stroke={col} strokeWidth="2" />
          {/* port tunnel in section */}
          {isReflex && (() => {
            const tl = Math.min(port.len * S, dd - 2 * wall * S - 6);
            const y = 10 + h - portH - 10;
            return <g>
              <rect x={wall * S} y={y} width={tl} height={portH} fill="none" stroke={T.ink} strokeWidth="1.6" />
              <line x1={wall * S} y1={y + portH / 2} x2={wall * S + tl} y2={y + portH / 2} stroke={T.ink} strokeDasharray="3 3" opacity=".5" />
              {port.len * S > dd - 2 * wall * S - 6 && (
                <text x={wall * S + tl / 2} y={y - 4} textAnchor="middle" style={{ font: `600 8px ${mono}`, fill: T.red }}>tunnel must fold</text>
              )}
            </g>;
          })()}
          <text x={dd / 2} y={VH - 24} textAnchor="middle" style={{ font: `600 10px ${mono}`, fill: T.ink2 }}>section</text>
        </g>
        <text x="12" y={VH - 8} style={{ font: `400 9px ${mono}`, fill: T.ink2 }}>
          21 mm walls assumed · outside {(oW * 1000).toFixed(0)} × {(oH * 1000).toFixed(0)} × {(oD * 1000).toFixed(0)} mm
        </text>
      </svg>
    </Card>
  );
}

/* ---------- horn drawing ---------- */
function HornProfile({ h, calc, title, col }) {
  const W = 340, H = 210, pad = 26;
  const sx = (W - 2 * pad) / Math.max(calc.L, 0.05);
  const sy = (H - 2 * pad) / Math.max(calc.Wm, 0.05);
  const rt = h.throat / 2000, N = 44;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const u = i / N, x = u * calc.L;
    let r;
    if (h.profile === "conical") r = rt + u * (calc.Wm / 2 - rt);
    else if (h.profile === "exp") r = rt * Math.exp(u * Math.log(calc.Wm / 2 / rt));
    else r = Math.sqrt(rt * rt + Math.pow(u, 1.7) * (Math.pow(calc.Wm / 2, 2) - rt * rt));
    return [pad + x * sx, H / 2 - r * sy, H / 2 + r * sy];
  });
  return (
    <Card title={title} note={`${h.h}° × ${h.v}° · ${h.profile.toUpperCase()}`}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <polygon points={`${pts.map((p) => `${p[0]},${p[1]}`).join(" ")} ${pts.slice().reverse().map((p) => `${p[0]},${p[2]}`).join(" ")}`}
          fill={col} fillOpacity=".12" stroke={col} strokeWidth="2" />
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke={T.rule} strokeDasharray="4 4" />
        <line x1={pad} y1={H / 2 - rt * sy} x2={pad} y2={H / 2 + rt * sy} stroke={T.ink} strokeWidth="3" />
        <text x={pad} y={H - 8} style={{ font: `600 9px ${mono}`, fill: T.ink2 }}>throat {h.throat.toFixed(0)}mm</text>
        <text x={W - pad} y={H - 8} textAnchor="end" style={{ font: `600 9px ${mono}`, fill: T.ink2 }}>mouth {(calc.Wm * 1000).toFixed(0)}×{(calc.Hm * 1000).toFixed(0)}mm</text>
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px", marginTop: 10, font: `400 11px ${mono}`, color: T.ink2 }}>
        <span>Mouth area <b style={{ color: T.ink }}>{(calc.Sm * 1e4).toFixed(0)} cm²</b></span>
        <span>Axial depth <b style={{ color: T.ink }}>{(calc.L * 1000).toFixed(0)} mm</b></span>
        <span>Loads to <b style={{ color: T.ink }}>{calc.fLoad.toFixed(0)} Hz</b></span>
        <span>Horn gain <b style={{ color: T.ink }}>+{calc.gain.toFixed(1)} dB</b></span>
      </div>
    </Card>
  );
}

/* ============================================================
   SYSTEM TAB
   ============================================================ */
function SystemTab({ sys, spk, boxes, splCurve, splAt, worstInBand, room, listenDist }) {
  const headroom = worstInBand - sys.target;
  const rows = [
    { k: "sub", band: `${sys.x1}–${sys.x2} Hz` },
    { k: "low", band: `${sys.x2}–${sys.x3} Hz` },
    { k: "mid", band: `${sys.x3}–${sys.x4} Hz` },
    { k: "hf", band: `${sys.x4} Hz–20 kHz` },
  ];
  const ampTotal = 2 * ["sub", "low", "mid", "hf"].reduce((s, k) => s + spk[k].drv.pe * spk[k].drv.n, 0);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, marginBottom: 18 }}>
        <Stat k="30 Hz" v={splAt(30).toFixed(0)} u="dB" tone={T.violet} />
        <Stat k="40 Hz" v={splAt(40).toFixed(0)} u="dB" tone={T.violet} />
        <Stat k="100 Hz" v={splAt(100).toFixed(0)} u="dB" tone={T.slate} />
        <Stat k="1 kHz" v={splAt(1000).toFixed(0)} u="dB" tone={T.olive} />
        <Stat k="Headroom vs target" v={(headroom >= 0 ? "+" : "") + headroom.toFixed(0)} u="dB" tone={headroom >= 0 ? T.olive : T.red} />
      </div>

      <Card title="Maximum SPL at the listening position" note={`${listenDist.toFixed(2)} m path length · ${sys.stacks === "pair" ? "both stacks, correlated" : "one stack"} · min(excursion, thermal)`}>
        <ResponsiveContainer width="100%" height={330}>
          <LineChart data={splCurve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <XAxis dataKey="f" scale="log" type="number" domain={[18, 19000]} ticks={OCT_TICKS} tickFormatter={tickFmt} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[80, 135]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} label={{ value: "dB", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(1)} dB`} labelFormatter={(l) => `${l.toFixed(0)} Hz`} />
            <Legend wrapperStyle={{ font: `400 11px ${mono}` }} />
            <ReferenceLine y={sys.target} stroke={T.ink} strokeDasharray="5 4" label={{ value: `target ${sys.target}`, fill: T.ink, fontSize: 10, position: "insideBottomRight" }} />
            <Line type="monotone" dataKey="sub" stroke={SPEC.sub.col} strokeWidth={1.2} dot={false} name="sub" />
            <Line type="monotone" dataKey="low" stroke={SPEC.low.col} strokeWidth={1.2} dot={false} name="low" />
            <Line type="monotone" dataKey="mid" stroke={SPEC.mid.col} strokeWidth={1.2} dot={false} name="mid" />
            <Line type="monotone" dataKey="hf" stroke={SPEC.hf.col} strokeWidth={1.2} dot={false} name="tweeter" />
            <Line type="monotone" dataKey="total" stroke={T.ink} strokeWidth={2.8} dot={false} name="system" />
          </LineChart>
        </ResponsiveContainer>
        <Note tone={headroom >= 0 ? T.olive : T.red}>
          {headroom >= 0
            ? `The weakest point in 40 Hz–12 kHz still clears your ${sys.target} dB target by ${headroom.toFixed(0)} dB. Keep at least 6 dB of that as unclipped peak headroom.`
            : `The system falls ${Math.abs(headroom).toFixed(0)} dB short of ${sys.target} dB somewhere in band. Look at which coloured trace dips — that is the section to grow on the Speaker tab.`}
        </Note>
      </Card>

      <Card title="Section budget" note="live from the Speaker tab" pad={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", font: `400 11.5px ${mono}` }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.ink}` }}>
              {["Section", "Band", "Drivers", "Enclosure", "Tuning", "Sd tot", "Amp/stack"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 12px", font: `700 9.5px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink2 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, band }) => {
              const s = spk[k], bc = boxes[k], isHF = k === "hf";
              return (
                <tr key={k} style={{ borderBottom: `1px solid ${T.rule}` }}>
                  <td style={{ padding: "9px 12px" }}><span style={{ display: "inline-block", width: 9, height: 9, background: SPEC[k].col, marginRight: 8 }} />{SPEC[k].name}</td>
                  <td style={{ padding: "9px 12px", color: T.ink2 }}>{band}</td>
                  <td style={{ padding: "9px 12px" }}>{isHF ? `1 × ${(s.horn.throat / 25.4).toFixed(1)}" CD` : `${s.drv.n} × ${s.drv.dia}"`}</td>
                  <td style={{ padding: "9px 12px", color: T.ink2 }}>{isHF ? `${s.horn.h}×${s.horn.v} horn` : `${bc.net.toFixed(0)} L ${s.box.type}`}</td>
                  <td style={{ padding: "9px 12px" }}>{isHF ? "—" : s.box.type === "reflex" ? `${bc.fb.toFixed(1)} Hz` : `Qtc ${bc.qtc.toFixed(2)}`}</td>
                  <td style={{ padding: "9px 12px" }}>{isHF ? "—" : `${(bc.sdTot * 1e4).toFixed(0)} cm²`}</td>
                  <td style={{ padding: "9px 12px" }}>{(s.drv.pe * s.drv.n).toFixed(0)} W</td>
                </tr>
              );
            })}
            <tr style={{ background: T.panel }}>
              <td colSpan={6} style={{ padding: "9px 12px", font: `700 10px ${mono}`, letterSpacing: ".12em", textTransform: "uppercase" }}>Amplifier total, both stacks</td>
              <td style={{ padding: "9px 12px", font: `700 12px ${mono}` }}>{(ampTotal / 1000).toFixed(1)} kW</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}


/* ============================================================
   ISOLATION TAB
   ============================================================ */
function IsolationTab({ plenum, iso, env, room }) {
  const nrA = plenum.roomA - plenum.gapA;
  const nrC = plenum.roomC - plenum.gapC;
  const data = plenum.rows.map((r) => ({ ...r, label: r.f >= 1000 ? `${r.f / 1000}k` : `${r.f}` }));
  const tl63 = plenum.rows.find((r) => r.f === 63).tl;
  const speech = plenum.gapA < 60 ? "normal conversation" : plenum.gapA < 72 ? "raised voice" : plenum.gapA < 85 ? "shouting" : "no speech";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, marginBottom: 18 }}>
        <Stat k="Level in gap" v={plenum.gapA.toFixed(0)} u="dB(A)" tone={T.violet} />
        <Stat k="Level in gap" v={plenum.gapC.toFixed(0)} u="dB(C)" tone={T.slate} />
        <Stat k="Reduction" v={`−${nrA.toFixed(0)}`} u="dB(A)" tone={T.olive} />
        <Stat k="Reduction" v={`−${nrC.toFixed(0)}`} u="dB(C)" tone={nrC < 22 ? T.red : T.olive} />
        <Stat k="Leaf TL @ 63 Hz" v={tl63.toFixed(0)} u="dB" tone={tl63 < 25 ? T.red : T.ink} />
      </div>

      <Card title="Octave-band budget" note={`${iso.shape} at ${iso.inRoom} dB(A) inside · plenum correction ${plenum.corr >= 0 ? "+" : ""}${plenum.corr.toFixed(1)} dB`}>
        <ResponsiveContainer width="100%" height={330}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={T.rule} strokeDasharray="2 4" />
            <XAxis dataKey="label" tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} />
            <YAxis domain={[0, 130]} tick={{ fill: T.ink2, fontSize: 11, fontFamily: mono }} stroke={T.ink} width={44} label={{ value: "dB", position: "insideTopLeft", fill: T.ink2, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: T.paper, border: `1px solid ${T.ink}`, borderRadius: 2, font: `400 11px ${mono}` }} formatter={(v) => `${v.toFixed(1)} dB`} />
            <Legend wrapperStyle={{ font: `400 11px ${mono}` }} />
            <Line type="monotone" dataKey="room" stroke={T.ink} strokeWidth={2.6} dot={{ r: 3 }} name="inside the room" />
            <Line type="monotone" dataKey="gap" stroke={T.violet} strokeWidth={2.6} dot={{ r: 3 }} name="in the gap" />
            <Line type="monotone" dataKey="tl" stroke={T.olive} strokeWidth={1.8} strokeDasharray="5 3" dot={false} name="TL (with flanking)" />
            <Line type="monotone" dataKey="tlAir" stroke={T.rule} strokeWidth={1.2} dot={false} name="TL (airborne only)" />
          </LineChart>
        </ResponsiveContainer>
        <Note tone={T.violet}>
          Standing in the gap you would hear <b style={{ color: T.ink }}>{plenum.gapA.toFixed(0)} dB(A)</b> but{" "}
          <b style={{ color: T.ink }}>{plenum.gapC.toFixed(0)} dB(C)</b>. The {nrC.toFixed(0)} dB C-weighted reduction is the number that matters — it's all bass.
          Speech there: {speech}.
        </Note>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        <Card title="Why the gap is louder than the leaf suggests">
          <table style={{ width: "100%", borderCollapse: "collapse", font: `400 11.5px ${mono}` }}>
            <tbody>
              {[
                ["Transmitting area S", `${plenum.S.toFixed(1)} m²`],
                ["Absorption in gap A", `${plenum.A.toFixed(1)} m² sabins`],
                ["10 log (S/A)", `${plenum.corr >= 0 ? "+" : ""}${plenum.corr.toFixed(1)} dB`, plenum.corr > 3 ? T.red : T.olive],
                ["Gap width", `${plenum.gapW.toFixed(2)} m`],
                ["First cross-mode", `${plenum.crossMode.toFixed(0)} Hz`],
                ["Panel / mass-air-mass f₀", `${plenum.mam.toFixed(0)} Hz`, plenum.mam > 26 ? T.red : T.olive],
              ].map(([k, v, tone], i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.rule}` }}>
                  <td style={{ padding: "8px 4px", color: T.ink2 }}>{k}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: tone || T.ink }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note tone={plenum.corr > 3 ? T.red : T.olive}>
            {plenum.corr > 3
              ? `A bare plywood-and-brick corridor has almost no absorption, so leaked energy piles up and adds ${plenum.corr.toFixed(1)} dB back. Lining the brick face is the cheapest ${Math.abs(plenum.corr).toFixed(0)}-odd dB you will ever buy.`
              : `With the outer face lined, the gap behaves close to free field and the leaf's TL is what you actually get.`}
          </Note>
        </Card>

        <Card title="Where the leak comes from">
          <div style={{ font: `400 12.5px ${disp}`, lineHeight: 1.6, color: T.ink2 }}>
            <p style={{ margin: "0 0 10px" }}>
              Above roughly 400 Hz the calculated airborne path through the leaf exceeds 60 dB — effectively silent.
              Everything you hear in the gap is set by two things:
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <b style={{ color: T.ink }}>1. The 16–125 Hz bands</b>, where 6 kg/m² of plywood gives you almost nothing.
              This is the whole story for a techno system.
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: T.ink }}>2. Flanking</b> — the slab, the soffit, the door into the plenum, conduit and duct penetrations.
              Set at {iso.flank} dB here. Push it and watch how little the total moves: bass dominates regardless.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

