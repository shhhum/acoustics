"""Command-line entry point: `soundroom wall --config scene.json [--out dir] [--png]`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import Scene
from .wall import compute_wall


def _load_scene(path: str | None) -> Scene:
    if path is None:
        return Scene()
    with open(path) as fh:
        return Scene.model_validate(json.load(fh))


def cmd_wall(args) -> int:
    scene = _load_scene(args.config)
    res = compute_wall(scene.wall, scene.wall_solver)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "wall.json").write_text(json.dumps(res, indent=1))
    (out / "inputs.json").write_text(scene.model_dump_json(indent=1))
    for w in res["warnings"]:
        print("warning:", w, file=sys.stderr)
    print(f"wrote {out/'wall.json'}  ({len(res['f'])} frequencies, {len(res['layers'])} layers, {res['thickness']*1000:.0f} mm)")
    if args.png:
        _plot_wall(res, out / "wall.png")
        print(f"wrote {out/'wall.png'}")
    return 0


def _plot_wall(res: dict, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    f = res["f"]
    fig, ax = plt.subplots(2, 2, figsize=(12, 8))
    for backing, ls in (("rigid", "-"), ("air", "--")):
        a = res[f"alpha_{backing}"]
        ax[0, 0].semilogx(f, a["normal"], ls, label=f"normal ({backing})")
        ax[0, 0].semilogx(f, a["field"], ls, label=f"field ({backing})")
    ax[0, 0].semilogx(f, res["alpha_rigid_miki_field"], ":", label="Miki field (rigid)")
    ax[0, 0].set(title="absorption coefficient", ylim=(0, 1.05), xlabel="Hz")
    ax[0, 0].legend(fontsize=7)
    z = res["Z_rigid"]
    ax[0, 1].semilogx(f, z["re"], label="Re Z/ρc (rigid)")
    ax[0, 1].semilogx(f, z["im"], label="Im Z/ρc (rigid)")
    ax[0, 1].set(title="normalized surface impedance, normal incidence", ylim=(-10, 10), xlabel="Hz")
    ax[0, 1].legend(fontsize=7)
    ax[1, 0].semilogx(f, res["TL"]["field"], label="TL field")
    ax[1, 0].semilogx(f, res["TL"]["normal"], label="TL normal")
    if res["TL"]["mass_law_field"]:
        ax[1, 0].semilogx(f, res["TL"]["mass_law_field"], ":", label="mass law (field)")
    ax[1, 0].set(title="transmission loss", xlabel="Hz", ylabel="dB")
    ax[1, 0].legend(fontsize=7)
    rows = [r for r in res["layers"] if "sigma" in r]
    ax[1, 1].bar([r["layer"] for r in rows], [r["sigma"] / 1e3 for r in rows])
    ax[1, 1].set(title="flow resistivity per layer", ylabel="kPa·s/m²")
    for a in ax.flat[:3]:
        a.grid(True, which="both", alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=120)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="soundroom")
    sub = p.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("wall", help="compute wall impedance / absorption / TL")
    w.add_argument("--config", help="scene JSON (default: built-in default scene)")
    w.add_argument("--out", default="out/wall", help="output directory")
    w.add_argument("--png", action="store_true", help="also write wall.png (matplotlib)")
    w.set_defaults(fn=cmd_wall)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
