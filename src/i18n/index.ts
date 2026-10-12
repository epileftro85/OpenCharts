/**
 * UI translations (Spanish / English). Own dictionary, no libraries — same
 * approach as market-structure's i18n.js, adapted to React.
 *
 * Language: `oc_lang` in localStorage (ES/EN switch in the chart toolbar) or,
 * if absent, the server default (APP_LANG in .env, served by /api/status).
 * Switching language re-renders every component that uses `useT()` — no reload.
 *
 * Keys live in en.ts; es.ts must define exactly the same keys (enforced by the
 * type of es.ts and by src/i18n/i18n.test.ts).
 */
import { useCallback } from "react";
import { create } from "zustand";
import en, { type MessageKey } from "./en.ts";
import es from "./es.ts";

export type Lang = "es" | "en";
export type { MessageKey };
export const LANGS: Lang[] = ["es", "en"];
export const DICTS: Record<Lang, Record<MessageKey, string>> = { es, en };

const STORAGE_KEY = "oc_lang";

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

type LangState = { lang: Lang; setLang: (lang: Lang) => void };

export const useLangStore = create<LangState>((set) => ({
  lang: storedLang() ?? "es",
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* not persisted — still switches for this session */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Applies the server default unless this browser already picked a language. */
export function initLang(serverDefault: string | undefined): void {
  const lang = storedLang() ?? (serverDefault === "en" ? "en" : "es");
  document.documentElement.lang = lang;
  useLangStore.setState({ lang });
}

export type Vars = Record<string, string | number>;

/** Text for `key` in `lang`. `{x}` is replaced by vars.x. Falls back to English, then to the key. */
export function translate(lang: Lang, key: MessageKey | string, vars?: Vars): string {
  const s = (DICTS[lang] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Non-React callers (toasts, stores): translates with the current language. */
export function t(key: MessageKey | string, vars?: Vars): string {
  return translate(useLangStore.getState().lang, key, vars);
}

export type TFunction = (key: MessageKey | string, vars?: Vars) => string;

/** React hook: `const t = useT();` — re-renders when the language changes. Stable per language. */
export function useT(): TFunction {
  const lang = useLangStore((s) => s.lang);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

/**
 * For components whose props carry English text (e.g. settings rows): looks up
 * `${ns}:${english}` and falls back to the English text itself.
 */
export function useTx(ns: string): (english: string) => string {
  const lang = useLangStore((s) => s.lang);
  return useCallback(
    (english: string) => {
      const key = `${ns}:${english}`;
      const v = translate(lang, key);
      return v === key ? english : v;
    },
    [lang, ns],
  );
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** BCP-47 locale for dates. Numbers stay en-US (decimal point) to match price inputs. */
export function dateLocale(lang: Lang = useLangStore.getState().lang): string {
  return lang === "es" ? "es-ES" : "en-US";
}
