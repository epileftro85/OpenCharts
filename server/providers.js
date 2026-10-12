// Data provider strategy. Every provider implements the same interface:
//
//   connect()                         start the connection (or key check); never throws
//   shutdown()                        release sockets/timers
//   status()                       →  { connected, mock, provider, target, lastError }
//   searchSymbols(q)               →  [descriptor]
//   resolve(name)                  →  descriptor for an app symbol name (see symbols.js)
//   getBars(descriptor, tf, range) →  [{ time, open, high, low, close, volume }]  (range: { fromSec?, toSec? })
//   subscribeQuotes(descriptor, cb)→  unsubscribe()   cb({ bid, ask, at })
//
// Errors carry `code`: NOT_CONNECTED / DISCONNECTED / TIMEOUT / UNSUPPORTED / BAD_REQUEST / NOT_FOUND,
// or the provider's own code. Pick one with DATA_PROVIDER in .env (alpaca | ibkr | mock).
// All providers are read-only: orders are paper-traded in the browser.
import { config } from './config.js';
import { AlpacaClient } from './alpaca.js';
import { MockClient } from './mock.js';

const FACTORIES = {
  alpaca: async () => new AlpacaClient(),
  // Loaded lazily so the IB library is only required when IBKR is used
  ibkr: async () => new (await import('./ib.js')).IBClient(),
  mock: async () => new MockClient(),
};

export async function createProvider(name = config.provider) {
  const make = FACTORIES[name];
  if (!make) throw new Error(`Unknown data provider "${name}" (valid: ${Object.keys(FACTORIES).join(', ')})`);
  return make();
}
