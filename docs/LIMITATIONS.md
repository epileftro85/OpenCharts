# Known limitations

OpenCharts is a **learning terminal**: market data is real (Alpaca / Interactive
Brokers) or simulated (mock), and **every order is paper-traded in the browser**.
The server is read-only by design and never sends orders to a broker. This page
lists what is known to be incomplete or approximate, so nothing here surprises
you while practicing.

_Last updated: 2026-10-12. Covers: data providers (phase 1–2), ES/EN interface (phase 3), market
structure tools, contextual guide and 4-timeframe view (phase 4)._

## Data providers

| Topic | Limitation |
| --- | --- |
| Testing | Alpaca and IBKR were built against fake APIs only (no real keys / IB Gateway were available). The mock provider is the only one exercised end to end. |
| Alpaca | US stocks/ETFs and crypto only — Alpaca does not serve forex or index data to regular accounts. |
| Alpaca feed | `ALPACA_FEED=iex` (free) covers one exchange: volume is lower than the consolidated tape and the IEX quote can be thin. `sip` on a free plan is delayed 15 minutes, so the last candles lag. |
| IBKR session | IBKR allows one session per username: logging in to IB Gateway disconnects TWS / mobile with the same user (use the paper username or a secondary user). |
| IBKR pacing | Historical requests are throttled (~60 per 10 min). Switching symbols/timeframes quickly, or scrolling far back, can be slow; responses are cached per symbol and timeframe. |
| IBKR delayed data | Without a market data subscription (`IB_MARKET_DATA_TYPE=3`) quotes are 15–20 min delayed but stamped with the current time, so the live candle can disagree with history until the next refresh. |
| IBKR instruments | Crypto is not supported through IBKR (use Alpaca). Indices are written `^SPX`; only the 14 forex pairs in `server/forex.js` are searchable. |
| Mock | Prices are a deterministic synthetic function that trades 24/7 (even "stocks"). Candle highs/lows are sampled, so the same move can differ by a few cents between timeframes. |

## Sessions and time

- With `USE_RTH=1` (default) stock/index candles are regular-hours only and **ticks outside 9:30–16:00 New York are dropped**, so prices freeze outside the session.
- Hourly and 4-hour stock candles are session-anchored (9:30, 10:30… / 9:30, 13:30), like IB's.
- The chart time axis is **UTC**, not exchange time.
- The "market closed" banner knows the regular weekly session only — exchange holidays and half days are not modeled.

## Paper trading engine

- **Limit and stop tickets fill immediately** at their requested price; there is no resting-order book. Order modify and cancel-all are no-ops.
- Market orders fill at the live ask (buy) / bid (sell). There is no slippage, commission or swap.
- Margin and P&L are computed in the quote currency **as if it were USD**: crosses such as `EUR.JPY` show margin/P&L in JPY amounts labelled as dollars.
- Leverage is fixed per asset type (stocks 4×, forex 30×, crypto 2×, indices 1×).
- Account, positions and history live in memory: **a page reload starts a new $100,000 paper account**. Drawings, chart settings, watchlist and language are kept in `localStorage`.
- The partial-close button only appears for positions larger than 1 unit.

## Market structure tools

Ported from `market-structure` (HH/HL/LH/LL, BOS/CHoCH, FVG, order blocks, EQH/EQL, sweeps, external
structure, higher-TF levels, EMA 10–200, daily VWAP, volume, Heikin Ashi) together with its contextual guide.

| Topic | Limitation |
| --- | --- |
| Confirmation lag | A swing is only confirmed `n` candles after it forms, so the latest labels appear late — inherent to any swing indicator, not a bug. |
| Live recompute | Marks are recomputed at most every 3 s from the candles on the chart; while a candle is forming, a BOS/CHoCH or zone can appear and then disappear on the next tick (same as any "by close" rule evaluated on an open candle). |
| History analysed | Only the most recent 5,000 candles of the chart are analysed. Older history loaded by scrolling back is drawn but does not change the marks. |
| Heikin Ashi | Applies to the 4-timeframe view only; the single chart always draws real candles. |
| Higher-TF levels | Only 1D, 4H and 15m are used (as in market-structure), each from its latest 1,500 candles, refreshed every 60 s. 1D and 1W charts receive no higher-TF lines. |
| Daily VWAP | Resets at 00:00 UTC. That matches a US regular session, but the "day" for forex and crypto is the UTC day, not a broker or exchange session. Not shown on 1D / 1W. |
| Duplicated tools | The Structure menu EMAs and VWAP are separate from the EMA/VWAP of the *Indicators* menu (different settings). The Structure menu's *Volume* switch also switches the chart's own volume setting. |
| `n` per timeframe | `n` is stored per timeframe and shared by the single chart and the 4-timeframe view. |
| 4-timeframe view | Fixed timeframes 1D · 4H · 15m · 10m and 2,000 candles per panel. The history is refreshed every 60 s; live ticks only move the last candle. No drawing tools, indicators, position/SL/TP lines or scroll-back loading in that view — orders go through the order panel on the right. Hidden panels keep loading while *Higher TF levels* is on. |
| Guide | Numbers in the examples are illustrative, not statistics. Several examples use EUR/USD and IB-specific notes (MIDPOINT forex prices); forex is not available with Alpaca. |
| Performance | Zone and sweep detection scan forward from every candidate (worst case quadratic). On very long histories with every overlay on, recomputes can take tens of milliseconds. |

## Interface

- The depth-of-market ladder sizes are **synthetic** (random sizes around the live price).
- The News tab shows **sample headlines**, not a news feed. The economic calendar and technical-analysis widgets are TradingView embeds.
- Language (ES/EN): numbers keep the `1,234.56` format in both languages so prices match the order inputs. Price-line labels drawn inside the chart (e.g. "compra 0.1") switch language on their next redraw. The account label stays "Paper Account".
- Panels inherited from the original platform that are not reachable (trade journal, session replay, AI trader, prop-firm account states, trade calculator) were not translated.
- The time axis of every chart (single and 4-timeframe) is UTC; market-structure showed New York time.

## Repository status

- The original bundled Binance data (`src/services/paper/data/`, `candles.ts`, `feed.ts`, `scripts/fetch-demo-data.mjs`) is no longer used and should be deleted; `feed.ts` causes 3 TypeScript errors until it is.
- `npm run typecheck` already reported ~150 errors in code inherited from the original platform (queries, replay, journal, preferences); `vite build` and the tests are unaffected.
- README sections after "Quick start" still describe the original static demo.
- Settings of the structure tools, watchlist, language and chart preferences are per browser (`localStorage`); there is no account or sync.
- Tests from `market-structure` for structure/indicators were ported verbatim (`src/lib/structure/*.test.ts`, type-checking disabled in those two files).
