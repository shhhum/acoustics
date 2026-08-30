import React from "react";
import { T, mono } from "./theme";

export function Field({ label, unit, children, hint }: { label: string; unit?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ font: `600 9.5px ${mono}`, letterSpacing: ".13em", textTransform: "uppercase", color: T.ink2 }}>{label}</span>
        {unit && <span style={{ font: `400 9.5px ${mono}`, color: T.ink2, opacity: 0.65 }}>{unit}</span>}
      </div>
      {children}
      {hint && <div style={{ font: `400 10px ${mono}`, color: T.ink2, opacity: 0.75, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export function Slider({ label, unit, value, min, max, step = 1, onChange, fmt, hint }: {
  label: string; unit?: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; fmt?: (v: number) => string; hint?: React.ReactNode;
}) {
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

export function NumberInput({ label, unit, value, onChange, step, min, max, hint, width = 90 }: {
  label: string; unit?: string; value: number | null | undefined; onChange: (v: number | null) => void;
  step?: number; min?: number; max?: number; hint?: React.ReactNode; width?: number;
}) {
  return (
    <Field label={label} unit={unit} hint={hint}>
      <input type="number" value={value ?? ""} step={step} min={min} max={max}
        placeholder="auto"
        onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
        style={{ width, font: `600 12px ${mono}`, padding: "4px 6px", border: `1px solid ${T.rule}`, borderRadius: 2, background: T.paper, color: T.ink }} />
    </Field>
  );
}

export function Seg<V extends string>({ options, value, onChange, small }: {
  options: (V | { v: V; l: string })[]; value: V; onChange: (v: V) => void; small?: boolean;
}) {
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
              font: `600 ${small ? 9 : 10}px ${mono}`, letterSpacing: ".08em", textTransform: "uppercase", transition: "background .12s",
            }}>{l}</button>
        );
      })}
    </div>
  );
}

export function Stat({ k, v, u, tone }: { k: string; v: React.ReactNode; u?: string; tone?: string }) {
  return (
    <div style={{ borderTop: `1px solid ${T.rule}`, paddingTop: 7, marginBottom: 12, minWidth: 110 }}>
      <div style={{ font: `600 9px ${mono}`, letterSpacing: ".14em", textTransform: "uppercase", color: T.ink2, marginBottom: 3 }}>{k}</div>
      <div style={{ font: `700 19px ${mono}`, color: tone || T.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {v}<span style={{ font: `400 11px ${mono}`, color: T.ink2, marginLeft: 4 }}>{u}</span>
      </div>
    </div>
  );
}

export function Card({ title, note, children, pad = 16, right }: { title?: string; note?: React.ReactNode; children: React.ReactNode; pad?: number; right?: React.ReactNode }) {
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 3, marginBottom: 16 }}>
      {title && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.rule}`, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ font: `700 11px ${mono}`, letterSpacing: ".16em", textTransform: "uppercase" }}>{title}</span>
          {note && <span style={{ font: `400 10px ${mono}`, color: T.ink2 }}>{note}</span>}
          {right}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ font: `700 10px ${mono}`, letterSpacing: ".18em", textTransform: "uppercase", color: T.ink, margin: "18px 0 10px", paddingBottom: 4, borderBottom: `1px solid ${T.ink}` }}>{children}</div>
  );
}

export function Note({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div style={{ font: `400 12px ${mono}`, lineHeight: 1.55, color: tone || T.ink2, borderLeft: `2px solid ${tone || T.rule}`, paddingLeft: 10, margin: "8px 0" }}>{children}</div>
  );
}

export function Button({ children, onClick, primary, small, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; small?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: small ? "4px 8px" : "7px 12px", border: `1px solid ${primary ? T.ink : T.rule}`, borderRadius: 2, cursor: disabled ? "default" : "pointer",
        background: primary ? T.ink : "transparent", color: primary ? T.paper : T.ink, opacity: disabled ? 0.5 : 1,
        font: `600 ${small ? 9 : 10}px ${mono}`, letterSpacing: ".1em", textTransform: "uppercase",
      }}>{children}</button>
  );
}

export const fmt = {
  mm: (m: number) => `${(m * 1000).toFixed(0)}`,
  hz: (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(2)}k` : f.toFixed(0)),
  n: (x: number, d = 2) => x.toFixed(d),
};
