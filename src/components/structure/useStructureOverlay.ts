import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import type { CandlestickData, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { api } from "../../services/api.ts";
import { computeOverlay, htfGroup, type HtfGroup } from "../../lib/structure/compute.ts";
import { StructurePrimitive } from "../../lib/structure/primitive.ts";
import { detectStructure, type Bar } from "../../lib/structure/structure.ts";
import { HTF_TFS, useStructureStore } from "../../lib/structure/store.ts";
import { useT } from "../../i18n/index.ts";

/** Timeframes from shortest to longest (to know which ones are "higher"). */
const TF_RANK = ["1m", "5m", "10m", "15m", "30m", "1h", "4h", "1d", "1w"];
const RECOMPUTE_MS = 3000;
const HTF_BARS = 1500;

export const higherTfs = (tf: string) => HTF_TFS.filter((h) => TF_RANK.indexOf(h) > TF_RANK.indexOf(tf));

/** Higher-timeframe levels for `symbol` (only fetched while "Higher TF levels" is on). */
export function useHtfGroups(symbol: string, tfs: readonly string[], enabled: boolean): HtfGroup[] {
  const breakBy = useStructureStore((s) => s.breakBy);
  const nByTf = useStructureStore((s) => s.nByTf);
  const t = useT();
  const queries = useQueries({
    queries: tfs.map((tf) => ({
      queryKey: ["structure-htf", symbol, tf] as const,
      queryFn: () => api.getCandles(symbol, tf, HTF_BARS) as Promise<Bar[]>,
      enabled: enabled && !!symbol,
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(",");
  return useMemo(() => {
    if (!enabled) return [];
    const labels = { high: t("ms.htf.high"), low: t("ms.htf.low") };
    return tfs.flatMap((tf, i) => {
      const bars = queries[i]?.data;
      if (!bars?.length) return [];
      return [htfGroup(tf, detectStructure(bars, { n: nByTf[tf] ?? 3, breakBy }), labels)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dataKey, breakBy, nByTf, tfs.join(","), t]);
}

function seriesBars(
  candles: ISeriesApi<"Candlestick">,
  volume: ISeriesApi<"Histogram"> | null,
): Bar[] {
  const vol = new Map<number, number>();
  for (const v of volume?.data() ?? []) {
    const p = v as { time: Time; value?: number };
    vol.set(p.time as number, p.value ?? 0);
  }
  return (candles.data() as CandlestickData<Time>[])
    .filter((c) => Number.isFinite(c.open))
    .map((c) => ({
      time: c.time as number,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: vol.get(c.time as number) ?? 0,
    }));
}

/**
 * Market-structure overlay for the single chart: HH/HL/LH/LL, BOS/CHoCH, zones, liquidity,
 * external structure, higher-TF levels, EMAs and daily VWAP. Reads the candles straight from
 * the chart series, so live updates and history loaded by scrolling back are included.
 */
export function useStructureOverlay(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  volumeSeriesRef: React.RefObject<ISeriesApi<"Histogram"> | null>,
  chartData: CandlestickData<Time>[],
  symbol: string,
  timeframe: string,
): void {
  const swings = useStructureStore((s) => s.swings);
  const structure = useStructureStore((s) => s.structure);
  const breakBy = useStructureStore((s) => s.breakBy);
  const n = useStructureStore((s) => s.nByTf[timeframe] ?? 3);
  const ind = useStructureStore((s) => s.ind);
  const setStatus = useStructureStore((s) => s.setStatus);
  const t = useT();
  const htfTfs = useMemo(() => higherTfs(timeframe), [timeframe]);
  const htf = useHtfGroups(symbol, htfTfs, ind.includes("htf"));

  const primRef = useRef<StructurePrimitive | null>(null);
  const attachedTo = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeries = useRef(new Map<string, ISeriesApi<"Line">>());
  const lineChart = useRef<IChartApi | null>(null);
  const signature = useRef("");

  useEffect(() => {
    const run = (force: boolean) => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) return;

      // (Re)attach after the chart instance was recreated (theme / symbol switches).
      if (attachedTo.current !== series) {
        primRef.current = new StructurePrimitive();
        series.attachPrimitive(primRef.current);
        attachedTo.current = series;
        signature.current = "";
      }
      if (lineChart.current !== chart) {
        lineSeries.current.clear();
        lineChart.current = chart;
      }

      const bars = seriesBars(series, volumeSeriesRef.current);
      const last = bars[bars.length - 1];
      const sig = `${bars.length}:${last?.time}:${last?.close}:${last?.high}:${last?.low}`;
      if (!force && sig === signature.current) return;
      signature.current = sig;

      const res = computeOverlay(bars, { n, breakBy, ind, daily: timeframe === "1d" || timeframe === "1w" });
      primRef.current!.update({ ...res.data, htf }, { swings, structure, sweepLabel: t("ms.sweep") });

      // EMA / VWAP line series: created on demand, removed when switched off.
      const wanted = new Map<string, { color: string; width: number; points: { time: number; value: number }[] }>();
      for (const e of res.emas) wanted.set(e.key, e);
      if (ind.includes("vwap")) wanted.set("vwap", { color: "#fbbf24", width: 2, points: res.vwap });
      for (const [key, s] of lineSeries.current) {
        if (!wanted.has(key)) {
          try {
            chart.removeSeries(s);
          } catch {
            /* already gone with the old chart */
          }
          lineSeries.current.delete(key);
        }
      }
      for (const [key, w] of wanted) {
        let s = lineSeries.current.get(key);
        if (!s) {
          s = chart.addLineSeries({
            color: w.color,
            lineWidth: w.width as 1 | 2 | 3 | 4,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          lineSeries.current.set(key, s);
        }
        s.setData(w.points.map((p) => ({ time: p.time as Time, value: p.value })));
      }

      setStatus({ trend: res.trend, lastBreak: res.lastBreak?.kind ?? null, notes: res.notes });
    };

    run(true);
    const timer = window.setInterval(() => run(false), RECOMPUTE_MS);
    return () => window.clearInterval(timer);
  }, [chartRef, candleSeriesRef, volumeSeriesRef, chartData, swings, structure, breakBy, n, ind, htf, timeframe, setStatus, t]);

  // Detach and clear when the chart goes away.
  useEffect(
    () => () => {
      try {
        if (attachedTo.current && primRef.current) attachedTo.current.detachPrimitive(primRef.current);
      } catch {
        /* chart already removed */
      }
      attachedTo.current = null;
      primRef.current = null;
    },
    [],
  );
}
