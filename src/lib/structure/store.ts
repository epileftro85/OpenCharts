/**
 * Market-structure settings shared by the Structure menu, the contextual guide,
 * the single chart overlay and the optional 4-timeframe view. Persisted per
 * browser (localStorage `oc_structure`); the guide's open state is not.
 */
import { create } from "zustand";
import { updateChartPreferences } from "../../hooks/useChartPreferences.ts";
import type { BreakBy } from "./structure.ts";

/** Optional overlays (all off by default, like in market-structure). */
export const IND_KEYS = [
  "fvg", "ob", "eq", "sweep", "ext", "htf",
  "ema10", "ema20", "ema50", "ema100", "ema200", "vwap", "vol",
] as const;
export type IndKey = (typeof IND_KEYS)[number];

/** External structure uses an `n` this many times larger than the internal one. */
export const EXT_FACTOR = 3;

/** Timeframes of the 4-panel view (same as market-structure), highest first. */
export const MULTI_TFS = ["1d", "4h", "15m", "10m"] as const;
export type MultiTf = (typeof MULTI_TFS)[number];
export const MULTI_LAYOUTS = [4, 2, 1] as const;

/** Higher timeframes drawn by "Higher TF levels", highest first. */
export const HTF_TFS = ["1d", "4h", "15m"] as const;

export const tfLabel = (tf: string) => (tf === "1d" ? "1D" : tf === "4h" ? "4H" : tf === "1w" ? "1W" : tf);

type Persisted = {
  swings: boolean;
  structure: boolean;
  breakBy: BreakBy;
  nByTf: Record<string, number>;
  ind: IndKey[];
  ha: boolean;
  view: "single" | "multi";
  multiLayout: 4 | 2 | 1;
  multiActive: MultiTf;
};

/** Live summary of the chart being analysed (shown on the Structure button). */
export type StructureStatus = {
  trend: "bull" | "bear" | null;
  lastBreak: "BOS" | "CHoCH" | null;
  notes: { key: string; vars?: Record<string, string | number> }[];
};

type StructureState = Persisted & {
  status: StructureStatus;
  setStatus: (s: StructureStatus) => void;
  guideOpen: boolean;
  guideKey: string | null;
  /** Bumped when the guide is asked to scroll to `guideKey` again. */
  guideNonce: number;
  nFor: (tf: string) => number;
  setN: (tf: string, n: number) => void;
  set: (patch: Partial<Persisted>) => void;
  toggleInd: (key: IndKey, on?: boolean) => void;
  clearInd: () => void;
  /** Guide switches: '@sw' / '@st' / '@ha' or an indicator key. */
  getToggle: (k: string) => boolean;
  setToggle: (k: string, on: boolean) => void;
  openGuide: (key?: string | null) => void;
  closeGuide: () => void;
};

const STORAGE_KEY = "oc_structure";

const DEFAULTS: Persisted = {
  swings: true,
  structure: true,
  breakBy: "close",
  nByTf: {},
  ind: [],
  ha: false,
  view: "single",
  multiLayout: 4,
  multiActive: "15m",
};

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Persisted>;
    const ind = Array.isArray(raw.ind) ? raw.ind.filter((k): k is IndKey => (IND_KEYS as readonly string[]).includes(k)) : [];
    return { ...DEFAULTS, ...raw, ind };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s: Persisted): void {
  const { swings, structure, breakBy, nByTf, ind, ha, view, multiLayout, multiActive } = s;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ swings, structure, breakBy, nByTf, ind, ha, view, multiLayout, multiActive }));
  } catch {
    /* not persisted */
  }
}

export const useStructureStore = create<StructureState>((set, get) => {
  const update = (patch: Partial<StructureState>) => {
    set(patch);
    save(get());
  };
  return {
    ...load(),
    status: { trend: null, lastBreak: null, notes: [] },
    setStatus: (status) => {
      const cur = get().status;
      if (JSON.stringify(cur) !== JSON.stringify(status)) set({ status });
    },
    guideOpen: false,
    guideKey: null,
    guideNonce: 0,
    nFor: (tf) => get().nByTf[tf] ?? 3,
    setN: (tf, n) => update({ nByTf: { ...get().nByTf, [tf]: Math.min(20, Math.max(1, Math.round(n))) } }),
    set: (patch) => update(patch),
    toggleInd: (key, on) => {
      const cur = new Set(get().ind);
      const next = on ?? !cur.has(key);
      if (next) cur.add(key);
      else cur.delete(key);
      update({ ind: IND_KEYS.filter((k) => cur.has(k)) });
      // The single chart already has its own volume histogram: keep both switches in step.
      if (key === "vol") updateChartPreferences({ showVolume: next });
    },
    clearInd: () => update({ ind: [] }),
    getToggle: (k) => {
      const s = get();
      if (k === "@sw") return s.swings;
      if (k === "@st") return s.structure;
      if (k === "@ha") return s.ha;
      return s.ind.includes(k as IndKey);
    },
    setToggle: (k, on) => {
      if (k === "@sw") update({ swings: on });
      else if (k === "@st") update({ structure: on });
      else if (k === "@ha") update({ ha: on });
      else if ((IND_KEYS as readonly string[]).includes(k)) get().toggleInd(k as IndKey, on);
    },
    openGuide: (key = null) => set({ guideOpen: true, guideKey: key, guideNonce: get().guideNonce + 1 }),
    closeGuide: () => set({ guideOpen: false }),
  };
});

/** The menu switches (ema10 … ema200) share a single help entry. */
export const helpKeyFor = (indKey: string) => (/^ema\d+$/.test(indKey) ? "ema" : indKey);
