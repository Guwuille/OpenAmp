import { store } from '../state/store.js';
import { formatTime } from '../lib/formatTime.js';
import { createMarquee } from './bitmapText.js';
import { toFileUrl } from '../lib/fileUrl.js';

export function initMainPanel({ playback, visualizer }) {
  const playBtn = document.getElementById('btn-play');
  const pauseBtn = document.getElementById('btn-pause');
  const stopBtn = document.getElementById('btn-stop');
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const shuffleBtn = document.getElementById('btn-shuffle');
  const repeatBtn = document.getElementById('btn-repeat');
  const eqToggleBtn = document.getElementById('btn-toggle-eq');
  const plToggleBtn = document.getElementById('btn-toggle-pl');
  const lyricsToggleBtn = document.getElementById('btn-toggle-lyrics');
  const seekBar = document.getElementById('seek-bar');
  const timeDisplay = document.getElementById('time-display');
  const trackFormat = document.getElementById('track-format');
  const volumeSlider = document.getElementById('volume-slider');
  const balanceSlider = document.getElementById('balance-slider');
  const eqPanel = document.getElementById('panel-equalizer');
  const plPanel = document.getElementById('panel-playlist');
  const lyricsPanel = document.getElementById('panel-lyrics');
  const displayRow = document.getElementById('display-row');
  const appShell = document.getElementById('app-shell');
  const visualizerWrap = document.getElementById('visualizer-wrap');
  const maxBtn = document.getElementById('btn-visualizer-max');
  const modeBtn = document.getElementById('btn-visualizer-mode');
  const fullscreenBtn = document.getElementById('btn-visualizer-fullscreen');
  const albumArt = document.getElementById('album-art');
  const albumArtImg = document.getElementById('album-art-img');
  const albumArtMaxBtn = document.getElementById('btn-albumart-max');

  const marquee = createMarquee(document.getElementById('track-marquee'));
  marquee.start();

  let seeking = false;
  let visualizerMode = false;
  let fullscreen = false;
  let albumArtMaximized = false;
  let panelsBeforeVisualizer = null;

  // El canvas siempre sigue el tamano real de su contenedor, asi se adapta
  // solo al entrar en modo visualizador, al pasar a pantalla completa y al
  // redimensionar la ventana.
  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) visualizer.resize(width, height);
  });
  resizeObserver.observe(visualizerWrap);

  // El modo vive en el store, no solo en una clase del DOM: otros paneles
  // (las letras, que se superponen al visualizador) necesitan reaccionar.
  function setVisualizerMode(on) {
    visualizerMode = on;
    appShell.classList.toggle('visualizer-mode', on);
    maxBtn.textContent = on ? '▢' : '▣';
    maxBtn.title = on ? 'Salir del modo visualizador' : 'Modo visualizador';

    if (on) {
      // Al entrar se colapsan los paneles para que el visualizador se quede
      // con toda la ventana, pero EQ, LRC y PL siguen funcionando: se pueden
      // abrir sin salir del modo, y al salir vuelve lo que habia antes.
      if (panelsBeforeVisualizer === null) {
        panelsBeforeVisualizer = { ...store.getState().visiblePanels };
      }
      store.setState({
        visualizerMode: true,
        visiblePanels: { equalizer: false, lyrics: false, playlist: false }
      });
    } else {
      const restore = panelsBeforeVisualizer || store.getState().visiblePanels;
      panelsBeforeVisualizer = null;
      store.setState({ visualizerMode: false, visiblePanels: { ...restore } });
    }
  }

  async function setFullscreen(on) {
    fullscreen = await window.api.window.setFullScreen(on);
    appShell.classList.toggle('fullscreen', fullscreen);
    fullscreenBtn.classList.toggle('active', fullscreen);
    store.setState({ visualizerFullscreen: fullscreen });
    // Pantalla completa sin el modo visualizador no tiene sentido: lo unico
    // que gana tamano es el visualizador.
    if (fullscreen && !visualizerMode) setVisualizerMode(true);
  }

  maxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (visualizerMode && fullscreen) setFullscreen(false);
    setVisualizerMode(!visualizerMode);
  });

  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setFullscreen(!fullscreen);
  });

  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = visualizer.toggleMode();
    modeBtn.title = mode === 'bars' ? 'Barras (clic para osciloscopio)' : 'Osciloscopio (clic para barras)';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (fullscreen) setFullscreen(false);
    else if (visualizerMode) setVisualizerMode(false);
  });

  albumArtMaxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    albumArtMaximized = !albumArtMaximized;
    displayRow.classList.toggle('albumart-maximized', albumArtMaximized);
    albumArtMaxBtn.textContent = albumArtMaximized ? '▢' : '▣';
  });

  playBtn.addEventListener('click', () => playback.play());
  pauseBtn.addEventListener('click', () => playback.pause());
  stopBtn.addEventListener('click', () => playback.stop());
  prevBtn.addEventListener('click', () => playback.prev());
  nextBtn.addEventListener('click', () => playback.next());

  shuffleBtn.addEventListener('click', () => {
    const shuffle = !store.getState().shuffle;
    store.setState({ shuffle });
    playback.setShuffle(shuffle);
  });

  repeatBtn.addEventListener('click', () => {
    const order = ['none', 'all', 'one'];
    const current = store.getState().repeat;
    const next = order[(order.indexOf(current) + 1) % order.length];
    store.setState({ repeat: next });
  });

  eqToggleBtn.addEventListener('click', () => {
    const visiblePanels = { ...store.getState().visiblePanels, equalizer: !store.getState().visiblePanels.equalizer };
    store.setState({ visiblePanels });
  });

  plToggleBtn.addEventListener('click', () => {
    const visiblePanels = { ...store.getState().visiblePanels, playlist: !store.getState().visiblePanels.playlist };
    store.setState({ visiblePanels });
  });

  lyricsToggleBtn.addEventListener('click', () => {
    const current = store.getState().visiblePanels;
    store.setState({ visiblePanels: { ...current, lyrics: !current.lyrics } });
  });

  seekBar.addEventListener('mousedown', () => (seeking = true));
  seekBar.addEventListener('change', () => {
    const fraction = Number(seekBar.value) / 1000;
    playback.seek(fraction);
    seeking = false;
  });

  volumeSlider.addEventListener('input', () => {
    const linear = Number(volumeSlider.value) / 100;
    playback.setVolume(linear);
  });

  balanceSlider.addEventListener('input', () => {
    const pan = Number(balanceSlider.value) / 100;
    playback.setBalance(pan);
  });

  function render() {
    const state = store.getState();

    playBtn.classList.toggle('active', state.isPlaying);
    shuffleBtn.classList.toggle('active', state.shuffle);
    repeatBtn.classList.toggle('active', state.repeat !== 'none');
    repeatBtn.textContent = state.repeat === 'one' ? 'REP1' : 'REP';

    eqToggleBtn.classList.toggle('active', state.visiblePanels.equalizer);
    plToggleBtn.classList.toggle('active', state.visiblePanels.playlist);
    lyricsToggleBtn.classList.toggle('active', state.visiblePanels.lyrics);
    eqPanel.classList.toggle('hidden', !state.visiblePanels.equalizer);
    plPanel.classList.toggle('hidden', !state.visiblePanels.playlist);
    lyricsPanel.classList.toggle('hidden', !state.visiblePanels.lyrics);

    if (state.currentTrack) {
      const t = state.currentTrack;
      marquee.setText(`${t.artist ? t.artist + ' - ' : ''}${t.title || t.file_path}`);
      trackFormat.textContent = [t.codec, t.sample_rate ? `${Math.round(t.sample_rate / 1000)}kHz` : null, t.bitrate ? `${Math.round(t.bitrate / 1000)}kbps` : null]
        .filter(Boolean)
        .join(' ');

      if (t.cover_path) {
        albumArtImg.src = toFileUrl(t.cover_path);
        albumArt.classList.add('has-art');
      } else {
        albumArtImg.removeAttribute('src');
        albumArt.classList.remove('has-art');
      }
    } else {
      marquee.setText('OpenAmp — sin reproduccion');
      trackFormat.textContent = '';
      albumArtImg.removeAttribute('src');
      albumArt.classList.remove('has-art');
    }

    if (!seeking) {
      const fraction = state.duration > 0 ? state.currentTime / state.duration : 0;
      seekBar.value = String(Math.round(fraction * 1000));
    }
    timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  }

  store.subscribe(render);
  render();

  return {
    // Lo usa el mini reproductor: los dos modos se pelean por el tamano de la
    // ventana, asi que entrar en uno tiene que sacar del otro.
    exitVisualizerMode() {
      if (!visualizerMode) return;
      if (fullscreen) setFullscreen(false);
      setVisualizerMode(false);
    }
  };
}
