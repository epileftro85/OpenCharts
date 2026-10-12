// Shapes of the contextual guide content (src/lib/guide/help.*.ts, examples.*.ts).
export type GuideLang = "es" | "en";
export type GuideGroup = "basic" | "zones" | "liquidity" | "advanced" | "context";

/** A switch the guide can flip: a structure-menu key, or '@sw' / '@st' / '@ha' (swings, breaks, Heikin Ashi). */
export type GuideToggle = { k: string; label: string };

export type HelpEntry = {
  key: string;
  group: GuideGroup;
  title: string;
  color: string;
  diagram?: string;
  toggles?: GuideToggle[];
  what: string;
  read: string[];
  rules: string[];
  practice: string;
  caveat: string;
};

export type Example = {
  title: string;
  scenario: string;
  diagrams?: { key: string; caption: string }[];
  steps?: string[];
  outcomes?: { title: string; when: string; means: string; check: string }[];
  measure?: string[];
  mistakes?: string[];
};
