import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLang, useT } from "../../i18n/index.ts";
import { DIAGRAMS, GROUP_TITLES, GROUPS } from "../../lib/guide/diagrams.ts";
import { HELP as HELP_EN } from "../../lib/guide/help.en.ts";
import { HELP as HELP_ES } from "../../lib/guide/help.es.ts";
import { EXAMPLES as EXAMPLES_EN } from "../../lib/guide/examples.en.ts";
import { EXAMPLES as EXAMPLES_ES } from "../../lib/guide/examples.es.ts";
import type { Example, HelpEntry } from "../../lib/guide/types.ts";
import { useStructureStore } from "../../lib/structure/store.ts";

/** Our own static SVG strings (src/lib/guide/diagrams.ts) — no external or user data. */
function Diagram({ svg }: { svg: string }) {
  return <div className="my-2 rounded bg-[#0b0f14] p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Section({ title, body }: { title: string; body: string | string[] }) {
  return (
    <>
      <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {Array.isArray(body) ? (
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {body.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">{body}</p>
      )}
    </>
  );
}

function ExampleBox({ ex }: { ex: Example }) {
  const t = useT();
  const lang = useLang();
  const h5 = "mt-3 text-[11px] font-semibold text-foreground";
  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t("ex.heading")}</h4>
      <div className="mt-1 font-semibold text-foreground">{ex.title}</div>
      <p className="mt-1">{ex.scenario}</p>
      {ex.diagrams?.map((d) => (
        <figure key={d.key}>
          <Diagram svg={DIAGRAMS[d.key]?.(lang) ?? ""} />
          <figcaption className="text-[11px] text-muted-foreground">{d.caption}</figcaption>
        </figure>
      ))}
      {!!ex.steps?.length && (
        <>
          <h5 className={h5}>{t("ex.steps")}</h5>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {ex.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {!!ex.outcomes?.length && (
        <>
          <h5 className={h5}>{t("ex.outcomes")}</h5>
          {ex.outcomes.map((o, i) => (
            <div key={i} className="mt-2 rounded border border-border bg-card p-2">
              <div className="font-semibold text-foreground">{o.title}</div>
              {(
                [
                  [t("ex.when"), o.when],
                  [t("ex.means"), o.means],
                  [t("ex.check"), o.check],
                ] as const
              ).map(([label, text]) => (
                <p key={label} className="mt-1">
                  <b>{label}: </b>
                  {text}
                </p>
              ))}
            </div>
          ))}
        </>
      )}
      {!!ex.measure?.length && (
        <>
          <h5 className={h5}>{t("ex.measure")}</h5>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {ex.measure.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </>
      )}
      {!!ex.mistakes?.length && (
        <>
          <h5 className={h5}>{t("ex.mistakes")}</h5>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sell/90">
            {ex.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-[10px] text-muted-foreground">{t("ex.note")}</p>
    </div>
  );
}

function Entry({ h, examples }: { h: HelpEntry; examples: Record<string, Example> }) {
  const t = useT();
  const lang = useLang();
  const getToggle = useStructureStore((s) => s.getToggle);
  const setToggle = useStructureStore((s) => s.setToggle);
  // Subscribe to the toggled values so the checkboxes stay in sync with the menu.
  useStructureStore((s) => `${s.swings}${s.structure}${s.ha}${s.ind.join()}`);
  const ex = examples[h.key];
  return (
    <section id={`guide-${h.key}`} className="scroll-mt-2 rounded-lg border border-transparent p-2 transition-colors">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: h.color }} />
        {h.title}
      </h3>
      {h.diagram && <Diagram svg={DIAGRAMS[h.diagram]?.(lang) ?? ""} />}
      {!!h.toggles?.length && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {h.toggles.map((tg) => (
            <label key={tg.k} className="flex cursor-pointer items-center gap-1 text-[11px] text-foreground">
              <input type="checkbox" checked={getToggle(tg.k)} onChange={(e) => setToggle(tg.k, e.target.checked)} />
              {tg.label}
            </label>
          ))}
        </div>
      )}
      <Section title={t("guide.what")} body={h.what} />
      <Section title={t("guide.read")} body={h.read} />
      <Section title={t("guide.rules")} body={h.rules} />
      <Section title={t("guide.practice")} body={h.practice} />
      {ex && <ExampleBox ex={ex} />}
      <div className="mt-3 rounded border border-warning/30 bg-warning/10 p-2 text-[11px]">
        <strong>{t("guide.caveat")}</strong>
        {h.caveat}
      </div>
    </section>
  );
}

/**
 * Contextual guide (ported from market-structure): what each mark is, how to read it, the exact
 * rule this app applies, what to practice and its limits, with step-by-step examples.
 * Opened from the "?" buttons; switches inside it toggle the overlays without closing it.
 */
export function GuidePanel() {
  const t = useT();
  const lang = useLang();
  const open = useStructureStore((s) => s.guideOpen);
  const key = useStructureStore((s) => s.guideKey);
  const nonce = useStructureStore((s) => s.guideNonce);
  const close = useStructureStore((s) => s.closeGuide);
  const openGuide = useStructureStore((s) => s.openGuide);
  const scroller = useRef<HTMLDivElement>(null);
  const help = lang === "en" ? HELP_EN : HELP_ES;
  const examples = lang === "en" ? EXAMPLES_EN : EXAMPLES_ES;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const box = scroller.current;
    if (!box) return;
    const sec = key ? box.querySelector<HTMLElement>(`#guide-${key}`) : null;
    if (!sec) {
      box.scrollTo({ top: 0 });
      return;
    }
    box.scrollTo({ top: sec.offsetTop - 8, behavior: "smooth" });
    sec.classList.add("border-primary");
    const timer = window.setTimeout(() => sec.classList.remove("border-primary"), 1500);
    return () => window.clearTimeout(timer);
  }, [open, key, nonce, lang]);

  if (!open) return null;

  return (
    <aside className="fixed bottom-0 right-0 top-0 z-[60] flex w-full max-w-[440px] flex-col border-l border-border bg-card text-xs leading-relaxed text-muted-foreground shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <strong className="text-sm text-foreground">{t("guide.title")}</strong>
        <button type="button" onClick={close} title={t("guide.close")} className="rounded p-1 hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div ref={scroller} className="relative flex-1 overflow-y-auto px-3 pb-6">
        <p className="mt-2">{t("guide.intro")}</p>
        <nav className="mt-2 flex flex-wrap gap-1">
          {help.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => openGuide(h.key)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground hover:border-primary"
            >
              {h.title.split(" · ")[0]!.split(" (")[0]}
            </button>
          ))}
        </nav>
        {GROUPS.map((group) => {
          const entries = help.filter((h) => h.group === group);
          if (!entries.length) return null;
          return (
            <div key={group}>
              <div className="mt-4 border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {GROUP_TITLES[lang][group]}
              </div>
              {entries.map((h) => (
                <Entry key={h.key} h={h} examples={examples} />
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
