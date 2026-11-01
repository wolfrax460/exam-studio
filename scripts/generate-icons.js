import { createCanvas, loadImage } from '../server/node_modules/@napi-rs/canvas/index.js';
import fs from 'node:fs';
import path from 'node:path';

const svgPath = path.resolve('client/public/icon.svg');

async function main() {
  const img = await loadImage(svgPath);

  // 512 PNG
  const c512 = createCanvas(512, 512);
  c512.getContext('2d').drawImage(img, 0, 0, 512, 512);
  fs.writeFileSync('client/public/icon-512.png', c512.toBuffer('image/png'));
  console.log('Wrote client/public/icon-512.png');

  // 192 PNG
  const c192 = createCanvas(192, 192);
  c192.getContext('2d').drawImage(img, 0, 0, 192, 192);
  fs.writeFileSync('client/public/icon-192.png', c192.toBuffer('image/png'));
  console.log('Wrote client/public/icon-192.png');

  // Copy to landing public
  fs.copyFileSync(svgPath, 'apps/landing/public/icon.svg');
  fs.copyFileSync('client/public/icon-192.png', 'apps/landing/public/icon-192.png');
  fs.copyFileSync('client/public/icon-512.png', 'apps/landing/public/icon-512.png');
  console.log('Copied icons to apps/landing/public/');

  // ICO with multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => {
    const c = createCanvas(s, s);
    c.getContext('2d').drawImage(img, 0, 0, s, s);
    return { size: s, buf: c.toBuffer('image/png') };
  });

  const ico = encodeIco(images);
  fs.writeFileSync('client/public/favicon.ico', ico);
  fs.copyFileSync('client/public/favicon.ico', 'apps/landing/public/favicon.ico');
  console.log('Wrote favicon.ico');
}

function encodeIco(images) {
  // ICO header: reserved(2)=0, type(2)=1, count(2)=N
  // buf.writeUInt16LE(value, offset)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // value=0, offset=0: reserved
  header.writeUInt16LE(1, 2);   // value=1, offset=2: type = ICO
  header.writeUInt16LE(images.length, 4); // value=count, offset=4

  let dataOffset = 6 + images.length * 16;
  const dirs = [];
  const datas = [];

  for (const { size, buf } of images) {
    const w = size === 256 ? 0 : size;
    const h = size === 256 ? 0 : size;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w, 0);       // width
    entry.writeUInt8(h, 1);       // height
    entry.writeUInt8(0, 2);       // color count
    entry.writeUInt8(0, 3);       // reserved
    entry.writeUInt16LE(1, 4);    // planes
    entry.writeUInt16LE(32, 6);   // bpp
    entry.writeUInt32LE(buf.length, 8); // size in bytes
    entry.writeUInt32LE(dataOffset, 12); // offset
    dirs.push(entry);
    datas.push(buf);
    dataOffset += buf.length;
  }

  return Buffer.concat([header, ...dirs, ...datas]);
}

main().catch((e) => { console.error(e); process.exit(1); });
