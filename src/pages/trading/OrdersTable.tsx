import { formatNumber, formatDate } from "../../lib/utils.ts";
import { useT } from "../../i18n/index.ts";
import { symbolDigits } from "./utils.ts";

interface OrderRow {
  id: string;
  symbolName: string;
  side: "BUY" | "SELL" | string;
  type: string;
  quantity: number;
  price?: number | null;
  stopPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status: string;
  createdAt: string | Date;
}

export function OrdersTable({
  orders,
  onCancel,
  onModify,
  onSelectSymbol,
}: {
  orders: OrderRow[];
  onCancel: (id: string) => void;
  onModify?: (order: OrderRow) => void;
  onSelectSymbol?: (symbolName: string) => void;
}) {
  const t = useT();
  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        {t("orders.empty")}
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 bg-card z-10">
        <tr>
          <th>{t("col.symbol")}</th>
          <th>{t("col.side")}</th>
          <th>{t("col.type")}</th>
          <th>{t("col.volume")}</th>
          <th>{t("col.price")}</th>
          <th>{t("col.sl")}</th>
          <th>{t("col.tp")}</th>
          <th>{t("col.status")}</th>
          <th>{t("col.time")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr
            key={o.id}
            className={
              onSelectSymbol ? "hover:bg-secondary/30 cursor-pointer" : "hover:bg-secondary/30"
            }
            onClick={() => onSelectSymbol?.(o.symbolName)}
            onKeyDown={(e) => {
              if (!onSelectSymbol) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSymbol(o.symbolName);
              }
            }}
            tabIndex={onSelectSymbol ? 0 : undefined}
          >
            <td className="font-semibold">{o.symbolName}</td>
            <td className={o.side === "BUY" ? "text-buy" : "text-sell"}>{t(`side.${o.side}`)}</td>
            <td>{t(`orderType.${o.type}`)}</td>
            <td className="font-mono">{o.quantity}</td>
            <td className="font-mono">
              {o.price
                ? formatNumber(o.price, symbolDigits(o.symbolName))
                : o.stopPrice
                  ? formatNumber(o.stopPrice, symbolDigits(o.symbolName))
                  : t("orders.market")}
            </td>
            <td className="font-mono text-sell">
              {o.stopLoss ? formatNumber(o.stopLoss, symbolDigits(o.symbolName)) : "--"}
            </td>
            <td className="font-mono text-buy">
              {o.takeProfit ? formatNumber(o.takeProfit, symbolDigits(o.symbolName)) : "--"}
            </td>
            <td>{t(`status.${o.status}`)}</td>
            <td className="text-muted-foreground">{formatDate(o.createdAt)}</td>
            <td>
              <div className="flex gap-1">
                {onModify && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onModify(o);
                    }}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-accent/20 text-accent hover:bg-accent/30"
                  >
                    {t("positions.modify")}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(o.id);
                  }}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-warning/20 text-warning hover:bg-warning/30"
                >
                  {t("orders.cancel")}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
