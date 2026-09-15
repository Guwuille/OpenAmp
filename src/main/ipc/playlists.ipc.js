const { ipcMain } = require('electron');
const { getDatabase } = require('../db/database');
const playlistsRepo = require('../db/playlistsRepo');
const { writeM3U, parseM3U } = require('../library/m3u');

function registerPlaylistsIpc() {
  ipcMain.handle('playlists:getAll', () => playlistsRepo.getAllPlaylists());

  ipcMain.handle('playlists:create', (event, name) => playlistsRepo.createPlaylist(name));

  ipcMain.handle('playlists:rename', (event, { id, name }) => {
    // La interfaz ya filtra, pero una playlist sin nombre queda invisible en
    // el desplegable y no habria forma de volver a seleccionarla.
    const limpio = typeof name === 'string' ? name.trim().slice(0, 80) : '';
    if (!limpio) return false;
    playlistsRepo.renamePlaylist(id, limpio);
    return true;
  });

  ipcMain.handle('playlists:delete', (event, id) => {
    playlistsRepo.deletePlaylist(id);
    return true;
  });

  ipcMain.handle('playlists:addTracks', (event, { playlistId, trackIds, atPosition }) => {
    playlistsRepo.addTracksToPlaylist(playlistId, trackIds, atPosition);
    return playlistsRepo.getAllPlaylists().find((p) => p.id === playlistId);
  });

  ipcMain.handle('playlists:removeTrack', (event, { playlistId, playlistTrackId }) => {
    playlistsRepo.removeTrackFromPlaylist(playlistId, playlistTrackId);
    return playlistsRepo.getAllPlaylists().find((p) => p.id === playlistId);
  });

  ipcMain.handle('playlists:reorder', (event, { playlistId, orderedIds }) => {
    playlistsRepo.reorderPlaylist(playlistId, orderedIds);
    return playlistsRepo.getAllPlaylists().find((p) => p.id === playlistId);
  });

  ipcMain.handle('playlists:exportM3U', (event, { playlistId, filePath }) => {
    const playlist = playlistsRepo.getAllPlaylists().find((p) => p.id === playlistId);
    if (!playlist) throw new Error('Playlist not found');
    writeM3U(filePath, playlist.tracks);
    return true;
  });

  ipcMain.handle('playlists:importM3U', (event, filePath) => {
    const db = getDatabase();
    const paths = parseM3U(filePath);
    const findTrack = db.prepare('SELECT id FROM tracks WHERE file_path = ?');
    const trackIds = paths.map((p) => findTrack.get(p)).filter(Boolean).map((r) => r.id);

    const name = filePath.split(/[\\/]/).pop().replace(/\.m3u8?$/i, '');
    const playlist = playlistsRepo.createPlaylist(name);
    if (trackIds.length > 0) {
      playlistsRepo.addTracksToPlaylist(playlist.id, trackIds);
    }
    return playlistsRepo.getAllPlaylists().find((p) => p.id === playlist.id);
  });
}

module.exports = registerPlaylistsIpc;
