// Mini-diagrams (static SVG, our own markup) and section titles of the contextual guide.
// Ported from market-structure/public/js/help.js; labels are drawn in the requested language.
import type { GuideGroup, GuideLang } from "./types.ts";

export const C = {
  up: "#2ebd85", down: "#f6465d", bos: "#6ea8fe", choch: "#f5a524", eq: "#94a3b8",
  sweep: "#f472b6", mute: "#8b95a5", htf4: "#22d3ee", htf1: "#c084fc",
};

// ---------------------------------------------------------------- drawings
type Pt = [number, number];
const svg = (inner: string) =>
  `<svg viewBox="0 0 230 110" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const ln = (x1: number, y1: number, x2: number, y2: number, c: string, { w = 1.5, d = "" }: { w?: number; d?: string } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ""}/>`;
const tx = (x: number, y: number, t: string, c: string, { a = "middle", s = 10 }: { a?: string; s?: number } = {}) =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${s}" font-weight="600" text-anchor="${a}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${t}</text>`;
const dot = (x: number, y: number, c: string, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const poly = (pts: Pt[], c: string, w = 1.6) =>
  `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const box = (x: number, y: number, w: number, h: number, c: string, { fill = 0.16, d = "" }: { fill?: number; d?: string } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity="${fill}" stroke="${c}" stroke-opacity=".8" stroke-width="1.2"${d ? ` stroke-dasharray="${d}"` : ""}/>`;
// y grows DOWNWARD (lower price). Green candle if it closes above its open (c < o in y).
const candle = (x: number, o: number, c: number, h: number, l: number) => {
  const col = c <= o ? C.up : C.down;
  return `${ln(x, h, x, l, col, { w: 1.2 })}<rect x="${x - 4}" y="${Math.min(o, c)}" width="8" height="${Math.max(2, Math.abs(o - c))}" fill="${col}"/>`;
};

// Drawing labels in the requested language (Spanish by default).
const L = (lang: GuideLang, es: string, en: string) => (lang === "en" ? en : es);

export const DIAGRAMS: Record<string, (lang: GuideLang) => string> = {
  swings: (lang: GuideLang) => svg([
    poly([[18, 88], [52, 52], [84, 70], [118, 24], [150, 56], [182, 40], [210, 78]], C.mute),
    ...([[18, 88], [52, 52], [84, 70], [118, 24], [150, 56], [182, 40], [210, 78]] as Pt[]).map(([x, y]) => dot(x, y, '#cbd5e1')),
    tx(118, 17, 'HH', C.up), tx(182, 33, 'LH', C.down),
    tx(84, 84, 'HL', C.up), tx(150, 70, 'HL', C.up), tx(210, 92, 'LL', C.down),
    tx(52, 45, L(lang, 'primer swing', 'first swing'), C.mute, { s: 8 }),
  ].join('')),

  bos: (lang: GuideLang) => svg([
    poly([[16, 92], [58, 40], [92, 72], [150, 22]], C.mute),
    ln(58, 40, 129, 40, C.bos, { w: 1.4, d: '4 3' }),
    dot(58, 40, '#cbd5e1'), dot(129, 40, C.bos, 3.2),
    tx(94, 33, 'BOS', C.bos), tx(58, 56, 'swing high', C.mute, { s: 8 }),
    tx(150, 14, L(lang, 'cierra por encima', 'closes above'), C.mute, { s: 8, a: 'middle' }),
  ].join('')),

  choch: (lang: GuideLang) => svg([
    poly([[16, 92], [48, 62], [80, 76], [116, 28], [160, 92]], C.mute),
    ln(80, 76, 149, 76, C.choch, { w: 2 }),
    dot(80, 76, '#cbd5e1'), dot(149, 76, C.choch, 3.2),
    tx(114, 90, 'CHoCH', C.choch), tx(80, 62, 'HL', C.up), tx(116, 20, 'HH', C.up),
    tx(188, 80, L(lang, 'cierra por debajo', 'closes below'), C.mute, { s: 8 }),
  ].join('')),

  fvg: (lang: GuideLang) => svg([
    box(92, 36, 123, 18, C.up, { fill: 0.14, d: '3 3' }),
    ln(62, 54, 92, 54, C.up, { w: 1, d: '2 2' }), ln(92, 36, 122, 36, C.up, { w: 1, d: '2 2' }),
    candle(62, 70, 60, 54, 74), candle(92, 62, 26, 22, 66), candle(122, 30, 18, 14, 36),
    candle(170, 28, 46, 24, 50),
    tx(196, 48, 'FVG', C.up),
    tx(62, 100, L(lang, 'vela 1', 'candle 1'), C.mute, { s: 8 }), tx(92, 100, L(lang, 'vela 2', 'candle 2'), C.mute, { s: 8 }), tx(122, 100, L(lang, 'vela 3', 'candle 3'), C.mute, { s: 8 }),
    tx(170, 100, L(lang, 'vuelve al hueco', 'returns to the gap'), C.mute, { s: 8 }),
  ].join('')),

  ob: (lang: GuideLang) => svg([
    ln(12, 35, 102, 35, C.bos, { w: 1.2, d: '4 3' }), tx(56, 29, 'BOS', C.bos),
    box(50, 60, 168, 17, C.up, { fill: 0.2 }),
    candle(30, 76, 66, 62, 78), candle(54, 64, 74, 60, 77), // the 2nd one is the bearish candle (OB)
    candle(78, 72, 46, 43, 74), candle(102, 46, 26, 22, 48), candle(126, 28, 18, 14, 30),
    candle(152, 20, 50, 18, 54), candle(176, 52, 64, 50, 68), candle(200, 62, 34, 30, 66),
    tx(128, 73, 'OB', C.up),
    tx(54, 95, L(lang, 'última vela', 'last bearish'), C.mute, { s: 8 }), tx(54, 104, L(lang, 'bajista', 'candle'), C.mute, { s: 8 }),
    tx(176, 95, L(lang, 'el precio regresa', 'price returns'), C.mute, { s: 8 }),
  ].join('')),

  eq: (lang: GuideLang) => svg([
    poly([[16, 90], [58, 32], [94, 66], [132, 33], [172, 80], [210, 60]], C.mute),
    ln(58, 32, 192, 32, C.eq, { w: 1.4, d: '2 3' }),
    dot(58, 32, '#cbd5e1'), dot(132, 33, '#cbd5e1'),
    tx(95, 24, 'EQH', C.eq), tx(150, 14, L(lang, 'stops acumulados encima', 'stops resting above'), C.mute, { s: 8 }),
  ].join('')),

  sweep: (lang: GuideLang) => svg([
    poly([[16, 90], [60, 36], [96, 66]], C.mute),
    ln(60, 36, 132, 36, C.sweep, { w: 1.2, d: '1 3' }),
    dot(60, 36, '#cbd5e1'),
    candle(132, 46, 56, 24, 60), candle(158, 58, 80, 56, 84),
    tx(132, 14, '▼ sweep', C.sweep), tx(60, 28, 'swing high', C.mute, { s: 8 }),
    tx(185, 36, L(lang, 'mecha pasa,', 'wick goes past,'), C.mute, { s: 8 }), tx(185, 46, L(lang, 'cierre vuelve', 'close comes back'), C.mute, { s: 8 }),
  ].join('')),

  eq_form: (lang: GuideLang) => svg([
    poly([[14, 92], [52, 36], [92, 72], [130, 37], [170, 74], [212, 58]], C.mute),
    ln(52, 36, 206, 36, C.eq, { w: 1.4, d: '2 3' }),
    dot(52, 36, '#cbd5e1'), dot(130, 37, '#cbd5e1'),
    tx(52, 27, L(lang, 'máx. 1', 'high 1'), C.mute, { s: 8 }), tx(91, 27, 'EQH', C.eq), tx(130, 27, L(lang, 'máx. 2', 'high 2'), C.mute, { s: 8 }),
    tx(178, 27, '× × ×  stops', C.sweep, { s: 8 }),
    tx(115, 104, L(lang, 'dos máximos a casi el mismo precio', 'two highs at almost the same price'), C.mute, { s: 8 }),
  ].join('')),

  eq_sweep: (lang: GuideLang) => svg([
    ln(0, 40, 230, 40, C.eq, { w: 1.2, d: '2 3' }), tx(22, 34, 'EQH', C.eq),
    candle(64, 66, 54, 50, 70), candle(88, 56, 46, 43, 59), candle(112, 50, 44, 42, 53),
    candle(142, 44, 58, 20, 60), // wick above the level, closes below
    candle(168, 58, 72, 56, 75), candle(194, 72, 88, 70, 90),
    ln(152, 20, 152, 40, C.sweep, { w: 1 }), tx(158, 32, L(lang, 'mecha', 'wick'), C.sweep, { s: 8, a: 'start' }),
    tx(142, 13, '▼ sweep', C.sweep),
    tx(115, 104, L(lang, 'cierra de vuelta bajo el nivel', 'closes back below the level'), C.mute, { s: 8 }),
  ].join('')),

  eq_break: (lang: GuideLang) => svg([
    ln(0, 46, 230, 46, C.eq, { w: 1.2, d: '2 3' }), tx(22, 40, 'EQH', C.eq),
    candle(46, 74, 64, 60, 76), candle(70, 64, 54, 50, 66), candle(94, 56, 49, 47, 58),
    candle(124, 50, 26, 22, 52), // closes beyond the level
    candle(150, 28, 38, 26, 40), candle(176, 40, 48, 38, 50), candle(204, 48, 24, 20, 50),
    tx(124, 14, L(lang, 'cierra más allá', 'closes beyond'), C.bos, { s: 9 }),
    tx(176, 66, 'retest', C.mute, { s: 8 }), ln(176, 52, 176, 60, C.mute, { w: 1 }),
    tx(115, 104, L(lang, 'ruptura (no es barrido): hay aceptación arriba', 'break (not a sweep): price is accepted above'), C.mute, { s: 8 }),
  ].join('')),

  eq_measure: () => svg([
    poly([[14, 94], [48, 34], [86, 72], [124, 44], [158, 72]], C.mute),
    ln(48, 34, 204, 34, C.eq, { w: 1.2, d: '2 3' }), ln(124, 44, 150, 44, C.eq, { w: 1, d: '2 3' }),
    dot(48, 34, '#cbd5e1'), dot(124, 44, '#cbd5e1'),
    ln(138, 34, 138, 44, C.choch, { w: 1.4 }), tx(146, 41, 'A', C.choch, { s: 9, a: 'start' }),
    ln(48, 98, 124, 98, C.choch, { w: 1.4 }), tx(86, 92, 'B', C.choch, { s: 9 }),
    candle(190, 46, 62, 14, 64),
    ln(176, 14, 176, 34, C.choch, { w: 1.4 }), tx(169, 28, 'C', C.choch, { s: 9, a: 'end' }),
    ln(206, 34, 206, 62, C.choch, { w: 1.4 }), tx(213, 52, 'D', C.choch, { s: 9, a: 'start' }),
    tx(48, 26, 'EQH', C.eq),
  ].join('')),

  choch_htf: (lang: GuideLang) => svg([
    tx(8, 10, L(lang, '4H · alcista', '4H · bullish'), C.up, { a: 'start', s: 9 }),
    poly([[14, 44], [54, 28], [86, 36], [128, 14], [168, 22], [214, 8]], C.up, 1.8),
    ln(0, 54, 230, 54, C.mute, { w: 0.8, d: '1 3' }),
    tx(8, 66, '15m · CHoCH ▼', C.choch, { a: 'start', s: 9 }),
    poly([[14, 100], [48, 78], [76, 90], [108, 72], [140, 98], [170, 88], [212, 76]], C.mute),
    ln(76, 90, 140, 90, C.choch, { w: 2 }),
    tx(108, 106, L(lang, 'solo un retroceso en la mayor?', 'just a pullback on the higher TF?'), C.mute, { s: 8 }),
  ].join('')),

  ext: (lang: GuideLang) => svg([
    poly([[14, 80], [30, 60], [42, 72], [58, 44], [72, 58], [88, 30], [104, 52], [118, 42], [134, 70], [150, 56], [166, 88], [182, 70], [198, 84], [214, 60]], C.mute, 1),
    poly([[14, 80], [88, 30], [166, 88], [214, 60]], C.choch, 2.6),
    tx(60, 24, L(lang, 'externa (n×3)', 'external (n×3)'), C.choch, { s: 9 }), tx(150, 40, L(lang, 'interna (n)', 'internal (n)'), C.mute, { s: 9 }),
  ].join('')),

  htf: (lang: GuideLang) => svg([
    ln(0, 28, 230, 28, C.htf4, { w: 1.4, d: '8 4' }), tx(224, 23, '4H swing high', C.htf4, { a: 'end', s: 8 }),
    ln(0, 78, 230, 78, C.htf1, { w: 1.2, d: '2 4' }), tx(224, 74, '1D BOS ▲', C.htf1, { a: 'end', s: 8 }),
    poly([[14, 96], [50, 64], [78, 80], [112, 48], [140, 62], [172, 34]], C.mute),
    tx(40, 100, L(lang, 'tu panel (15m / 10m)', 'your panel (15m / 10m)'), C.mute, { s: 8, a: 'start' }),
  ].join('')),
};

export const GROUPS: GuideGroup[] = ['basic', 'zones', 'liquidity', 'advanced', 'context'];
export const GROUP_TITLES: Record<GuideLang, Record<GuideGroup, string>> = {
  es: { basic: 'Estructura básica', zones: 'Zonas', liquidity: 'Liquidez', advanced: 'Estructura avanzada', context: 'Contexto' },
  en: { basic: 'Basic structure', zones: 'Zones', liquidity: 'Liquidity', advanced: 'Advanced structure', context: 'Context' },
};

