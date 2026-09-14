const { app, BrowserWindow, session, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

const { getDatabase } = require('./db/database');
const registerLibraryIpc = require('./ipc/library.ipc');
const registerPlaylistsIpc = require('./ipc/playlists.ipc');
const registerDialogsIpc = require('./ipc/dialogs.ipc');
const registerWindowIpc = require('./ipc/window.ipc');
const registerLyricsIpc = require('./ipc/lyrics.ipc');
const settingsStore = require('./settingsStore');

let mainWindow = null;
let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('OpenAmp');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar / Ocultar',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        mainWindow = null;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

function createWindow() {
  const savedBounds = settingsStore.get('windowBounds', { width: 960, height: 640 });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 660,
    minHeight: 380,
    frame: false,
    transparent: false,
    backgroundColor: '#050200',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    settingsStore.set('windowBounds', mainWindow.getBounds());
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; media-src 'self' file:;"
        ]
      }
    });
  });

  getDatabase();

  registerLibraryIpc();
  registerPlaylistsIpc();
  registerDialogsIpc();
  registerWindowIpc(() => mainWindow);
  registerLyricsIpc();

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
