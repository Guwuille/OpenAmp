const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Los de video son los que Chromium sabe demuxear: mkv y avi quedan afuera
// aunque adentro lleven un H.264 perfectamente reproducible.
const AUDIO_EXTENSIONS = new Set([
  '.flac', '.mp3', '.wav', '.ogg', '.m4a', '.opus',
  '.mp4', '.m4v', '.webm', '.ogv'
]);

function saveCoverIfNeeded(picture, coversDir) {
  if (!picture || !picture.data || picture.data.length === 0) return null;
  const hash = crypto.createHash('sha1').update(picture.data).digest('hex');
  const ext = (picture.format || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const filePath = path.join(coversDir, `${hash}.${ext}`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, picture.data);
  }
  return filePath;
}

function walkDirSync(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDirSync(fullPath, results);
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
}

async function run() {
  const { folderPath, folderId, coversDir, known } = workerData;
  const { parseFile } = await import('music-metadata');

  const files = [];
  walkDirSync(folderPath, files);

  const total = files.length;
  const tracks = [];
  const unchanged = [];
  const stamps = known || {};

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    try {
      const stat = fs.statSync(filePath);

      // Ya indexado y sin tocar desde entonces: no hace falta releer los
      // metadatos, que es la parte lenta del escaneo.
      if (stamps[filePath] != null && stamps[filePath] === stat.mtimeMs) {
        unchanged.push(filePath);
        parentPort.postMessage({ type: 'progress', scanned: i + 1, total, currentFile: filePath });
        continue;
      }

      const metadata = await parseFile(filePath, { duration: true, skipCovers: false });
      const common = metadata.common || {};
      const format = metadata.format || {};
      const picture = Array.isArray(common.picture) && common.picture.length > 0 ? common.picture[0] : null;

      tracks.push({
        file_path: filePath,
        title: common.title || path.basename(filePath, path.extname(filePath)),
        artist: common.artist || 'Unknown Artist',
        album: common.album || 'Unknown Album',
        album_artist: common.albumartist || common.artist || null,
        genre: (common.genre && common.genre[0]) || null,
        year: common.year || null,
        track_no: (common.track && common.track.no) || null,
        disc_no: (common.disk && common.disk.no) || null,
        duration: format.duration || null,
        bitrate: format.bitrate ? Math.round(format.bitrate) : null,
        sample_rate: format.sampleRate || null,
        codec: format.codec || format.container || null,
        cover_path: saveCoverIfNeeded(picture, coversDir),
        folder_id: folderId,
        date_added: Date.now(),
        date_modified: stat.mtimeMs
      });
    } catch (err) {
      // Skip unreadable/corrupt files, continue scanning the rest.
    }

    parentPort.postMessage({ type: 'progress', scanned: i + 1, total, currentFile: filePath });
  }

  parentPort.postMessage({ type: 'done', tracks, unchanged });
}

run().catch((err) => {
  parentPort.postMessage({ type: 'error', message: err.message });
});
