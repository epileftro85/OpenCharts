// Instrument identity and specs shared by every provider.
//
// The browser identifies an instrument by its `name` (a string). Names encode the asset type:
//   AAPL, SPY      stocks / ETFs (secType STK)
//   EUR.USD        forex pair     (secType CASH)
//   BTC/USD        crypto pair    (secType CRYPTO)
//   ^SPX           index          (secType IND) — IBKR only
//
// A *descriptor* is what providers work with: { name, symbol, secType, exchange, currency, conId?, description }.

const RTH_OPEN = 9 * 60 + 30;
const RTH_CLOSE = 16 * 60;

const nyFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** New York date ('2026-10-06'), minute of day and weekday (0 = Sunday) for an epoch in seconds. */
export function nyClock(t) {
  const p = Object.fromEntries(nyFmt.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute), dow };
}

/** True when `t` (seconds) falls inside regular US trading hours (9:30–16:00 New York, Mon–Fri). */
export function isRTH(t) {
  const { minute, dow } = nyClock(t);
  return dow >= 1 && dow <= 5 && minute >= RTH_OPEN && minute < RTH_CLOSE;
}

/** Keeps only bars that start inside regular trading hours. */
export function filterRTH(bars) {
  return bars.filter((b) => isRTH(b.time));
}

/**
 * Groups RTH intraday bars into session-anchored buckets of `minutes` (60 → 9:30, 10:30…; 240 → 9:30, 13:30),
 * which is how IB builds hourly and 4-hour bars with regular trading hours.
 */
export function aggregateSession(bars, minutes) {
  const out = [];
  let key = null;
  for (const b of bars) {
    const { day, minute } = nyClock(b.time);
    const k = `${day}/${Math.floor((minute - RTH_OPEN) / minutes)}`;
    const last = out[out.length - 1];
    if (k !== key || !last) {
      out.push({ ...b, time: b.time - (((minute - RTH_OPEN) % minutes) * 60) });
      key = k;
    } else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    }
  }
  return out;
}

/** Daily/weekly bars are drawn at UTC midnight of their (New York) trading date. */
export function toDateBar(bar) {
  const { day } = nyClock(bar.time);
  return { ...bar, time: Date.parse(`${day}T00:00:00Z`) / 1000 };
}

/** Sorts by time and drops duplicated timestamps. */
export function sortDedup(bars) {
  bars.sort((a, b) => a.time - b.time);
  return bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
}

/** Parses an app name into a descriptor skeleton (providers fill in conId/exchange/description). */
export function parseName(raw) {
  const name = String(raw || '').trim().toUpperCase();
  if (!/^\^?[A-Z0-9][A-Z0-9 .\/-]{0,23}$/.test(name)) return null;
  if (name.startsWith('^')) return { name, symbol: name.slice(1), secType: 'IND', exchange: '', currency: 'USD' };
  let m = name.match(/^([A-Z0-9]{2,10})\/([A-Z]{3,4})$/);
  if (m) return { name, symbol: m[1], secType: 'CRYPTO', exchange: '', currency: m[2] };
  m = name.match(/^([A-Z]{3})\.([A-Z]{3})$/);
  if (m) return { name, symbol: m[1], secType: 'CASH', exchange: 'IDEALPRO', currency: m[2] };
  return { name, symbol: name, secType: 'STK', exchange: '', currency: 'USD' };
}

/** App name for a descriptor's fields. */
export function nameOf({ symbol, secType, currency }) {
  if (secType === 'CASH') return `${symbol}.${currency}`;
  if (secType === 'CRYPTO') return `${symbol}/${currency}`;
  if (secType === 'IND') return `^${symbol}`;
  return symbol;
}

const CATEGORY = { STK: 'STOCK', CASH: 'FOREX', CRYPTO: 'CRYPTO', IND: 'INDEX' };

// Paper-trading leverage per asset type (educational, close to typical retail limits):
// Reg-T intraday 4× for stocks, 30× for majors (ESMA-style), 2× for crypto, indices are not tradable instruments.
const LEVERAGE = { STK: 4, CASH: 30, CRYPTO: 2, IND: 1 };

const US_SESSION = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:30', closeTime: '16:00' }));

function defaultTick(d) {
  if (d.secType === 'CASH') return d.currency === 'JPY' ? 0.001 : 0.00001;
  return 0.01;
}

/**
 * Builds the `Symbol` object the terminal expects (src/services/schemas.ts) from a descriptor.
 * Extra fields (tradingHours, sessionTimezone, exchange, secType) are read by MarketClosedBanner and the search UI.
 */
export function toAppSymbol(d) {
  const tickSize = d.tickSize || defaultTick(d);
  const leverage = LEVERAGE[d.secType] ?? 1;
  const regular = d.secType === 'STK' || d.secType === 'IND';
  return {
    id: d.name,
    name: d.name,
    displayName: d.description || d.name,
    category: CATEGORY[d.secType] ?? 'OTHER',
    contractSize: 1,
    tickSize,
    tickValue: tickSize,
    marginPercent: 100 / leverage,
    maxLeverage: leverage,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: regular ? '09:30' : null,
    tradingHoursEnd: regular ? '16:00' : null,
    isActive: true,
    // extras
    secType: d.secType,
    exchange: d.exchange || '',
    currency: d.currency || '',
    tradingHours: regular ? US_SESSION : d.secType === 'CRYPTO' ? [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '00:00', closeTime: '24:00' })) : [],
    sessionTimezone: regular ? 'America/New_York' : 'UTC',
  };
}
