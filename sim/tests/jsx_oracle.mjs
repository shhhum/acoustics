// Golden-baseline oracle: evaluates the wall physics of soundsystem-designer.jsx
// (lines 33–138: Miki model, impedance translation, Paris integral) verbatim on
// the component's default envelope, and prints JSON. Re-run with:
//   node sim/tests/jsx_oracle.mjs > sim/tests/fixtures/jsx_default_envelope.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "..", "soundsystem-designer.jsx"), "utf8").split("\n");
const physics = src.slice(32, 138).join("\n"); // 1-based lines 33..138

const env = {
  skinT: 0.003, skinSigma: 6000,
  wool: [
    { t: 0.05, rho: 40, sigma: 12000 },
    { t: 0.10, rho: 100, sigma: 38000 },
    { t: 0.10, rho: 140, sigma: 55000 },
  ],
  plyT: 0.01, plyRho: 600,
  gap: 1.2, gapFill: 0, gapFillSigma: 9000,
};
const n = 60;
const freqs = Array.from({ length: n }, (_, i) => 20 * Math.pow(10000 / 20, i / (n - 1)));

const driver = `
  const curve = absorptionCurve(cfg, freqs);
  const Z = freqs.map((f) => { const z = wallSurfaceZ(f, cfg); return [z.re / Z0, z.im / Z0]; });
  return { env: cfg, f: freqs, normal: curve.map((d) => d.normal), random: curve.map((d) => d.random), Z_norm: Z,
           note: "JSX Miki TMM, rigid termination, Paris N=60 to 83deg using normal-incidence Z (locally reacting)" };
`;
const run = new Function("cfg", "freqs", physics + "\n" + driver);
process.stdout.write(JSON.stringify(run(env, freqs)));
