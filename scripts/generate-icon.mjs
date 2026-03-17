import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const svg = readFileSync(path.join(root, 'images', 'icon.svg'));

await sharp(svg)
  .resize(128, 128)
  .png()
  .toFile(path.join(root, 'images', 'icon.png'));

console.log('icon.png generated (128×128)');
