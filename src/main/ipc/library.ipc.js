const { ipcMain, BrowserWindow } = require('electron');
const tracksRepo = require('../db/tracksRepo');
const { scanFolders } = require('../library/scanner');

function registerLibraryIpc() {
  ipcMain.handle('library:addFolders', async (event, folderPaths) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const folders = folderPaths.map((p) => tracksRepo.upsertFolder(p));

    try {
      const { addedCount } = await scanFolders(folders, (progress) => {
        win?.webContents.send('library:scanProgress', progress);
      });
      win?.webContents.send('library:scanComplete', { addedCount });
    } catch (err) {
      win?.webContents.send('library:scanError', { message: err.message });
    }

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
    return tracksRepo.getAllTracks();
  });

  ipcMain.handle('library:rescan', async (event, folderId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const allFolders = tracksRepo.getAllFolders();
    const folders = folderId === 'all' ? allFolders : allFolders.filter((f) => f.id === folderId);

    try {
      const { addedCount } = await scanFolders(folders, (progress) => {
        win?.webContents.send('library:scanProgress', progress);
      });
      win?.webContents.send('library:scanComplete', { addedCount });
    } catch (err) {
      win?.webContents.send('library:scanError', { message: err.message });
    }

    return tracksRepo.getAllTracks();
  });
}

module.exports = registerLibraryIpc;
