import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { api } from "../../services/api.ts";
import { useTradingStore } from "../../services/store.tsx";
import { cn } from "../../lib/utils.ts";
import { useT } from "../../i18n/index.ts";
import { computeOverlay, htfGroup, type HtfGroup } from "../../lib/structure/compute.ts";
import { heikinAshi } from "../../lib/structure/indicators.ts";
import { StructurePrimitive } from "../../lib/structure/primitive.ts";
import type { Bar, StructureResult } from "../../lib/structure/structure.ts";
import { MULTI_LAYOUTS, MULTI_TFS, tfLabel, useStructureStore, type MultiTf } from "../../lib/structure/store.ts";
import { CHART_COLORS } from "../../pages/trading/constants.ts";
import { HelpButton, NControl } from "./StructureMenu.tsx";

/** Candles loaded per panel and initial space per candle in px (same as market-structure). */
const PANEL_BARS = 2000;
const BAR_SPACING = 10;
const TF_SEC: Record<MultiTf, number> = { "1d": 86400, "4h": 14400, "15m": 900, "10m": 600 };

type PanelHandle = { chart: IChartApi; series: ISeriesApi<"Candlestick">; bars: () => Bar[] };

/** Bar at or before `time` (binary search), for the synced crosshair. */
function barAtOrBefore(bars: Bar[], time: number): Bar | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? bars[ans]! : null;
}

function TfPanel({
  tf,
  symbol,
  digits,
  isDark,
  visible,
  enabled,
  active,
  htf,
  onSelect,
  onMaximize,
  onResult,
  register,
  onCrosshair,
}: {
  tf: MultiTf;
  symbol: string;
  digits: number;
  isDark: boolean;
  visible: boolean;
  enabled: boolean;
  active: boolean;
  htf: HtfGroup[];
  onSelect: () => void;
  onMaximize: () => void;
  onResult: (tf: MultiTf, res: StructureResult | null) => void;
  register: (tf: MultiTf, h: PanelHandle | null) => void;
  onCrosshair: (tf: MultiTf, p: MouseEventParams) => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lines = useRef(new Map<string, ISeriesApi<"Line">>());
  const prim = useRef<StructurePrimitive | null>(null);
  const bars = useRef<Bar[]>([]);
  const fitted = useRef(false);
  const [summary, setSummary] = useState<{ text: string; cls: string; notes: string }>({ text: "", cls: "", notes: "" });

  const { swings, structure, breakBy, ind, ha } = useStructureStore();
  const n = useStructureStore((s) => s.nByTf[tf] ?? 3);
  const setStatus = useStructureStore((s) => s.setStatus);
  const tick = useTradingStore((s) => s.ticks[symbol]);

  const { data, error, isLoading } = useQuery({
    queryKey: ["mtf-candles", symbol, tf],
    queryFn: () => api.getCandles(symbol, tf, PANEL_BARS) as Promise<Bar[]>,
    enabled: enabled && !!symbol,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Chart instance (one per panel).
  useEffect(() => {
    if (!box.current) return;
    const c = isDark ? CHART_COLORS.dark : CHART_COLORS.light;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: c.background }, textColor: c.text, fontSize: 11 },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { timeVisible: tf !== "1d", secondsVisible: false, rightOffset: 6, barSpacing: BAR_SPACING },
    });
    const series = chart.addCandlestickSeries({
      upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false,
    });
    const vol = chart.addHistogramSeries({
      visible: false, priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const p = new StructurePrimitive();
    series.attachPrimitive(p);
    chartRef.current = chart;
    seriesRef.current = series;
    volRef.current = vol;
    prim.current = p;
    lines.current.clear();
    fitted.current = false;
    register(tf, { chart, series, bars: () => bars.current });
    const onMove = (param: MouseEventParams) => onCrosshair(tf, param);
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      register(tf, null);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [tf, isDark, register, onCrosshair]);

  // Forex needs 5 decimals (3 for JPY pairs); stocks 2: use the instrument's tick size.
  useEffect(() => {
    seriesRef.current?.applyOptions({ priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits } });
  }, [digits, isDark]);

  // A new symbol starts from scratch.
  useEffect(() => {
    bars.current = [];
    fitted.current = false;
    seriesRef.current?.setData([]);
  }, [symbol]);

  const paint = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const real = bars.current;
    const shown = ha ? heikinAshi(real) : real;
    series.setData(shown.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    // With Heikin Ashi the series' own last value is an average: hide it (the real price is on the tick lines)
    series.applyOptions({ lastValueVisible: !ha, priceLineVisible: !ha });
    if (!fitted.current && real.length && visible) {
      chart.timeScale().applyOptions({ barSpacing: BAR_SPACING });
      chart.timeScale().scrollToRealTime();
      fitted.current = true;
    }
  }, [ha, visible]);

  const recompute = useCallback(() => {
    const chart = chartRef.current;
    const real = bars.current;
    if (!chart || !prim.current) return;
    if (!real.length) {
      prim.current.update(null);
      onResult(tf, null);
      return;
    }
    const res = computeOverlay(real, { n, breakBy, ind, daily: tf === "1d" });
    prim.current.update({ ...res.data, htf }, { swings, structure, sweepLabel: t("ms.sweep") });
    onResult(tf, res.data.structure);

    const wanted = new Map<string, { color: string; width: number; points: { time: number; value: number }[] }>();
    for (const e of res.emas) wanted.set(e.key, e);
    if (ind.includes("vwap")) wanted.set("vwap", { color: "#fbbf24", width: 2, points: res.vwap });
    for (const [key, s] of lines.current) {
      if (!wanted.has(key)) {
        chart.removeSeries(s);
        lines.current.delete(key);
      }
    }
    for (const [key, w] of wanted) {
      let s = lines.current.get(key);
      if (!s) {
        s = chart.addLineSeries({
          color: w.color, lineWidth: w.width as 1 | 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        lines.current.set(key, s);
      }
      s.setData(w.points.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    const vol = volRef.current;
    if (vol) {
      const on = ind.includes("vol");
      vol.applyOptions({ visible: on });
      vol.setData(
        on
          ? real.map((b) => ({
              time: b.time as Time,
              value: b.volume ?? 0,
              color: b.close >= b.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
            }))
          : [],
      );
    }
    const last = res.lastBreak;
    // The selected panel feeds the trend shown on the toolbar's Structure button.
    if (active) setStatus({ trend: res.trend, lastBreak: last?.kind ?? null, notes: res.notes });
    setSummary({
      text: res.trend
        ? `${t(res.trend === "bull" ? "ms.bull" : "ms.bear")}${last ? ` · ${t("ms.last", { kind: last.kind })}` : ""}`
        : t("ms.noTrend"),
      cls: res.trend === "bull" ? "text-buy" : res.trend === "bear" ? "text-sell" : "text-muted-foreground",
      notes: res.notes.map((x) => t(x.key, x.vars)).join(" · "),
    });
  }, [tf, n, breakBy, ind, htf, swings, structure, onResult, t, active, setStatus]);

  // New history from the server (initial load and the 60 s refresh).
  useEffect(() => {
    if (!data) return;
    bars.current = data.map((b) => ({ ...b }));
    paint();
    recompute();
  }, [data, paint, recompute]);

  // Settings changes re-draw without refetching.
  useEffect(() => {
    paint();
  }, [paint]);
  useEffect(() => {
    recompute();
  }, [recompute]);

  // Live quotes move the last candle (anchored to the last bar, like the main chart).
  useEffect(() => {
    const series = seriesRef.current;
    const real = bars.current;
    const last = real[real.length - 1];
    if (!tick || !series || !last) return;
    const mid = (tick.bid + tick.ask) / 2;
    if (!(mid > 0)) return;
    const tSec = Math.floor(tick.timestamp / 1000);
    if (tSec < last.time) return;
    const step = TF_SEC[tf];
    const bucket = last.time + Math.floor((tSec - last.time) / step) * step;
    if (bucket === last.time) {
      last.high = Math.max(last.high, mid);
      last.low = Math.min(last.low, mid);
      last.close = mid;
    } else {
      real.push({ time: bucket, open: last.close, high: Math.max(last.close, mid), low: Math.min(last.close, mid), close: mid, volume: 0 });
    }
    const shown = ha ? heikinAshi(real.slice(-60)) : real.slice(-1);
    const b = shown[shown.length - 1]!;
    try {
      series.update({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close });
    } catch {
      /* older than the series — ignore */
    }
  }, [tick, tf, ha]);

  // Marks follow live candles at most every 3 s.
  useEffect(() => {
    const timer = window.setInterval(recompute, 3000);
    return () => window.clearInterval(timer);
  }, [recompute]);

  // A panel that was hidden while data arrived has no size: fit once it becomes visible.
  useEffect(() => {
    if (visible && !fitted.current && bars.current.length) requestAnimationFrame(paint);
  }, [visible, paint]);

  const message = error ? (error as Error).message : !isLoading && data && !data.length ? t("mtf.noBars") : isLoading && enabled ? t("common.loading") : "";

  return (
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col border border-border bg-card",
        active && "border-primary/60",
        !visible && "hidden",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1 text-xs">
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onMaximize}
          title={t("mtf.tfBtn")}
          className={cn("rounded px-1.5 py-0.5 font-semibold", active ? "bg-primary text-primary-foreground" : "bg-secondary")}
        >
          {tfLabel(tf)}
        </button>
        <span className="font-semibold">{symbol}</span>
        <span className={summary.cls}>{summary.text}</span>
        {summary.notes && <span className="truncate text-[10px] text-warning">{summary.notes}</span>}
        <span className="flex-1" />
        <NControl tf={tf} compact />
        <HelpButton helpKey="swings" label={t("mtf.nHelp")} />
      </header>
      <div ref={box} className="min-h-0 flex-1" />
      {message && (
        <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto w-fit rounded bg-card/90 px-3 py-1.5 text-xs text-muted-foreground">
          {message}
        </div>
      )}
    </section>
  );
}

/**
 * Optional 4-timeframe view (1D · 4H · 15m · 10m) ported from market-structure: each panel marks its own
 * structure with its own n, higher-TF levels flow from the panels above, the crosshair is synced and
 * the layout cycles 4 → 2 → 1 (key L). Paper orders still go through the order panel.
 */
export function MultiTimeframeView({ symbol, digits, isDark }: { symbol: string; digits: number; isDark: boolean }) {
  const t = useT();
  const layout = useStructureStore((s) => s.multiLayout);
  const activeTf = useStructureStore((s) => s.multiActive);
  const htfOn = useStructureStore((s) => s.ind.includes("htf"));
  const set = useStructureStore((s) => s.set);
  const [second, setSecond] = useState<MultiTf>(activeTf === "4h" ? "15m" : "4h");
  const [results, setResults] = useState<Partial<Record<MultiTf, StructureResult | null>>>({});
  const handles = useRef(new Map<MultiTf, PanelHandle>());
  const resultSig = useRef(new Map<MultiTf, string>());
  const syncing = useRef(false);

  const shown: readonly MultiTf[] =
    layout === 4 ? MULTI_TFS : layout === 2 ? MULTI_TFS.filter((x) => x === activeTf || x === second) : [activeTf];
  // With "Higher TF levels", hidden higher panels still load so the lower ones can draw their levels.
  const lowest = Math.max(...shown.map((x) => MULTI_TFS.indexOf(x)));
  const needed = (tf: MultiTf) => shown.includes(tf) || (htfOn && MULTI_TFS.indexOf(tf) < lowest);

  const select = useCallback(
    (tf: MultiTf) => {
      if (tf !== activeTf) setSecond(activeTf);
      set({ multiActive: tf });
    },
    [activeTf, set],
  );
  const cycleLayout = useCallback(() => {
    const i = MULTI_LAYOUTS.indexOf(layout);
    set({ multiLayout: MULTI_LAYOUTS[(i + 1) % MULTI_LAYOUTS.length]! });
  }, [layout, set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "l" || e.key === "L") cycleLayout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleLayout]);

  // Only what the higher-TF lines use (active swings + last break) counts as a change; otherwise every
  // recompute would re-render the lower panels, which would recompute again.
  const onResult = useCallback((tf: MultiTf, res: StructureResult | null) => {
    const sig = res ? JSON.stringify([res.active, res.breaks[res.breaks.length - 1] ?? null]) : "";
    if (resultSig.current.get(tf) === sig) return;
    resultSig.current.set(tf, sig);
    setResults((r) => ({ ...r, [tf]: res }));
  }, []);
  const register = useCallback((tf: MultiTf, h: PanelHandle | null) => {
    if (h) handles.current.set(tf, h);
    else handles.current.delete(tf);
  }, []);
  // Synced crosshair: same time on every visible chart.
  const onCrosshair = useCallback((source: MultiTf, param: MouseEventParams) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (const [tf, h] of handles.current) {
        if (tf === source) continue;
        const bar = param.time !== undefined ? barAtOrBefore(h.bars(), param.time as number) : null;
        if (bar) h.chart.setCrosshairPosition(bar.close, bar.time as Time, h.series);
        else h.chart.clearCrosshairPosition();
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  const labels = useMemo(() => ({ high: t("ms.htf.high"), low: t("ms.htf.low") }), [t]);
  const htfFor = useCallback(
    (tf: MultiTf): HtfGroup[] => {
      if (!htfOn) return [];
      const k = MULTI_TFS.indexOf(tf);
      return MULTI_TFS.slice(0, k).flatMap((h) => {
        const res = results[h];
        return res ? [htfGroup(h, res, labels)] : [];
      });
    },
    [htfOn, results, labels],
  );
  const htfGroups = useMemo(
    () => Object.fromEntries(MULTI_TFS.map((tf) => [tf, htfFor(tf)])) as Record<MultiTf, HtfGroup[]>,
    [htfFor],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1 text-xs">
        <button type="button" onClick={cycleLayout} title={t("mtf.layout")} className="rounded bg-secondary px-2 py-0.5 hover:bg-border">
          {t("mtf.layoutLabel", { n: layout })}
        </button>
        {MULTI_TFS.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => select(tf)}
            className={cn(
              "rounded-full border px-2 py-0.5",
              shown.includes(tf) ? "border-primary/60 text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {tfLabel(tf)}
          </button>
        ))}
        <span className="ml-2 truncate text-[10px] text-muted-foreground">{t("mtf.trade")}</span>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-px",
          layout === 4 && "grid-cols-1 md:grid-cols-2 md:grid-rows-2",
          layout === 2 && "grid-cols-1 md:grid-cols-2",
          layout === 1 && "grid-cols-1",
        )}
      >
        {MULTI_TFS.map((tf) => (
          <TfPanel
            key={tf}
            tf={tf}
            symbol={symbol}
            digits={digits}
            isDark={isDark}
            visible={shown.includes(tf)}
            enabled={needed(tf)}
            active={tf === activeTf}
            htf={htfGroups[tf]}
            onSelect={() => select(tf)}
            onMaximize={() => {
              select(tf);
              set({ multiLayout: 1 });
            }}
            onResult={onResult}
            register={register}
            onCrosshair={onCrosshair}
          />
        ))}
      </div>
    </div>
  );
}
