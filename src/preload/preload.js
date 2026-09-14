const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  library: {
    addFolders: (folderPaths) => ipcRenderer.invoke('library:addFolders', folderPaths),
    getAllTracks: () => ipcRenderer.invoke('library:getAllTracks'),
    getFolders: () => ipcRenderer.invoke('library:getFolders'),
    removeFolder: (folderId) => ipcRenderer.invoke('library:removeFolder', folderId),
    rescan: (folderId) => ipcRenderer.invoke('library:rescan', folderId),
    onScanProgress: (cb) => on('library:scanProgress', cb),
    onScanComplete: (cb) => on('library:scanComplete', cb),
    onScanError: (cb) => on('library:scanError', cb),
    onUpdated: (cb) => on('library:updated', cb)
  },
  playlists: {
    getAll: () => ipcRenderer.invoke('playlists:getAll'),
    create: (name) => ipcRenderer.invoke('playlists:create', name),
    rename: (id, name) => ipcRenderer.invoke('playlists:rename', { id, name }),
    delete: (id) => ipcRenderer.invoke('playlists:delete', id),
    addTracks: (playlistId, trackIds, atPosition) =>
      ipcRenderer.invoke('playlists:addTracks', { playlistId, trackIds, atPosition }),
    removeTrack: (playlistId, playlistTrackId) =>
      ipcRenderer.invoke('playlists:removeTrack', { playlistId, playlistTrackId }),
    reorder: (playlistId, orderedIds) => ipcRenderer.invoke('playlists:reorder', { playlistId, orderedIds }),
    exportM3U: (playlistId, filePath) => ipcRenderer.invoke('playlists:exportM3U', { playlistId, filePath }),
    importM3U: (filePath) => ipcRenderer.invoke('playlists:importM3U', filePath)
  },
  dialogs: {
    selectFolders: () => ipcRenderer.invoke('dialog:selectFolders'),
    selectAudioFiles: () => ipcRenderer.invoke('dialog:selectAudioFiles'),
    selectSaveM3U: (defaultName) => ipcRenderer.invoke('dialog:selectSaveM3U', defaultName),
    selectOpenM3U: () => ipcRenderer.invoke('dialog:selectOpenM3U')
  },
  lyrics: {
    load: (trackPath) => ipcRenderer.invoke('lyrics:load', trackPath),
    save: (trackPath, text) => ipcRenderer.invoke('lyrics:save', { trackPath, text }),
    hasSidecar: (trackPath) => ipcRenderer.invoke('lyrics:hasSidecar', trackPath),
    fetchOnline: (query) => ipcRenderer.invoke('lyrics:fetchOnline', query)
  },
  player: {
    setState: (state) => ipcRenderer.invoke('player:setState', state),
    onCommand: (cb) => on('player:command', cb)
  },
  downloads: {
    start: (options) => ipcRenderer.invoke('downloads:start', options),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    onProgress: (cb) => on('downloads:progress', cb),
    onDone: (cb) => on('downloads:done', cb),
    onError: (cb) => on('downloads:error', cb),
    onCancelled: (cb) => on('downloads:cancelled', cb)
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
    isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
    setFullScreen: (value) => ipcRenderer.invoke('window:setFullScreen', value),
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => on('window:maximizeChange', cb),
    setMiniMode: (options) => ipcRenderer.invoke('window:setMiniMode', options),
    getSize: () => ipcRenderer.invoke('window:getSize'),
    resizeToFitPanels: (width, height) => ipcRenderer.invoke('window:resizeToFitPanels', { width, height })
  }
});
