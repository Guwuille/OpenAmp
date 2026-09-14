// Iconos de los botones de la miniatura de la barra de tareas.
//
// Se dibujan por codigo y se codifican como PNG en memoria en vez de guardar
// archivos binarios en el repo: son cuatro figuras de 16x16 que se describen
// en menos espacio del que ocuparian como imagenes, y asi se pueden ajustar
// sin abrir un editor.

const zlib = require('node:zlib');
const { nativeImage } = require('electron');

const SIZE = 16;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada scanline lleva adelante su byte de filtro, aca siempre 0 (sin filtro).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const from = y * size * 4;
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, from, from + size * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function draw(isInk) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!isInk(x, y)) continue;
      const i = (y * SIZE + x) * 4;
      // Blanco opaco: la barra de tareas de Windows suele ser oscura.
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(encodePng(rgba, SIZE));
}

const MID = 7.5;
const HALF_HEIGHT = 5;

// Triangulo apuntando a la derecha entre dos columnas.
function triangleRight(x, y, left, right) {
  if (x < left || x > right) return false;
  const progress = (right - x) / (right - left);
  return Math.abs(y - MID) <= HALF_HEIGHT * progress;
}

function triangleLeft(x, y, left, right) {
  if (x < left || x > right) return false;
  const progress = (x - left) / (right - left);
  return Math.abs(y - MID) <= HALF_HEIGHT * progress;
}

function bar(x, y, left, right) {
  return x >= left && x <= right && Math.abs(y - MID) <= HALF_HEIGHT;
}

function createThumbarIcons() {
  return {
    previous: draw((x, y) => bar(x, y, 3, 4) || triangleLeft(x, y, 6, 12)),
    play: draw((x, y) => triangleRight(x, y, 4, 12)),
    pause: draw((x, y) => bar(x, y, 4, 6) || bar(x, y, 9, 11)),
    next: draw((x, y) => triangleRight(x, y, 3, 9) || bar(x, y, 11, 12))
  };
}

module.exports = { createThumbarIcons, encodePng, SIZE };
