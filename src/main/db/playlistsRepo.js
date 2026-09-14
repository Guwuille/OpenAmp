const { getDatabase } = require('./database');

function getAllPlaylists() {
  const db = getDatabase();
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY created_at').all();
  const trackStmt = db.prepare(`
    SELECT pt.id as playlist_track_id, pt.position, t.*
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
  `);
  return playlists.map((p) => ({ ...p, tracks: trackStmt.all(p.id) }));
}

function createPlaylist(name) {
  const db = getDatabase();
  const now = Date.now();
  const info = db.prepare('INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)').run(name, now, now);
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(info.lastInsertRowid);
}

function renamePlaylist(id, name) {
  getDatabase().prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
}

function deletePlaylist(id) {
  getDatabase().prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

function addTracksToPlaylist(playlistId, trackIds, atPosition) {
  const db = getDatabase();
  const countRow = db.prepare('SELECT COUNT(*) as c FROM playlist_tracks WHERE playlist_id = ?').get(playlistId);
  let position = typeof atPosition === 'number' ? atPosition : countRow.c;

  const shiftStmt = db.prepare('UPDATE playlist_tracks SET position = position + ? WHERE playlist_id = ? AND position >= ?');
  const insertStmt = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');

  const run = db.transaction(() => {
    if (typeof atPosition === 'number') {
      shiftStmt.run(trackIds.length, playlistId, atPosition);
    }
    trackIds.forEach((trackId, i) => {
      insertStmt.run(playlistId, trackId, position + i);
    });
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  });
  run();
}

function removeTrackFromPlaylist(playlistId, playlistTrackId) {
  const db = getDatabase();
  const run = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?').run(playlistTrackId, playlistId);
    const rows = db.prepare('SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(playlistId);
    rows.forEach((row, i) => {
      db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?').run(i, row.id);
    });
  });
  run();
}

function reorderPlaylist(playlistId, orderedPlaylistTrackIds) {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ? AND playlist_id = ?');
  const run = db.transaction(() => {
    orderedPlaylistTrackIds.forEach((id, i) => stmt.run(i, id, playlistId));
  });
  run();
}

module.exports = {
  getAllPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addTracksToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist
};
