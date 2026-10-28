// Ubica ffmpeg. Se busca primero junto a la app y despues en el sistema, de
// modo que empaquetarlo mas adelante sea dejar los binarios en su lugar: no
// hay que tocar nada mas.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const BINARIOS = ['ffmpeg', 'ffprobe'];

function existe(ruta) {
  try {
    return fs.statSync(ruta).isFile();
  } catch (err) {
    return false;
  }
}

// Carpetas candidatas, en orden de preferencia.
function carpetasCandidatas() {
  const candidatas = [];

  // 1. Empaquetado con la app (extraResources deja la carpeta junto al asar).
  if (process.resourcesPath) {
    candidatas.push(path.join(process.resourcesPath, 'ffmpeg'));
    candidatas.push(path.join(process.resourcesPath, 'ffmpeg', 'bin'));
  }

  // 2. En desarrollo, una copia dentro del proyecto.
  const raizProyecto = path.join(__dirname, '..', '..', '..');
  candidatas.push(path.join(raizProyecto, 'vendor', 'ffmpeg'));
  candidatas.push(path.join(raizProyecto, 'vendor', 'ffmpeg', 'bin'));

  // 3. Descargado por la propia app a su carpeta de datos.
  try {
    candidatas.push(path.join(app.getPath('userData'), 'ffmpeg'));
  } catch (err) {
    // getPath falla si se llama antes de que la app este lista.
  }

  // 4. Lo que haya en el PATH.
  for (const entrada of (process.env.PATH || '').split(path.delimiter)) {
    if (entrada.trim()) candidatas.push(entrada.trim());
  }

  // 5. Instalaciones de WinGet, que no agregan nada al PATH del proceso.
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const paquetes = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const entrada of fs.readdirSync(paquetes)) {
        if (!/ffmpeg/i.test(entrada)) continue;
        const base = path.join(paquetes, entrada);
        candidatas.push(base);
        // Los builds de Gyan desempaquetan en ffmpeg-<version>/bin.
        for (const sub of fs.readdirSync(base)) {
          candidatas.push(path.join(base, sub, 'bin'));
        }
      }
    } catch (err) {
      // Sin carpeta de WinGet no hay nada que mirar.
    }
  }

  return candidatas;
}

let cache = null;

function resolverFfmpeg({ refrescar = false } = {}) {
  if (cache && !refrescar) return cache;

  const sufijo = process.platform === 'win32' ? '.exe' : '';

  for (const carpeta of carpetasCandidatas()) {
    const rutas = {};
    const completos = BINARIOS.every((nombre) => {
      const ruta = path.join(carpeta, `${nombre}${sufijo}`);
      if (!existe(ruta)) return false;
      rutas[nombre] = ruta;
      return true;
    });

    if (completos) {
      cache = { disponible: true, carpeta, ...rutas };
      return cache;
    }
  }

  cache = { disponible: false, carpeta: null, ffmpeg: null, ffprobe: null };
  return cache;
}

module.exports = { resolverFfmpeg };
