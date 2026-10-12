import { describe, expect, it } from "vitest";
import { getQuote, mark } from "../services/paper/engine.ts";
import { paperApi } from "../services/paper/api.ts";

describe("paper quotes", () => {
  it("has no snapshot before the first real quote (never a 0 price)", async () => {
    expect(getQuote("ZZZ")).toBeNull();
    await expect(paperApi.getTick("ZZZ")).resolves.toBeNull();
  });

  it("ignores empty quotes and returns the last real one", async () => {
    mark("QQQ", 0, 0);
    expect(getQuote("QQQ")).toBeNull();
    mark("QQQ", 480.1, 480.2);
    mark("QQQ", 0, 0);
    await expect(paperApi.getTick("QQQ")).resolves.toMatchObject({ bid: 480.1, ask: 480.2 });
  });
});
