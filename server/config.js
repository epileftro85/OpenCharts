import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Central configuration. Everything can be overridden with environment variables,
// either exported in the shell or written in a `.env` file at the repo root (see .env.example).
// Shell variables win over `.env`.
//
// Typical IB ports:
//   IB Gateway  paper 4002  |  live 4001
//   TWS         paper 7497  |  live 7496
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

export const PROVIDERS = ['alpaca', 'ibkr', 'mock'];

// Which data source to use: DATA_PROVIDER=alpaca (default) | ibkr | mock. MOCK=1 still forces mock.
function pickProvider() {
  if (process.env.MOCK === '1') return 'mock';
  const p = String(process.env.DATA_PROVIDER || 'alpaca').trim().toLowerCase();
  if (!PROVIDERS.includes(p)) {
    console.warn(`[config] unknown DATA_PROVIDER "${p}", using alpaca (valid: ${PROVIDERS.join(', ')})`);
    return 'alpaca';
  }
  return p;
}

const provider = pickProvider();

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// Watchlist a fresh browser starts with, per provider (names as the app shows them).
const DEFAULT_WATCHLIST = {
  alpaca: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'BTC/USD', 'ETH/USD'],
  ibkr: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'EUR.USD', 'GBP.USD', 'USD.JPY'],
  mock: ['SPY', 'AAPL', 'NVDA', 'EUR.USD', 'BTC/USD'],
};

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1', // local only: do not expose this to the network
  provider,
  mock: provider === 'mock',
  // Default UI language: 'es' or 'en'. Each browser can switch it from the toolbar.
  lang: process.env.APP_LANG === 'en' ? 'en' : 'es',
  watchlist: list(process.env.WATCHLIST).length ? list(process.env.WATCHLIST) : DEFAULT_WATCHLIST[provider],
  ib: {
    host: process.env.IB_HOST || '127.0.0.1',
    port: Number(process.env.IB_PORT) || 4001,
    clientId: Number(process.env.IB_CLIENT_ID) || 17,
    // 1 = live, 3 = delayed. Without a market data subscription, IB delivers delayed data.
    marketDataType: Number(process.env.IB_MARKET_DATA_TYPE) || 3,
  },
  // Alpaca market data (read-only: only GET requests and the market data stream).
  // Paper and live accounts have different keys; ALPACA_PAPER=0 uses the live endpoints.
  alpaca: {
    keyId: process.env.ALPACA_API_KEY_ID || '',
    secretKey: process.env.ALPACA_API_SECRET_KEY || '',
    paper: process.env.ALPACA_PAPER !== '0',
    // iex = free for every account; sip = all US exchanges (free plans only get it 15 min delayed)
    feed: process.env.ALPACA_FEED === 'sip' ? 'sip' : 'iex',
  },
  // 1 = regular trading hours only for stocks/indices (cleaner structure). 0 = includes pre/post market.
  useRTH: process.env.USE_RTH !== '0',
  // Minimum gap between IB historical requests (IB allows ~60 per 10 min).
  historicalGapMs: 350,
  requestTimeoutMs: 30000,
  // Max quote updates per symbol pushed to the browser (ms between ticks).
  tickThrottleMs: 250,
};
