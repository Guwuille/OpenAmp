// Deteccion de CD de audio y lectura de su indice.
//
// Windows muestra las pistas como archivos .cda de 44 bytes. No contienen
// audio: son cabeceras RIFF/CDDA con el numero de pista y sus posiciones. Eso
// alcanza para armar el indice completo al instante, sin invocar a ffmpeg ni
// hacer girar el lector.

const fsp = require('node:fs/promises');
const path = require('node:path');

// Un CD de audio son 75 sectores por segundo.
const FRAMES_POR_SEGUNDO = 75;

// Posiciones dentro del bloque fmt del .cda, verificadas contra el indice que
// reporta ffprobe para el mismo disco.
const OFFSET_PISTA = 22;
const OFFSET_ID_DISCO = 24;
const OFFSET_INICIO = 28;
const OFFSET_LARGO = 32;

const TAMANO_CDA = 44;

async function leerStub(rutaArchivo) {
  const datos = await fsp.readFile(rutaArchivo);
  if (datos.length < TAMANO_CDA) return null;
  if (datos.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (datos.toString('ascii', 8, 12) !== 'CDDA') return null;

  const inicioFrames = datos.readUInt32LE(OFFSET_INICIO);
  const largoFrames = datos.readUInt32LE(OFFSET_LARGO);
  return {
    numero: datos.readUInt16LE(OFFSET_PISTA),
    idDisco: datos.readUInt32LE(OFFSET_ID_DISCO),
    // En segundos para la interfaz y para ffmpeg.
    inicio: inicioFrames / FRAMES_POR_SEGUNDO,
    duracion: largoFrames / FRAMES_POR_SEGUNDO,
    // En frames para calcular el identificador de MusicBrainz, que no tolera
    // redondeos: un frame de diferencia da otro hash y la consulta falla.
    inicioFrames,
    largoFrames
  };
}

async function leerDisco(unidad) {
  let entradas;
  try {
    entradas = await fsp.readdir(unidad);
  } catch (err) {
    // Unidad vacia, abierta o todavia reconociendo el disco.
    return null;
  }

  const stubs = entradas.filter((nombre) => nombre.toLowerCase().endsWith('.cda'));
  if (stubs.length === 0) return null;

  const pistas = [];
  for (const nombre of stubs.sort()) {
    try {
      const pista = await leerStub(path.join(unidad, nombre));
      if (pista) pistas.push(pista);
    } catch (err) {
      // Un stub ilegible no deberia invalidar el disco entero.
    }
  }

  if (pistas.length === 0) return null;
  pistas.sort((a, b) => a.numero - b.numero);

  return {
    unidad,
    idDisco: pistas[0].idDisco,
    pistas,
    duracionTotal: pistas.reduce((suma, p) => suma + p.duracion, 0)
  };
}

// No hay API de Node para enumerar unidades, asi que se prueban las letras.
//
// Se hace de forma asincrona y en paralelo a proposito. Leyendo de forma
// sincrona, una unidad lenta o recien despertada bloquea el proceso principal
// entero, y con el toda la interfaz: se vio colgar varios minutos con el
// lector recuperandose de una lectura interrumpida.
async function listarDiscos() {
  if (process.platform !== 'win32') return [];

  const letras = [];
  for (let codigo = 'D'.charCodeAt(0); codigo <= 'Z'.charCodeAt(0); codigo++) {
    letras.push(`${String.fromCharCode(codigo)}:\\`);
  }

  const resultados = await Promise.all(letras.map((unidad) => leerDisco(unidad)));
  return resultados.filter(Boolean);
}

module.exports = { listarDiscos, leerDisco, FRAMES_POR_SEGUNDO };
