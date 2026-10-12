// Contextual guide content (Spanish). Ported from market-structure/public/js/help.js;
// adapted only where it described market-structure's own controls. Data only: GuidePanel renders it.
import { C } from "./diagrams.ts";
import type { HelpEntry } from "./types.ts";

export const HELP: HelpEntry[] = [
  {
    key: 'swings', group: 'basic', title: 'Swings y etiquetas HH · HL · LH · LL', color: C.up,
    diagram: 'swings',
    toggles: [{ k: '@sw', label: 'Mostrar etiquetas HH/HL/LH/LL' }],
    what: 'Un swing high es un máximo local y un swing low un mínimo local. Cada swing se compara con el anterior del mismo tipo para describir la tendencia: HH (Higher High, máximo más alto), HL (Higher Low, mínimo más alto), LH (Lower High) y LL (Lower Low).',
    read: [
      'Tendencia alcista = secuencia de HH y HL. Tendencia bajista = secuencia de LH y LL.',
      'Verde = HH/HL. Rojo = LH/LL. Un punto gris es el primer swing de cada tipo (todavía no hay con qué compararlo).',
      'Cuando la secuencia se rompe (por ejemplo, aparece un LL tras una serie de HL) es una señal de posible cambio: es lo que se marca como CHoCH.',
    ],
    rules: [
      'Swing high: máximo mayor que el de las n velas anteriores y mayor o igual que el de las n posteriores. Swing low: lo mismo a la inversa.',
      'Un swing solo se confirma n velas después de formarse, por eso las marcas más recientes aparecen "tarde". Es inherente a cualquier indicador de swings.',
      'n se ajusta por temporalidad con los botones − / + del menú Estructura (o de la cabecera de cada panel en la vista de 4 temporalidades). Por defecto 3.',
    ],
    practice: 'Marca a mano los swings en un gráfico, luego mira lo que marca la app y fíjate dónde difieren. Prueba n = 2, 3, 5 y observa qué swings aparecen y desaparecen.',
    caveat: 'No existe un n "correcto": n pequeño da mucho ruido, n grande da pocos swings y tardíos. Depende de la temporalidad y de lo que quieras estudiar.',
  },
  {
    key: 'bos', group: 'basic', title: 'BOS · Break of Structure', color: C.bos,
    diagram: 'bos',
    toggles: [{ k: '@st', label: 'Mostrar líneas BOS/CHoCH' }],
    what: 'Ruptura de estructura a favor de la tendencia vigente: en tendencia alcista, el precio supera el último swing high; en bajista, pierde el último swing low. Indica continuación de la tendencia.',
    read: [
      'Línea azul punteada desde el swing que se rompió hasta la vela que lo rompe, con la etiqueta BOS.',
      'La primera ruptura de todo el gráfico fija la tendencia y se marca como BOS.',
    ],
    rules: [
      'Por defecto la ruptura es por cierre: una vela debe cerrar más allá del nivel. Con "Ruptura: por mecha" basta que la mecha lo supere.',
      'Se evalúa contra el último swing aún no roto. Cada swing se rompe una sola vez.',
    ],
    practice: 'Antes de ver la marca, pregúntate: ¿cuál es el último swing sin romper? ¿Qué vela lo rompió y cerró más allá?',
    caveat: 'Un BOS describe lo que ya ocurrió; no predice que la tendencia vaya a continuar.',
  },
  {
    key: 'choch', group: 'basic', title: 'CHoCH · Change of Character', color: C.choch,
    diagram: 'choch',
    toggles: [{ k: '@st', label: 'Mostrar líneas BOS/CHoCH' }],
    what: 'Primera ruptura en contra de la tendencia vigente: en alcista, un cierre por debajo del último swing low (normalmente el HL); en bajista, por encima del último swing high (el LH). Es la primera señal de un posible cambio de tendencia.',
    read: [
      'Línea naranja sólida con la etiqueta CHoCH. Desde esa vela, la tendencia que muestra el botón Estructura (o la cabecera del panel) (▲ / ▼) cambia de signo.',
      'Después de un CHoCH, el siguiente movimiento en la nueva dirección se marcará como BOS.',
    ],
    rules: [
      'Mismo criterio que el BOS (cierre o mecha), pero en contra de la tendencia vigente.',
    ],
    practice: 'Compara las temporalidades: un CHoCH en 15m dentro de una tendencia alcista de 4H puede ser solo un retroceso dentro de la tendencia mayor. Es el motivo por el que conviene mirar varias a la vez (activa "Niveles de TF mayor").',
    caveat: 'Un CHoCH puede fallar: el precio puede volver y retomar la tendencia previa.',
  },
  {
    key: 'fvg', group: 'zones', title: 'FVG · Fair Value Gap', color: C.up,
    diagram: 'fvg', toggles: [{ k: 'fvg', label: 'Mostrar FVG' }],
    what: 'Hueco que deja un movimiento muy rápido: entre la mecha de la vela 1 y la de la vela 3 queda un rango que la vela 2 (impulsiva) no dejó "cubrir". La idea es que ahí hubo poca negociación y el precio a veces regresa a ese rango.',
    read: [
      'Rectángulo con borde punteado desde la vela central hacia la derecha: verde si el hueco es alcista (queda debajo del precio), rojo si es bajista.',
      'Cuando una vela lo llena por completo, desaparece.',
    ],
    rules: [
      'Alcista: el low de la vela 3 es mayor que el high de la vela 1. Bajista: el high de la vela 3 es menor que el low de la vela 1.',
      'Se ignoran huecos menores que 0.25 × ATR(14) para evitar ruido. Se muestran como máximo los 10 más recientes sin llenar.',
    ],
    practice: 'Observa qué hace el precio cuando regresa a un FVG: ¿rebota, lo atraviesa, lo llena a medias? Hazlo en distintas temporalidades.',
    caveat: 'Es una hipótesis visual, no una garantía. En temporalidades bajas aparecen muchos y la mayoría no tiene relevancia.',
  },
  {
    key: 'ob', group: 'zones', title: 'Order Block', color: C.up,
    diagram: 'ob', toggles: [{ k: 'ob', label: 'Mostrar Order Blocks' }],
    what: 'La última vela de dirección contraria antes del impulso que rompió la estructura. La idea es que ahí quedó una concentración de órdenes que el precio podría "respetar" cuando regrese.',
    read: [
      'Rectángulo de borde sólido con la etiqueta OB: verde (alcista, vela bajista previa a un impulso al alza) o rojo (bajista).',
      'Se prolonga hacia la derecha hasta que una vela cierra al otro lado de la zona (queda "mitigado") y entonces desaparece.',
    ],
    rules: [
      'Para cada BOS/CHoCH: entre el swing roto y la vela de ruptura se toma el extremo (el mínimo en una ruptura alcista, el máximo en una bajista).',
      'El OB es la última vela contraria en ese extremo o hasta 2 velas antes. La zona es su rango completo, de mecha a mecha.',
      'Se muestran como máximo los 6 más recientes sin mitigar.',
    ],
    practice: 'Identifica a mano el OB de una ruptura antes de activar el indicador. Luego observa si el precio regresó a la zona y cómo reaccionó.',
    caveat: 'Hay varias definiciones de OB (solo el cuerpo, la mecha completa, otra vela de la secuencia). Esta es una; si la tuya difiere es normal.',
  },
  {
    key: 'eq', group: 'liquidity', title: 'EQH / EQL · Equal Highs / Lows', color: C.eq,
    diagram: 'eq', toggles: [{ k: 'eq', label: 'Mostrar EQH / EQL' }],
    what: 'Dos máximos (o mínimos) consecutivos casi al mismo nivel. Se interpretan como liquidez: muchos participantes colocan sus stops justo encima de los máximos (o debajo de los mínimos), así que el precio puede ir a buscarlos.',
    read: [
      'Línea gris punteada que une los dos swings y se prolonga hacia la derecha hasta que el nivel se barre (sweep) o se rompe.',
    ],
    rules: [
      'Dos swings consecutivos del mismo tipo con diferencia de precio ≤ 0.1 × ATR(14). Usa los mismos swings del gráfico, así que depende de n.',
      'El nivel es el más extremo de los dos. Se muestran como máximo los 8 más recientes.',
    ],
    practice: 'Mira qué ocurre después de que un EQH es barrido: ¿reversión o continuación? Combínalo con "Sweeps".',
    caveat: 'La tolerancia (0.1 × ATR) es una elección de esta app; dos máximos que a ti te parecen iguales pueden quedar fuera, y al revés.',
  },
  {
    key: 'sweep', group: 'liquidity', title: 'Sweep · barrido de liquidez', color: C.sweep,
    diagram: 'sweep', toggles: [{ k: 'sweep', label: 'Mostrar Sweeps' }],
    what: 'La mecha supera un swing anterior (toma los stops que había allí) pero la vela cierra de vuelta dentro del rango. Es distinto de una ruptura (BOS/CHoCH), donde el cierre queda más allá del nivel.',
    read: [
      'Línea rosa punteada desde el swing hasta la vela, con ▼ sweep (barrió un máximo) o ▲ sweep (barrió un mínimo).',
    ],
    rules: [
      'Para cada swing confirmado se mira la primera vela que lo supera: si cierra de vuelta dentro es un sweep; si cierra más allá es una ruptura y no se marca aquí. Cada swing da como mucho un sweep.',
      'Se muestran como máximo los 12 más recientes.',
    ],
    practice: 'Un sweep seguido de un CHoCH en una temporalidad menor es un patrón clásico de estudio. Búscalos y revisa cuántas veces funcionó y cuántas no.',
    caveat: 'Si la ruptura está en modo "por mecha", la misma vela puede aparecer como BOS/CHoCH y como sweep, porque ambos criterios son independientes.',
  },
  {
    key: 'ext', group: 'advanced', title: 'Estructura externa (n × 3)', color: C.choch,
    diagram: 'ext', toggles: [{ k: 'ext', label: 'Mostrar estructura externa' }],
    what: 'Una segunda escala de estructura en el mismo gráfico. La interna (tu n) muestra los movimientos pequeños; la externa (n × 3) muestra solo los grandes.',
    read: [
      'Etiquetas en forma de píldora y líneas gruesas (BOS azul, CHoCH naranja), por encima de las marcas normales.',
      'Sirve para distinguir un retroceso interno dentro de un movimiento externo más grande.',
    ],
    rules: [
      'Es el mismo algoritmo con n triplicado: si n = 3, la externa usa n = 9.',
    ],
    practice: 'Busca CHoCH internos que no vengan acompañados de CHoCH externo y mira cómo termina cada caso.',
    caveat: 'El factor 3 es una convención de esta app, no un estándar.',
  },
  {
    key: 'htf', group: 'advanced', title: 'Niveles de TF mayor', color: C.htf4,
    diagram: 'htf', toggles: [{ k: 'htf', label: 'Mostrar niveles de TF mayor' }],
    what: 'Dibuja en el gráfico (o en cada panel) los niveles vigentes de las temporalidades superiores, para ver si lo que marcas abajo está alineado con el contexto de arriba (análisis top-down).',
    read: [
      'Líneas horizontales con la etiqueta a la derecha: "4H swing high/low" (continua) y "4H BOS ▼" (punteada: nivel de la última ruptura y su dirección).',
      'Colores: 1D morado, 4H cian, 15m lima. El botón Estructura (o la cabecera de cada panel) ya muestra la tendencia (▲ / ▼) de su temporalidad.',
      'Pregunta clave en 15m / 10m: ¿el CHoCH que veo va a favor o en contra de la última ruptura de 4H y 1D?',
    ],
    rules: [
      'Swing high/low vigentes = los últimos sin romper según el n de esa temporalidad (cada temporalidad usa su propio n). La última ruptura es la más reciente.',
      'Un gráfico solo recibe las temporalidades superiores a la suya (1D no recibe nada; 10m o 5m reciben 1D, 4H y 15m).',
      'Si alguna temporalidad no está visible (layout 1 o 2), la app la carga en segundo plano.',
    ],
    practice: 'Mira un CHoCH en 10m y revisa si está a favor o en contra de la tendencia de 4H y 1D. Anota cómo evoluciona en cada caso.',
    caveat: 'Las líneas que caen fuera del rango de precios visible no se dibujan; aleja el zoom para verlas.',
  },
  {
    key: 'ema', group: 'context', title: 'EMA 10 / 20 / 50 / 100 / 200', color: '#93c5fd',
    toggles: [10, 20, 50, 100, 200].map((p) => ({ k: `ema${p}`, label: `EMA ${p}` })),
    what: 'Promedios móviles exponenciales: promedian los cierres dándole más peso a los recientes. Dan contexto de tendencia y de "velocidad" del precio.',
    read: [
      'Cuanto más corta la EMA, más gruesa la línea y más rápido reacciona: EMA 10 (rosa, la más gruesa), 20 (turquesa), 50 (azul claro), 100 (violeta) y 200 (blanca, la más fina).',
      'Precio por encima de una EMA inclinada hacia arriba suele leerse como contexto alcista; por debajo y hacia abajo, bajista.',
    ],
    rules: [
      'EMA de los cierres reales (también con Heikin Ashi activo), sembrada con la media simple de las primeras n velas. Cada EMA necesita al menos tantas velas como su periodo; si no hay suficientes, la app lo avisa.',
    ],
    practice: 'Compara cómo se comporta la estructura (BOS/CHoCH) cuando el precio está por encima o por debajo de la EMA 200.',
    caveat: 'Son indicadores rezagados: describen el pasado reciente.',
  },
  {
    key: 'vwap', group: 'context', title: 'VWAP diario', color: '#fbbf24',
    toggles: [{ k: 'vwap', label: 'VWAP' }],
    what: 'Precio medio ponderado por volumen desde el inicio de la sesión. Muchos participantes lo usan como referencia del "precio medio del día".',
    read: [
      'Línea amarilla que salta al inicio de cada día porque se reinicia.',
      'Precio por encima = compradores pagando por encima del promedio del día; por debajo, lo contrario.',
    ],
    rules: [
      'Usa el precio típico (máximo + mínimo + cierre) / 3 de cada vela ponderado por su volumen, reiniciado cada día (hora de la bolsa).',
      'No aplica en 1D y no se puede calcular sin volumen (forex): la app lo avisa.',
    ],
    practice: 'Observa cómo reacciona el precio al VWAP en las temporalidades de 15m y 10m durante la sesión.',
    caveat: 'El volumen que entrega IB puede no coincidir exactamente con el de otras plataformas, así que el VWAP puede diferir ligeramente.',
  },
  {
    key: 'vol', group: 'context', title: 'Volumen', color: '#26a69a',
    toggles: [{ k: 'vol', label: 'Volumen' }],
    what: 'Cantidad negociada en cada vela, como histograma en la parte inferior del gráfico.',
    read: [
      'Verde: vela alcista. Rojo: vela bajista.',
      'Se suele observar si las rupturas (BOS/CHoCH) vienen acompañadas de más volumen de lo normal.',
    ],
    rules: [
      'Forex no tiene volumen en IB (se piden precios MIDPOINT): la app lo avisa en lugar de dibujar algo falso.',
    ],
    practice: 'Compara el volumen de un BOS con el de las velas anteriores: ¿se confirma o pasa desapercibido?',
    caveat: 'Más volumen no garantiza continuación; es contexto, no una señal.',
  },
  {
    key: 'ha', group: 'context', title: 'Velas Heikin Ashi', color: '#26a69a',
    toggles: [{ k: '@ha', label: 'Usar velas Heikin Ashi' }],
    what: 'Otra forma de dibujar las velas: cada una promedia la vela real con la Heikin Ashi anterior. Suaviza el ruido y hace más visibles las rachas de velas del mismo color.',
    read: [
      'Rachas de velas verdes sin mecha inferior suelen leerse como impulso alcista; rojas sin mecha superior, bajista.',
      'Velas pequeñas con mechas a ambos lados indican indecisión o pausa.',
      'Las marcas (swings, BOS, CHoCH, zonas) se calculan con las velas reales, así que una etiqueta puede no coincidir exactamente con la mecha Heikin Ashi dibujada.',
      'En OpenCharts, Heikin Ashi se aplica en la vista de 4 temporalidades; el gráfico único siempre dibuja las velas reales.',
    ],
    rules: [
      'Cierre HA = (apertura + máximo + mínimo + cierre) / 4. Apertura HA = (apertura HA anterior + cierre HA anterior) / 2; la primera es (apertura + cierre) / 2.',
      'Máximo HA = el mayor entre el máximo real, la apertura HA y el cierre HA; mínimo HA, el menor.',
      'Es solo visual: estructura, indicadores, EMAs y la etiqueta del último precio usan las velas reales. Por defecto se usan velas normales.',
    ],
    practice: 'Marca la estructura con velas normales, cambia a Heikin Ashi y mira si las rachas de color coinciden con los tramos entre BOS.',
    caveat: 'Los precios Heikin Ashi no son precios negociados: no midas niveles, rupturas ni distancias sobre ellos.',
  },
];
