/**
 * What to draw for a set of candles and structure settings. Pure (no chart), shared by
 * the single-chart overlay and the 4-timeframe view. Ported from market-structure's Panel.
 */
import { detectStructure, type Bar, type BreakBy, type StructureResult, type Trend } from "./structure.ts";
import {
  detectEqualLevels,
  detectFVG,
  detectOrderBlocks,
  detectSweeps,
  ema,
  vwapDaily,
  type EqualLevel,
  type Point,
  type Sweep,
  type Zone,
} from "./indicators.ts";
import { EXT_FACTOR, tfLabel, type IndKey } from "./store.ts";

/** Maximum number of recent zones/levels drawn (to avoid cluttering the chart). */
export const MAX = { fvg: 10, ob: 6, eq: 8, sweep: 12 };

/** Candles analysed: the most recent ones (older history does not change the current marks much). */
export const MAX_ANALYSED_BARS = 5000;

/** Optional EMAs: the shorter the period, the thicker the line. Keys match the Structure menu. */
export const EMAS = [
  { key: "ema10", period: 10, color: "#f9a8d4", width: 2 },
  { key: "ema20", period: 20, color: "#5eead4", width: 2 },
  { key: "ema50", period: 50, color: "#93c5fd", width: 2 },
  { key: "ema100", period: 100, color: "#a78bfa", width: 1 },
  { key: "ema200", period: 200, color: "#e2e8f0", width: 1 },
] as const;
export const VWAP_COLOR = "#fbbf24";
export const HTF_COLORS: Record<string, string> = { "1d": "#c084fc", "4h": "#22d3ee", "15m": "#a3e635" };

export type HtfLine = { price: number; label: string; dash: boolean };
export type HtfGroup = { color: string; lines: HtfLine[] };

export type OverlayData = {
  structure: StructureResult | null;
  ext: StructureResult | null;
  zones: Zone[];
  eq: EqualLevel[];
  sweeps: Sweep[];
  htf: HtfGroup[];
};

export type OverlayResult = {
  data: OverlayData;
  emas: { key: string; color: string; width: number; points: Point[] }[];
  vwap: Point[];
  trend: Trend | null;
  lastBreak: StructureResult["breaks"][number] | null;
  /** Notes as i18n keys + vars (e.g. not enough candles for an EMA). */
  notes: { key: string; vars?: Record<string, string | number> }[];
};

export type OverlaySettings = { n: number; breakBy: BreakBy; ind: readonly IndKey[]; daily: boolean };

export function computeOverlay(allBars: Bar[], s: OverlaySettings): OverlayResult {
  const bars = allBars.length > MAX_ANALYSED_BARS ? allBars.slice(-MAX_ANALYSED_BARS) : allBars;
  const on = (k: IndKey) => s.ind.includes(k);
  const structure = detectStructure(bars, { n: s.n, breakBy: s.breakBy });
  const ext = on("ext") ? detectStructure(bars, { n: s.n * EXT_FACTOR, breakBy: s.breakBy }) : null;

  const zones: Zone[] = [];
  if (on("fvg")) zones.push(...detectFVG(bars).filter((z) => z.mitigatedIndex === null).slice(-MAX.fvg));
  if (on("ob")) {
    zones.push(...detectOrderBlocks(bars, structure.breaks).filter((z) => z.mitigatedIndex === null).slice(-MAX.ob));
  }
  const eq = on("eq") ? detectEqualLevels(bars, structure.pivots).slice(-MAX.eq) : [];
  const sweeps = on("sweep") ? detectSweeps(bars, structure.pivots).slice(-MAX.sweep) : [];

  const emas = EMAS.filter((e) => on(e.key)).map((e) => ({ key: e.key, color: e.color, width: e.width, points: ema(bars, e.period) }));
  const vwap = on("vwap") && !s.daily ? vwapDaily(bars) : [];

  const notes: OverlayResult["notes"] = [];
  const hasVolume = bars.some((b) => (b.volume ?? 0) > 0);
  if ((on("vol") || on("vwap")) && !hasVolume) notes.push({ key: "ms.note.noVolume" });
  else if (on("vwap") && s.daily) notes.push({ key: "ms.note.vwapDaily" });
  // Report only the longest enabled EMA that lacks candles
  const short = EMAS.filter((e) => on(e.key) && bars.length < e.period).pop();
  if (short) notes.push({ key: "ms.note.emaShort", vars: { p: short.period, n: bars.length } });

  return {
    data: { structure, ext, zones, eq, sweeps, htf: [] },
    emas,
    vwap,
    trend: structure.trend,
    lastBreak: structure.breaks[structure.breaks.length - 1] ?? null,
    notes,
  };
}

/** Lines for "Higher TF levels": active swing high/low and last break of each higher timeframe. */
export function htfGroup(tf: string, res: StructureResult, labels: { high: string; low: string }): HtfGroup {
  const lines: HtfLine[] = [];
  const name = tfLabel(tf);
  if (res.active.high) lines.push({ price: res.active.high.price, label: `${name} ${labels.high}`, dash: false });
  if (res.active.low) lines.push({ price: res.active.low.price, label: `${name} ${labels.low}`, dash: false });
  const brk = res.breaks[res.breaks.length - 1];
  if (brk) lines.push({ price: brk.level, label: `${name} ${brk.kind} ${brk.dir === "bull" ? "▲" : "▼"}`, dash: true });
  return { color: HTF_COLORS[tf] ?? "#ffffff", lines };
}
