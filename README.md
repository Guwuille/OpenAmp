# OpenAmp

Reproductor de música de escritorio al estilo Winamp clásico, con soporte FLAC.
Hecho con Electron.

La interfaz sigue la estética de [guwusoft.com](https://guwusoft.com): chrome
naranja tipo Windows XP Luna sobre negro para la ventana y la biblioteca, y
pantalla LCD verde neón para el reproductor.

## Descargas

Los instaladores para Windows x64 están en la sección
[Releases](../../releases):

- **`OpenAmp Setup 0.1.0.exe`** — instalador, permite elegir la carpeta de destino.
- **`OpenAmp 0.1.0.exe`** — portable, se ejecuta sin instalar.

Los ejecutables no están firmados, así que la primera vez Windows SmartScreen
muestra el aviso de "editor desconocido". Hay que entrar en *Más información >
Ejecutar de todas formas*.

## Qué hace

- **Formatos**: FLAC, MP3, WAV y OGG.
- **Biblioteca**: escaneo recursivo de carpetas en un *worker thread* (no
  congela la interfaz), metadatos con `music-metadata` y catálogo en SQLite.
  Las carátulas embebidas se extraen y se cachean por hash.
- **Organización**: agrupá por álbum, artista, carpeta, género o año — o sin
  agrupar — y ordená por número de pista, título, artista, álbum, año,
  duración o fecha de agregado, en cualquier dirección. La preferencia se
  recuerda entre sesiones, y reproducir desde la biblioteca encola las pistas
  en el orden que estás viendo.
- **Ecualizador**: 10 bandas (60 Hz a 16 kHz) con preamplificador y 8 presets
  — Flat, Rock, Pop, Jazz, Classical, Bass Boost, Treble Boost y Vocal.
- **Playlists**: varias listas, reordenamiento por *drag and drop*, e
  importación y exportación en M3U.
- **Visualizador**: barras de espectro y osciloscopio, conmutables. Tiene un
  modo que le da toda la ventana, ocultando biblioteca, ecualizador y playlist
  pero dejando a mano la info de la pista y el transporte, y desde ahí se pasa
  a pantalla completa del monitor. `Escape` sale de pantalla completa primero
  y del modo después.
- **Ventana**: sin marco, redimensionable, con *always on top*, icono en la
  bandeja del sistema y modo persiana — doble clic en la barra de título
  colapsa la ventana dejando solo esa barra.

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
npm start
```

Para generar los `.exe` (instalador NSIS y portable, ambos x64):

```bash
npm run dist
```

Los artefactos quedan en `dist/`.

### Compilar sin Node instalado

Electron trae Node adentro, así que se puede invocar `electron-builder` con él.
Hacen falta dos variables de entorno: `ELECTRON_RUN_AS_NODE` para que el
binario actúe como Node, y `ELECTRON_NO_ASAR` porque si no Electron intercepta
las rutas `.asar` y falla al escribir el paquete con *Invalid package*.

## Estructura

```
src/
  main/       proceso principal: ventana, bandeja, SQLite, IPC y escáner
  preload/    puente contextIsolation entre main y renderer
  renderer/   interfaz: audio (Web Audio API), estado, componentes y estilos
build/        recursos de empaquetado (icono)
```

El renderer corre con `contextIsolation`, `sandbox` y sin `nodeIntegration`.
Todo el acceso al sistema pasa por IPC, y hay una CSP estricta aplicada tanto
en el HTML como en las cabeceras de respuesta.

## Stack

Electron 34 · better-sqlite3 · music-metadata · electron-store · electron-builder

## Licencia

MIT
