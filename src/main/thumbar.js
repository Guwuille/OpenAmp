// Botones sobre la miniatura de la barra de tareas de Windows: aparecen al
// pasar el cursor por el icono de la app y permiten controlar la reproduccion
// sin traer la ventana al frente.

const { createThumbarIcons } = require('./thumbarIcons');

const SUPPORTED = process.platform === 'win32';

function createThumbar(getMainWindow) {
  let icons = null;
  let isPlaying = false;
  let applied = false;

  function send(command) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('player:command', command);
  }

  function apply() {
    if (!SUPPORTED) return;
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    // Los iconos se dibujan una sola vez y se reutilizan en cada refresco.
    if (!icons) icons = createThumbarIcons();

    win.setThumbarButtons([
      { tooltip: 'Anterior', icon: icons.previous, click: () => send('prev') },
      {
        tooltip: isPlaying ? 'Pausar' : 'Reproducir',
        icon: isPlaying ? icons.pause : icons.play,
        click: () => send(isPlaying ? 'pause' : 'play')
      },
      { tooltip: 'Siguiente', icon: icons.next, click: () => send('next') }
    ]);
    applied = true;
  }

  return {
    init() {
      apply();
    },

    setPlaying(value) {
      const next = Boolean(value);
      // El renderer avisa seguido; solo se rehacen los botones si el icono
      // de reproducir/pausar cambia de verdad.
      if (next === isPlaying && applied) return;
      isPlaying = next;
      apply();
    },

    setTrack(title) {
      if (!SUPPORTED) return;
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.setThumbnailToolTip(title ? `OpenAmp — ${title}` : 'OpenAmp');
    }
  };
}

module.exports = { createThumbar };
