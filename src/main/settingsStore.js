const Store = require('electron-store');

const store = new Store({
  name: 'settings',
  defaults: {
    windowBounds: { width: 960, height: 640 },
    volume: 0.8,
    balance: 0,
    eq: { enabled: true, preamp: 0, bands: new Array(10).fill(0), preset: 'Flat' },
    lastFolders: [],
    alwaysOnTop: false
  }
});

module.exports = store;
