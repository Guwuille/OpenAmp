// Consulta de metadatos a MusicBrainz a partir del identificador del disco.
//
// Se hace desde el proceso principal, igual que la busqueda de letras: asi el
// renderer conserva su CSP cerrada y no necesita permiso para hablar con la
// red. Lo unico que se envia es el identificador, que es un hash del indice
// del disco; no sale ningun dato del equipo.

const BASE = 'https://musicbrainz.org/ws/2';

// MusicBrainz exige un User-Agent que identifique a la aplicacion.
const USER_AGENT = 'OpenAmp/0.2.0 ( https://github.com/Guwuille/OpenAmp )';
const TIMEOUT_MS = 12000;

function nombreArtista(credito) {
  if (!Array.isArray(credito)) return '';
  return credito.map((parte) => `${parte.name || ''}${parte.joinphrase || ''}`).join('').trim();
}

// Vuelven varias ediciones del mismo album (distintos paises o fechas) con el
// mismo indice. Se elige la que mejor coincide con las duraciones reales del
// disco, que es mas fiable que quedarse con la primera.
function elegirEdicion(releases, pistasDelDisco) {
  let mejor = null;
  let mejorDesvio = Infinity;

  for (const release of releases) {
    for (const medio of release.media || []) {
      const pistas = medio.tracks || [];
      if (pistas.length !== pistasDelDisco.length) continue;

      let desvio = 0;
      for (let i = 0; i < pistas.length; i++) {
        const segundosMb = (pistas[i].length || 0) / 1000;
        const segundosDisco = pistasDelDisco[i].duracion || 0;
        desvio += Math.abs(segundosMb - segundosDisco);
      }

      if (desvio < mejorDesvio) {
        mejorDesvio = desvio;
        mejor = { release, medio };
      }
    }
  }

  return mejor;
}

async function buscarPorDiscId(discId, pistasDelDisco) {
  if (!discId) return { ok: false, error: 'No se pudo calcular el identificador del disco.' };

  const url = `${BASE}/discid/${encodeURIComponent(discId)}?inc=artists+recordings&fmt=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let datos;
  try {
    const respuesta = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });

    if (respuesta.status === 404) {
      return { ok: false, noEncontrado: true, error: 'El disco no figura en MusicBrainz.' };
    }
    if (!respuesta.ok) {
      return { ok: false, error: `MusicBrainz respondio ${respuesta.status}.` };
    }

    datos = await respuesta.json();
  } catch (err) {
    const abortado = err.name === 'AbortError';
    return { ok: false, error: abortado ? 'La consulta tardo demasiado.' : 'No se pudo consultar MusicBrainz.' };
  } finally {
    clearTimeout(timer);
  }

  const releases = Array.isArray(datos.releases) ? datos.releases : [];
  if (releases.length === 0) {
    return { ok: false, noEncontrado: true, error: 'El disco no figura en MusicBrainz.' };
  }

  const elegida = elegirEdicion(releases, pistasDelDisco);
  if (!elegida) {
    return { ok: false, error: 'Las ediciones encontradas no coinciden con el disco.' };
  }

  const { release, medio } = elegida;
  const artistaAlbum = nombreArtista(release['artist-credit']);

  const pistas = (medio.tracks || []).map((pista, indice) => ({
    numero: pista.position || indice + 1,
    titulo: (pista.title || '').trim(),
    // Una recopilacion puede tener un artista por pista distinto al del album.
    artista: nombreArtista(pista['artist-credit']) || artistaAlbum,
    duracion: (pista.length || 0) / 1000
  }));

  return {
    ok: true,
    // Lo necesita Cover Art Archive para traer la portada.
    releaseId: release.id || null,
    artista: artistaAlbum,
    album: (release.title || '').trim(),
    fecha: release.date || '',
    pais: release.country || '',
    ediciones: releases.length,
    pistas
  };
}

module.exports = { buscarPorDiscId };
