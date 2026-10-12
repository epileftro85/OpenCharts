import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useInstrumentLabels } from "../../hooks/useInstrumentLabels.ts";
import { useT } from "../../i18n/index.ts";
import { symbolDigits } from "../../pages/trading/utils.ts";

interface OrderConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  order: {
    symbol: string;
    side: "BUY" | "SELL";
    type: string;
    quantity: number;
    price?: number;
    stopPrice?: number;
    takeProfit?: number;
    stopLoss?: number;
  } | null;
  tick?: { bid: number; ask: number };
  symbolInfo?: {
    digits?: number;
    pip?: number;
    contractSize?: number;
    marginPercent?: number;
    commission?: number;
    [key: string]: unknown;
  } | null;
  loading?: boolean;
}

export function OrderConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  order,
  tick,
  symbolInfo,
  loading,
}: OrderConfirmDialogProps) {
  const { formatQty } = useInstrumentLabels();
  const t = useT();
  if (!isOpen || !order) return null;
  const digits = symbolDigits(order.symbol);

  const executionPrice =
    order.type === "MARKET"
      ? order.side === "BUY"
        ? tick?.ask
        : tick?.bid
      : order.price || order.stopPrice;

  const marginRequired =
    executionPrice && symbolInfo
      ? order.quantity *
        (symbolInfo.contractSize || 1) *
        executionPrice *
        ((symbolInfo.marginPercent || 1) / 100)
      : null;

  const commission = symbolInfo ? (symbolInfo.commission || 0) * order.quantity : null;

  const tpPnl =
    order.takeProfit && executionPrice
      ? (order.side === "BUY"
          ? order.takeProfit - executionPrice
          : executionPrice - order.takeProfit) *
        order.quantity *
        (symbolInfo?.contractSize || 1)
      : null;

  const slPnl =
    order.stopLoss && executionPrice
      ? (order.side === "BUY" ? order.stopLoss - executionPrice : executionPrice - order.stopLoss) *
        order.quantity *
        (symbolInfo?.contractSize || 1)
      : null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div
            className={cn(
              "px-5 py-3 border-b",
              order.side === "BUY" ? "bg-buy/10 border-buy/20" : "bg-sell/10 border-sell/20",
            )}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {order.side === "BUY" ? (
                <TrendingUp className="h-4 w-4 text-buy" />
              ) : (
                <TrendingDown className="h-4 w-4 text-sell" />
              )}
              {t(`confirm.title.${order.side}`)}
            </h3>
          </div>

          <div className="px-5 py-4 space-y-2 text-sm">
            <Row label={t("confirm.symbol")} value={order.symbol} bold />
            <Row
              label={t("confirm.side")}
              value={t(`side.${order.side}`)}
              valueClass={order.side === "BUY" ? "text-buy" : "text-sell"}
            />
            <Row label={t("confirm.type")} value={t(`orderType.${order.type}`)} />
            <Row label={t("confirm.volume")} value={formatQty(order.quantity)} />
            {executionPrice && <Row label={t("confirm.price")} value={formatNumber(executionPrice, digits)} />}
            {order.takeProfit && (
              <Row
                label={t("order.takeProfit")}
                value={formatNumber(order.takeProfit, digits)}
                extra={
                  tpPnl !== null ? `(${tpPnl >= 0 ? "+" : ""}${formatCurrency(tpPnl)})` : undefined
                }
                valueClass="text-buy"
              />
            )}
            {order.stopLoss && (
              <Row
                label={t("order.stopLoss")}
                value={formatNumber(order.stopLoss, digits)}
                extra={
                  slPnl !== null ? `(${slPnl >= 0 ? "+" : ""}${formatCurrency(slPnl)})` : undefined
                }
                valueClass="text-sell"
              />
            )}
            {marginRequired !== null && (
              <Row label={t("order.margin")} value={formatCurrency(marginRequired)} />
            )}
            {commission !== null && <Row label={t("order.commission")} value={formatCurrency(commission)} />}
          </div>

          <div className="px-5 py-3 border-t border-border/40 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={order.side === "BUY" ? "buy" : "sell"}
              className="flex-1"
              onClick={onConfirm}
              loading={loading}
              disabled={loading}
            >
              {loading ? t("confirm.placing") : t(`confirm.btn.${order.side}`)}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  valueClass,
  bold,
  extra,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
  extra?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn("font-mono text-xs", valueClass, bold && "font-semibold text-sm")}>
        {value}
        {extra && <span className="text-[10px] ml-1 opacity-70">{extra}</span>}
      </span>
    </div>
  );
}
