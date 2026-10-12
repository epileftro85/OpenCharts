/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useSyncExternalStore } from "react";
import { wsClient, type ConnectionState } from "@/services/ws";
import { useMarketDataHealth } from "@/services/queries";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/index.ts";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

interface MarketDataHealthSnapshot {
  adapter?: {
    status?: string;
    reason?: string;
  } | null;
  staleCount?: number;
  totalSymbols?: number;
  lastTickAgeMs?: number;
}

function isMarketDataInterrupted(health: unknown): health is MarketDataHealthSnapshot {
  return typeof health === "object" && health !== null;
}

// ── React Hook ──────────────────────────────────────────
function subscribeToWsState(callback: () => void) {
  return wsClient.onStateChange(() => callback());
}

function getWsSnapshot() {
  return wsClient.state;
}

export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribeToWsState, getWsSnapshot);
}

/** True only when the WebSocket is fully authenticated and streaming data */
export function useIsFeedConnected(): boolean {
  const state = useConnectionState();
  return state === "connected";
}

// ── Stale data banner (>10s disconnected) ───────────────
export function useStaleData(): boolean {
  const state = useConnectionState();
  const { data: health } = useMarketDataHealth();
  const [stale, setStale] = useState(false);

  const marketDataInterrupted = (() => {
    if (!isMarketDataInterrupted(health)) return false;

    // Explicit provider interruption from backend should always surface.
    if (health.adapter?.status === "unavailable") return true;

    // No ticks observed since process start.
    if (typeof health.lastTickAgeMs === "number" && health.lastTickAgeMs < 0) return true;

    // Avoid false positives from partial staleness (some symbols stale while others are fine).
    // Treat as interrupted only when all tracked symbols are stale and stale age is significant.
    const staleCount = typeof health.staleCount === "number" ? health.staleCount : 0;
    const totalSymbols = typeof health.totalSymbols === "number" ? health.totalSymbols : 0;
    const lastTickAgeMs = typeof health.lastTickAgeMs === "number" ? health.lastTickAgeMs : 0;
    if (totalSymbols > 0 && staleCount >= totalSymbols && lastTickAgeMs > 30_000) {
      return true;
    }

    return false;
  })();

  useEffect(() => {
    if (state === "connected" && !marketDataInterrupted) {
      setStale(false);
      return;
    }
    const timer = setTimeout(() => setStale(true), 10_000);
    return () => clearTimeout(timer);
  }, [marketDataInterrupted, state]);

  return stale;
}

// ── Connection Indicator Component ──────────────────────
const stateConfig = {
  connected: {
    label: "conn.connected",
    icon: Wifi,
    color: "text-success",
    dot: "bg-success",
  },
  connecting: {
    label: "conn.connecting",
    icon: Loader2,
    color: "text-warning",
    dot: "bg-warning",
  },
  reconnecting: {
    label: "conn.reconnecting",
    icon: Loader2,
    color: "text-warning",
    dot: "bg-warning",
  },
  disconnected: {
    label: "conn.disconnected",
    icon: WifiOff,
    color: "text-destructive",
    dot: "bg-destructive",
  },
} as const;

export function ConnectionIndicator({ className }: { className?: string }) {
  const state = useConnectionState();
  const t = useT();
  const { label: labelKey, icon: Icon, color, dot } = stateConfig[state];
  const label = t(labelKey);
  const isSpinning = state === "connecting" || state === "reconnecting";
  const provider = wsClient.providerStatus;
  const title = provider
    ? `${label} · ${t("conn.provider", { provider: provider.provider, target: provider.target })}${provider.lastError ? ` — ${provider.lastError}` : ""}`
    : label;

  return (
    <div className={cn("flex items-center gap-1.5 text-[11px]", className)} title={title}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", dot, state !== "connected" && "animate-pulse")}
      />
      <Icon className={cn("h-3 w-3", color, isSpinning && "animate-spin")} />
      <span className={cn("hidden sm:inline", color)}>{label}</span>
    </div>
  );
}

// ── Stale Data Banner ───────────────────────────────────
export function StaleDataBanner() {
  const stale = useStaleData();
  const state = useConnectionState();
  const { data: health } = useMarketDataHealth();
  const t = useT();
  if (!stale) return null;

  const message = (() => {
    if (isMarketDataInterrupted(health)) {
      const interruptionReason = health.adapter?.reason;
      if (health.adapter?.status === "unavailable") {
        return interruptionReason
          ? t("conn.outageReason", { reason: interruptionReason })
          : t("conn.outage");
      }

      if (typeof health.lastTickAgeMs === "number" && health.lastTickAgeMs < 0) {
        return t("conn.historicalOnly");
      }

      const staleCount = typeof health.staleCount === "number" ? health.staleCount : 0;
      const totalSymbols = typeof health.totalSymbols === "number" ? health.totalSymbols : 0;
      if (totalSymbols > 0 && staleCount >= totalSymbols) {
        return t("conn.degradedAll");
      }
      if (staleCount > 0) {
        return t("conn.degradedSome");
      }
    }

    if (state !== "connected") {
      return t("conn.lost");
    }

    return t("conn.interrupted");
  })();

  return (
    <div className="bg-warning/10 border-b border-warning/30 px-4 py-1.5 text-center text-xs text-warning">
      {message}
    </div>
  );
}

// ── Disconnected Trading Banner (inline for order panel / bottom panel) ──
export function DisconnectedTradingBanner({ className }: { className?: string }) {
  const t = useT();
  return (
    <div
      className={cn(
        "bg-destructive/10 border border-destructive/30 rounded px-3 py-2 text-center",
        className,
      )}
    >
      <div className="flex items-center justify-center gap-1.5 text-destructive text-xs font-semibold">
        <WifiOff className="h-3.5 w-3.5" />
        {t("conn.banner.title")}
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {t("conn.banner.desc")}
      </p>
    </div>
  );
}
