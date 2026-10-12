import type { Symbol } from "../schemas.ts";

/**
 * Specs of the instruments the terminal knows about (watchlist + anything opened
 * from search), as served by the market-data server. The paper engine reads
 * contract size and leverage from here.
 */
const registry = new Map<string, Symbol>();

export function registerSymbols(list: Symbol[]): void {
  for (const s of list) registry.set(s.name, s);
}

export function getSymbolSpec(name: string): Symbol | undefined {
  return registry.get(name);
}
