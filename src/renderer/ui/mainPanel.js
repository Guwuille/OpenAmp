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
  const seekBar = document.getElementById('seek-bar');
  const timeDisplay = document.getElementById('time-display');
  const trackFormat = document.getElementById('track-format');
  const volumeSlider = document.getElementById('volume-slider');
  const balanceSlider = document.getElementById('balance-slider');
  const eqPanel = document.getElementById('panel-equalizer');
  const plPanel = document.getElementById('panel-playlist');
  const displayRow = document.getElementById('display-row');
  const visualizerCanvas = document.getElementById('visualizer');
  const maxBtn = document.getElementById('btn-visualizer-max');
  const albumArt = document.getElementById('album-art');
  const albumArtImg = document.getElementById('album-art-img');
  const albumArtMaxBtn = document.getElementById('btn-albumart-max');

  const marquee = createMarquee(document.getElementById('track-marquee'));
  marquee.start();

  let seeking = false;
  let visualizerMaximized = false;
  let albumArtMaximized = false;

  maxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    visualizerMaximized = !visualizerMaximized;
    displayRow.classList.toggle('visualizer-maximized', visualizerMaximized);
    maxBtn.textContent = visualizerMaximized ? '▢' : '▣';
    if (visualizerMaximized) {
      visualizer.resize(visualizerCanvas.clientWidth || 400, 140);
    } else {
      visualizer.resize(76, 32);
    }
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
    eqPanel.classList.toggle('hidden', !state.visiblePanels.equalizer);
    plPanel.classList.toggle('hidden', !state.visiblePanels.playlist);

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
}
