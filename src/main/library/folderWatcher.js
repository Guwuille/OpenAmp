const fs = require('node:fs');
const path = require('node:path');

// Tiene que coincidir con lo que acepta el escaner, o se vigilarian cambios
// que el escaneo despues ignora (o al reves).
const AUDIO_EXTENSIONS = new Set([
  '.flac', '.mp3', '.wav', '.ogg', '.m4a', '.opus',
  '.mp4', '.m4v', '.webm', '.ogv'
]);

// Copiar musica dispara muchos eventos seguidos (y archivos a medio escribir),
// asi que se espera a que se calme antes de reescanear.
const DEBOUNCE_MS = 2500;

function createFolderWatcher(onFoldersChanged) {
  let watchers = [];
  let pending = new Set();
  let timer = null;

  function flush() {
    timer = null;
    const ids = [...pending];
    pending.clear();
    if (ids.length > 0) onFoldersChanged(ids);
  }

  function schedule(folderId) {
    pending.add(folderId);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  function stop() {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch (err) {
        // Un vigilante ya cerrado no es problema.
      }
    }
    watchers = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.clear();
  }

  function watch(folders) {
    stop();

    for (const folder of folders) {
      try {
        // persistent: false para que vigilar carpetas no mantenga vivo el
        // proceso por su cuenta al cerrar la app.
        const watcher = fs.watch(
          folder.path,
          { recursive: true, persistent: false },
          (eventType, filename) => {
            if (filename) {
              const ext = path.extname(filename).toLowerCase();
              // Un .lrc nuevo o un archivo temporal de descarga no cambian el
              // catalogo. Sin extension puede ser una carpeta: conviene mirar.
              if (ext && !AUDIO_EXTENSIONS.has(ext)) return;
            }
            schedule(folder.id);
          }
        );
        watcher.on('error', () => {
          // Unidad desconectada o permisos: se deja de vigilar esa carpeta y
          // las demas siguen.
        });
        watchers.push(watcher);
      } catch (err) {
        // Una carpeta borrada o en un disco ausente no debe impedir vigilar
        // el resto de la biblioteca.
      }
    }

    return watchers.length;
  }

  return { watch, stop };
}

module.exports = { createFolderWatcher };
