import { useT } from "../i18n/index.ts";

/**
 * Quantity labels for the paper account. The account is multi-asset (stocks,
 * forex, crypto from the market-data server) and every instrument has a
 * contract size of 1, so quantities are plain units (shares, coins, currency
 * units) and may be fractional.
 */
export function useInstrumentLabels() {
  const t = useT();
  return {
    instrumentType: "MULTI" as const,
    isFutures: false,
    unitLabel: t("unit.label"),
    unitLabelCap: t("unit.labelCap"),
    /** Quantity with its unit label, up to 4 decimals without trailing zeros. */
    formatQty: (qty: number) => t("unit.qty", { qty: Number(qty.toFixed(4)) }),
  };
}
