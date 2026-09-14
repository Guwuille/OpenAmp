const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app } = require('electron');

function getCoversDir() {
  const dir = path.join(app.getPath('userData'), 'covers');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveCoverIfNeeded(picture) {
  if (!picture || !picture.data || picture.data.length === 0) return null;

  const dir = getCoversDir();
  const hash = crypto.createHash('sha1').update(picture.data).digest('hex');
  const ext = (picture.format || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const filePath = path.join(dir, `${hash}.${ext}`);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, picture.data);
  }
  return filePath;
}

module.exports = { saveCoverIfNeeded, getCoversDir };
