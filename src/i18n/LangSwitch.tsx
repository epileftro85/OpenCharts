import { cn } from "../lib/utils.ts";
import { LANGS, useLangStore, useT } from "./index.ts";

/** ES / EN switch. The choice is saved per browser (localStorage `oc_lang`). */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();
  return (
    <div role="group" aria-label={t("lang.title")} title={t("lang.title")} className={cn("flex items-center rounded border border-border text-[10px] font-semibold", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "px-1.5 py-0.5 uppercase",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
