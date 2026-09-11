// Design tokens ported from soundsystem-designer.jsx
export const T = {
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

export const mono = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
export const disp = "'Space Grotesk', 'Helvetica Neue', system-ui, sans-serif";

export const OCT_TICKS = [20, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
export const tickFmt = (v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`);
