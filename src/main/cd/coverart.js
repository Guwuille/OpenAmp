// Descarga la portada desde Cover Art Archive, el servicio hermano de
// MusicBrainz. Se pide por el identificador del lanzamiento que devolvio la
// busqueda de metadatos.
//
// Un CD no trae ninguna imagen, y la biblioteca muestra la caratula leyendola
// de la etiqueta del archivo, asi que sin esto los discos importados quedan
// sin portada.

const fsp = require('node:fs/promises');

const BASE = 'https://coverartarchive.org';
const USER_AGENT = 'OpenAmp/0.2.0 ( https://github.com/Guwuille/OpenAmp )';
const TIMEOUT_MS = 20000;
const MAX_BYTES = 12 * 1024 * 1024;

function extensionDe(tipo) {
  if (!tipo) return null;
  if (tipo.includes('jpeg') || tipo.includes('jpg')) return '.jpg';
  if (tipo.includes('png')) return '.png';
  return null;
}

// Devuelve la ruta del archivo descargado, o null si el lanzamiento no tiene
// portada. No tener portada no es un error: se importa igual, sin imagen.
async function descargarPortada(releaseId, destinoSinExtension) {
  if (!releaseId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${BASE}/release/${encodeURIComponent(releaseId)}/front`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }
    });

    if (!respuesta.ok) return null;

    const tipo = (respuesta.headers.get('content-type') || '').toLowerCase();
    const extension = extensionDe(tipo);
    // Solo imagenes conocidas: si el servicio devuelve otra cosa, mejor
    // importar sin portada que incrustar algo que ffmpeg no sepa leer.
    if (!extension) return null;

    const datos = Buffer.from(await respuesta.arrayBuffer());
    if (datos.length === 0 || datos.length > MAX_BYTES) return null;

    const ruta = `${destinoSinExtension}${extension}`;
    await fsp.writeFile(ruta, datos);
    return ruta;
  } catch (err) {
    // Sin conexion o demorado: se sigue sin portada.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { descargarPortada };
