import { useState, useEffect, useRef } from "react";
import { TrendingUp, Clock, History, Globe, Newspaper, Bot } from "lucide-react";
import { useAuthStore } from "../../services/store.tsx";
import { useTradingStore } from "../../services/store.tsx";
import {
  useCancelOrder,
  useClosePosition,
  useCloseAllPositions,
  useClosedPositions,
} from "../../services/queries.ts";
import type {
  JournalEntry,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
} from "../../services/api/journal.ts";
import type { Account, ClosedPosition, Order, Position } from "../../services/schemas.ts";
import { Button } from "../../components/ui/button.tsx";
import { TradeJournalPanel } from "../../components/TradingDialogs.tsx";
import { AiTraderPanel } from "../AiTraderPage.tsx";
import { TradingViewEconomicCalendar } from "../../components/TradingViewWidgets.tsx";
import { toast } from "../../services/toast.ts";
import { formatCurrency, formatNumber, formatDate, cn, pnlClass } from "../../lib/utils.ts";
import { MOCK_EVENTS, MOCK_NEWS } from "./constants.ts";
import { PositionsTable } from "./PositionsTable.tsx";
import { OrdersTable } from "./OrdersTable.tsx";
import { computeLivePnl, computeLivePrice } from "../../lib/livePnl.ts";
import { t as translateNow, useT } from "../../i18n/index.ts";
import { getSymbolSpec } from "../../services/paper/symbols.ts";
import { getPipDigits } from "./utils.ts";

type TradingActionError = {
  error?: { message?: string };
  message?: string;
};

type AccountOption = Pick<Account, "id"> & { label?: string | null };

function getErrorMessage(error: unknown): string {
  const actionError = error as TradingActionError;
  return actionError.error?.message || actionError.message || translateNow("err.request");
}

export interface BottomPanelProps {
  tab: "positions" | "orders" | "history" | "journal" | "calendar" | "news" | "ai-trader";
  onTabChange: (
    t: "positions" | "orders" | "history" | "journal" | "calendar" | "news" | "ai-trader",
  ) => void;
  positions: Position[];
  orders: Order[];
  accountId: string | null;
  onModifyPosition?: (position: Position) => void;
  onModifyOrder?: (order: Order) => void;
  onSelectPositionSymbol?: (symbolName: string) => void;
  onSelectOrderSymbol?: (symbolName: string) => void;
  journalEntries: JournalEntry[];
  journalLoading: boolean;
  onCreateJournal: (data: CreateJournalEntryInput) => void;
  onUpdateJournal: (id: string, data: UpdateJournalEntryInput) => void;
  onDeleteJournal: (id: string) => void;
  aiTraderEnabled?: boolean;
  height?: number;
  isFeedConnected?: boolean;
}

export function BottomPanel({
  tab,
  onTabChange,
  positions,
  orders,
  accountId,
  onModifyPosition,
  onModifyOrder,
  onSelectPositionSymbol,
  onSelectOrderSymbol,
  journalEntries,
  journalLoading,
  onCreateJournal,
  onUpdateJournal,
  onDeleteJournal,
  aiTraderEnabled,
  height = 220,
  isFeedConnected = true,
}: BottomPanelProps) {
  const t = useT();
  const isDemo = useAuthStore((s) => s.isDemo);
  const cancelOrder = useCancelOrder();
  const closePosition = useClosePosition();
  const closeAllPositions = useCloseAllPositions();
  const accounts = useTradingStore((s) => s.accounts as AccountOption[]);
  const activeAccount = accounts.find((account) => account.id === accountId);

  const handleCancel = (orderId: string) => {
    if (!accountId || isDemo) {
      if (isDemo) toast.warning(t("toast.demo"), t("toast.demo.desc"));
      return;
    }
    if (!isFeedConnected) {
      toast.warning(t("toast.noFeed"), t("toast.noFeed.cancel"));
      return;
    }
    if (cancelOrder.isPending) return;
    cancelOrder.mutate(
      { orderId, accountId },
      {
        onSuccess: () => toast.info(t("toast.orderCancelled"), t("toast.orderCancelled.desc")),
        onError: (err: unknown) => toast.error(t("toast.cancelFailed"), getErrorMessage(err)),
      },
    );
  };

  const handleClosePosition = (positionId: string) => {
    if (!accountId || isDemo) {
      if (isDemo) toast.warning(t("toast.demo"), t("toast.demo.desc"));
      return;
    }
    if (!isFeedConnected) {
      toast.warning(t("toast.noFeed"), t("toast.noFeed.close"));
      return;
    }
    if (closePosition.isPending) return;
    closePosition.mutate(
      { positionId, accountId },
      {
        onSuccess: () => toast.success(t("toast.positionClosed"), t("toast.positionClosed.desc")),
        onError: (err: unknown) => toast.error(t("toast.closeFailed"), getErrorMessage(err)),
      },
    );
  };

  const handlePartialClose = (positionId: string, quantity: number) => {
    if (!accountId || isDemo) {
      if (isDemo) toast.warning(t("toast.demo"), t("toast.demo.desc"));
      return;
    }
    if (!isFeedConnected) {
      toast.warning(t("toast.noFeed"), t("toast.noFeed.close"));
      return;
    }
    if (closePosition.isPending) return;
    closePosition.mutate(
      { positionId, accountId, quantity },
      {
        onSuccess: () =>
          toast.success(t("toast.partialClose"), t("toast.partialClose.desc", { qty: quantity })),
        onError: (err: unknown) => toast.error(t("toast.partialCloseFailed"), getErrorMessage(err)),
      },
    );
  };

  const handleCloseAll = () => {
    if (!accountId || isDemo) {
      if (isDemo) toast.warning(t("toast.demo"), t("toast.demo.desc"));
      return;
    }
    if (!isFeedConnected) {
      toast.warning(t("toast.noFeed"), t("toast.noFeed.close"));
      return;
    }
    closeAllPositions.mutate(accountId, {
      onSuccess: () => toast.success(t("toast.allClosed"), t("toast.allClosed.desc")),
      onError: (err: unknown) => toast.error(t("toast.closeAllFailed"), getErrorMessage(err)),
    });
  };

  const ticks = useTradingStore((s) => s.ticks);
  const openPositions = positions
    .filter((position) => position.quantity > 0)
    .map((p) => {
      const tick = ticks[p.symbolName];
      if (!tick) return p;
      return {
        ...p,
        currentPrice: computeLivePrice(p, tick),
        unrealizedPnl: computeLivePnl(p, tick),
      };
    });
  const pendingOrders = orders.filter(
    (order) => order.status === "PENDING" || order.status === "NEW",
  );
  const totalPnl = openPositions.reduce((sum, position) => sum + (position.unrealizedPnl || 0), 0);

  const tabs: {
    key: typeof tab;
    label: string;
    icon: typeof Clock;
    count?: number;
  }[] = [
    { key: "positions", label: "Positions", icon: TrendingUp, count: openPositions.length },
    { key: "orders", label: "Orders", icon: Clock, count: pendingOrders.length },
    { key: "history", label: "Trade History", icon: History },
    // { key: "journal", label: "Journal", icon: BookOpen }, // hidden pending QA (PS-285)
    { key: "calendar", label: "Calendar", icon: Globe },
    { key: "news", label: "News", icon: Newspaper },
    ...(aiTraderEnabled ? [{ key: "ai-trader" as const, label: "AI Trader", icon: Bot }] : []),
  ];

  return (
    <div
      className="border-t border-border flex flex-col shrink-0 bg-card max-h-[150px] md:max-h-none"
      style={{ height }}
    >
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-secondary text-xs overflow-x-auto no-scrollbar">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => onTabChange(tb.key)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded shrink-0 whitespace-nowrap",
              tab === tb.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tb.icon className="h-3 w-3" />
            <span className="hidden md:inline">{t(`tab.${tb.key}`)}</span>
            {tb.count !== undefined && tb.count > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[9px]">
                {tb.count}
              </span>
            )}
          </button>
        ))}

        {tab === "positions" && openPositions.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className={cn("font-mono text-xs font-semibold", pnlClass(totalPnl))}>
              {t("bottom.pnl")} {totalPnl >= 0 ? "+" : ""}
              {formatCurrency(totalPnl)}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCloseAll}
              className="text-[10px] h-5"
              disabled={closeAllPositions.isPending || isDemo || !isFeedConnected}
            >
              {t("bottom.closeAll")}
            </Button>
          </div>
        )}

        {activeAccount &&
          (tab === "positions" || tab === "orders" || tab === "history") &&
          !(tab === "positions" && openPositions.length > 0) && (
            <span className="ml-auto text-[10px] text-muted-foreground font-mono px-2">
              {activeAccount.label || accountId?.slice(0, 8)}
            </span>
          )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "positions" && (
          <PositionsTable
            positions={openPositions}
            onClose={handleClosePosition}
            onModify={onModifyPosition as unknown as ((p: { id: string }) => void) | undefined}
            onPartialClose={handlePartialClose}
            onSelectSymbol={onSelectPositionSymbol}
          />
        )}
        {tab === "orders" && (
          <OrdersTable
            orders={pendingOrders}
            onCancel={handleCancel}
            onModify={onModifyOrder as unknown as ((order: { id: string }) => void) | undefined}
            onSelectSymbol={onSelectOrderSymbol}
          />
        )}
        {tab === "history" && <TradeHistoryTable accountId={accountId} />}
        {tab === "journal" && (
          <TradeJournalPanel
            entries={journalEntries}
            isLoading={journalLoading}
            accountId={accountId}
            onCreateEntry={
              onCreateJournal as unknown as (
                data: Partial<{ notes: string; tags: string[] }> & {
                  notes: string;
                  tags: string[];
                },
              ) => void
            }
            onUpdateEntry={
              onUpdateJournal as unknown as (
                id: string,
                data: Partial<{ notes: string; tags: string[] }> & {
                  notes: string;
                  tags: string[];
                },
              ) => void
            }
            onDeleteEntry={onDeleteJournal}
          />
        )}
        {tab === "calendar" && <EconomicCalendar />}
        {tab === "news" && <NewsFeed />}
        {tab === "ai-trader" && <AiTraderPanel accountId={accountId} />}
      </div>
    </div>
  );
}

// ── Trade History Table ──────────────────────────────────────
function TradeHistoryTable({ accountId }: { accountId: string | null }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const { data: closedData, isLoading } = useClosedPositions(accountId, page);
  const trades: ClosedPosition[] = closedData?.data || [];
  const totalPages = closedData?.totalPages || 1;
  const accounts = useTradingStore((s) => s.accounts as AccountOption[]);
  const activeAccount = accounts.find((account) => account.id === accountId);

  const prevAccRef = useRef(accountId);
  useEffect(() => {
    if (prevAccRef.current !== accountId) {
      setPage(1);
      prevAccRef.current = accountId;
    }
  }, [accountId]);

  if (!accountId)
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        {t("history.selectAccount")}
      </div>
    );
  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        {t("common.loading")}
      </div>
    );
  if (trades.length === 0)
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        {activeAccount
          ? t("history.emptyFor", { account: activeAccount.label || accountId?.slice(0, 8) || "" })
          : t("history.empty")}
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card z-10">
          <tr>
            <th>{t("col.closed")}</th>
            <th>{t("col.symbol")}</th>
            <th>{t("col.side")}</th>
            <th>{t("col.volume")}</th>
            <th>{t("col.entry")}</th>
            <th>{t("col.exit")}</th>
            <th>{t("col.commission")}</th>
            <th>{t("col.grossPnl")}</th>
            <th>{t("col.netPnl")}</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((tr) => {
            const comm = tr.commission ?? 0;
            const gross = tr.realizedPnl ?? 0;
            const net = gross - comm;
            const digits = getPipDigits(getSymbolSpec(tr.symbolName), tr.symbolName);
            return (
              <tr key={tr.id} className="hover:bg-secondary/30">
                <td className="text-muted-foreground font-mono">
                  {formatDate(tr.closedAt || tr.openedAt)}
                </td>
                <td className="font-semibold">{tr.symbolName}</td>
                <td className={tr.side === "LONG" ? "text-buy" : "text-sell"}>{t(`side.${tr.side}`)}</td>
                <td className="font-mono">{tr.quantity}</td>
                <td className="font-mono">{tr.entryPrice ? formatNumber(tr.entryPrice, digits) : "--"}</td>
                <td className="font-mono">{tr.exitPrice ? formatNumber(tr.exitPrice, digits) : "--"}</td>
                <td className="font-mono text-muted-foreground">
                  {comm > 0 ? `-${comm.toFixed(2)}` : "0.00"}
                </td>
                <td
                  className={cn(
                    "font-mono",
                    gross >= 0 ? "text-success/70" : "text-destructive/70",
                  )}
                >
                  {`${gross >= 0 ? "+" : ""}${gross.toFixed(2)}`}
                </td>
                <td className={cn("font-mono font-semibold", pnlClass(net))}>
                  {`${net >= 0 ? "+" : ""}${net.toFixed(2)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-1 border-t border-border text-[10px]">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-40"
          >
            {t("pager.prev")}
          </button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-40"
          >
            {t("pager.next")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Economic Calendar ────────────────────────────────────────
function EconomicCalendar() {
  const t = useT();
  const [useTvCalendar, setUseTvCalendar] = useState(
    () => localStorage.getItem("tvEconCalendar") !== "false",
  );
  const isDark = !document.documentElement.classList.contains("light");

  const impactColor = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-warning/20 text-warning",
    high: "bg-destructive/20 text-destructive",
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border/40 shrink-0">
        <button
          onClick={() => {
            setUseTvCalendar(false);
            localStorage.setItem("tvEconCalendar", "false");
          }}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-medium",
            !useTvCalendar
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary",
          )}
        >
          {t("calendar.sim")}
        </button>
        <button
          onClick={() => {
            setUseTvCalendar(true);
            localStorage.setItem("tvEconCalendar", "true");
          }}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-medium",
            useTvCalendar ? "bg-[#2962ff] text-white" : "text-muted-foreground hover:bg-secondary",
          )}
        >
          {t("calendar.tv")}
        </button>
      </div>
      {useTvCalendar ? (
        <div className="flex-1 min-h-0">
          <TradingViewEconomicCalendar
            theme={isDark ? "dark" : "light"}
            width="100%"
            height="100%"
          />
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              <th>{t("col.time")}</th>
              <th>{t("col.currency")}</th>
              <th>{t("col.impact")}</th>
              <th>{t("col.event")}</th>
              <th>{t("col.forecast")}</th>
              <th>{t("col.previous")}</th>
              <th>{t("col.actual")}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_EVENTS.map((ev, i) => (
              <tr key={i} className="hover:bg-secondary/30">
                <td className="text-muted-foreground">{ev.time}</td>
                <td className="font-semibold">{ev.currency}</td>
                <td>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-medium",
                      impactColor[ev.impact],
                    )}
                  >
                    {t(`impact.${ev.impact}`)}
                  </span>
                </td>
                <td>{ev.event}</td>
                <td className="font-mono">{ev.forecast || "--"}</td>
                <td className="font-mono text-muted-foreground">{ev.previous || "--"}</td>
                <td className="font-mono font-semibold">{ev.actual || "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── News Feed ────────────────────────────────────────────────
function NewsFeed() {
  const t = useT();
  const impactStyle = {
    bullish: "text-buy",
    bearish: "text-sell",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="divide-y divide-border/30">
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground/70">{t("news.placeholder")}</p>
      {MOCK_NEWS.map((item, i) => (
        <div key={i} className="px-3 py-2 hover:bg-secondary/30 cursor-pointer">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
            <span>{item.time}</span>
            <span className="text-muted-foreground">|</span>
            <span>{item.source}</span>
            <span className={cn("font-semibold", impactStyle[item.impact])}>
              {t(`news.${item.impact}`)}
            </span>
          </div>
          <p className="text-xs leading-snug">{item.title}</p>
        </div>
      ))}
    </div>
  );
}
