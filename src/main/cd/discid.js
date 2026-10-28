// Identificador de disco de MusicBrainz.
//
// Se calcula a partir del indice: primera pista, ultima, final del disco y el
// inicio de cada pista, todo en frames y en hexadecimal, pasado por SHA-1.
//
// Windows reporta los offsets en LBA, y MusicBrainz los espera con el pregap
// estandar de 150 frames sumado. Se verifico contra un disco conocido: sin la
// suma la consulta devuelve 404, y con ella devuelve el album correcto.

const crypto = require('node:crypto');

const PREGAP = 150;
const MAX_PISTAS = 99;

function hex(valor, digitos) {
  return valor.toString(16).toUpperCase().padStart(digitos, '0');
}

// pistas: [{ numero, inicio, largo }] con inicio y largo en frames.
function calcularDiscId(pistas) {
  if (!Array.isArray(pistas) || pistas.length === 0) return null;

  const ordenadas = pistas.slice().sort((a, b) => a.numero - b.numero);
  const primera = ordenadas[0].numero;
  const ultima = ordenadas[ordenadas.length - 1].numero;

  const offsets = new Array(MAX_PISTAS + 1).fill(0);
  for (const pista of ordenadas) {
    if (pista.numero >= 1 && pista.numero <= MAX_PISTAS) {
      offsets[pista.numero] = pista.inicio + PREGAP;
    }
  }

  const ultimaPista = ordenadas[ordenadas.length - 1];
  const leadout = ultimaPista.inicio + ultimaPista.largo + PREGAP;

  const partes = [hex(primera, 2), hex(ultima, 2), hex(leadout, 8)];
  for (let i = 1; i <= MAX_PISTAS; i++) partes.push(hex(offsets[i], 8));

  const digest = crypto.createHash('sha1').update(partes.join(''), 'ascii').digest('base64');
  // MusicBrainz usa un base64 adaptado a URLs.
  return digest.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
}

module.exports = { calcularDiscId, PREGAP };
