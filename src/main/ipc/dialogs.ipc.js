const { ipcMain, dialog, BrowserWindow } = require('electron');

function registerDialogsIpc() {
  ipcMain.handle('dialog:selectFolders', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections']
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('dialog:selectAudioFiles', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Musica y video', extensions: ['flac', 'mp3', 'wav', 'ogg', 'm4a', 'opus', 'mp4', 'm4v', 'webm', 'ogv'] },
        { name: 'Audio', extensions: ['flac', 'mp3', 'wav', 'ogg', 'm4a', 'opus'] },
        { name: 'Video', extensions: ['mp4', 'm4v', 'webm', 'ogv'] }
      ]
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('dialog:selectSaveM3U', async (event, defaultName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName ? `${defaultName}.m3u` : 'playlist.m3u',
      filters: [{ name: 'Playlist', extensions: ['m3u'] }]
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:selectOpenM3U', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Playlist', extensions: ['m3u', 'm3u8'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
}

module.exports = registerDialogsIpc;
