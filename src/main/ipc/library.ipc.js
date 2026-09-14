const { ipcMain } = require('electron');
const tracksRepo = require('../db/tracksRepo');
const { scanFolders } = require('../library/scanner');
const { createFolderWatcher } = require('../library/folderWatcher');

function registerLibraryIpc(getMainWindow) {
  let scanning = false;
  let rescanQueued = false;

  function send(channel, payload) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  // Un solo escaneo a la vez: dos a la vez se pisarian en la base y harian
  // trabajo repetido. Si llega otro pedido mientras corre, se encola uno.
  async function runScan(folders, { silent = false } = {}) {
    if (folders.length === 0) return;

    if (scanning) {
      rescanQueued = true;
      return;
    }
    scanning = true;

    try {
      const { addedCount, changedCount } = await scanFolders(folders, (progress) => {
        if (!silent) send('library:scanProgress', progress);
      });

      if (!silent) send('library:scanComplete', { addedCount });
      // Solo se avisa si algo cambio de verdad: al arrancar, lo normal es que
      // el reescaneo no encuentre nada y no haga falta rearmar la lista.
      if (changedCount > 0) send('library:updated', { tracks: tracksRepo.getAllTracks() });
    } catch (err) {
      if (!silent) send('library:scanError', { message: err.message });
    } finally {
      scanning = false;
      if (rescanQueued) {
        rescanQueued = false;
        runScan(tracksRepo.getAllFolders(), { silent: true });
      }
    }
  }

  const watcher = createFolderWatcher((folderIds) => {
    const ids = new Set(folderIds);
    const folders = tracksRepo.getAllFolders().filter((f) => ids.has(f.id));
    runScan(folders, { silent: true });
  });

  function refreshWatches() {
    watcher.watch(tracksRepo.getAllFolders());
  }

  ipcMain.handle('library:addFolders', async (event, folderPaths) => {
    const folders = folderPaths.map((p) => tracksRepo.upsertFolder(p));
    await runScan(folders);
    refreshWatches();
    return tracksRepo.getAllFolders();
  });

  ipcMain.handle('library:getAllTracks', () => {
    return tracksRepo.getAllTracks();
  });

  ipcMain.handle('library:getFolders', () => {
    return tracksRepo.getAllFolders();
  });

  ipcMain.handle('library:removeFolder', (event, folderId) => {
    tracksRepo.removeFolder(folderId);
    refreshWatches();
    return tracksRepo.getAllTracks();
  });

  ipcMain.handle('library:rescan', async (event, folderId) => {
    const allFolders = tracksRepo.getAllFolders();
    const folders = folderId === 'all' ? allFolders : allFolders.filter((f) => f.id === folderId);
    await runScan(folders);
    return tracksRepo.getAllTracks();
  });

  return {
    // Se arranca cuando el renderer ya puede recibir mensajes, si no el aviso
    // de biblioteca actualizada se perderia.
    start() {
      const folders = tracksRepo.getAllFolders();
      refreshWatches();
      // Reescaneo de arranque en silencio: recoge lo que se agrego o cambio
      // mientras la app estaba cerrada, sin tapar la interfaz con progreso.
      runScan(folders, { silent: true });
    },
    stop() {
      watcher.stop();
    }
  };
}

module.exports = registerLibraryIpc;
