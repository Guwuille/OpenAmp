CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  last_scanned INTEGER
);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT,
  artist TEXT,
  album TEXT,
  album_artist TEXT,
  genre TEXT,
  year INTEGER,
  track_no INTEGER,
  disc_no INTEGER,
  duration REAL,
  bitrate INTEGER,
  sample_rate INTEGER,
  codec TEXT,
  cover_path TEXT,
  folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  date_added INTEGER,
  date_modified INTEGER
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pl ON playlist_tracks(playlist_id, position);
