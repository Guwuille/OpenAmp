import { createEventBus } from '../lib/eventBus.js';
import { createEqualizerChain, EQ_PRESETS } from './equalizer.js';
import { toFileUrl } from '../lib/fileUrl.js';

export function createAudioEngine() {
  const bus = createEventBus();

  // Un <video> tambien reproduce audio, asi que sirve para todo y ademas
  // permite mostrar la imagen cuando el archivo la trae. La interfaz lo monta
  // donde corresponda a traves de mediaElement.
  const audioEl = document.createElement('video');
  audioEl.preload = 'auto';
  audioEl.playsInline = true;
  // Sin esto, un video reproducido solo en segundo plano puede quedar sin
  // decodificar cuadros en algunos casos.
  audioEl.disablePictureInPicture = true;

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
    // videoWidth es la unica forma fiable de saber si el archivo trae imagen:
    // la extension miente (un .mp4 puede ser solo audio y un .webm tambien).
    bus.emit('loadedmetadata', {
      duration: audioEl.duration || 0,
      hasVideo: audioEl.videoWidth > 0,
      videoWidth: audioEl.videoWidth,
      videoHeight: audioEl.videoHeight
    });
  });
  audioEl.addEventListener('ended', () => bus.emit('ended'));
  audioEl.addEventListener('play', () => bus.emit('play'));
  audioEl.addEventListener('pause', () => bus.emit('pause'));
  audioEl.addEventListener('error', () => {
    const error = audioEl.error;

    // Un aborto no es un fallo del archivo: ocurre cuando se empieza a cargar
    // otra pista encima de una que todavia estaba cargando. Tratarlo como
    // error hacia que elegir una cancion saltara a la siguiente.
    if (!error || error.code === MediaError.MEDIA_ERR_ABORTED) return;

    bus.emit('error', {
      code: error.code,
      message: error.message,
      src: audioEl.currentSrc || audioEl.src
    });
  });

  function resumeContext() {
    if (audioContext.state === 'suspended') audioContext.resume();
  }

  return {
    analyserNode,
    on: bus.on,

    // La interfaz lo inserta detras del visualizador para que el video se vea
    // como fondo. Es el mismo elemento que reproduce: no hay decodificacion
    // duplicada ni riesgo de que imagen y sonido se desincronicen.
    mediaElement: audioEl,

    hasVideo() {
      return audioEl.videoWidth > 0;
    },

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
