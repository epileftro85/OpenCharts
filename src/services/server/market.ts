import type { Candle, Symbol } from "../schemas.ts";
import { registerSymbols } from "../paper/symbols.ts";
import { getJSON } from "./http.ts";

/**
 * Market data from the local server (Alpaca / IBKR / mock). Read-only: the
 * server never places orders — trading is simulated by the paper engine.
 */

/** Symbol spec plus the provider details the server adds. */
export type MarketSymbol = Symbol & {
  secType?: string;
  exchange?: string;
  currency?: string;
};

export type ServerStatus = {
  connected: boolean;
  mock: boolean;
  provider: string;
  target: string;
  lastError: string | null;
  lang: "es" | "en";
  watchlist: string[];
  useRTH: boolean;
};

type CandlesPayload = {
  candles: Candle[];
  metadata: { isPartial: boolean; backfillQueued: boolean; historicalCoverageStart: number | null };
};

// ── Watchlist (per browser, localStorage) ─────────────────
const WATCHLIST_KEY = "oc_watchlist";

export function readWatchlist(): string[] | null {
  try {
    const list = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? "null");
    return Array.isArray(list) ? list.filter((s) => typeof s === "string") : null;
  } catch {
    return null;
  }
}

export function writeWatchlist(names: string[]): void {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...new Set(names)]));
  } catch {
    /* storage unavailable — the watchlist just won't persist */
  }
}

export const getStatus = () => getJSON<ServerStatus>("/status");

/** Specs for the browser's watchlist (the server's default list the first time). */
export async function getWatchlistSymbols(): Promise<MarketSymbol[]> {
  const names = readWatchlist();
  const { symbols, errors } = await getJSON<{ symbols: MarketSymbol[]; errors: { name: string; message: string }[] }>(
    "/symbols",
    { names: names?.join(",") },
  );
  if (errors.length) console.warn("[watchlist] skipped:", errors.map((e) => `${e.name} (${e.message})`).join(", "));
  registerSymbols(symbols);
  if (!names) writeWatchlist(symbols.map((s) => s.name));
  return symbols;
}

export async function searchSymbols(q: string): Promise<MarketSymbol[]> {
  const { results } = await getJSON<{ results: MarketSymbol[] }>("/search", { q });
  registerSymbols(results);
  return results;
}

export function getCandlesWithMeta(
  symbol: string,
  timeframe: string,
  limit?: number,
  range?: { fromMs: number; toMs: number },
): Promise<CandlesPayload> {
  return getJSON<CandlesPayload>("/candles", {
    symbol,
    tf: timeframe,
    limit,
    from: range?.fromMs,
    to: range?.toMs,
  });
}

export async function getCandles(
  symbol: string,
  timeframe: string,
  limit?: number,
  range?: { fromMs: number; toMs: number },
): Promise<Candle[]> {
  return (await getCandlesWithMeta(symbol, timeframe, limit, range)).candles;
}
