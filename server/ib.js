// Interactive Brokers provider (stocks/ETFs, indices, forex) through IB Gateway or TWS.
//
// Read-only: it only requests contract details, historical bars and market data. It never
// places orders (keep "Read-Only API" enabled in IB Gateway). The terminal paper-trades locally.
import { IBApi, EventName, isNonFatalError } from '@stoqey/ib';
import { config } from './config.js';
import { TIMEFRAMES, ibDuration, ibEndDateTime } from './timeframes.js';
import { TtlCache, err } from './cache.js';
import { matchForexPairs, looksLikePair } from './forex.js';
import { nameOf, parseName, sortDedup } from './symbols.js';

const SEARCH_SEC_TYPES = ['STK', 'IND', 'CASH'];
// IB tick types: live and delayed (reqMarketDataType 3) bid / ask / last
const BID = new Set([1, 66]);
const ASK = new Set([2, 67]);
const LAST = new Set([4, 68]);

/** Converts IB's `time` field to epoch seconds. */
export function parseIbTime(s) {
  if (/^\d{8}$/.test(s)) {
    // Daily/weekly bars arrive as yyyymmdd (no time) → UTC midnight of that date
    const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
    return Date.UTC(y, m - 1, d) / 1000;
  }
  if (/^\d+$/.test(s)) return Number(s);
  return Math.floor(Date.parse(s) / 1000);
}

/** Builds the IB Contract for a descriptor. */
export function buildContract(d) {
  const base = { symbol: d.symbol, secType: d.secType, currency: d.currency };
  if (d.conId) base.conId = d.conId;
  if (d.secType === 'STK') return { ...base, exchange: 'SMART' };
  if (d.secType === 'CASH') return { ...base, exchange: 'IDEALPRO' };
  return { ...base, exchange: d.exchange }; // IND: native exchange
}

export class IBClient {
  constructor() {
    this.ib = new IBApi({ host: config.ib.host, port: config.ib.port, clientId: config.ib.clientId });
    this.ready = false;
    this.lastError = null;
    this.nextId = 1;
    this.pending = new Map();   // reqId -> { resolve, reject, timer, data, kind }
    this.cache = new TtlCache();
    this.queue = Promise.resolve();
    this.registry = new Map();  // app name -> descriptor (conId never changes)
    this.mkt = new Map();       // reqId -> { d, bid, ask, cbs }
    this.mktByName = new Map(); // app name -> reqId
    this.reconnectTimer = null;
    this._wire();
  }

  _wire() {
    const ib = this.ib;

    ib.on(EventName.connected, () => console.log(`[ib] socket connected (${config.ib.host}:${config.ib.port})`));

    ib.on(EventName.nextValidId, (id) => {
      this.nextId = Math.max(this.nextId, id);
      this.ready = true;
      this.lastError = null;
      try { ib.reqMarketDataType(config.ib.marketDataType); } catch { /* not critical */ }
      console.log('[ib] ready to request data');
      this._resubscribeAll();
    });

    ib.on(EventName.disconnected, () => {
      if (this.ready) console.warn('[ib] disconnected');
      this.ready = false;
      this._failAll(err('Connection to IB lost', 'DISCONNECTED'));
      this._scheduleReconnect();
    });

    ib.on(EventName.error, (e, code, reqId) => {
      const p = this.pending.get(reqId);
      if (p && !isNonFatalError(code, e)) {
        this._settle(reqId, 'reject', Object.assign(err(e.message, code), { ibCode: code }));
        return;
      }
      const m = this.mkt.get(reqId);
      if (m) {
        if (code < 2100 || code >= 3000) console.warn(`[ib] market data ${m.d.name}: ${code} ${e.message}`);
        return;
      }
      if (reqId === -1 || reqId === undefined) {
        // Informational messages (2104, 2106, 2158 = data farm OK) are not real errors
        if (code >= 2100 && code < 3000) return;
        this.lastError = `${code}: ${e.message}`;
        console.warn(`[ib] ${this.lastError}`);
        if (code === 502 || code === 504) this._scheduleReconnect();
      }
    });

    ib.on(EventName.historicalData, (reqId, time, o, h, l, c, v) => {
      const p = this.pending.get(reqId);
      if (!p || p.kind !== 'bars') return;
      if (typeof time === 'string' && time.startsWith('finished')) {
        this._settle(reqId, 'resolve', p.data);
        return;
      }
      if (o < 0 || h < 0 || l < 0 || c < 0) return; // IB uses -1 for "no data"
      // forex (MIDPOINT) comes with volume -1
      p.data.push({ time: parseIbTime(String(time)), open: o, high: h, low: l, close: c, volume: v > 0 ? v : 0 });
    });

    ib.on(EventName.contractDetails, (reqId, details) => {
      const p = this.pending.get(reqId);
      if (p && p.kind === 'details') p.data.push(details);
    });

    ib.on(EventName.contractDetailsEnd, (reqId) => {
      const p = this.pending.get(reqId);
      if (p && p.kind === 'details') this._settle(reqId, 'resolve', p.data);
    });

    ib.on(EventName.symbolSamples, (reqId, descriptions) => {
      const p = this.pending.get(reqId);
      if (!p || p.kind !== 'search') return;
      this._settle(reqId, 'resolve', descriptions || []);
    });

    ib.on(EventName.tickPrice, (reqId, field, price) => {
      const m = this.mkt.get(reqId);
      if (!m || !(price > 0)) return;
      if (BID.has(field)) m.bid = price;
      else if (ASK.has(field)) m.ask = price;
      else if (LAST.has(field)) m.last = price;
      else return;
      // Indices only have LAST; stocks/forex need both sides
      const bid = m.bid ?? m.last;
      const ask = m.ask ?? m.last;
      if (!(bid > 0 && ask > 0)) return;
      const tick = { bid: Math.min(bid, ask), ask: Math.max(bid, ask), at: Date.now() };
      for (const cb of m.cbs) cb(tick);
    });
  }

  connect() {
    try { this.ib.connect(); } catch (e) { this.lastError = e.message; this._scheduleReconnect(); }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.ready) this.connect();
    }, 5000);
  }

  _settle(reqId, how, value) {
    const p = this.pending.get(reqId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(reqId);
    if (how === 'resolve') p.resolve(value);
    else p.reject(value);
  }

  _failAll(e) {
    for (const reqId of [...this.pending.keys()]) this._settle(reqId, 'reject', e);
  }

  _request(kind, send) {
    if (!this.ready) return Promise.reject(err('No connection to IB Gateway/TWS', 'NOT_CONNECTED'));
    const reqId = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (kind === 'bars') { try { this.ib.cancelHistoricalData(reqId); } catch { /* ignore */ } }
        this._settle(reqId, 'reject', err('Timed out waiting for IB', 'TIMEOUT'));
      }, config.requestTimeoutMs);
      this.pending.set(reqId, { resolve, reject, timer, data: [], kind });
      try { send(reqId); } catch (e) { this._settle(reqId, 'reject', e); }
    });
  }

  /** Serializes historical requests with a pause between them (IB pacing: ~60 requests / 10 min). */
  _enqueueHistorical(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, config.historicalGapMs)));
    return run;
  }

  _remember(d) {
    this.registry.set(d.name, d);
    return d;
  }

  /** Contract details → descriptor (first match). */
  async _details(contract, name) {
    const details = await this._request('details', (id) => this.ib.reqContractDetails(id, contract));
    const det = details[0];
    if (!det?.contract?.conId) throw err(`IB could not find ${name}`, 'NOT_FOUND');
    const c = det.contract;
    return this._remember({
      name, symbol: c.symbol, secType: c.secType, currency: c.currency,
      conId: c.conId, exchange: c.primaryExch || c.exchange || '',
      description: det.longName || name, tickSize: det.minTick || undefined,
    });
  }

  _forex({ pair, base, quote }) {
    const name = `${base}.${quote}`;
    if (this.registry.has(name)) return Promise.resolve(this.registry.get(name));
    return this._details({ symbol: base, secType: 'CASH', exchange: 'IDEALPRO', currency: quote }, name)
      .then((d) => this._remember({ ...d, description: `Forex ${pair}` }));
  }

  async _searchForex(q) {
    const settled = await Promise.allSettled(matchForexPairs(q).map((m) => this._forex(m)));
    const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length && settled.length) throw settled[0].reason; // all failed
    return ok;
  }

  async _searchStocks(q) {
    return this.cache.get(`search:${q}`, 600, async () => {
      const descs = await this._request('search', (id) => this.ib.reqMatchingSymbols(id, q));
      const results = [];
      for (const desc of descs) {
        const c = desc.contract;
        if (!c || !c.conId || !SEARCH_SEC_TYPES.includes(c.secType) || c.secType === 'CASH') continue;
        const d = { symbol: c.symbol, secType: c.secType, currency: c.currency || 'USD', conId: c.conId, exchange: c.primaryExch || c.exchange || '', description: c.description || '' };
        results.push(this._remember({ ...d, name: nameOf(d) }));
      }
      return results;
    });
  }

  async searchSymbols(pattern) {
    const q = pattern.trim().toUpperCase();
    // "EUR.USD" or "EURUSD" are not stock tickers: skip that search entirely
    const pairOnly = looksLikePair(q) && matchForexPairs(q).length > 0;
    const [stocks, fx] = await Promise.allSettled([
      pairOnly ? Promise.resolve([]) : this._searchStocks(q.replace(/^\^/, '')),
      this._searchForex(q),
    ]);
    const a = stocks.status === 'fulfilled' ? stocks.value : [];
    const b = fx.status === 'fulfilled' ? fx.value : [];
    if (!a.length && !b.length) {
      const failed = [stocks, fx].find((r) => r.status === 'rejected');
      if (failed) throw failed.reason;
    }
    return pairOnly ? [...b, ...a] : [...a, ...b];
  }

  async resolve(name) {
    const d = parseName(name);
    if (!d) throw err(`Invalid symbol "${name}"`, 'BAD_REQUEST');
    if (this.registry.has(d.name)) return this.registry.get(d.name);
    if (d.secType === 'CRYPTO') throw err('Crypto is not supported with the IBKR provider (use Alpaca)', 'UNSUPPORTED');
    return this.cache.get(`resolve:${d.name}`, 3600, () => {
      if (d.secType === 'CASH') return this._forex({ pair: d.name, base: d.symbol, quote: d.currency });
      if (d.secType === 'IND') return this._details({ symbol: d.symbol, secType: 'IND', currency: 'USD' }, d.name);
      return this._details({ symbol: d.symbol, secType: 'STK', exchange: 'SMART', currency: 'USD' }, d.name);
    });
  }

  async getBars(d, tf, range = {}) {
    const spec = TIMEFRAMES[tf];
    if (!spec) throw err('invalid timeframe', 'BAD_REQUEST');
    const { fromSec, toSec } = range;
    const nowSec = Math.floor(Date.now() / 1000);
    const historic = fromSec && toSec && toSec < nowSec - spec.sec * 2;
    const key = fromSec ? `bars:${d.name}:${tf}:${fromSec}:${toSec}` : `bars:${d.name}:${tf}`;
    return this.cache.get(key, historic ? 6 * 3600 : spec.ttl, () =>
      this._enqueueHistorical(async () => {
        const contract = buildContract(d);
        const whatToShow = d.secType === 'CASH' ? 'MIDPOINT' : 'TRADES';
        const rth = d.secType === 'CASH' ? 0 : config.useRTH ? 1 : 0;
        const end = fromSec ? ibEndDateTime(toSec ?? nowSec) : '';
        const dur = fromSec ? ibDuration(fromSec, toSec ?? nowSec) : spec.ibDur;
        const bars = await this._request('bars', (id) =>
          this.ib.reqHistoricalData(id, contract, end, dur, spec.ibBar, whatToShow, rth, 2, false),
        );
        const out = sortDedup(bars);
        return fromSec ? out.filter((b) => b.time >= fromSec) : out;
      }),
    );
  }

  _startMkt(name) {
    const m = this.mkt.get(this.mktByName.get(name));
    if (!m || !this.ready) return;
    const reqId = this.nextId++;
    this.mkt.delete(this.mktByName.get(name));
    this.mkt.set(reqId, m);
    this.mktByName.set(name, reqId);
    try { this.ib.reqMktData(reqId, buildContract(m.d), '', false, false); } catch (e) { console.warn(`[ib] reqMktData ${name}: ${e.message}`); }
  }

  _resubscribeAll() {
    for (const name of this.mktByName.keys()) this._startMkt(name);
  }

  /** Live bid/ask for a descriptor (delayed without a market data subscription). Returns an unsubscribe function. */
  subscribeQuotes(d, cb) {
    let reqId = this.mktByName.get(d.name);
    let m = reqId !== undefined ? this.mkt.get(reqId) : null;
    if (!m) {
      m = { d, cbs: new Set() };
      reqId = -(this.mkt.size + 1) - Date.now(); // placeholder id until the request is sent
      this.mkt.set(reqId, m);
      this.mktByName.set(d.name, reqId);
      this._startMkt(d.name);
    }
    m.cbs.add(cb);
    return () => {
      m.cbs.delete(cb);
      if (m.cbs.size) return;
      const id = this.mktByName.get(d.name);
      this.mkt.delete(id);
      this.mktByName.delete(d.name);
      if (this.ready && id > 0) { try { this.ib.cancelMktData(id); } catch { /* ignore */ } }
    };
  }

  status() {
    return {
      connected: this.ready, mock: false, provider: 'IBKR',
      target: `${config.ib.host}:${config.ib.port}`, lastError: this.lastError,
    };
  }

  shutdown() {
    clearTimeout(this.reconnectTimer);
    try { this.ib.disconnect(); } catch { /* ignore */ }
  }
}
