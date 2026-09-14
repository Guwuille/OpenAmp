const path = require('node:path');
const { Worker } = require('node:worker_threads');
const tracksRepo = require('../db/tracksRepo');
const { getCoversDir } = require('./coverCache');

function scanFolder(folder, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'scanner.worker.js'), {
      workerData: {
        folderPath: folder.path,
        folderId: folder.id,
        coversDir: getCoversDir()
      }
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        onProgress?.(msg);
      } else if (msg.type === 'done') {
        resolve(msg.tracks);
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

  for (const folder of folders) {
    const tracks = await scanFolder(folder, onProgress);
    tracksRepo.upsertTracksBatch(tracks);
    const existingPaths = new Set(tracks.map((t) => t.file_path));
    tracksRepo.removeMissingTracks(folder.id, existingPaths);
    tracksRepo.touchFolderScanned(folder.id);
    addedCount += tracks.length;
  }

  return { addedCount };
}

module.exports = { scanFolders };
