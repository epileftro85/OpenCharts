// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { aggregateSession, filterRTH, isRTH, nameOf, nyClock, parseName, toAppSymbol, toDateBar } from '../symbols.js';
import { AlpacaClient, alpacaTimeframe, shapeBars } from '../alpaca.js';
import { MockClient, mockPrice } from '../mock.js';
import { ibDuration, ibEndDateTime } from '../timeframes.js';

const sec = (iso) => Date.parse(iso) / 1000;
const bar = (iso, open, high, low, close, volume = 100) => ({ time: sec(iso), open, high, low, close, volume });

function makeConfig(over = {}) {
  return { useRTH: true, requestTimeoutMs: 5000, alpaca: { keyId: 'k', secretKey: 's', paper: true, feed: 'iex', ...over } };
}

// Fake fetch: records every call and answers by path
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    const handler = routes[u.pathname];
    if (!handler) return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    const out = handler(u);
    return { ok: (out.status ?? 200) < 400, status: out.status ?? 200, statusText: '', json: async () => out.body };
  };
  fn.calls = calls;
  return fn;
}

describe('symbol names', () => {
  it('parses every asset type', () => {
    expect(parseName('aapl')).toMatchObject({ name: 'AAPL', secType: 'STK' });
    expect(parseName('EUR.USD')).toMatchObject({ symbol: 'EUR', currency: 'USD', secType: 'CASH' });
    expect(parseName('BTC/USD')).toMatchObject({ symbol: 'BTC', currency: 'USD', secType: 'CRYPTO' });
    expect(parseName('^SPX')).toMatchObject({ symbol: 'SPX', secType: 'IND' });
    expect(parseName('bad;name')).toBeNull();
  });

  it('round-trips names', () => {
    for (const n of ['AAPL', 'EUR.USD', 'BTC/USD', '^SPX']) expect(nameOf(parseName(n))).toBe(n);
  });

  it('builds app symbols with paper leverage and session hours', () => {
    const s = toAppSymbol({ ...parseName('AAPL'), description: 'Apple' });
    expect(s).toMatchObject({ name: 'AAPL', category: 'STOCK', tickSize: 0.01, maxLeverage: 4, sessionTimezone: 'America/New_York' });
    expect(s.tradingHours).toHaveLength(5);
    expect(toAppSymbol(parseName('USD.JPY')).tickSize).toBe(0.001);
  });
});

describe('sessions', () => {
  it('nyClock handles daylight saving time', () => {
    expect(nyClock(sec('2026-03-02T14:30:00Z'))).toMatchObject({ day: '2026-03-02', minute: 570, dow: 1 }); // EST
    expect(nyClock(sec('2026-07-01T13:30:00Z'))).toMatchObject({ day: '2026-07-01', minute: 570 }); // EDT
  });

  it('filterRTH keeps only 9:30–16:00 New York on weekdays', () => {
    const bars = [
      bar('2026-03-02T14:00:00Z', 1, 1, 1, 1), // 9:00 pre-market
      bar('2026-03-02T14:30:00Z', 1, 1, 1, 1), // 9:30
      bar('2026-03-02T20:45:00Z', 1, 1, 1, 1), // 15:45
      bar('2026-03-02T21:00:00Z', 1, 1, 1, 1), // 16:00 after-hours
    ];
    expect(filterRTH(bars).map((b) => nyClock(b.time).minute)).toEqual([570, 945]);
    expect(isRTH(sec('2026-03-07T15:00:00Z'))).toBe(false); // Saturday
  });

  it('aggregateSession builds 9:30 and 13:30 candles for 4h', () => {
    const out = aggregateSession([
      bar('2026-03-02T14:30:00Z', 10, 12, 9, 11, 5),
      bar('2026-03-02T18:00:00Z', 11, 15, 10, 14, 5), // 13:00, still first candle
      bar('2026-03-02T18:30:00Z', 14, 14, 8, 9, 7), // 13:30, second candle
      bar('2026-03-02T20:30:00Z', 9, 10, 7, 8, 1),
      bar('2026-03-03T14:30:00Z', 8, 9, 8, 9, 2), // next day
    ], 240);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual(bar('2026-03-02T14:30:00Z', 10, 15, 9, 14, 10));
    expect(out[1]).toEqual(bar('2026-03-02T18:30:00Z', 14, 14, 7, 8, 8));
    expect(out[2].time).toBe(sec('2026-03-03T14:30:00Z'));
  });

  it('aggregateSession anchors hourly bars at :30', () => {
    const out = aggregateSession([bar('2026-03-02T15:00:00Z', 1, 2, 1, 2), bar('2026-03-02T15:30:00Z', 2, 3, 2, 3)], 60);
    expect(out.map((b) => nyClock(b.time).minute)).toEqual([570, 630]); // 9:30 and 10:30
  });

  it('daily bars land on UTC midnight of the New York date', () => {
    expect(toDateBar(bar('2026-03-02T05:00:00Z', 1, 1, 1, 1)).time).toBe(sec('2026-03-02T00:00:00Z'));
  });
});

describe('IB helpers', () => {
  it('formats durations and end times', () => {
    expect(ibDuration(0, 3 * 86400)).toBe('3 D');
    expect(ibDuration(0, 400 * 86400)).toBe('2 Y');
    expect(ibEndDateTime(sec('2026-03-02T14:30:05Z'))).toBe('20260302-14:30:05');
  });
});

describe('Alpaca provider', () => {
  it('maps timeframes (RTH hourly/4h come from 30-minute bars)', () => {
    expect(alpacaTimeframe('4h', { rth: true, crypto: false })).toBe('30Min');
    expect(alpacaTimeframe('4h', { rth: false, crypto: false })).toBe('4Hour');
    expect(alpacaTimeframe('1h', { rth: true, crypto: true })).toBe('1Hour');
    expect(alpacaTimeframe('1d', { rth: true, crypto: false })).toBe('1Day');
  });

  it('shapes crypto daily bars to UTC midnight', () => {
    const out = shapeBars([bar('2026-03-02T05:00:00Z', 1, 1, 1, 1)], '1d', { rth: true, crypto: true });
    expect(out[0].time).toBe(sec('2026-03-02T00:00:00Z'));
  });

  it('without keys: not connected, clear message, no network calls', async () => {
    const fetch = fakeFetch({});
    const c = new AlpacaClient({ config: makeConfig({ keyId: '', secretKey: '' }), fetch });
    await c.connect();
    expect(c.status().connected).toBe(false);
    expect(c.status().lastError).toMatch(/ALPACA_API_KEY_ID/);
    expect(fetch.calls).toHaveLength(0);
    await expect(c.getBars(parseName('AAPL'), '1d')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it('only issues GET requests, with the key headers', async () => {
    const fetch = fakeFetch({
      '/v2/clock': () => ({ body: { is_open: true } }),
      '/v2/stocks/bars': () => ({ body: { bars: { AAPL: [{ t: '2026-03-02T14:30:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] } } }),
    });
    const c = new AlpacaClient({ config: makeConfig(), fetch });
    await c.connect();
    const bars = await c.getBars(parseName('AAPL'), '15m');
    expect(bars).toEqual([bar('2026-03-02T14:30:00Z', 1, 2, 0.5, 1.5, 10)]);
    for (const { init } of fetch.calls) {
      expect(init.method).toBe('GET');
      expect(init.headers['APCA-API-KEY-ID']).toBe('k');
    }
    const req = fetch.calls.find((x) => x.url.pathname === '/v2/stocks/bars').url;
    expect(req.searchParams.get('feed')).toBe('iex');
    expect(req.searchParams.get('timeframe')).toBe('15Min');
  });

  it('routes crypto to the crypto endpoint and rejects forex', async () => {
    const fetch = fakeFetch({
      '/v2/clock': () => ({ body: {} }),
      '/v1beta3/crypto/us/bars': () => ({ body: { bars: { 'BTC/USD': [] } } }),
    });
    const c = new AlpacaClient({ config: makeConfig(), fetch });
    await c.connect();
    await c.getBars(parseName('BTC/USD'), '1h');
    expect(fetch.calls.some((x) => x.url.pathname === '/v1beta3/crypto/us/bars')).toBe(true);
    await expect(c.resolve('EUR.USD')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('turns quotes into ticks and ignores crossed books', () => {
    const c = new AlpacaClient({ config: makeConfig(), fetch: fakeFetch({}) });
    const ticks = [];
    c.listeners.set('AAPL', new Set([(t) => ticks.push(t)]));
    c._onStream({ T: 'q', S: 'AAPL', bp: 100, ap: 100.02, t: '2026-03-02T15:00:00Z' });
    c._onStream({ T: 'q', S: 'AAPL', bp: 101, ap: 100, t: '2026-03-02T15:00:01Z' }); // crossed
    c._onStream({ T: 't', S: 'AAPL', p: 100.01, t: '2026-03-02T15:00:02Z' }); // quote is fresh → no trade tick
    expect(ticks).toEqual([{ bid: 100, ask: 100.02, at: sec('2026-03-02T15:00:00Z') * 1000 }]);
  });
});

describe('mock provider', () => {
  it('is consistent across timeframes (a 1h bar spans its 1m bars)', async () => {
    const m = new MockClient();
    const d = await m.resolve('SPY');
    const hour = 3600 * 480000; // 2024, in the past
    const [h] = await m.getBars(d, '1h', { fromSec: hour, toSec: hour + 3599 });
    const mins = await m.getBars(d, '1m', { fromSec: hour, toSec: hour + 3599 });
    expect(mins).toHaveLength(60);
    expect(h.open).toBeCloseTo(mins[0].open, 1);
    expect(Math.max(...mins.map((b) => b.high))).toBeLessThanOrEqual(h.high * 1.001); // sampled: within 0.1%
  });

  it('prices are deterministic', () => {
    const model = { seed: 1, base: 100, vol: 1, dp: 2 };
    expect(mockPrice(model, 1e9)).toBe(mockPrice(model, 1e9));
  });
});
