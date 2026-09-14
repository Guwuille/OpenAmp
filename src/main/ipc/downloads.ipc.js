const { ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const tracksRepo = require('../db/tracksRepo');

const MEDIA_EXTENSIONS = new Set([
  '.flac', '.mp3', '.wav', '.ogg', '.m4a', '.opus',
  '.mp4', '.m4v', '.webm', '.ogv'
]);

// Para cuando la URL no trae extension pero el servidor si declara el tipo.
const TYPE_TO_EXTENSION = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogv'
};

const PROGRESS_INTERVAL_MS = 200;

// Nombre de archivo seguro: sin separadores ni caracteres que Windows rechaza,
// y sin puntos al principio, para que no pueda escaparse de la carpeta ni
// quedar oculto.
function safeFileName(raw) {
  const base = path.basename(String(raw || ''));
  const cleaned = base
    .replace(/[<>:"/\\|?*]/g, '_')
    // caracteres de control: Windows los rechaza en nombres de archivo
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 150);
  return cleaned || 'descarga';
}

function nameFromContentDisposition(header) {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch (err) {
      // Cabecera mal formada: se sigue con el nombre de la URL.
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

// Si el nombre ya existe se numera, en vez de pisar musica que ya estaba.
async function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  for (let i = 0; i < 500; i++) {
    const candidate = path.join(dir, i === 0 ? fileName : `${stem} (${i + 1})${ext}`);
    try {
      await fsp.access(candidate);
    } catch (err) {
      return candidate;
    }
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function registerDownloadsIpc(getMainWindow) {
  const running = new Map();
  let nextId = 1;

  function send(channel, payload) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('downloads:start', async (event, { url, folderId } = {}) => {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch (err) {
      return { ok: false, error: 'La direccion no es valida.' };
    }

    // Solo descargas de red: file:// o data: aca solo servirian para copiar
    // cosas del disco a ciegas.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Solo se pueden descargar enlaces http o https.' };
    }

    const folder = tracksRepo.getAllFolders().find((f) => f.id === folderId);
    if (!folder) return { ok: false, error: 'Elegi una carpeta de la biblioteca.' };
    if (!fs.existsSync(folder.path)) return { ok: false, error: 'La carpeta ya no existe.' };

    const id = nextId++;
    const controller = new AbortController();
    running.set(id, controller);

    (async () => {
      let partPath = null;
      try {
        const response = await fetch(parsed, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'OpenAmp', Accept: '*/*' }
        });

        if (!response.ok) throw new Error(`El servidor respondio ${response.status}.`);
        if (!response.body) throw new Error('La respuesta vino vacia.');

        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

        let fileName = safeFileName(
          nameFromContentDisposition(response.headers.get('content-disposition')) ||
          decodeURIComponent(path.basename(parsed.pathname))
        );

        let ext = path.extname(fileName).toLowerCase();
        if (!MEDIA_EXTENSIONS.has(ext)) {
          const fromType = TYPE_TO_EXTENSION[contentType];
          if (fromType) {
            fileName = path.basename(fileName, ext) + fromType;
            ext = fromType;
          }
        }

        // Se exige que sea audio o video: sin esto, un enlace a una pagina
        // guardaria el HTML como si fuera una cancion.
        const looksLikeMedia =
          MEDIA_EXTENSIONS.has(ext) || contentType.startsWith('audio/') || contentType.startsWith('video/');
        if (!looksLikeMedia) {
          throw new Error('El enlace no apunta a un archivo de audio o video.');
        }
        if (!MEDIA_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
          throw new Error(`No se reconoce el formato (${contentType || 'sin tipo'}).`);
        }

        const target = await uniquePath(folder.path, fileName);
        // Se baja con extension .part y se renombra al final: el vigilante de
        // carpetas ignora .part, asi que no intenta indexar el archivo a medio
        // escribir, y el rename final si dispara el escaneo.
        partPath = `${target}.part`;

        const total = Number(response.headers.get('content-length')) || 0;
        let received = 0;
        let lastReport = 0;

        send('downloads:progress', { id, received: 0, total, name: path.basename(target) });

        const source = Readable.fromWeb(response.body);
        source.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastReport >= PROGRESS_INTERVAL_MS) {
            lastReport = now;
            send('downloads:progress', { id, received, total, name: path.basename(target) });
          }
        });

        await pipeline(source, fs.createWriteStream(partPath));
        await fsp.rename(partPath, target);
        partPath = null;

        send('downloads:done', { id, path: target, name: path.basename(target), bytes: received });
      } catch (err) {
        if (partPath) {
          try {
            await fsp.unlink(partPath);
          } catch (cleanupError) {
            // Si no se puede borrar el parcial no hay mucho mas que hacer.
          }
        }
        const cancelled = err.name === 'AbortError';
        send(cancelled ? 'downloads:cancelled' : 'downloads:error', {
          id,
          error: cancelled ? 'Descarga cancelada.' : err.message
        });
      } finally {
        running.delete(id);
      }
    })();

    return { ok: true, id };
  });

  ipcMain.handle('downloads:cancel', (event, id) => {
    const controller = running.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  });

  return {
    stop() {
      for (const controller of running.values()) controller.abort();
      running.clear();
    }
  };
}

module.exports = registerDownloadsIpc;
