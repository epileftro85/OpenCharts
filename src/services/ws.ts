/**
 * Market-data WebSocket client.
 *
 * Connects to the local server's /ws endpoint (live quotes from Alpaca / IBKR /
 * mock), reconnects with backoff, and republishes every event on the in-process
 * bus so consumers (MarketDataBridge, ConnectionIndicator, store, …) keep the
 * same connect / subscribe / onStateChange surface they always used. Each quote
 * also marks the paper engine's positions to market. The paper engine publishes
 * its own account / positions / orders events on the same bus.
 */
import { publish, subscribeChannel, type ChannelHandler } from "./paper/bus.ts";
import { mark } from "./paper/engine.ts";

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected";
export type WsHandler = ChannelHandler;

export type ProviderStatus = {
  connected: boolean;
  mock: boolean;
  provider: string;
  target: string;
  lastError: string | null;
};

type MarketTick = { eventType: "MarketTick"; symbol: string; bid: number; ask: number; occurredAt: number };

const MAX_BACKOFF_MS = 15_000;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

class MarketWsClient {
  private _state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private retryMs = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  /** Latest provider status pushed by the server (null until the first one arrives). */
  providerStatus: ProviderStatus | null = null;

  get state(): ConnectionState {
    return this._state;
  }

  private setState(next: ConnectionState): void {
    if (next === this._state) return;
    this._state = next;
    for (const cb of this.stateListeners) cb(next);
  }

  /** Socket open AND the provider (broker connection / API keys) healthy. */
  private refreshState(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.setState(this.providerStatus && !this.providerStatus.connected ? "reconnecting" : "connected");
  }

  connect(_token?: string): void {
    this.wanted = true;
    if (this.ws) return;
    this.setState(this._state === "disconnected" ? "connecting" : "reconnecting");
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = 1000;
      this.sendSymbols();
      this.refreshState();
    };
    ws.onmessage = (ev) => {
      let msg: { channel?: string; event?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.channel === "status") {
        this.providerStatus = msg.event as ProviderStatus;
        publish("status", msg.event);
        this.refreshState();
        return;
      }
      if (msg.channel === "market-data") {
        const tick = msg.event as MarketTick;
        if (tick.eventType === "MarketTick") mark(tick.symbol, tick.bid, tick.ask);
        publish("market-data", tick);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wanted) {
        this.setState("disconnected");
        return;
      }
      this.setState("reconnecting");
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_BACKOFF_MS);
    };
    ws.onerror = () => ws.close();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  reauthenticate(_token: string): void {
    // The local server has no auth.
  }

  subscribe(channel: string, handler: WsHandler): () => void {
    return subscribeChannel(channel, handler);
  }

  subscribeAccounts(_accountIds: string[]): void {
    // Account events come from the local paper engine on the "account" channel.
  }

  private sendSymbols(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbols: this.symbols }));
    }
  }

  /** Symbols to stream quotes for (watchlist + chart + open positions). Replaces the previous set. */
  setSymbolInterest(symbols: string[]): void {
    const next = [...new Set(symbols)].sort();
    if (next.join(",") === this.symbols.join(",")) return;
    this.symbols = next;
    this.sendSymbols();
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this._state);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  /** Allow the engine to push events through the same client (parity helper). */
  emit(channel: string, event: unknown): void {
    publish(channel, event);
  }
}

export const wsClient = new MarketWsClient();
