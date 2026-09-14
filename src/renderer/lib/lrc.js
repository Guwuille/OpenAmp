// Parseo y serializacion de LRC.
//
// Soporta:
//   [mm:ss.xx] texto              formato estandar
//   [mm:ss.xx][mm:ss.xx] texto    varios tiempos para una misma linea (estribillos)
//   [00:12.00]<00:12.00>pa<00:12.40>la<00:12.90>bra   LRC extendido, por palabra
//   [ti:], [ar:], [al:], [by:], [offset:]             metadatos
//
// Las lineas sin marca de tiempo se conservan como letra plana, asi un .lrc
// sin sincronizar sigue siendo util (y es el punto de partida del editor).

const LEADING_TIME = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const META = /^\[([a-zA-Z#]+):([^\]]*)\]$/;
const WORD_TIME = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toSeconds(minutes, seconds, fraction) {
  let frac = 0;
  if (fraction) {
    // .x son decimas, .xx centesimas, .xxx milesimas
    const value = Number(fraction);
    frac = fraction.length === 1 ? value / 10 : fraction.length === 2 ? value / 100 : value / 1000;
  }
  return Number(minutes) * 60 + Number(seconds) + frac;
}

function parseWords(str) {
  WORD_TIME.lastIndex = 0;
  if (!WORD_TIME.test(str)) return { text: str.trim(), words: null };

  WORD_TIME.lastIndex = 0;
  const words = [];
  let match;
  let cursor = 0;
  let pending = null;
  let lead = '';

  while ((match = WORD_TIME.exec(str))) {
    if (pending === null) lead = str.slice(0, match.index);
    else words.push({ time: pending, text: str.slice(cursor, match.index) });
    pending = toSeconds(match[1], match[2], match[3]);
    cursor = WORD_TIME.lastIndex;
  }
  if (pending !== null) words.push({ time: pending, text: str.slice(cursor) });

  const text = (lead + words.map((w) => w.text).join('')).trim();
  return { text, words: words.length > 0 ? words : null };
}

export function parseLRC(text) {
  const meta = {};
  const lines = [];

  for (const raw of String(text || '').split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(META);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    const times = [];
    let rest = trimmed;
    let timeMatch;
    while ((timeMatch = rest.match(LEADING_TIME))) {
      times.push(toSeconds(timeMatch[1], timeMatch[2], timeMatch[3]));
      rest = rest.slice(timeMatch[0].length);
    }

    if (times.length === 0) {
      lines.push({ time: null, text: trimmed, words: null });
      continue;
    }

    const parsed = parseWords(rest);
    // Las marcas por palabra solo tienen sentido con un unico tiempo: si la
    // linea se repite en varios momentos, esos tiempos ya no corresponden.
    const single = times.length === 1;
    for (const time of times) {
      lines.push({ time, text: parsed.text, words: single ? parsed.words : null });
    }
  }

  // El desplazamiento de [offset:] se expresa en milisegundos y, por la
  // convencion mas difundida, un valor positivo adelanta la letra.
  const offset = Number(meta.offset);
  if (Number.isFinite(offset) && offset !== 0) {
    const shift = offset / 1000;
    for (const line of lines) {
      if (line.time != null) line.time = Math.max(0, line.time - shift);
      if (line.words) for (const w of line.words) w.time = Math.max(0, w.time - shift);
    }
  }

  lines.sort((a, b) => {
    if (a.time == null && b.time == null) return 0;
    if (a.time == null) return 1;
    if (b.time == null) return -1;
    return a.time - b.time;
  });

  return { meta, lines, synced: lines.some((l) => l.time != null) };
}

// Indice de la ultima linea cuyo tiempo ya paso. -1 si todavia no empezo
// ninguna. Busqueda binaria: se llama en cada cuadro de animacion.
export function findActiveIndex(lines, time) {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const at = lines[mid].time;
    if (at == null || at > time) {
      high = mid - 1;
    } else {
      result = mid;
      low = mid + 1;
    }
  }
  return result;
}

export function findActiveWord(words, time) {
  if (!words) return -1;
  let result = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].time <= time) result = i;
    else break;
  }
  return result;
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const centis = Math.round((total - Math.floor(total)) * 100);
  // El redondeo de centesimas puede llegar a 100 y desbordar el segundo.
  const carry = centis === 100;
  const finalSecs = carry ? secs + 1 : secs;
  const finalCentis = carry ? 0 : centis;
  const finalMinutes = finalSecs === 60 ? minutes + 1 : minutes;
  const shownSecs = finalSecs === 60 ? 0 : finalSecs;
  return (
    String(finalMinutes).padStart(2, '0') +
    ':' +
    String(shownSecs).padStart(2, '0') +
    '.' +
    String(finalCentis).padStart(2, '0')
  );
}

export function serializeLRC({ meta = {}, lines = [] }) {
  const out = [];
  for (const key of ['ti', 'ar', 'al', 'by', 'offset']) {
    if (meta[key]) out.push(`[${key}:${meta[key]}]`);
  }
  for (const line of lines) {
    if (line.time == null) out.push(line.text);
    else out.push(`[${formatTimestamp(line.time)}]${line.text}`);
  }
  return out.join('\n') + '\n';
}
