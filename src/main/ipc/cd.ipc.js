const { ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const tracksRepo = require('../db/tracksRepo');
const { listarDiscos } = require('../cd/cdrom');
const { resolverFfmpeg } = require('../cd/ffmpegPath');
const { calcularDiscId } = require('../cd/discid');
const { buscarPorDiscId } = require('../cd/musicbrainz');

// La lectora ignoro los valores intermedios en las pruebas, pero con 24 dio
// 3.5x contra 2.7x por defecto. Pedir de mas no rompe: el firmware recorta.
const VELOCIDAD_LECTURA = 24;

function nombreSeguro(texto, porDefecto) {
  const limpio = String(texto || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100);
  return limpio || porDefecto;
}

function dosDigitos(n) {
  return String(n).padStart(2, '0');
}

async function carpetaLibre(base) {
  if (!fs.existsSync(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidata = `${base} (${i})`;
    if (!fs.existsSync(candidata)) return candidata;
  }
  return `${base} (${Date.now()})`;
}

function registerCdIpc(getMainWindow) {
  let enCurso = null;

  function enviar(canal, datos) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(canal, datos);
  }

  ipcMain.handle('cd:list', () => {
    const ffmpeg = resolverFfmpeg({ refrescar: true });
    return {
      ffmpeg: { disponible: ffmpeg.disponible, carpeta: ffmpeg.carpeta },
      discos: listarDiscos(),
      importando: Boolean(enCurso)
    };
  });

  ipcMain.handle('cd:lookup', async (event, { unidad } = {}) => {
    const disco = listarDiscos().find((d) => d.unidad === unidad);
    if (!disco) return { ok: false, error: 'No se encuentra el disco. Fijate que siga puesto.' };

    const discId = calcularDiscId(
      disco.pistas.map((p) => ({ numero: p.numero, inicio: p.inicioFrames, largo: p.largoFrames }))
    );

    return buscarPorDiscId(discId, disco.pistas);
  });

  // Extrae una pista a FLAC. Se escribe con extension .part y se renombra al
  // terminar: el vigilante de carpetas ignora .part, asi que no intenta
  // indexar un archivo a medio escribir, y el rename final si dispara el
  // escaneo.
  function extraerPista({ ffmpeg, unidad, pista, destino, titulo, artista, album, totalPistas, alProgreso }) {
    return new Promise((resolve, reject) => {
      const parcial = `${destino}.part`;

      const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-speed', String(VELOCIDAD_LECTURA),
        '-ss', pista.inicio.toFixed(3),
        '-f', 'libcdio',
        // ffmpeg quiere la unidad sin barra final.
        '-i', unidad.replace(/[\\/]+$/, ''),
        '-t', pista.duracion.toFixed(3),
        '-c:a', 'flac',
        // Hay que declarar el formato: ffmpeg lo deduce de la extension, y el
        // archivo se escribe como .flac.part para que el vigilante de
        // carpetas no lo indexe a medio escribir.
        '-f', 'flac',
        '-metadata', `title=${titulo}`,
        '-metadata', `artist=${artista}`,
        '-metadata', `album=${album}`,
        '-metadata', `track=${pista.numero}/${totalPistas}`,
        '-progress', 'pipe:1',
        '-nostats',
        '-y',
        parcial
      ];

      const hijo = execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 });
      enCurso = { hijo, parcial };

      let errores = '';
      hijo.stderr.on('data', (trozo) => { errores += trozo; });

      hijo.stdout.on('data', (trozo) => {
        // -progress emite lineas clave=valor; out_time_us marca el avance.
        for (const linea of String(trozo).split(/\r?\n/)) {
          const [clave, valor] = linea.split('=');
          if (clave === 'out_time_us' && valor) {
            const segundos = Number(valor) / 1e6;
            if (Number.isFinite(segundos) && pista.duracion > 0) {
              alProgreso(Math.max(0, Math.min(1, segundos / pista.duracion)));
            }
          }
        }
      });

      hijo.on('error', (err) => reject(err));

      hijo.on('close', async (codigo, senal) => {
        enCurso = null;
        if (senal || codigo !== 0) {
          try {
            await fsp.unlink(parcial);
          } catch (err) {
            // Si no se puede borrar el parcial, no hay mas que hacer.
          }
          if (senal) return reject(Object.assign(new Error('cancelado'), { cancelado: true }));
          return reject(new Error(errores.trim() || `ffmpeg termino con codigo ${codigo}`));
        }

        try {
          await fsp.rename(parcial, destino);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  ipcMain.handle('cd:import', async (event, { unidad, folderId, artista, album, pistas, titulos } = {}) => {
    if (enCurso) return { ok: false, error: 'Ya hay una importacion en curso.' };

    const ffmpeg = resolverFfmpeg();
    if (!ffmpeg.disponible) {
      return { ok: false, error: 'No se encontro ffmpeg, que es lo que lee el CD.', faltaFfmpeg: true };
    }

    const disco = listarDiscos().find((d) => d.unidad === unidad);
    if (!disco) return { ok: false, error: 'No se encuentra el disco. Fijate que siga puesto.' };

    const carpeta = tracksRepo.getAllFolders().find((f) => f.id === folderId);
    if (!carpeta) return { ok: false, error: 'Elegi una carpeta de la biblioteca.' };
    if (!fs.existsSync(carpeta.path)) return { ok: false, error: 'La carpeta de destino ya no existe.' };

    const artistaLimpio = nombreSeguro(artista, 'Artista desconocido');
    const albumLimpio = nombreSeguro(album, 'CD de audio');

    // Titulos reales si hubo busqueda de metadatos; si no, nombres genericos.
    const porNumero = new Map();
    if (Array.isArray(titulos)) {
      for (const entrada of titulos) {
        if (entrada && entrada.numero) porNumero.set(entrada.numero, entrada);
      }
    }

    const seleccion = Array.isArray(pistas) && pistas.length > 0
      ? disco.pistas.filter((p) => pistas.includes(p.numero))
      : disco.pistas;

    if (seleccion.length === 0) return { ok: false, error: 'No hay pistas seleccionadas.' };

    const destinoCarpeta = await carpetaLibre(
      path.join(carpeta.path, `${artistaLimpio} - ${albumLimpio}`)
    );

    (async () => {
      let importadas = 0;
      try {
        await fsp.mkdir(destinoCarpeta, { recursive: true });

        for (let i = 0; i < seleccion.length; i++) {
          const pista = seleccion[i];
          const datos = porNumero.get(pista.numero);
          const titulo = (datos && datos.titulo) || `Pista ${dosDigitos(pista.numero)}`;
          // Una recopilacion puede tener artista propio por pista.
          const artistaPista = (datos && datos.artista) || artistaLimpio;

          const archivo = path.join(
            destinoCarpeta,
            `${dosDigitos(pista.numero)} - ${nombreSeguro(titulo, 'Pista ' + dosDigitos(pista.numero))}.flac`
          );

          enviar('cd:progress', {
            pista: pista.numero,
            indice: i,
            total: seleccion.length,
            avancePista: 0,
            avanceTotal: i / seleccion.length
          });

          await extraerPista({
            ffmpeg: ffmpeg.ffmpeg,
            unidad: disco.unidad,
            pista,
            destino: archivo,
            titulo,
            artista: artistaPista,
            album: albumLimpio,
            totalPistas: disco.pistas.length,
            alProgreso: (fraccion) => {
              enviar('cd:progress', {
                pista: pista.numero,
                indice: i,
                total: seleccion.length,
                avancePista: fraccion,
                avanceTotal: (i + fraccion) / seleccion.length
              });
            }
          });

          importadas += 1;
        }

        enviar('cd:done', { carpeta: destinoCarpeta, importadas, total: seleccion.length });
      } catch (err) {
        if (err && err.cancelado) {
          enviar('cd:cancelled', { importadas, carpeta: destinoCarpeta });
        } else {
          enviar('cd:error', { error: err.message, importadas });
        }
      } finally {
        enCurso = null;
      }
    })();

    return { ok: true, carpeta: destinoCarpeta, total: seleccion.length };
  });

  ipcMain.handle('cd:cancel', () => {
    if (!enCurso) return false;
    enCurso.hijo.kill();
    return true;
  });

  return {
    stop() {
      if (enCurso) enCurso.hijo.kill();
      enCurso = null;
    }
  };
}

module.exports = registerCdIpc;
