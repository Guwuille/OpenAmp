const { ipcMain } = require('electron');
const settingsStore = require('../settingsStore');

const NORMAL_MIN_WIDTH = 660;
const NORMAL_MIN_HEIGHT = 380;
const MINI_MIN_WIDTH = 240;
const MINI_MIN_HEIGHT = 64;

function registerWindowIpc(getMainWindow) {
  // Lo que habia antes de encoger, para poder devolver la ventana tal cual
  // estaba al salir del mini reproductor.
  let beforeMini = null;

  ipcMain.handle('window:setMiniMode', (event, { enabled, width, height } = {}) => {
    const win = getMainWindow();
    if (!win) return false;

    if (enabled) {
      if (!beforeMini) {
        beforeMini = {
          bounds: win.getNormalBounds(),
          maximized: win.isMaximized(),
          alwaysOnTop: win.isAlwaysOnTop()
        };
      }
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();

      // El minimo se baja a un piso generoso, no al tamano exacto pedido: si
      // el minimo fuera el tamano actual, la ventana quedaria clavada y no se
      // podria agrandar ni achicar a mano.
      win.setMinimumSize(MINI_MIN_WIDTH, MINI_MIN_HEIGHT);

      // Sin ancho explicito se conserva el que tenga la ventana: asi cambiar
      // una opcion no descarta el ancho que el usuario haya elegido.
      const [currentWidth] = win.getSize();
      const w = Math.max(MINI_MIN_WIDTH, Math.round(width || currentWidth));
      const h = Math.max(MINI_MIN_HEIGHT, Math.round(height || 120));
      win.setSize(w, h, false);
      // Un mini reproductor tapado por otra ventana no sirve de nada.
      win.setAlwaysOnTop(true);
      return true;
    }

    const previous = beforeMini;
    beforeMini = null;
    win.setMinimumSize(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT);
    if (previous) {
      win.setBounds(previous.bounds);
      win.setAlwaysOnTop(previous.alwaysOnTop);
      if (previous.maximized) win.maximize();
    }
    return false;
  });

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

  ipcMain.handle('window:toggleMaximize', () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      // El modo persiana deja el minimumSize reducido; sin restaurarlo la
      // ventana maximizada podria volver colapsada.
      win.setMinimumSize(660, 380);
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setFullScreen', (event, value) => {
    const win = getMainWindow();
    if (!win) return false;
    // Fullscreen ignora el minimumSize, pero si el modo persiana lo dejo
    // reducido hay que restaurarlo o la ventana vuelve colapsada al salir.
    win.setMinimumSize(660, 380);
    win.setFullScreen(!!value);
    return win.isFullScreen();
  });

  ipcMain.handle('window:isFullScreen', () => {
    return getMainWindow()?.isFullScreen() ?? false;
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
