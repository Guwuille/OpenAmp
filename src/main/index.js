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

  if (settingsStore.get('windowMaximized', false)) mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // La ventana tambien se puede maximizar por fuera del boton (Win+flecha,
  // arrastrarla al borde), asi que el estado se avisa en vez de suponerlo.
  const sendMaximizeState = () => {
    mainWindow?.webContents.send('window:maximizeChange', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximizeState);
  mainWindow.on('unmaximize', sendMaximizeState);

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    // getNormalBounds y no getBounds: si se cierra maximizada, getBounds
    // devuelve el tamano de pantalla completa y al restaurar la ventana
    // quedaria de ese tamano pero sin estar maximizada.
    settingsStore.set('windowBounds', mainWindow.getNormalBounds());
    settingsStore.set('windowMaximized', mainWindow.isMaximized());
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

  const library = registerLibraryIpc(() => mainWindow);
  registerPlaylistsIpc();
  registerDialogsIpc();
  registerWindowIpc(() => mainWindow);
  registerLyricsIpc();

  createWindow();
  createTray();

  // El reescaneo de arranque avisa por IPC, asi que hay que esperar a que el
  // renderer este listo o el mensaje se pierde.
  mainWindow.webContents.once('did-finish-load', () => library.start());
  app.on('before-quit', () => library.stop());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
