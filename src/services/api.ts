/**
 * API facade.
 *
 * Market data comes from the local server (services/server → server/), trading
 * from the in-browser paper engine (services/paper). `api` is that table wrapped
 * in a Proxy whose fallback returns a benign async no-op for any method not
 * implemented — so leftover calls from the platform this terminal was extracted
 * from resolve harmlessly instead of throwing network errors.
 */
import { paperApi } from "./paper/api.ts";

export const API_BASE = "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// react-query rejects `undefined` query results, so resolve to null instead.
const benign = () => Promise.resolve(null);

export const api = new Proxy(paperApi as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return benign;
  },
}) as typeof paperApi & Record<string, (...args: never[]) => Promise<unknown>>;
