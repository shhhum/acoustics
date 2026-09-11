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


def cmd_room(args) -> int:
    import numpy as np

    from .room import compute_room

    scene = _load_scene(args.config)
    if args.fmax:
        scene.room_solver.f_max = args.fmax

    class P:
        def update(self, frac, msg=""):
            print(f"  {frac*100:5.1f}%  {msg}", file=sys.stderr)

    res, arrays = compute_room(scene, scene.room_solver, P())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "room.json").write_text(json.dumps(res, indent=1))
    np.savez_compressed(out / "room.npz", **arrays)
    (out / "inputs.json").write_text(scene.model_dump_json(indent=1))
    st = res["stats"]
    print(f"wrote {out/'room.json'}: {st['mesh']['nodes']} dofs, {st['N_basis']} modes, "
          f"{st['n_modes_below_cap']} below {scene.room_solver.f_max:.0f} Hz, f_schroeder {st['f_schroeder']:.0f} Hz, "
          f"timings {{{', '.join(f'{k} {v:.1f}s' for k, v in res['timings'].items())}}}")
    return 0


def cmd_isolation(args) -> int:
    import numpy as np

    from .isolation import compute_isolation

    scene = _load_scene(args.config)
    if args.fmax:
        scene.isolation_solver.f_max = args.fmax
    if args.workers:
        scene.isolation_solver.workers = args.workers

    class P:
        def update(self, frac, msg=""):
            print(f"  {frac*100:5.1f}%  {msg}", file=sys.stderr)

    res, arrays = compute_isolation(scene, P())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "isolation.json").write_text(json.dumps(res, indent=1))
    np.savez_compressed(out / "isolation.npz", **arrays)
    (out / "inputs.json").write_text(scene.model_dump_json(indent=1))
    sm = res["summary"]
    print(f"wrote {out/'isolation.json'}: {res['fem']['dofs']} dofs, D_venue_avg(FEM) @125 = {sm['D_venue_avg_fem_125']:.1f} dB, "
          f"TL_max(openings) = {sm['TL_max_openings']}, timings {{{', '.join(f'{k} {v:.1f}s' for k, v in res['timings'].items())}}}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="soundroom")
    sub = p.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("wall", help="compute wall impedance / absorption / TL")
    w.add_argument("--config", help="scene JSON (default: built-in default scene)")
    w.add_argument("--out", default="out/wall", help="output directory")
    w.add_argument("--png", action="store_true", help="also write wall.png (matplotlib)")
    w.set_defaults(fn=cmd_wall)
    r = sub.add_parser("room", help="room FEM/modal solve: FRF, T60, modes, pressure slices")
    r.add_argument("--config")
    r.add_argument("--out", default="out/room")
    r.add_argument("--fmax", type=float, help="override the FEM cap (Hz)")
    r.set_defaults(fn=cmd_room)
    i = sub.add_parser("isolation", help="coupled venue+room FEM: inside->outside level difference")
    i.add_argument("--config")
    i.add_argument("--out", default="out/isolation")
    i.add_argument("--fmax", type=float)
    i.add_argument("--workers", type=int)
    i.set_defaults(fn=cmd_isolation)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
