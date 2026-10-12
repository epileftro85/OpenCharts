import { type ReactNode, useCallback, useEffect, useState } from "react";
import { TradingPage } from "./pages/TradingPage.tsx";
import { useAuthStore, useTradingStore } from "./services/store.tsx";
import { getStatus, type ServerStatus } from "./services/server/market.ts";
import { wsClient } from "./services/ws.ts";
import { initLang, t as translateNow, useT } from "./i18n/index.ts";

/**
 * OpenCharts entry point.
 *
 * No auth / routing: the app boots straight into the trading terminal. Market
 * data comes from the local server (server/: Alpaca, IBKR or mock), which must
 * be running; orders are paper-traded by the in-browser engine. A local
 * "login" seeds the user/account and opens the market-data WebSocket.
 */

/** Streams quotes for everything on screen: watchlist, chart symbol and open positions. */
function useSymbolInterest(): void {
  useEffect(() => {
    const sync = () => {
      const s = useTradingStore.getState();
      wsClient.setSymbolInterest([
        ...s.symbols.map((x) => x.name),
        s.selectedSymbol,
        ...s.positions.map((p) => p.symbolName),
      ].filter(Boolean));
    };
    sync();
    return useTradingStore.subscribe(sync);
  }, []);
}

const code = (s: string) => <code className="text-neutral-200">{s}</code>;

/** Renders a translated message whose {placeholders} are React nodes. */
function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  return (
    <>
      {text.split(/(\{\w+\})/).map((chunk, i) => {
        const m = chunk.match(/^\{(\w+)\}$/);
        return <span key={i}>{m && m[1]! in parts ? parts[m[1]!] : chunk}</span>;
      })}
    </>
  );
}

function ServerDown({ error, status, onRetry }: { error: string; status: ServerStatus | null; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] p-4 text-neutral-300">
      <div className="max-w-lg space-y-3 text-sm">
        <h1 className="text-lg font-semibold text-neutral-100">{t("app.down.title")}</h1>
        <p className="text-red-400">{error}</p>
        {status && !status.connected && (
          <p>
            {t("app.down.provider", { provider: status.provider, target: status.target })}
            {status.lastError ? `: ${status.lastError}` : "."}
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-neutral-400">
          <li>
            <Rich text={t("app.down.start")} parts={{ cmd: code("npm run dev") }} />
          </li>
          <li>
            <Rich text={t("app.down.env")} parts={{ file: code(".env"), vars: code("DATA_PROVIDER=alpaca|ibkr|mock") }} />
          </li>
          <li>
            <Rich text={t("app.down.mock")} parts={{ cmd: code("npm run dev:mock") }} />
          </li>
        </ul>
        <button onClick={onRetry} className="rounded bg-neutral-800 px-3 py-1.5 text-neutral-100 hover:bg-neutral-700">
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const loadSymbols = useTradingStore((s) => s.loadSymbols);
  const loadAccounts = useTradingStore((s) => s.loadAccounts);
  const t = useT();
  useSymbolInterest();

  const boot = useCallback(async () => {
    setError(null);
    try {
      const st = await getStatus();
      setStatus(st);
      initLang(st.lang);
      await demoLogin();
      // Paper trades genuinely execute against the in-browser engine, so this is
      // a real (non-demo) session — clears the "trading disabled" gate.
      localStorage.setItem("is_demo", "false");
      useAuthStore.setState({ isDemo: false });
      await Promise.all([loadSymbols(), loadAccounts()]);
      if (useTradingStore.getState().symbols.length === 0) {
        throw new Error(translateNow("app.noSymbols"));
      }
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [demoLogin, loadSymbols, loadAccounts]);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (error) return <ServerDown error={error} status={status} onRetry={() => void boot()} />;

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] text-neutral-400">
        {t("app.loading")}
      </div>
    );
  }

  return <TradingPage />;
}
