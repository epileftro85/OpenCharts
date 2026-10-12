// Timeframes the terminal uses (src/pages/trading/constants.ts, plus 10m for the 4-timeframe
// structure view) and how each provider serves them.
//
//   sec       bar length in seconds
//   days      calendar days of history loaded on first view (scrolling back loads more)
//   ttl       seconds the server reuses a cached response
//   alpaca    Alpaca `timeframe` parameter
//   ibBar     IB `barSizeSetting`
//   ibDur     IB `durationStr` for the first load (IB limits how far back each bar size may go per request)
export const TIMEFRAMES = {
  '1m': { sec: 60, days: 5, ttl: 20, alpaca: '1Min', ibBar: '1 min', ibDur: '2 D' },
  '5m': { sec: 300, days: 30, ttl: 30, alpaca: '5Min', ibBar: '5 mins', ibDur: '2 W' },
  '10m': { sec: 600, days: 45, ttl: 45, alpaca: '10Min', ibBar: '10 mins', ibDur: '2 W' },
  '15m': { sec: 900, days: 90, ttl: 60, alpaca: '15Min', ibBar: '15 mins', ibDur: '1 M' },
  '30m': { sec: 1800, days: 180, ttl: 90, alpaca: '30Min', ibBar: '30 mins', ibDur: '2 M' },
  '1h': { sec: 3600, days: 365, ttl: 120, alpaca: '1Hour', ibBar: '1 hour', ibDur: '6 M' },
  '4h': { sec: 14400, days: 730, ttl: 300, alpaca: '4Hour', ibBar: '4 hours', ibDur: '1 Y' },
  '1d': { sec: 86400, days: 3650, ttl: 600, alpaca: '1Day', ibBar: '1 day', ibDur: '5 Y' },
  '1w': { sec: 604800, days: 7300, ttl: 1800, alpaca: '1Week', ibBar: '1 week', ibDur: '10 Y' },
};

export const isDaily = (tf) => tf === '1d' || tf === '1w';

/** Hard cap on bars returned in one response (keeps the browser and the providers responsive). */
export const MAX_BARS = 20000;

/** IB `durationStr` covering a [fromSec, toSec] range. */
export function ibDuration(fromSec, toSec) {
  const days = Math.max(1, Math.ceil((toSec - fromSec) / 86400));
  if (days > 365) return `${Math.ceil(days / 365)} Y`;
  return `${days} D`;
}

/** IB `endDateTime` in UTC ("yyyymmdd-hh:mm:ss"). */
export function ibEndDateTime(sec) {
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
