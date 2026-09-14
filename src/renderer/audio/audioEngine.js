import { createEventBus } from '../lib/eventBus.js';
import { createEqualizerChain, EQ_PRESETS } from './equalizer.js';
import { toFileUrl } from '../lib/fileUrl.js';

export function createAudioEngine() {
  const bus = createEventBus();

  const audioEl = new Audio();
  audioEl.preload = 'auto';

  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaElementSource(audioEl);
  const gainNode = audioContext.createGain();
  const preampNode = audioContext.createGain();
  const equalizer = createEqualizerChain(audioContext);
  const pannerNode = audioContext.createStereoPanner();
  const analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;

  sourceNode.connect(gainNode);
  gainNode.connect(preampNode);
  preampNode.connect(equalizer.input);
  equalizer.output.connect(pannerNode);
  pannerNode.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  audioEl.addEventListener('timeupdate', () => {
    bus.emit('timeupdate', { currentTime: audioEl.currentTime, duration: audioEl.duration || 0 });
  });
  audioEl.addEventListener('loadedmetadata', () => {
    bus.emit('loadedmetadata', { duration: audioEl.duration || 0 });
  });
  audioEl.addEventListener('ended', () => bus.emit('ended'));
  audioEl.addEventListener('play', () => bus.emit('play'));
  audioEl.addEventListener('pause', () => bus.emit('pause'));
  audioEl.addEventListener('error', () => bus.emit('error', audioEl.error));

  function resumeContext() {
    if (audioContext.state === 'suspended') audioContext.resume();
  }

  return {
    analyserNode,
    on: bus.on,

    loadTrack(filePath) {
      return new Promise((resolve, reject) => {
        const onCanPlay = () => {
          audioEl.removeEventListener('canplay', onCanPlay);
          audioEl.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audioEl.removeEventListener('canplay', onCanPlay);
          audioEl.removeEventListener('error', onError);
          reject(audioEl.error);
        };
        audioEl.addEventListener('canplay', onCanPlay);
        audioEl.addEventListener('error', onError);
        audioEl.src = toFileUrl(filePath);
        audioEl.load();
      });
    },

    async play() {
      resumeContext();
      await audioEl.play();
    },

    pause() {
      audioEl.pause();
    },

    stop() {
      audioEl.pause();
      audioEl.currentTime = 0;
    },

    seek(seconds) {
      audioEl.currentTime = seconds;
    },

    setVolume(linear) {
      gainNode.gain.value = Math.max(0, Math.min(1, linear));
    },

    setBalance(pan) {
      pannerNode.pan.value = Math.max(-1, Math.min(1, pan));
    },

    setPreamp(gainDb) {
      preampNode.gain.value = Math.pow(10, gainDb / 20);
    },

    setEqEnabled(enabled, gains) {
      equalizer.setEnabled(enabled, gains);
    },

    setEqBand(index, gainDb) {
      equalizer.setBandGain(index, gainDb);
    },

    applyPreset(name) {
      const gains = EQ_PRESETS[name] || EQ_PRESETS.Flat;
      equalizer.setAllGains(gains);
      return gains;
    },

    getCurrentTime() {
      return audioEl.currentTime;
    },

    getDuration() {
      return audioEl.duration || 0;
    }
  };
}
