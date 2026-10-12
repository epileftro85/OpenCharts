import type { Account, ClosedPosition, Fill, Order, Position } from "../schemas.ts";
import { publish } from "./bus.ts";
import { getSymbolSpec } from "./symbols.ts";
import { t } from "../../i18n/index.ts";

/**
 * In-browser paper-trading engine. The single source of truth for the paper
 * account, positions and orders. Prices come from the real market-data feed
 * (Alpaca / IBKR via the local server), but nothing is ever sent to a broker:
 * market orders fill instantly at the live quote (buys at the ask, sells at the
 * bid) and positions are marked-to-market on every tick. State is ephemeral
 * (memory only) — a refresh starts a fresh paper session.
 */

const STARTING_BALANCE = 100_000;

const account: Account = {
  id: crypto.randomUUID(),
  userId: "demo-user",
  templateId: "demo",
  label: "Paper Account",
  status: "ACTIVE",
  balance: STARTING_BALANCE,
  equity: STARTING_BALANCE,
  margin: 0,
  freeMargin: STARTING_BALANCE,
  phase: "LIVE",
  startDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isHftMode: false,
  template: { name: "Paper Account", startingBalance: STARTING_BALANCE, instrumentType: "EQUITIES" },
};

const positions: Position[] = [];
const orders: Order[] = [];
const closed: ClosedPosition[] = [];
const fills: Fill[] = [];
const quotes = new Map<string, { bid: number; ask: number; at: number }>();

export function getAccount(): Account {
  return { ...account };
}
export function getAccounts(): Account[] {
  return [getAccount()];
}
export function getPositions(): Position[] {
  return positions.map((p) => ({ ...p }));
}
export function getOrders(): Order[] {
  return orders.map((o) => ({ ...o }));
}
export function getClosedPositions(): ClosedPosition[] {
  return closed.map((c) => ({ ...c }));
}
export function getFills(): Fill[] {
  return fills.map((f) => ({ ...f }));
}
/** Latest real quote received for `symbol`, or null before the first tick. */
export function getQuote(symbol: string): { bid: number; ask: number; at: number } | null {
  return quotes.get(symbol) ?? null;
}

/** Latest mid price (0 until the first tick arrives). */
export function getLastPrice(symbol: string): number {
  const q = quotes.get(symbol);
  return q ? (q.bid + q.ask) / 2 : 0;
}

/** Price a position would close at right now: longs sell at the bid, shorts buy at the ask. */
function exitPrice(pos: Position): number {
  const q = quotes.get(pos.symbolName);
  if (!q) return pos.currentPrice ?? pos.entryPrice;
  return pos.side === "LONG" ? q.bid : q.ask;
}

function leverageOf(symbol: string): number {
  return getSymbolSpec(symbol)?.maxLeverage || 1;
}

function notional(symbol: string, qty: number, price: number): number {
  const contractSize = getSymbolSpec(symbol)?.contractSize ?? 1;
  return price * qty * contractSize;
}

function pnlOf(pos: Position, price: number): number {
  const contractSize = getSymbolSpec(pos.symbolName)?.contractSize ?? 1;
  const dir = pos.side === "LONG" ? 1 : -1;
  return (price - pos.entryPrice) * pos.quantity * contractSize * dir;
}

function recomputeEquity(): void {
  let unrealized = 0;
  let margin = 0;
  for (const p of positions) {
    const price = exitPrice(p);
    p.currentPrice = price;
    p.unrealizedPnl = pnlOf(p, price);
    unrealized += p.unrealizedPnl;
    margin += p.margin;
  }
  account.margin = margin;
  account.equity = account.balance + unrealized;
  account.freeMargin = account.equity - margin;
  account.updatedAt = new Date().toISOString();
}

function emitEquity(): void {
  publish("account", {
    eventType: "EquityUpdated",
    accountId: account.id,
    equity: account.equity,
    balance: account.balance,
    freeMargin: account.freeMargin,
    marginUsed: account.margin,
  });
}

function openPosition(symbol: string, side: string, qty: number, price: number, tp?: number, sl?: number): Position {
  const isLong = side === "BUY";
  const pos: Position = {
    id: crypto.randomUUID(),
    accountId: account.id,
    symbolName: symbol,
    side: isLong ? "LONG" : "SHORT",
    quantity: qty,
    entryPrice: price,
    currentPrice: price,
    unrealizedPnl: 0,
    margin: notional(symbol, qty, price) / leverageOf(symbol),
    contractSize: getSymbolSpec(symbol)?.contractSize ?? 1,
    openedAt: new Date().toISOString(),
    takeProfit: tp ?? null,
    stopLoss: sl ?? null,
  };
  positions.push(pos);
  publish("positions", { eventType: "PositionOpened", accountId: account.id, positionId: pos.id, _entity: { ...pos } });
  return pos;
}

function makeFilledOrder(input: PlaceOrderArgs, price: number): Order {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    accountId: account.id,
    symbolName: input.symbol,
    side: input.side === "BUY" ? "BUY" : "SELL",
    type: (input.type as Order["type"]) ?? "MARKET",
    quantity: input.quantity,
    price: input.price ?? null,
    stopPrice: input.stopPrice ?? null,
    takeProfit: input.takeProfit ?? null,
    stopLoss: input.stopLoss ?? null,
    status: "FILLED",
    filledQuantity: input.quantity,
    avgFillPrice: price,
    comment: null,
    createdAt: now,
    updatedAt: now,
  };
}

export type PlaceOrderArgs = {
  accountId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
};

/**
 * Market orders fill instantly at the live quote (BUY at the ask, SELL at the bid);
 * limit/stop tickets still fill immediately at their requested price (no resting book).
 */
export function placeOrder(input: PlaceOrderArgs): Order {
  const q = quotes.get(input.symbol);
  const market = q ? (input.side === "BUY" ? q.ask : q.bid) : 0;
  const price = input.type === "MARKET" || input.price == null ? market : input.price;
  if (!(price > 0)) throw new Error(t("err.noPrice", { symbol: input.symbol }));
  const margin = notional(input.symbol, input.quantity, price) / leverageOf(input.symbol);
  if (margin > account.freeMargin) {
    throw new Error(t("err.margin", { need: margin.toFixed(2), free: account.freeMargin.toFixed(2) }));
  }
  const order = makeFilledOrder(input, price);
  orders.unshift(order);
  publish("orders", { eventType: "OrderPlaced", accountId: account.id, orderId: order.id, _entity: { ...order } });
  publish("orders", { eventType: "OrderFilled", accountId: account.id, orderId: order.id, _entity: { ...order } });
  openPosition(input.symbol, input.side, input.quantity, price, input.takeProfit, input.stopLoss);
  recomputeEquity();
  emitEquity();
  return order;
}

function recordClose(pos: Position, qty: number, exitPrice: number, realized: number): void {
  const now = new Date().toISOString();
  closed.unshift({
    id: crypto.randomUUID(),
    accountId: account.id,
    symbolName: pos.symbolName,
    side: pos.side,
    quantity: qty,
    entryPrice: pos.entryPrice,
    exitPrice,
    realizedPnl: realized,
    commission: 0,
    swap: 0,
    openedAt: pos.openedAt,
    closedAt: now,
    isPartialClose: qty < pos.quantity,
  });
  fills.unshift({
    id: crypto.randomUUID(),
    orderId: pos.id,
    accountId: account.id,
    symbolName: pos.symbolName,
    side: pos.side === "LONG" ? "SELL" : "BUY",
    quantity: qty,
    price: exitPrice,
    commission: 0,
    realizedPnl: realized,
    createdAt: now,
  });
}

export function closePosition(positionId: string, quantity?: number): { success: boolean } {
  const idx = positions.findIndex((p) => p.id === positionId);
  if (idx < 0) return { success: false };
  const pos = positions[idx]!;
  const price = exitPrice(pos);
  const qty = quantity && quantity < pos.quantity ? quantity : pos.quantity;
  const realized = pnlOf({ ...pos, quantity: qty }, price);
  account.balance += realized;
  recordClose(pos, qty, price, realized);
  if (qty >= pos.quantity) {
    positions.splice(idx, 1);
    publish("positions", { eventType: "PositionClosed", accountId: account.id, positionId });
  } else {
    pos.quantity -= qty;
    publish("positions", { eventType: "PositionUpdated", accountId: account.id, positionId, quantity: pos.quantity });
  }
  recomputeEquity();
  emitEquity();
  return { success: true };
}

export function closeAllPositions(): { success: boolean } {
  for (const p of [...positions]) closePosition(p.id);
  return { success: true };
}

export function modifyPosition(
  positionId: string,
  mods: { takeProfit?: number | null; stopLoss?: number | null },
): Position | undefined {
  const pos = positions.find((p) => p.id === positionId);
  if (!pos) return undefined;
  if (mods.takeProfit !== undefined) pos.takeProfit = mods.takeProfit;
  if (mods.stopLoss !== undefined) pos.stopLoss = mods.stopLoss;
  publish("positions", {
    eventType: "PositionUpdated",
    accountId: account.id,
    positionId,
    unrealizedPnl: pos.unrealizedPnl,
    quantity: pos.quantity,
    averagePrice: pos.entryPrice,
  });
  return { ...pos };
}

export function cancelOrder(orderId: string): { success: boolean } {
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx >= 0) orders.splice(idx, 1);
  publish("orders", { eventType: "OrderCanceled", accountId: account.id, orderId });
  return { success: true };
}

function checkStops(pos: Position, price: number): boolean {
  const hitTp = pos.takeProfit != null && (pos.side === "LONG" ? price >= pos.takeProfit : price <= pos.takeProfit);
  const hitSl = pos.stopLoss != null && (pos.side === "LONG" ? price <= pos.stopLoss : price >= pos.stopLoss);
  return hitTp || hitSl;
}

/** Called by the market-data client on every live quote: marks positions, fires SL/TP. */
export function mark(symbol: string, bid: number, ask: number): void {
  if (!(bid > 0 && ask > 0)) return; // never let an empty quote reach positions or the chart
  quotes.set(symbol, { bid, ask, at: Date.now() });
  const affected = positions.filter((p) => p.symbolName === symbol);
  if (affected.length === 0) return;
  for (const pos of affected) {
    const price = exitPrice(pos);
    if (checkStops(pos, price)) {
      closePosition(pos.id);
      continue;
    }
    pos.currentPrice = price;
    pos.unrealizedPnl = pnlOf(pos, price);
    publish("positions", {
      eventType: "PositionUpdated",
      accountId: account.id,
      positionId: pos.id,
      unrealizedPnl: pos.unrealizedPnl,
      quantity: pos.quantity,
      averagePrice: pos.entryPrice,
    });
  }
  recomputeEquity();
  emitEquity();
}
