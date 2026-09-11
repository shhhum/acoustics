import React from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { OCT_TICKS, T, mono, tickFmt } from "./theme";

export interface Series { key: string; name: string; color: string; dash?: string; width?: number }
export interface RefLine { x: number; label: string; color?: string }

/** Log-frequency line chart. `data` rows must have `f` plus one key per series. */
export function LogLineChart({ data, series, yDomain, yLabel, refLines = [], height = 240, xDomain = [20, 10000], yTicks }: {
  data: Record<string, number | null>[]; series: Series[]; yDomain?: [number, number]; yLabel?: string;
  refLines?: RefLine[]; height?: number; xDomain?: [number, number]; yTicks?: number[];
}) {
  const ticks = OCT_TICKS.filter((t) => t >= xDomain[0] && t <= xDomain[1]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={T.rule} strokeDasharray="2 3" />
        <XAxis dataKey="f" type="number" scale="log" domain={xDomain} ticks={ticks} tickFormatter={tickFmt}
          tick={{ fontSize: 10, fontFamily: mono, fill: T.ink2 }} stroke={T.rule} />
        <YAxis domain={yDomain} ticks={yTicks} allowDataOverflow={!!yDomain} tick={{ fontSize: 10, fontFamily: mono, fill: T.ink2 }} stroke={T.rule} width={40}
          label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { font: `500 9px ${mono}`, fill: T.ink2 } } : undefined} />
        <Tooltip contentStyle={{ font: `500 10px ${mono}`, background: T.paper, border: `1px solid ${T.rule}` }}
          labelFormatter={(v) => `${Number(v).toFixed(0)} Hz`} formatter={(v: any) => (typeof v === "number" ? v.toFixed(3) : v)} />
        <Legend wrapperStyle={{ font: `500 10px ${mono}` }} />
        {refLines.map((r) => (
          <ReferenceLine key={r.label} x={r.x} stroke={r.color || T.amber} strokeDasharray="4 3"
            label={{ value: r.label, position: "top", style: { font: `500 9px ${mono}`, fill: r.color || T.amber } }} />
        ))}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.width ?? 2}
            strokeDasharray={s.dash} dot={false} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Zip a frequency array with named y arrays into chart rows. */
export function rows(f: number[], cols: Record<string, (number | null)[] | null | undefined>): Record<string, number | null>[] {
  const keys = Object.keys(cols).filter((k) => cols[k]);
  return f.map((fv, i) => {
    const r: Record<string, number | null> = { f: fv };
    for (const k of keys) r[k] = cols[k]![i] ?? null;
    return r;
  });
}
