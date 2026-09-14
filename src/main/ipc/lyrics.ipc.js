const { ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'OpenAmp (https://github.com/Guwuille/OpenAmp)';
const FETCH_TIMEOUT_MS = 8000;

function sidecarPath(trackPath) {
  const dir = path.dirname(trackPath);
  const base = path.basename(trackPath, path.extname(trackPath));
  return path.join(dir, `${base}.lrc`);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(seconds) {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const c = Math.round((total - Math.floor(total)) * 100);
  return c === 100 ? `[${pad(m)}:${pad(s + 1)}.00]` : `[${pad(m)}:${pad(s)}.${pad(c)}]`;
}

// music-metadata devuelve las letras embebidas en varias formas segun el
// contenedor: texto suelto (Vorbis/FLAC) o lineas con marca de tiempo
// (ID3 SYLT). Se normaliza todo a texto LRC.
function lyricsFromTags(common) {
  const entries = Array.isArray(common?.lyrics) ? common.lyrics : [];
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.trim()) return entry;

    const sync = entry?.syncText;
    if (Array.isArray(sync) && sync.length > 0 && sync.some((s) => typeof s.timestamp === 'number')) {
      return sync
        .map((s) => {
          const text = (s.text || '').replace(/\r?\n/g, ' ').trim();
          // music-metadata expone timestamp en milisegundos
          return typeof s.timestamp === 'number' ? `${stamp(s.timestamp / 1000)}${text}` : text;
        })
        .join('\n');
    }

    if (typeof entry?.text === 'string' && entry.text.trim()) return entry.text;
  }
  return null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function registerLyricsIpc() {
  // Lee la letra de una pista: primero el .lrc de al lado, y si no hay, las
  // etiquetas del propio archivo de audio.
  ipcMain.handle('lyrics:load', async (event, trackPath) => {
    if (!trackPath || typeof trackPath !== 'string') return { source: null, text: null };

    const sidecar = sidecarPath(trackPath);
    try {
      const text = await fsp.readFile(sidecar, 'utf8');
      if (text.trim()) return { source: 'lrc', text, path: sidecar };
    } catch (err) {
      if (err.code !== 'ENOENT') return { source: null, text: null, error: err.message };
    }

    try {
      const { parseFile } = await import('music-metadata');
      const metadata = await parseFile(trackPath, { duration: false, skipCovers: true });
      const text = lyricsFromTags(metadata.common);
      if (text) return { source: 'tags', text };
    } catch (err) {
      // Un archivo sin etiquetas legibles no es un error que valga reportar.
    }

    return { source: null, text: null };
  });

  ipcMain.handle('lyrics:save', async (event, { trackPath, text }) => {
    if (!trackPath || typeof text !== 'string') return { ok: false, error: 'argumentos invalidos' };
    const target = sidecarPath(trackPath);
    try {
      await fsp.writeFile(target, text, 'utf8');
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lyrics:hasSidecar', async (event, trackPath) => {
    if (!trackPath) return false;
    return fs.existsSync(sidecarPath(trackPath));
  });

  // Consulta a LRCLIB. Se hace desde el proceso principal a proposito: asi el
  // renderer se queda con su CSP cerrada y no habla con la red.
  ipcMain.handle('lyrics:fetchOnline', async (event, { artist, title, album, duration, trackPath, save }) => {
    if (!title) return { ok: false, error: 'la pista no tiene titulo' };

    const exact = new URLSearchParams({ track_name: title });
    if (artist) exact.set('artist_name', artist);
    if (album) exact.set('album_name', album);
    if (Number.isFinite(duration) && duration > 0) exact.set('duration', String(Math.round(duration)));

    let hit = await fetchJson(`${LRCLIB}/get?${exact}`);

    if (!hit) {
      const query = new URLSearchParams({ track_name: title });
      if (artist) query.set('artist_name', artist);
      const results = await fetchJson(`${LRCLIB}/search?${query}`);
      if (Array.isArray(results) && results.length > 0) {
        // Con duracion conocida se elige el resultado que mas se le acerque:
        // evita traer un remix o una version en vivo de otra duracion.
        hit = Number.isFinite(duration) && duration > 0
          ? results.reduce((best, item) =>
              Math.abs((item.duration || 0) - duration) < Math.abs((best.duration || 0) - duration) ? item : best
            )
          : results[0];
      }
    }

    if (!hit) return { ok: false, notFound: true };

    const synced = typeof hit.syncedLyrics === 'string' && hit.syncedLyrics.trim() ? hit.syncedLyrics : null;
    const plain = typeof hit.plainLyrics === 'string' && hit.plainLyrics.trim() ? hit.plainLyrics : null;
    if (!synced && !plain) return { ok: false, notFound: true };

    const text = synced || plain;
    let savedTo = null;

    // Solo se guarda letra sincronizada, y nunca se pisa un .lrc existente.
    if (save && synced && trackPath) {
      const target = sidecarPath(trackPath);
      if (!fs.existsSync(target)) {
        try {
          await fsp.writeFile(target, synced, 'utf8');
          savedTo = target;
        } catch (err) {
          savedTo = null;
        }
      }
    }

    return { ok: true, text, synced: Boolean(synced), source: 'lrclib', savedTo };
  });
}

module.exports = registerLyricsIpc;
