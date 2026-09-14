import { store } from '../state/store.js';

const MINI_WIDTH = 360;

export function initMiniPlayer({ exitVisualizerMode = () => {} } = {}) {
  const appShell = document.getElementById('app-shell');
  const titlebar = document.getElementById('titlebar');
  const panelMain = document.getElementById('panel-main');

  const miniBtn = document.getElementById('btn-mini');
  const visBtn = document.getElementById('btn-mini-vis');
  const artBtn = document.getElementById('btn-mini-art');
  const lrcBtn = document.getElementById('btn-mini-lrc');
  const onMinBtn = document.getElementById('btn-mini-onmin');

  let appliedSignature = null;

  function signature(state) {
    const o = state.miniOptions;
    return [state.miniMode, o.visualizer, o.art, o.lyrics, state.minimizeToMini].join(' ');
  }

  function paint(state) {
    appShell.classList.toggle('mini-mode', state.miniMode);
    appShell.classList.toggle('mini-no-visualizer', !state.miniOptions.visualizer);
    appShell.classList.toggle('mini-no-art', !state.miniOptions.art);
    appShell.classList.toggle('mini-lyrics', state.miniOptions.lyrics);

    visBtn.classList.toggle('active', state.miniOptions.visualizer);
    artBtn.classList.toggle('active', state.miniOptions.art);
    lrcBtn.classList.toggle('active', state.miniOptions.lyrics);
    onMinBtn.classList.toggle('active', state.minimizeToMini);

    miniBtn.classList.toggle('active', state.miniMode);
    miniBtn.title = state.miniMode ? 'Volver al tamano normal' : 'Mini reproductor';
  }

  // La ventana se ajusta a lo que el contenido mide de verdad, asi no hay que
  // mantener una tabla de altos por cada combinacion de opciones.
  //
  // La medicion es sincrona a proposito: paint() ya cambio las clases y leer
  // offsetHeight fuerza el recalculo de layout. Esperar a requestAnimationFrame
  // seria fragil, porque Electron estrangula los cuadros cuando la ventana esta
  // tapada o minimizada y el mini reproductor nunca llegaria a achicarse.
  function fitWindowToContent() {
    const height = titlebar.offsetHeight + panelMain.offsetHeight;
    return window.api.window.setMiniMode({ enabled: true, width: MINI_WIDTH, height });
  }

  function applyWindow(state) {
    return state.miniMode ? fitWindowToContent() : window.api.window.setMiniMode({ enabled: false });
  }

  function setMini(enabled) {
    // El modo visualizador y el mini reproductor son incompatibles: uno quiere
    // toda la pantalla y el otro el minimo posible.
    if (enabled) exitVisualizerMode();
    store.setState({ miniMode: enabled });
  }

  function toggleOption(key) {
    const options = { ...store.getState().miniOptions, [key]: !store.getState().miniOptions[key] };
    store.setState({ miniOptions: options });
    window.api.settings.set('miniOptions', options);
  }

  miniBtn.addEventListener('click', () => setMini(!store.getState().miniMode));
  visBtn.addEventListener('click', () => toggleOption('visualizer'));
  artBtn.addEventListener('click', () => toggleOption('art'));
  lrcBtn.addEventListener('click', () => toggleOption('lyrics'));

  onMinBtn.addEventListener('click', () => {
    const next = !store.getState().minimizeToMini;
    store.setState({ minimizeToMini: next });
    window.api.settings.set('minimizeToMini', next);
  });

  store.subscribe(() => {
    const state = store.getState();
    const current = signature(state);
    if (current === appliedSignature) return;
    appliedSignature = current;
    paint(state);
    applyWindow(state);
  });

  paint(store.getState());
  appliedSignature = signature(store.getState());

  (async () => {
    const [options, onMinimize] = await Promise.all([
      window.api.settings.get('miniOptions'),
      window.api.settings.get('minimizeToMini')
    ]);

    const patch = {};
    if (options && typeof options === 'object') {
      patch.miniOptions = {
        visualizer: options.visualizer !== false,
        art: options.art !== false,
        lyrics: options.lyrics === true
      };
    }
    if (typeof onMinimize === 'boolean') patch.minimizeToMini = onMinimize;
    if (Object.keys(patch).length > 0) store.setState(patch);
  })();

  return {
    enter: () => setMini(true),
    exit: () => setMini(false),
    isMini: () => store.getState().miniMode
  };
}
