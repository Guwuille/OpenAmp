# OpenAmp

Reproductor de música de escritorio al estilo Winamp clásico, con soporte FLAC.
Hecho con Electron.

La interfaz sigue la estética de [guwusoft.com](https://guwusoft.com): chrome
naranja tipo Windows XP Luna sobre negro para la ventana y la biblioteca, y
pantalla LCD verde neón para el reproductor.

## Descargas

Los instaladores para Windows x64 están en la sección
[Releases](../../releases):

- **`OpenAmp Setup <version>.exe`** — instalador, permite elegir la carpeta de destino.
- **`OpenAmp <version>.exe`** — portable, se ejecuta sin instalar.

Los ejecutables no están firmados, así que la primera vez Windows SmartScreen
muestra el aviso de "editor desconocido". Hay que entrar en *Más información >
Ejecutar de todas formas*.

## Qué hace

- **Formatos**: FLAC, MP3, WAV, OGG, M4A y Opus. También video: MP4, M4V,
  WebM y OGV. Ver [Video](#video) para el detalle de códecs.
- **Video**: si la pista trae imagen, se reproduce de fondo en el visualizador.
  Las barras se dibujan encima y la letra por delante de todo; cada capa se
  prende y apaga por separado.
- **Biblioteca**: escaneo recursivo de carpetas en un *worker thread* (no
  congela la interfaz), metadatos con `music-metadata` y catálogo en SQLite.
  Las carátulas embebidas se extraen y se cachean por hash. Las carpetas
  quedan vigiladas: si agregás, cambiás o borrás música, la lista se
  actualiza sola, y al arrancar se revisa lo que pasó mientras la app estaba
  cerrada. El reescaneo es incremental — saltea por fecha de modificación lo
  que no cambió, así que no relee los metadatos de toda la biblioteca.
- **Organización**: agrupá por álbum, artista, carpeta, género o año — o sin
  agrupar — y ordená por número de pista, título, artista, álbum, año,
  duración o fecha de agregado, en cualquier dirección. La preferencia se
  recuerda entre sesiones, y reproducir desde la biblioteca encola las pistas
  en el orden que estás viendo.
- **Ecualizador**: 10 bandas (60 Hz a 16 kHz) con preamplificador y 8 presets
  — Flat, Rock, Pop, Jazz, Classical, Bass Boost, Treble Boost y Vocal.
- **Letras sincronizadas**: formato LRC, incluida la variante extendida que
  marca los tiempos palabra por palabra. La línea actual se resalta al ritmo de
  la canción y podés hacer clic en cualquier línea para saltar a ese momento.
  Se ven en su propio panel y también superpuestas sobre el visualizador en
  modo maximizado. Ver [Letras](#letras) para el detalle.
- **Playlists**: varias listas, reordenamiento por *drag and drop*, e
  importación y exportación en M3U.
- **Visualizador**: barras de espectro y osciloscopio, conmutables. Tiene un
  modo que le da toda la ventana y desde ahí se pasa a pantalla completa del
  monitor. Al entrar, los paneles se colapsan para dejarle todo el espacio,
  pero los botones EQ, LRC y PL siguen funcionando: podés abrir el ecualizador
  o la playlist sin salir del modo, y al salir vuelve lo que tenías abierto.
  `Escape` sale de pantalla completa primero y del modo después.
- **Ventana**: sin marco, redimensionable, con *always on top*, botones de
  minimizar, maximizar y cerrar propios, icono en la bandeja del sistema y
  modo persiana — doble clic en la barra de título colapsa la ventana dejando
  solo esa barra. El tamaño y el estado maximizado se recuerdan al cerrar.
- **Control desde la barra de tareas**: al pasar el cursor por el icono de la
  app en la barra de tareas de Windows, la miniatura trae botones de anterior,
  reproducir/pausar y siguiente, y el globo muestra qué está sonando. No hace
  falta traer la ventana al frente.
- **Mini reproductor**: la misma ventana encogida a ~360 px de ancho y siempre
  visible por encima del resto, con la marquesina, la barra de progreso y el
  transporte. Elegís si mostrar el visualizador, la carátula y la línea de
  letra, y la ventana se ajusta de alto a lo que quede. Se entra con su botón
  en la barra de título, y hay una opción para que el botón de minimizar abra
  el mini reproductor en vez de mandar la app a la barra de tareas.

## Video

OpenAmp reproduce lo que Chromium sabe demuxear, porque el motor de video es
el de Electron:

- **Funcionan**: MP4 y M4V (H.264 + AAC), WebM (VP8/VP9 + Vorbis/Opus) y OGV.
- **No funcionan**: MKV y AVI. Aunque adentro lleven un H.264 perfectamente
  reproducible, Chromium no abre esos contenedores. Hay que remuxearlos a MP4,
  que es una operación sin recodificar y por lo tanto sin pérdida.

Si la pista trae imagen, el video aparece de fondo en el visualizador. El
visualizador dibuja sobre transparente, así que las barras del espectro se ven
sobre el video, y la letra sincronizada va por delante de las dos.

En modo visualizador aparecen tres interruptores arriba a la derecha:

- **V** — el video de fondo. Queda deshabilitado si la pista no trae imagen.
- **B** — las barras del espectro. Apagalas y el video queda limpio.
- **L** — la letra sincronizada superpuesta.

Las tres preferencias se recuerdan entre sesiones. Es el mismo elemento el que
reproduce y el que muestra la imagen, así que no hay decodificación duplicada
ni riesgo de que el sonido se desincronice de la imagen.

## Letras

OpenAmp busca la letra de cada pista en este orden:

1. Un archivo `.lrc` con el mismo nombre que la canción, en la misma carpeta.
2. Las letras embebidas en las etiquetas del archivo de audio.
3. [LRCLIB](https://lrclib.net), si la búsqueda automática está activada.

Cuando la encuentra online y viene sincronizada, la guarda como `.lrc` junto a
la canción para no volver a pedirla. Nunca pisa un `.lrc` que ya exista.

El botón **AUTO** del panel controla el paso 3. Tenelo en cuenta: con la
búsqueda automática encendida, cada vez que suena una pista sin letra se envían
su artista, título, álbum y duración a un servidor externo. Apagalo y OpenAmp
no toca la red; podés seguir usando el botón **Buscar** cuando vos quieras.

Si la letra no existe en ningún lado, **Editar** te deja pegarla y
**Sincronizar** marca los tiempos: suena la canción y vas apretando `Espacio`
al empezar cada línea (`Retroceso` deshace la última marca). El resultado se
guarda como `.lrc` estándar, compatible con cualquier otro reproductor.

Si la letra va adelantada o atrasada respecto del audio, los botones `−` y `+`
la corren de a 100 ms.

La consulta a LRCLIB se hace desde el proceso principal, no desde la interfaz.
Así el renderer conserva su CSP cerrada (`default-src 'self'`) y no necesita
permiso para hablar con la red.

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
