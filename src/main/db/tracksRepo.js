const { getDatabase } = require('./database');

function upsertFolder(folderPath) {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM folders WHERE path = ?').get(folderPath);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO folders (path, last_scanned) VALUES (?, NULL)').run(folderPath);
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid);
}

function getAllFolders() {
  return getDatabase().prepare('SELECT * FROM folders ORDER BY path').all();
}

function removeFolder(folderId) {
  getDatabase().prepare('DELETE FROM folders WHERE id = ?').run(folderId);
}

function touchFolderScanned(folderId) {
  getDatabase().prepare('UPDATE folders SET last_scanned = ? WHERE id = ?').run(Date.now(), folderId);
}

function getAllTracks() {
  return getDatabase().prepare('SELECT * FROM tracks ORDER BY artist, album, disc_no, track_no').all();
}

function getTrackById(id) {
  return getDatabase().prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

// Fecha de modificacion de lo que ya esta indexado, para que el escaneo
// pueda saltearse los archivos que no cambiaron en vez de releer sus
// metadatos desde cero.
function getFolderFileStamps(folderId) {
  const rows = getDatabase()
    .prepare('SELECT file_path, date_modified FROM tracks WHERE folder_id = ?')
    .all(folderId);
  const stamps = Object.create(null);
  for (const row of rows) stamps[row.file_path] = row.date_modified;
  return stamps;
}

const upsertTrackStmt = () => getDatabase().prepare(`
  INSERT INTO tracks (
    file_path, title, artist, album, album_artist, genre, year, track_no, disc_no,
    duration, bitrate, sample_rate, codec, cover_path, folder_id, date_added, date_modified
  ) VALUES (
    @file_path, @title, @artist, @album, @album_artist, @genre, @year, @track_no, @disc_no,
    @duration, @bitrate, @sample_rate, @codec, @cover_path, @folder_id, @date_added, @date_modified
  )
  ON CONFLICT(file_path) DO UPDATE SET
    title=excluded.title, artist=excluded.artist, album=excluded.album,
    album_artist=excluded.album_artist, genre=excluded.genre, year=excluded.year,
    track_no=excluded.track_no, disc_no=excluded.disc_no, duration=excluded.duration,
    bitrate=excluded.bitrate, sample_rate=excluded.sample_rate, codec=excluded.codec,
    cover_path=excluded.cover_path, folder_id=excluded.folder_id, date_modified=excluded.date_modified
`);

function upsertTracksBatch(tracks) {
  const db = getDatabase();
  const stmt = upsertTrackStmt();
  const insertMany = db.transaction((rows) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(tracks);
}

function removeMissingTracks(folderId, existingPaths) {
  const db = getDatabase();
  const rows = db.prepare('SELECT id, file_path FROM tracks WHERE folder_id = ?').all(folderId);
  const toDelete = rows.filter((r) => !existingPaths.has(r.file_path)).map((r) => r.id);
  if (toDelete.length === 0) return 0;
  const del = db.prepare('DELETE FROM tracks WHERE id = ?');
  const delMany = db.transaction((ids) => {
    for (const id of ids) del.run(id);
  });
  delMany(toDelete);
  return toDelete.length;
}

module.exports = {
  upsertFolder,
  getAllFolders,
  removeFolder,
  touchFolderScanned,
  getAllTracks,
  getTrackById,
  getFolderFileStamps,
  upsertTracksBatch,
  removeMissingTracks
};
