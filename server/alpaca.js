// Alpaca market data provider (US stocks/ETFs and crypto).
//
// Read-only by construction: HTTP calls are GET only, against the market data (bars), assets
// (symbol list) and clock (key check) endpoints, plus the market data stream for live quotes.
// Nothing here touches orders, positions or the account: the terminal paper-trades locally.
//
// Not supported: forex (Alpaca serves FX data to broker partners only) and indices.
import WebSocket from 'ws';
import { config as defaultConfig } from './config.js';
import { TIMEFRAMES, isDaily } from './timeframes.js';
import { TtlCache, err } from './cache.js';
import { aggregateSession, filterRTH, parseName, sortDedup, toDateBar } from './symbols.js';

const DATA_URL = 'https://data.alpaca.markets';
const TRADING_URL = { paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' };
const STREAM_URL = {
  stocks: (feed) => `wss://stream.data.alpaca.markets/v2/${feed}`,
  crypto: () => 'wss://stream.data.alpaca.markets/v1beta3/crypto/us',
};

/**
 * Alpaca timeframe to request for an app timeframe. With RTH, hourly and 4-hour stock bars are
 * built from 30-minute bars so they start at 9:30 / 13:30 New York like IB's.
 */
export function alpacaTimeframe(tf, { rth, crypto }) {
  if (!crypto && rth && (tf === '1h' || tf === '4h')) return '30Min';
  return TIMEFRAMES[tf].alpaca;
}

/** Alpaca bar → app candle. */
const toCandle = (b) => ({
  time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v > 0 ? b.v : 0,
});

/** Shapes raw bars of a stock or crypto pair into the app timeframe. */
export function shapeBars(raw, tf, { rth, crypto }) {
  let bars = sortDedup(raw);
  if (isDaily(tf)) {
    return crypto ? bars.map((b) => ({ ...b, time: b.time - (b.time % 86400) })) : bars.map(toDateBar);
  }
  if (crypto || !rth) return bars;
  bars = filterRTH(bars);
  if (tf === '1h') return aggregateSession(bars, 60);
  if (tf === '4h') return aggregateSession(bars, 240);
  return bars;
}

/** One market data stream socket (stocks or crypto) with its own subscription set. */
class AlpacaStream {
  constructor(url, keys, onData, WS) {
    this.url = url;
    this.keys = keys;
    this.onData = onData;
    this.WS = WS;
    this.symbols = new Set();
    this.ws = null;
    this.authed = false;
    this.timer = null;
    this.closed = false;
  }

  _send(msg) {
    if (this.ws && this.authed && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  _open() {
    if (this.ws || this.closed) return;
    const ws = new this.WS(this.url);
    this.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ action: 'auth', key: this.keys.keyId, secret: this.keys.secretKey })));
    ws.on('message', (raw) => {
      let msgs;
      try { msgs = JSON.parse(String(raw)); } catch { return; }
      for (const m of Array.isArray(msgs) ? msgs : [msgs]) {
        if (m.T === 'success' && m.msg === 'authenticated') {
          this.authed = true;
          if (this.symbols.size) this._send({ action: 'subscribe', quotes: [...this.symbols], trades: [...this.symbols] });
        } else if (m.T === 'error') {
          console.warn(`[alpaca] stream ${m.code}: ${m.msg}`);
        } else if (m.T === 'q' || m.T === 't') {
          this.onData(m);
        }
      }
    });
    const retry = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (!this.closed && this.symbols.size) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this._open(), 5000);
        this.timer.unref?.();
      }
    };
    ws.on('close', retry);
    ws.on('error', (e) => { console.warn(`[alpaca] stream error: ${e.message}`); try { ws.close(); } catch { /* ignore */ } });
  }

  add(symbol) {
    if (this.symbols.has(symbol)) return;
    this.symbols.add(symbol);
    if (!this.ws) this._open();
    else this._send({ action: 'subscribe', quotes: [symbol], trades: [symbol] });
  }

  remove(symbol) {
    if (!this.symbols.delete(symbol)) return;
    this._send({ action: 'unsubscribe', quotes: [symbol], trades: [symbol] });
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

export class AlpacaClient {
  /** `fetch`, `WebSocket` and `config` are injectable for tests. */
  constructor({ config = defaultConfig, fetch: fetchFn = globalThis.fetch, WebSocket: WS = WebSocket } = {}) {
    this.cfg = config;
    this.fetch = fetchFn;
    this.WS = WS;
    this.tradingUrl = config.alpaca.paper ? TRADING_URL.paper : TRADING_URL.live;
    this.ready = false;
    this.lastError = null;
    this.cache = new TtlCache();
    this.retryTimer = null;
    this.streams = {};
    this.listeners = new Map(); // app name -> Set<cb>
    this.quotes = new Map();    // app name -> { bid, ask, at }
  }

  _hasKeys() {
    return Boolean(this.cfg.alpaca.keyId && this.cfg.alpaca.secretKey);
  }

  /** The single place that talks to Alpaca over HTTP. GET only. */
  async _get(base, path, params = {}) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
    let res;
    try {
      res = await this.fetch(url, {
        method: 'GET',
        headers: { 'APCA-API-KEY-ID': this.cfg.alpaca.keyId, 'APCA-API-SECRET-KEY': this.cfg.alpaca.secretKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
      });
    } catch (e) {
      if (e.name === 'TimeoutError') throw err('Timed out waiting for Alpaca', 'TIMEOUT');
      throw err(`Could not reach Alpaca: ${e.message}`, 'NOT_CONNECTED');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.message || res.statusText || 'request failed';
      if (res.status === 401 || res.status === 403) {
        this.ready = false;
        this.lastError = `${res.status}: ${msg}`;
      }
      throw err(`Alpaca ${res.status}: ${msg}`, res.status);
    }
    return body;
  }

  /** Checks the keys with a harmless call (market clock). Retries every 30 s while it fails. */
  async connect() {
    clearTimeout(this.retryTimer);
    if (!this._hasKeys()) {
      this.ready = false;
      this.lastError = 'Missing ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY (see .env.example)';
      console.warn(`[alpaca] ${this.lastError}`);
      return;
    }
    try {
      await this._get(this.tradingUrl, '/v2/clock');
      this.ready = true;
      this.lastError = null;
      console.log(`[alpaca] keys OK (${this.cfg.alpaca.paper ? 'paper' : 'live'}, feed ${this.cfg.alpaca.feed})`);
    } catch (e) {
      this.ready = false;
      this.lastError = e.message;
      console.warn(`[alpaca] ${e.message}`);
      this.retryTimer = setTimeout(() => this.connect(), 30000);
      this.retryTimer.unref?.();
    }
  }

  _requireReady() {
    if (!this.ready) throw err(this.lastError || 'Not connected to Alpaca', 'NOT_CONNECTED');
  }

  /** Active US equities and crypto pairs, fetched once and kept for 12 h (Alpaca has no text search endpoint). */
  _assets() {
    return this.cache.get('assets', 12 * 3600, async () => {
      const [stocks, crypto] = await Promise.all([
        this._get(this.tradingUrl, '/v2/assets', { status: 'active', asset_class: 'us_equity' }),
        this._get(this.tradingUrl, '/v2/assets', { status: 'active', asset_class: 'crypto' }).catch(() => []),
      ]);
      const list = [];
      for (const a of Array.isArray(stocks) ? stocks : []) {
        if (a.symbol && a.tradable !== false) {
          list.push({ name: a.symbol, symbol: a.symbol, secType: 'STK', exchange: a.exchange || '', currency: 'USD', description: a.name || '' });
        }
      }
      for (const a of Array.isArray(crypto) ? crypto : []) {
        const d = parseName(a.symbol);
        if (d?.secType === 'CRYPTO') {
          list.push({ ...d, exchange: 'CRYPTO', description: a.name || a.symbol, tickSize: Number(a.price_increment) || undefined });
        }
      }
      return list;
    });
  }

  async searchSymbols(pattern) {
    this._requireReady();
    const q = pattern.trim().toUpperCase();
    if (!q) return [];
    const plain = q.replace(/[^A-Z0-9]/g, '');
    const assets = await this._assets();
    const exact = [], prefix = [], byName = [];
    for (const a of assets) {
      const key = a.name.replace(/[^A-Z0-9]/g, '');
      if (a.name === q || key === plain) exact.push(a);
      else if (a.name.startsWith(q) || (a.secType === 'CRYPTO' && key.startsWith(plain))) prefix.push(a);
      else if (q.length >= 3 && a.description.toUpperCase().includes(q)) byName.push(a);
    }
    prefix.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    return [...exact, ...prefix, ...byName].slice(0, 25);
  }

  async resolve(name) {
    const d = parseName(name);
    if (!d) throw err(`Invalid symbol "${name}"`, 'BAD_REQUEST');
    if (d.secType === 'CASH' || d.secType === 'IND') {
      throw err(`Alpaca does not provide data for ${d.secType === 'CASH' ? 'forex' : 'indices'} (US stocks, ETFs and crypto only)`, 'UNSUPPORTED');
    }
    if (this.ready) {
      const hit = (await this._assets().catch(() => [])).find((a) => a.name === d.name);
      if (hit) return hit;
    }
    return { ...d, description: d.name };
  }

  async _fetchBars(d, timeframe, startSec, endSec) {
    const crypto = d.secType === 'CRYPTO';
    const path = crypto ? '/v1beta3/crypto/us/bars' : '/v2/stocks/bars';
    const params = { symbols: d.name, timeframe, start: new Date(startSec * 1000).toISOString(), limit: 10000, sort: 'asc' };
    if (endSec) params.end = new Date(endSec * 1000).toISOString();
    if (!crypto) {
      params.adjustment = 'split';
      params.feed = this.cfg.alpaca.feed;
      // Free plans may read SIP only with a 15-minute delay
      if (this.cfg.alpaca.feed === 'sip') {
        const limit = Date.now() - 16 * 60 * 1000;
        if (!endSec || endSec * 1000 > limit) params.end = new Date(limit).toISOString();
      }
    }
    const out = [];
    for (let page = 0; page < 20; page++) {
      const body = await this._get(DATA_URL, path, params);
      for (const b of body.bars?.[d.name] ?? []) out.push(toCandle(b));
      if (!body.next_page_token) break;
      params.page_token = body.next_page_token;
    }
    return out;
  }

  /** Candles for a descriptor. Without a range, the timeframe's default history window ending now. */
  async getBars(d, tf, range = {}) {
    const spec = TIMEFRAMES[tf];
    if (!spec) throw err('invalid timeframe', 'BAD_REQUEST');
    if (d.secType !== 'STK' && d.secType !== 'CRYPTO') {
      throw err(`Alpaca does not provide data for ${d.name} (US stocks, ETFs and crypto only)`, 'UNSUPPORTED');
    }
    this._requireReady();
    const opts = { rth: this.cfg.useRTH, crypto: d.secType === 'CRYPTO' };
    const nowSec = Math.floor(Date.now() / 1000);
    const { fromSec, toSec } = range;
    const historic = fromSec && toSec && toSec < nowSec - spec.sec * 2;
    const key = fromSec ? `bars:${d.name}:${tf}:${fromSec}:${toSec}` : `bars:${d.name}:${tf}`;
    return this.cache.get(key, historic ? 6 * 3600 : spec.ttl, async () => {
      const start = fromSec ?? nowSec - spec.days * 86400;
      const raw = await this._fetchBars(d, alpacaTimeframe(tf, opts), start, toSec);
      return shapeBars(raw, tf, opts);
    });
  }

  _stream(d) {
    const kind = d.secType === 'CRYPTO' ? 'crypto' : 'stocks';
    if (!this.streams[kind]) {
      const url = STREAM_URL[kind](this.cfg.alpaca.feed);
      this.streams[kind] = new AlpacaStream(url, this.cfg.alpaca, (m) => this._onStream(m), this.WS);
    }
    return this.streams[kind];
  }

  /** Quote → bid/ask tick. Trades only produce a tick when there is no usable quote (thin IEX book). */
  _onStream(m) {
    const name = m.S;
    const cbs = this.listeners.get(name);
    if (!cbs?.size) return;
    const at = m.t ? Date.parse(m.t) : Date.now();
    let tick = null;
    if (m.T === 'q') {
      if (m.bp > 0 && m.ap > 0 && m.ap >= m.bp && (m.ap - m.bp) / m.bp < 0.02) {
        this.quotes.set(name, { at: Date.now() });
        tick = { bid: m.bp, ask: m.ap, at };
      }
    } else if (m.p > 0) {
      const q = this.quotes.get(name);
      if (!q || Date.now() - q.at > 5000) tick = { bid: m.p, ask: m.p, at };
    }
    if (tick) for (const cb of cbs) cb(tick);
  }

  /** Live quotes for a descriptor. Returns an unsubscribe function. */
  subscribeQuotes(d, cb) {
    if (!this._hasKeys() || (d.secType !== 'STK' && d.secType !== 'CRYPTO')) return () => {};
    let set = this.listeners.get(d.name);
    if (!set) {
      set = new Set();
      this.listeners.set(d.name, set);
      this._stream(d).add(d.name);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
      if (set.size === 0) {
        this.listeners.delete(d.name);
        this._stream(d).remove(d.name);
      }
    };
  }

  status() {
    return {
      connected: this.ready, mock: false, provider: 'Alpaca',
      target: `${this.cfg.alpaca.paper ? 'paper' : 'live'} · ${this.cfg.alpaca.feed}`, lastError: this.lastError,
    };
  }

  shutdown() {
    clearTimeout(this.retryTimer);
    for (const s of Object.values(this.streams)) s.close();
  }
}

