// Simulated provider: lets you use the whole terminal without a broker account.
//
// Price is a deterministic function of time (a sum of waves with different periods plus fine noise),
// so every timeframe shows the same market: a 4h candle contains exactly the 1m candles below it,
// trends and pullbacks appear at every scale (there is structure to mark), and the live ticks
// continue the last candle. Markets trade 24/7 here, even stocks.
import { TIMEFRAMES } from './timeframes.js';
import { err } from './cache.js';
import { matchForexPairs } from './forex.js';
import { parseName } from './symbols.js';

const STOCKS = [
  ['SPY', 'SPDR S&P 500 ETF TRUST', 560],
  ['QQQ', 'INVESCO QQQ TRUST', 480],
  ['AAPL', 'APPLE INC', 225],
  ['MSFT', 'MICROSOFT CORP', 430],
  ['NVDA', 'NVIDIA CORP', 125],
  ['TSLA', 'TESLA INC', 250],
  ['AMZN', 'AMAZON.COM INC', 185],
];
const CRYPTO = [['BTC/USD', 'Bitcoin', 62000], ['ETH/USD', 'Ethereum', 2500], ['SOL/USD', 'Solana', 145]];

// [period in minutes, relative amplitude]
const WAVES = [[23, 0.0015], [97, 0.003], [410, 0.006], [1630, 0.012], [6100, 0.025], [21700, 0.05], [83000, 0.09], [310000, 0.16]];

function hash(n) {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seedOf(name) {
  let h = 0x811c9dc5;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** Price of an instrument at `t` seconds. */
export function mockPrice(model, t) {
  const minutes = t / 60;
  let x = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const [period, amp] = WAVES[i];
    const phase = hash(model.seed + i) * Math.PI * 2;
    x += amp * model.vol * Math.sin((2 * Math.PI * minutes) / period + phase);
  }
  // fine noise (per minute and per 5 s), interpolated so it is continuous
  const noise = (u, salt, amp) => {
    const u0 = Math.floor(u);
    const n0 = hash((model.seed ^ salt) + u0) - 0.5;
    const n1 = hash((model.seed ^ salt) + u0 + 1) - 0.5;
    return (n0 + (n1 - n0) * (u - u0)) * amp * model.vol;
  };
  x += noise(minutes, 0x51, 0.0012) + noise(t / 5, 0xa7, 0.0004);
  return model.base * Math.exp(x);
}

function modelFor(d) {
  const known = [...STOCKS, ...CRYPTO].find(([n]) => n === d.name);
  const seed = seedOf(d.name);
  const fxBase = d.currency === 'JPY' ? 150 : 1 + (seed % 60) / 100;
  const base = known ? known[2] : d.secType === 'CASH' ? fxBase : 20 + (seed % 400);
  const vol = d.secType === 'CASH' ? 0.35 : d.secType === 'CRYPTO' ? 1.8 : 1;
  const dp = d.secType === 'CASH' ? (d.currency === 'JPY' ? 3 : 5) : 2;
  return { seed, base, vol, dp };
}

const round = (v, dp) => Number(v.toFixed(dp));

function bar(model, t, sec, isFx) {
  // one sample per minute (12 minimum, 240 maximum): close enough for highs/lows to agree across timeframes
  const steps = Math.min(240, Math.max(12, Math.round(sec / 60)));
  let open = 0, high = -Infinity, low = Infinity, close = 0;
  for (let i = 0; i <= steps; i++) {
    const p = mockPrice(model, t + (sec * i) / steps);
    if (i === 0) open = p;
    close = p;
    high = Math.max(high, p);
    low = Math.min(low, p);
  }
  const vol = isFx ? 0 : Math.floor((0.3 + hash(model.seed ^ t)) * sec * 40);
  return { time: t, open: round(open, model.dp), high: round(high, model.dp), low: round(low, model.dp), close: round(close, model.dp), volume: vol };
}

function describe(d) {
  const known = [...STOCKS, ...CRYPTO].find(([n]) => n === d.name);
  const description = known ? known[1] : d.secType === 'CASH' ? `Forex ${d.name}` : `${d.name} (simulated)`;
  return { ...d, exchange: d.exchange || 'MOCK', description, tickSize: d.secType === 'CASH' ? (d.currency === 'JPY' ? 0.001 : 0.00001) : 0.01 };
}

export class MockClient {
  constructor() {
    this.timers = new Map(); // name -> { timer, cbs }
  }

  connect() {}

  shutdown() {
    for (const { timer } of this.timers.values()) clearInterval(timer);
  }

  status() {
    return { connected: true, mock: true, provider: 'Mock', target: 'simulated data', lastError: null };
  }

  async searchSymbols(q) {
    const s = q.trim().toUpperCase();
    const list = [...STOCKS, ...CRYPTO]
      .filter(([n, desc]) => n.startsWith(s) || n.replace('/', '').startsWith(s) || desc.toUpperCase().includes(s))
      .map(([n]) => describe(parseName(n)));
    const fx = matchForexPairs(q).map((m) => describe(parseName(m.pair)));
    return [...list, ...fx];
  }

  async resolve(name) {
    const d = parseName(name);
    if (!d) throw err(`Invalid symbol "${name}"`, 'BAD_REQUEST');
    return describe(d);
  }

  async getBars(d, tf, range = {}) {
    const spec = TIMEFRAMES[tf];
    if (!spec) throw err('invalid timeframe', 'BAD_REQUEST');
    const model = modelFor(d);
    const nowSec = Math.floor(Date.now() / 1000);
    const step = spec.sec;
    const end = Math.min(range.toSec ?? nowSec, nowSec);
    const start = range.fromSec ?? nowSec - Math.min(spec.days * 86400, step * 3000);
    const out = [];
    // 1w buckets start on Monday 00:00 UTC (epoch 0 was a Thursday)
    const offset = tf === '1w' ? 4 * 86400 : 0;
    for (let t = Math.ceil((start - offset) / step) * step + offset; t <= end; t += step) {
      out.push(bar(model, t, step, d.secType === 'CASH'));
    }
    return out;
  }

  subscribeQuotes(d, cb) {
    let entry = this.timers.get(d.name);
    if (!entry) {
      const model = modelFor(d);
      const half = d.secType === 'CASH' ? model.base * 0.00004 : model.base * 0.0001;
      entry = {
        cbs: new Set(),
        timer: setInterval(() => {
          const p = mockPrice(model, Date.now() / 1000);
          const tick = { bid: round(p - half, model.dp), ask: round(p + half, model.dp), at: Date.now() };
          for (const fn of entry.cbs) fn(tick);
        }, 500),
      };
      entry.timer.unref?.();
      this.timers.set(d.name, entry);
    }
    entry.cbs.add(cb);
    return () => {
      entry.cbs.delete(cb);
      if (!entry.cbs.size) {
        clearInterval(entry.timer);
        this.timers.delete(d.name);
      }
    };
  }
}
