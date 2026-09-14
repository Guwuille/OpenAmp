import { store } from '../state/store.js';
import { EQ_BAND_FREQUENCIES, EQ_PRESETS } from '../audio/equalizer.js';

function freqLabel(freq) {
  return freq >= 1000 ? `${freq / 1000}k` : String(freq);
}

export function initEqualizerPanel({ audioEngine }) {
  const containerEl = document.getElementById('eq-band-container');
  const presetSelect = document.getElementById('eq-preset-select');
  const enableBtn = document.getElementById('btn-eq-enable');
  const preampInput = document.querySelector('#eq-preamp-band input');

  const bandInputs = [];

  EQ_BAND_FREQUENCIES.forEach((freq, i) => {
    const band = document.createElement('div');
    band.className = 'eq-band';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-12';
    input.max = '12';
    input.step = '1';
    input.value = '0';

    const label = document.createElement('label');
    label.textContent = freqLabel(freq);

    input.addEventListener('input', () => {
      const gains = store.getState().eq.bands.slice();
      gains[i] = Number(input.value);
      store.setState({ eq: { ...store.getState().eq, bands: gains, preset: 'Custom' } });
      audioEngine.setEqBand(i, gains[i]);
      persistEq();
      renderPresetSelect();
    });

    band.appendChild(input);
    band.appendChild(label);
    containerEl.appendChild(band);
    bandInputs.push(input);
  });

  function persistEq() {
    window.api.settings.set('eq', store.getState().eq);
  }

  function renderPresetSelect() {
    const { preset } = store.getState().eq;
    presetSelect.innerHTML = '';
    for (const name of [...Object.keys(EQ_PRESETS), 'Custom']) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      opt.selected = name === preset;
      presetSelect.appendChild(opt);
    }
  }

  function applyGainsToUI(gains) {
    gains.forEach((g, i) => (bandInputs[i].value = String(g)));
  }

  presetSelect.addEventListener('change', () => {
    const name = presetSelect.value;
    if (name === 'Custom') return;
    const gains = audioEngine.applyPreset(name);
    applyGainsToUI(gains);
    store.setState({ eq: { ...store.getState().eq, bands: gains, preset: name } });
    persistEq();
  });

  enableBtn.addEventListener('click', () => {
    const eq = store.getState().eq;
    const enabled = !eq.enabled;
    audioEngine.setEqEnabled(enabled, eq.bands);
    store.setState({ eq: { ...eq, enabled } });
    enableBtn.classList.toggle('active', enabled);
    enableBtn.textContent = enabled ? 'ON' : 'OFF';
    persistEq();
  });

  preampInput.addEventListener('input', () => {
    const value = Number(preampInput.value);
    audioEngine.setPreamp?.(value);
    store.setState({ eq: { ...store.getState().eq, preamp: value } });
    persistEq();
  });

  async function bootstrap() {
    const saved = await window.api.settings.get('eq');
    if (saved) {
      store.setState({ eq: saved });
      applyGainsToUI(saved.bands);
      preampInput.value = String(saved.preamp || 0);
      audioEngine.setEqEnabled(saved.enabled, saved.bands);
      enableBtn.classList.toggle('active', saved.enabled);
      enableBtn.textContent = saved.enabled ? 'ON' : 'OFF';
    }
    renderPresetSelect();
  }

  bootstrap();
}
