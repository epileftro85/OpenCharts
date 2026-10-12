// Market structure detection. PURE module: bars in, marks out (ported from market-structure).
// It depends on neither the browser nor the chart, so it is unit-tested.
//
// Definitions (the same ones used by popular "Smart Money Concepts" style indicators):
//
//  • Swing high  : candle whose high is greater than the previous `n` candles' and
//                  greater than or equal to the next `n` candles'.
//  • Swing low   : the same, inverted.
//  • A swing is only CONFIRMED `n` candles after it forms. That is why the most
//    recent marks can appear "late": it is inherent to any swing indicator.
//  • Labels      : each swing is compared with the previous one of the same type
//                  high:  HH (higher) / LH (lower)
//                  low :  HL (higher) / LL (lower)
//  • Break       : when price goes above the last swing high (or below the last
//                  swing low) not yet broken.
//        - If it goes WITH the current trend     → BOS   (Break of Structure)
//        - If it goes AGAINST the current trend  → CHoCH (Change of Character)
//        - The chart's first break sets the trend and is marked as BOS.
//  • `breakBy`   : 'close' (close beyond the level) or 'wick' (the wick is enough).

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
export type BreakBy = "close" | "wick";
export type Trend = "bull" | "bear";

export type Pivot = {
  type: "high" | "low";
  index: number;
  time: number;
  price: number;
  confirmedIndex: number;
  label: "HH" | "LH" | "HL" | "LL" | null;
};

export type Break = {
  kind: "BOS" | "CHoCH";
  dir: Trend;
  level: number;
  fromIndex: number;
  fromTime: number;
  index: number;
  time: number;
};

type Active = { price: number; index: number; time: number };

export type StructureResult = {
  pivots: Pivot[];
  breaks: Break[];
  trend: Trend | null;
  active: { high: Active | null; low: Active | null };
  params: { n: number; breakBy: BreakBy };
};

export function detectStructure(bars: Bar[], opts: { n?: number; breakBy?: BreakBy } = {}): StructureResult {
  const n = Math.max(1, Math.floor(opts.n ?? 3));
  const breakBy: BreakBy = opts.breakBy === "wick" ? "wick" : "close";

  const pivots: Pivot[] = [];
  const breaks: Break[] = [];
  let trend: Trend | null = null;

  let lastHighPivot: Pivot | null = null; // last confirmed pivot high (to label HH/LH)
  let lastLowPivot: Pivot | null = null; // last confirmed pivot low (to label HL/LL)
  let activeHigh: Active | null = null; // swing high level not yet broken
  let activeLow: Active | null = null; // swing low level not yet broken

  for (let i = 0; i < bars.length; i++) {
    // 1) Is a pivot confirmed now? The candidate is candle i-n.
    const p = i - n;
    if (p >= n) {
      const pb = bars[p]!;
      if (isSwingHigh(bars, p, n)) {
        const piv: Pivot = {
          type: "high", index: p, time: pb.time, price: pb.high, confirmedIndex: i,
          label: lastHighPivot ? (pb.high > lastHighPivot.price ? "HH" : "LH") : null,
        };
        pivots.push(piv);
        lastHighPivot = piv;
        activeHigh = { price: piv.price, index: p, time: piv.time };
      }
      if (isSwingLow(bars, p, n)) {
        const piv: Pivot = {
          type: "low", index: p, time: pb.time, price: pb.low, confirmedIndex: i,
          label: lastLowPivot ? (pb.low > lastLowPivot.price ? "HL" : "LL") : null,
        };
        pivots.push(piv);
        lastLowPivot = piv;
        activeLow = { price: piv.price, index: p, time: piv.time };
      }
    }

    // 2) Does the current candle break any active level?
    const bar = bars[i]!;
    const upSide = breakBy === "wick" ? bar.high : bar.close;
    const downSide = breakBy === "wick" ? bar.low : bar.close;

    let broke = false;
    if (activeHigh && upSide > activeHigh.price) {
      breaks.push({
        kind: trend === "bear" ? "CHoCH" : "BOS", dir: "bull",
        level: activeHigh.price, fromIndex: activeHigh.index, fromTime: activeHigh.time,
        index: i, time: bar.time,
      });
      trend = "bull";
      activeHigh = null;
      broke = true;
    }
    if (!broke && activeLow && downSide < activeLow.price) {
      breaks.push({
        kind: trend === "bull" ? "CHoCH" : "BOS", dir: "bear",
        level: activeLow.price, fromIndex: activeLow.index, fromTime: activeLow.time,
        index: i, time: bar.time,
      });
      trend = "bear";
      activeLow = null;
    }
  }

  return { pivots, breaks, trend, active: { high: activeHigh, low: activeLow }, params: { n, breakBy } };
}

function isSwingHigh(bars: Bar[], p: number, n: number): boolean {
  const h = bars[p]!.high;
  for (let j = 1; j <= n; j++) {
    if (bars[p - j]!.high >= h) return false; // left: strictly greater
    if (bars[p + j]!.high > h) return false; // right: greater or equal
  }
  return true;
}

function isSwingLow(bars: Bar[], p: number, n: number): boolean {
  const l = bars[p]!.low;
  for (let j = 1; j <= n; j++) {
    if (bars[p - j]!.low <= l) return false;
    if (bars[p + j]!.low < l) return false;
  }
  return true;
}
