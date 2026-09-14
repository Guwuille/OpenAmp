const { ipcMain } = require('electron');
const { createThumbar } = require('../thumbar');

function registerPlayerIpc(getMainWindow) {
  const thumbar = createThumbar(getMainWindow);

  ipcMain.handle('player:setState', (event, { isPlaying, title } = {}) => {
    thumbar.setPlaying(isPlaying);
    thumbar.setTrack(title);
    return true;
  });

  return {
    init() {
      thumbar.init();
    }
  };
}

module.exports = registerPlayerIpc;
