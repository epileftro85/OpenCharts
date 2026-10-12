import { useEffect, useRef, useState } from "react";
import { ChevronDown, HelpCircle, LayoutGrid, Minus, Plus, Square } from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { useT } from "../../i18n/index.ts";
import { EMAS, VWAP_COLOR } from "../../lib/structure/compute.ts";
import { EXT_FACTOR, helpKeyFor, useStructureStore, type IndKey } from "../../lib/structure/store.ts";

/** "?" button that opens the guide at an entry. */
export function HelpButton({ helpKey, label, className }: { helpKey: string; label: string; className?: string }) {
  const t = useT();
  const openGuide = useStructureStore((s) => s.openGuide);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openGuide(helpKey);
      }}
      title={t("ms.helpFor", { label })}
      aria-label={t("ms.helpFor", { label })}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[9px] font-bold text-muted-foreground hover:border-primary hover:text-primary",
        className,
      )}
    >
      ?
    </button>
  );
}

/** − n + control for one timeframe. */
export function NControl({ tf, compact = false }: { tf: string; compact?: boolean }) {
  const t = useT();
  const n = useStructureStore((s) => s.nByTf[tf] ?? 3);
  const setN = useStructureStore((s) => s.setN);
  const btn = "flex h-5 w-5 items-center justify-center rounded bg-secondary hover:bg-border";
  return (
    <span className="inline-flex items-center gap-1" title={t("ms.nTitle")}>
      {!compact && <span className="text-xs text-muted-foreground">{t("ms.n")}</span>}
      {compact && <span className="text-[10px] text-muted-foreground">n</span>}
      <button type="button" className={btn} onClick={() => setN(tf, n - 1)} aria-label={t("ms.less")}>
        <Minus className="h-3 w-3" />
      </button>
      <output className="w-4 text-center font-mono text-xs">{n}</output>
      <button type="button" className={btn} onClick={() => setN(tf, n + 1)} aria-label={t("ms.more")}>
        <Plus className="h-3 w-3" />
      </button>
    </span>
  );
}

function Row({
  checked,
  onChange,
  label,
  tip,
  color,
  helpKey,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  tip?: string;
  color: string;
  helpKey: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-secondary" title={tip}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <HelpButton helpKey={helpKey} label={label} />
    </label>
  );
}

/**
 * Toolbar dropdown with the market-structure tools from market-structure: swing labels,
 * BOS/CHoCH, n, break rule, zones, liquidity, external structure, higher-TF levels and context.
 * The button shows the current trend of the chart.
 */
export function StructureMenu({ timeframe }: { timeframe: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = useStructureStore();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const has = (k: IndKey) => s.ind.includes(k);
  const toggle = (k: IndKey) => (on: boolean) => s.toggleInd(k, on);
  const { trend, lastBreak, notes } = s.status;
  const trendText = trend
    ? `${t(trend === "bull" ? "ms.bull" : "ms.bear")}${lastBreak ? ` · ${t("ms.last", { kind: lastBreak })}` : ""}`
    : t("ms.noTrend");

  const groups: { title: string; items: { key: IndKey; label: string; tip?: string; color: string }[] }[] = [
    {
      title: t("ms.g.zones"),
      items: [
        { key: "fvg", label: "FVG", tip: t("ms.fvg.tip"), color: "#2ebd85" },
        { key: "ob", label: "Order Blocks", tip: t("ms.ob.tip"), color: "#2ebd85" },
      ],
    },
    {
      title: t("ms.g.liquidity"),
      items: [
        { key: "eq", label: "EQH / EQL", tip: t("ms.eq.tip"), color: "#94a3b8" },
        { key: "sweep", label: "Sweeps", tip: t("ms.sweep.tip"), color: "#f472b6" },
      ],
    },
    {
      title: t("ms.g.structure"),
      items: [
        { key: "ext", label: t("ms.ext.label", { f: EXT_FACTOR }), tip: t("ms.ext.tip", { f: EXT_FACTOR }), color: "#f5a524" },
        { key: "htf", label: t("ms.htf.label"), tip: t("ms.htf.tip"), color: "#c084fc" },
      ],
    },
    {
      title: t("ms.g.context"),
      items: [
        ...EMAS.map((e) => ({ key: e.key as IndKey, label: `EMA ${e.period}`, color: e.color })),
        { key: "vwap", label: t("ms.vwap.label"), tip: t("ms.vwap.tip"), color: VWAP_COLOR },
        { key: "vol", label: t("ms.vol.label"), tip: t("ms.vol.tip"), color: "#26a69a" },
      ],
    },
  ];

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={trendText}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs",
          open ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <span className="font-medium">{t("ms.button")}</span>
        <span className={cn("text-[10px]", trend === "bull" ? "text-buy" : trend === "bear" ? "text-sell" : "")}>
          {trend ? (trend === "bull" ? "▲" : "▼") : "–"}
          {lastBreak ? ` ${lastBreak}` : ""}
        </span>
        {s.ind.length > 0 && (
          <span className="rounded-full bg-primary px-1 text-[9px] text-primary-foreground">{s.ind.length}</span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[75vh] w-72 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ms.title")}</span>
            <button
              type="button"
              onClick={() => s.openGuide(null)}
              title={t("guide.btnTitle")}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-secondary"
            >
              <HelpCircle className="h-3 w-3" /> {t("guide.btn")}
            </button>
          </div>
          <p className={cn("px-2 pb-1 text-xs", trend === "bull" ? "text-buy" : trend === "bear" ? "text-sell" : "text-muted-foreground")}>
            {trendText}
          </p>
          {notes.length > 0 && (
            <p className="px-2 pb-1 text-[10px] text-warning">{notes.map((n) => t(n.key, n.vars)).join(" · ")}</p>
          )}

          <Row checked={s.swings} onChange={(v) => s.set({ swings: v })} label={t("ms.swings")} color="#2ebd85" helpKey="swings" />
          <Row checked={s.structure} onChange={(v) => s.set({ structure: v })} label={t("ms.breaks")} color="#6ea8fe" helpKey="bos" />
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <NControl tf={timeframe} />
            <HelpButton helpKey="swings" label="n" />
          </div>
          <label className="flex items-center justify-between gap-2 px-2 py-1 text-xs" title={t("ms.brk.title")}>
            <span className="text-muted-foreground">{t("ms.brk")}</span>
            <select
              value={s.breakBy}
              onChange={(e) => s.set({ breakBy: e.target.value === "wick" ? "wick" : "close" })}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs"
            >
              <option value="close">{t("ms.brk.close")}</option>
              <option value="wick">{t("ms.brk.wick")}</option>
            </select>
          </label>

          {groups.map((g) => (
            <div key={g.title} className="mt-1 border-t border-border/60 pt-1">
              <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</div>
              {g.items.map((it) => (
                <Row
                  key={it.key}
                  checked={has(it.key)}
                  onChange={toggle(it.key)}
                  label={it.label}
                  tip={it.tip}
                  color={it.color}
                  helpKey={helpKeyFor(it.key)}
                />
              ))}
            </div>
          ))}
          <Row checked={s.ha} onChange={(v) => s.set({ ha: v })} label={t("ms.ha.label")} tip={t("ms.ha.tip")} color="#26a69a" helpKey="ha" />

          <div className="mt-1 flex items-center justify-between border-t border-border/60 px-2 pt-2">
            <button type="button" onClick={s.clearInd} className="rounded bg-secondary px-2 py-1 text-[11px] hover:bg-border">
              {t("ms.clear")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single chart ↔ 4-timeframe view switch. */
export function ViewSwitch() {
  const t = useT();
  const view = useStructureStore((s) => s.view);
  const set = useStructureStore((s) => s.set);
  const multi = view === "multi";
  return (
    <button
      type="button"
      onClick={() => set({ view: multi ? "single" : "multi" })}
      title={t("ms.view.title")}
      className={cn(
        "hidden items-center gap-1 rounded px-2 py-1 text-xs md:flex",
        multi ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {multi ? <LayoutGrid className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      {t(multi ? "ms.view.multi" : "ms.view.single")}
    </button>
  );
}
