export const EQ_BAND_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Rock: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
  Pop: [-1, 2, 4, 4, 2, -1, -2, -2, -1, -1],
  Jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  Classical: [4, 3, 2, 1, -1, -1, -1, 0, 2, 3],
  'Bass Boost': [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  Vocal: [-2, -2, -1, 2, 4, 4, 2, 0, -1, -2]
};

export function createEqualizerChain(audioContext) {
  const filters = EQ_BAND_FREQUENCIES.map((freq) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    filter.gain.value = 0;
    return filter;
  });

  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }

  return {
    input: filters[0],
    output: filters[filters.length - 1],
    filters,
    setBandGain(index, gainDb) {
      if (filters[index]) filters[index].gain.value = gainDb;
    },
    setAllGains(gains) {
      gains.forEach((g, i) => this.setBandGain(i, g));
    },
    setEnabled(enabled, gains) {
      if (enabled) {
        this.setAllGains(gains);
      } else {
        filters.forEach((f) => (f.gain.value = 0));
      }
    }
  };
}
