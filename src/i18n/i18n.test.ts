import { describe, expect, it } from "vitest";
import en from "./en.ts";
import es from "./es.ts";
import { translate } from "./index.ts";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  it("define the same keys in Spanish and English", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("use the same {placeholders} in both languages", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(es[key]), key).toEqual(vars(en[key]));
    }
  });

  it("have no empty translations", () => {
    for (const [key, value] of Object.entries(es)) expect(value.trim(), key).not.toBe("");
  });
});

describe("translate", () => {
  it("interpolates variables and falls back to English, then to the key", () => {
    expect(translate("es", "order.btn.buy", { qty: 2, symbol: "AAPL" })).toBe("Comprar 2 AAPL");
    expect(translate("en", "order.btn.buy", { qty: 2, symbol: "AAPL" })).toBe("Buy 2 AAPL");
    expect(translate("es", "missing.key")).toBe("missing.key");
  });
});

describe("dynamic keys used by components exist", () => {
  const dyn = [
    ...["SMA", "EMA", "RSI", "MACD", "BOLL", "ATR", "STOCH", "VWAP"].map((k) => `ind.${k}`),
    ...["overlay", "below"].map((k) => `ind.pane.${k}`),
    ...["BUY", "SELL", "LONG", "SHORT"].map((k) => `side.${k}`),
    ...["MARKET", "LIMIT", "STOP"].map((k) => `orderType.${k}`),
    ...["STOCK", "FOREX", "CRYPTO", "INDEX", "OTHER"].map((k) => `cat.${k}`),
    ...["positions", "orders", "history", "calendar", "news", "ai-trader"].map((k) => `tab.${k}`),
    ...["crosshair", "session", "session-breaks", "bands", "tooltip", "delta-tooltip"].map((k) => `plugin.${k}`),
    ...[
      "horizontal", "trendline", "fibonacci", "rectangle", "ray", "extended", "vertical", "channel",
      "fibextension", "ellipse", "arrow", "triangle", "text", "long-position", "short-position", "measure",
    ].map((k) => `tool.${k}`),
    ...["lines", "fib", "shapes", "trade", "text"].map((k) => `railGroup.${k}`),
  ];
  it.each(dyn)("%s", (key) => {
    expect(key in en).toBe(true);
  });
});
