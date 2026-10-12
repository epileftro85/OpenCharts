// Live market data hub: one WebSocket endpoint (/ws) for every browser tab.
//
// Browser → server:  { type: 'subscribe', symbols: ['AAPL', 'BTC/USD'] }   (replaces the tab's set)
// Server → browser:  { channel: 'market-data', event: { eventType: 'MarketTick', symbol, bid, ask, occurredAt } }
//                    { channel: 'status', event: provider.status() }
//
// Each symbol is subscribed once at the provider no matter how many tabs watch it, and released
// when the last tab stops watching. Ticks are throttled per symbol (config.tickThrottleMs).
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { isRTH } from './symbols.js';

const MAX_SYMBOLS_PER_CLIENT = 60;

export function attachStream(server, provider) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const subs = new Map(); // name -> { clients: Set<ws>, unsub, last, sentAt, timer, d }

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  function flush(name) {
    const s = subs.get(name);
    if (!s?.last) return;
    s.timer = null;
    s.sentAt = Date.now();
    const msg = { channel: 'market-data', event: { eventType: 'MarketTick', symbol: name, bid: s.last.bid, ask: s.last.ask, occurredAt: s.last.at } };
    for (const ws of s.clients) send(ws, msg);
  }

  function onTick(name, tick) {
    const s = subs.get(name);
    if (!s) return;
    // Outside regular hours stock ticks would paint candles that the RTH history does not have
    const regular = s.d.secType === 'STK' || s.d.secType === 'IND';
    if (regular && config.useRTH && !config.mock && !isRTH(Math.floor(tick.at / 1000))) return;
    s.last = tick;
    const wait = config.tickThrottleMs - (Date.now() - (s.sentAt || 0));
    if (wait <= 0) flush(name);
    else if (!s.timer) s.timer = setTimeout(() => flush(name), wait);
  }

  async function watch(name, ws) {
    let s = subs.get(name);
    if (s) { s.clients.add(ws); return; }
    s = { clients: new Set([ws]), unsub: null, d: null, last: null, sentAt: 0, timer: null };
    subs.set(name, s);
    try {
      const d = await provider.resolve(name);
      if (subs.get(name) !== s) return; // released while resolving
      s.d = d;
      s.unsub = provider.subscribeQuotes(d, (tick) => onTick(name, tick));
    } catch (e) {
      console.warn(`[stream] ${name}: ${e.message}`);
    }
  }

  function unwatch(name, ws) {
    const s = subs.get(name);
    if (!s) return;
    s.clients.delete(ws);
    if (s.clients.size) return;
    clearTimeout(s.timer);
    s.unsub?.();
    subs.delete(name);
  }

  wss.on('connection', (ws) => {
    ws.symbols = new Set();
    send(ws, { channel: 'status', event: provider.status() });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg?.type !== 'subscribe' || !Array.isArray(msg.symbols)) return;
      const next = new Set(msg.symbols.filter((x) => typeof x === 'string' && x.length <= 24).map((x) => x.toUpperCase()).slice(0, MAX_SYMBOLS_PER_CLIENT));
      for (const name of ws.symbols) if (!next.has(name)) unwatch(name, ws);
      for (const name of next) if (!ws.symbols.has(name)) watch(name, ws);
      ws.symbols = next;
      // Repeat the latest known quote so a new tab paints prices immediately
      for (const name of next) {
        const s = subs.get(name);
        if (s?.last) send(ws, { channel: 'market-data', event: { eventType: 'MarketTick', symbol: name, bid: s.last.bid, ask: s.last.ask, occurredAt: s.last.at } });
      }
    });
    ws.on('close', () => { for (const name of ws.symbols) unwatch(name, ws); });
  });

  const statusTimer = setInterval(() => {
    const msg = { channel: 'status', event: provider.status() };
    for (const ws of wss.clients) send(ws, msg);
  }, 5000);
  statusTimer.unref?.();

  return { close: () => { clearInterval(statusTimer); wss.close(); } };
}
