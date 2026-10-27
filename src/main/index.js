const { app, BrowserWindow, session, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

const { getDatabase } = require('./db/database');
const registerLibraryIpc = require('./ipc/library.ipc');
const registerPlaylistsIpc = require('./ipc/playlists.ipc');
const registerDialogsIpc = require('./ipc/dialogs.ipc');
const registerWindowIpc = require('./ipc/window.ipc');
const registerLyricsIpc = require('./ipc/lyrics.ipc');
const registerPlayerIpc = require('./ipc/player.ipc');
const settingsStore = require('./settingsStore');

let mainWindow = null;
let tray = null;

// Mismas extensiones que folderWatcher/scanner: lo que Windows puede mandar
// como argumento al abrir un archivo de audio con OpenAmp.
const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3', '.wav', '.ogg', '.m4a', '.opus']);

function extractAudioFilesFromArgv(argv) {
  return argv.filter((arg) => AUDIO_EXTENSIONS.has(path.extname(arg).toLowerCase()));
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH);
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

const ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icon.ico');

function createWindow() {
  const savedBounds = settingsStore.get('windowBounds', { width: 960, height: 640 });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 660,
    minHeight: 380,
    frame: false,
    // Sin esto la ventana usa el icono por defecto de Electron en la barra de
    // tareas cuando se corre desde el codigo fuente.
    icon: ICON_PATH,
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

// Windows agrupa las ventanas en la barra de tareas por este identificador.
// Sin el, la app corriendo desde el codigo fuente aparece como Electron.
if (process.platform === 'win32') app.setAppUserModelId('com.openamp.player');

// Si ya hay una instancia corriendo y el usuario abre otro archivo con
// OpenAmp, Windows lanza una segunda instancia: la cerramos y le pasamos
// el archivo a la que ya esta abierta via 'second-instance'.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    const files = extractAudioFilesFromArgv(argv);
    if (files.length) mainWindow.webContents.send('player:openFiles', files);
  });

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
    const player = registerPlayerIpc(() => mainWindow);

    createWindow();
    createTray();

    // El reescaneo de arranque avisa por IPC, asi que hay que esperar a que el
    // renderer este listo o el mensaje se pierde. Los botones de la miniatura
    // tambien necesitan la ventana ya creada, y lo mismo el archivo con el
    // que se haya abierto OpenAmp (doble clic / "Abrir con" en Windows).
    mainWindow.webContents.once('did-finish-load', () => {
      library.start();
      player.init();

      const initialFiles = extractAudioFilesFromArgv(process.argv);
      if (initialFiles.length) mainWindow.webContents.send('player:openFiles', initialFiles);
    });
    app.on('before-quit', () => library.stop());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
