import { t } from "../../i18n/index.ts";

/**
 * Minimal JSON client for the local market-data server (server/index.js).
 * In development Vite proxies /api to it; in production the server serves the app.
 */

export class ServerError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = "network") {
    super(message);
    this.name = "ServerError";
    this.status = status;
    this.code = code;
  }
}

export async function getJSON<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = qs.size ? `/api${path}?${qs}` : `/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ServerError(t("err.server"));
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ServerError(body.message || `HTTP ${res.status}`, res.status, body.error || "http");
  }
  return body as T;
}
