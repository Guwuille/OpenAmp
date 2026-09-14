const fs = require('node:fs');
const path = require('node:path');

function buildM3U(tracks) {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    const seconds = Math.round(t.duration || 0);
    lines.push(`#EXTINF:${seconds},${t.artist} - ${t.title}`);
    lines.push(t.file_path);
  }
  return lines.join('\n') + '\n';
}

function writeM3U(filePath, tracks) {
  fs.writeFileSync(filePath, buildM3U(tracks), 'utf8');
}

function parseM3U(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const baseDir = path.dirname(filePath);
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const paths = [];
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    paths.push(path.isAbsolute(line) ? line : path.resolve(baseDir, line));
  }
  return paths;
}

module.exports = { buildM3U, writeM3U, parseM3U };
