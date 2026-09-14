const path = require('node:path');
const { Worker } = require('node:worker_threads');
const tracksRepo = require('../db/tracksRepo');
const { getCoversDir } = require('./coverCache');

function scanFolder(folder, known, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'scanner.worker.js'), {
      workerData: {
        folderPath: folder.path,
        folderId: folder.id,
        coversDir: getCoversDir(),
        known
      }
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        onProgress?.(msg);
      } else if (msg.type === 'done') {
        resolve({ tracks: msg.tracks, unchanged: msg.unchanged || [] });
      } else if (msg.type === 'error') {
        reject(new Error(msg.message));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Scanner worker exited with code ${code}`));
    });
  });
}

async function scanFolders(folders, onProgress) {
  let addedCount = 0;
  let changedCount = 0;

  for (const folder of folders) {
    const known = tracksRepo.getFolderFileStamps(folder.id);
    const { tracks, unchanged } = await scanFolder(folder, known, onProgress);

    if (tracks.length > 0) tracksRepo.upsertTracksBatch(tracks);

    // Los salteados siguen existiendo en disco: tienen que contar como
    // presentes o removeMissingTracks los borraria del catalogo.
    const existingPaths = new Set(unchanged);
    for (const track of tracks) existingPaths.add(track.file_path);

    const removed = tracksRepo.removeMissingTracks(folder.id, existingPaths);
    tracksRepo.touchFolderScanned(folder.id);

    addedCount += tracks.length;
    changedCount += tracks.length + removed;
  }

  // changedCount permite no molestar a la interfaz cuando el reescaneo no
  // encontro nada nuevo, que es el caso normal al arrancar.
  return { addedCount, changedCount };
}

module.exports = { scanFolders };
