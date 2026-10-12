// OpenCharts server: market data from Alpaca / IBKR / mock for the terminal (read-only).
//
//   GET /api/status                       provider status, default language and watchlist
//   GET /api/symbols?names=AAPL,EUR.USD   specs for the watchlist (defaults when `names` is empty)
//   GET /api/search?q=apple               symbol search at the provider
//   GET /api/candles?symbol&tf&limit&from&to   history (from/to in epoch ms)
//   WS  /ws                               live quotes (see stream.js)
//
// In development Vite proxies /api and /ws here; `npm start` also serves the built app from dist/.
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { createProvider } from './providers.js';
import { attachStream } from './stream.js';
import { TIMEFRAMES, MAX_BARS } from './timeframes.js';
import { parseName, toAppSymbol } from './symbols.js';

const provider = await createProvider();
provider.connect();

const app = express();
app.disable('x-powered-by');

const STATUS = { NOT_CONNECTED: 503, DISCONNECTED: 503, TIMEOUT: 504, UNSUPPORTED: 422, BAD_REQUEST: 400, NOT_FOUND: 404 };

function sendError(res, e) {
  const code = e.code ?? 'PROVIDER_ERROR';
  const status = STATUS[code] ?? 502;
  if (status === 502) console.warn('[api]', code, e.message);
  return res.status(status).json({ error: String(code).toLowerCase(), message: e.message });
}

const bad = (res, message) => res.status(400).json({ error: 'bad_request', message });

app.get('/api/status', (_req, res) => {
  res.json({ ...provider.status(), lang: config.lang, watchlist: config.watchlist, timeframes: Object.keys(TIMEFRAMES), useRTH: config.useRTH });
});

app.get('/api/symbols', async (req, res) => {
  const names = String(req.query.names ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = (names.length ? names : config.watchlist).slice(0, 100);
  if (!list.every(parseName)) return bad(res, 'invalid symbol name');
  const settled = await Promise.allSettled(list.map((n) => provider.resolve(n)));
  const symbols = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') symbols.push(toAppSymbol(r.value));
    else errors.push({ name: list[i], message: r.reason?.message ?? 'error' });
  });
  res.json({ symbols, errors });
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 1 || !/^[\^A-Za-z0-9 .\/\-_]{1,24}$/.test(q)) return res.json({ results: [] });
  try {
    res.json({ results: (await provider.searchSymbols(q)).slice(0, 25).map(toAppSymbol) });
  } catch (e) { sendError(res, e); }
});

app.get('/api/candles', async (req, res) => {
  const { symbol, tf } = req.query;
  if (!TIMEFRAMES[tf]) return bad(res, 'invalid tf');
  if (!parseName(symbol)) return bad(res, 'invalid symbol');
  const limit = Math.min(Number(req.query.limit) || MAX_BARS, MAX_BARS);
  const from = req.query.from ? Number(req.query.from) : null;
  const to = req.query.to ? Number(req.query.to) : null;
  if ((from !== null && !(from > 0)) || (to !== null && !(to > 0))) return bad(res, 'invalid range');
  const range = from ? { fromSec: Math.floor(from / 1000), toSec: Math.floor((to ?? Date.now()) / 1000) } : {};
  try {
    const d = await provider.resolve(symbol);
    let candles = await provider.getBars(d, tf, range);
    if (range.toSec) candles = candles.filter((c) => c.time < range.toSec);
    if (candles.length > limit) candles = candles.slice(-limit);
    res.json({ candles, metadata: { isPartial: false, backfillQueued: false, historicalCoverageStart: null } });
  } catch (e) { sendError(res, e); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'unknown endpoint' }));

// Production: serve the built terminal (npm run build) from the same origin.
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const stream = attachStream(server, provider);

server.listen(config.port, config.host, () => {
  console.log(`\n  OpenCharts server → http://${config.host}:${config.port}`);
  const where = {
    mock: 'MOCK mode (simulated data)',
    ibkr: `IBKR at ${config.ib.host}:${config.ib.port}  (clientId ${config.ib.clientId})`,
    alpaca: `Alpaca market data (${config.alpaca.paper ? 'paper' : 'live'} keys, feed ${config.alpaca.feed})`,
  }[config.provider];
  console.log(`  ${where} · read-only, orders are paper-traded in the browser\n`);
});

function shutdown() {
  stream.close();
  provider.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
