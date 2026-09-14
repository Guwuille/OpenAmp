const { ipcMain } = require('electron');
const settingsStore = require('../settingsStore');

function registerWindowIpc(getMainWindow) {
  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:setAlwaysOnTop', (event, value) => {
    const win = getMainWindow();
    if (!win) return;
    win.setAlwaysOnTop(!!value);
    settingsStore.set('alwaysOnTop', !!value);
  });

  ipcMain.handle('window:resizeToFitPanels', (event, { width, height }) => {
    const win = getMainWindow();
    if (!win) return;
    const [currentWidth] = win.getSize();
    const targetWidth = width || currentWidth;
    // Temporarily relax the minimum size so window-shade can shrink below the
    // normal minHeight, then restore the usual floor once we're at/above it.
    win.setMinimumSize(Math.min(targetWidth, 660), Math.min(height, 380));
    win.setSize(targetWidth, height, true);
  });

  ipcMain.handle('window:isAlwaysOnTop', () => {
    return getMainWindow()?.isAlwaysOnTop() ?? false;
  });

  ipcMain.handle('window:getSize', () => {
    return getMainWindow()?.getSize() ?? [960, 640];
  });

  ipcMain.handle('settings:get', (event, key) => settingsStore.get(key));
  ipcMain.handle('settings:set', (event, { key, value }) => {
    settingsStore.set(key, value);
    return true;
  });
}

module.exports = registerWindowIpc;
