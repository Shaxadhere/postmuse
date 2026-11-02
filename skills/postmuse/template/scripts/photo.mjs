#!/usr/bin/env node
// Photo editing for Postmuse posts: crop to a post size, reframe, color-adjust, stylize.
// Usage: npm run photo -- <input> <output> [options]   (run with --help for the list)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const HELP = `
npm run photo -- <input> <output> [options]

Framing
  --size WxH            Resize and crop to exactly W×H (e.g. 1080x1350)
  --focus X,Y           Where to keep when cropping, in % (default 50,50; 50,30 keeps the top-middle)
  --zoom N              Zoom in before cropping (1 = none, 1.3 = 30% closer)
  --contain             Fit the whole image inside --size with padding instead of cropping
  --pad-color HEX       Padding color for --contain (default #000000)
  --rotate DEG          Rotate (90, 180, -90, or any angle)
  --flip                Mirror left-right

Color
  --brightness N        1 = unchanged, 1.15 = brighter, 0.85 = darker
  --contrast N          1 = unchanged, 1.2 = punchier, 0.85 = flatter
  --saturation N        1 = unchanged, 0 = black and white, 1.3 = more vivid
  --warmth N            -100 (cool/blue) … 100 (warm/orange); 0 = unchanged
  --hue DEG             Shift hue in degrees
  --grayscale           Black and white
  --duotone A,B         Map shadows to color A and highlights to color B (hex)
  --tint HEX            Color wash over the image
  --tint-strength N     0…1, default 0.25

Finish
  --sharpen             Light sharpening (good after upscaling)
  --blur N              Gaussian blur radius (e.g. 8 for a soft background)
  --vignette N          Darken edges, 0…1 (0.35 is subtle)
  --round N             Rounded corners radius in px (output becomes PNG)
  --quality N           JPEG/WebP quality 1…100 (default 90)
`;

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { opts._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return opts;
}

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help || o._.length < 2) { console.log(HELP); process.exit(o.help ? 0 : 1); }
  const [input, output] = o._;

  let img = sharp(input, { failOn: 'none' }).rotate(); // .rotate() with no args applies EXIF orientation
  if (o.rotate) img = sharp(await img.rotate(Number(o.rotate), { background: '#00000000' }).toBuffer());
  if (o.flip) img = img.flop();

  // Framing
  if (o.size) {
    const [W, H] = String(o.size).toLowerCase().split('x').map(Number);
    const zoom = Math.max(1, Number(o.zoom) || 1);
    const [fx, fy] = String(o.focus || '50,50').split(',').map((v) => Number(v) / 100);
    if (o.contain) {
      img = img.resize(W, H, { fit: 'contain', background: o['pad-color'] || '#000000' });
    } else {
      const meta = await sharp(await img.toBuffer()).metadata();
      const scale = Math.max(W / meta.width, H / meta.height) * zoom;
      const rw = Math.round(meta.width * scale), rh = Math.round(meta.height * scale);
      const left = Math.round(Math.min(Math.max(fx * rw - W / 2, 0), rw - W));
      const top = Math.round(Math.min(Math.max(fy * rh - H / 2, 0), rh - H));
      img = sharp(await img.resize(rw, rh).toBuffer()).extract({ left, top, width: W, height: H });
    }
  }

  // Color
  if (o.brightness || o.saturation || o.hue) {
    img = img.modulate({
      brightness: Number(o.brightness) || 1,
      saturation: o.saturation !== undefined ? Number(o.saturation) : 1,
      hue: Number(o.hue) || 0,
    });
  }
  if (o.contrast) {
    const c = Number(o.contrast);
    img = img.linear(c, 128 * (1 - c));
  }
  if (o.warmth) {
    const w = Math.max(-100, Math.min(100, Number(o.warmth))) / 100;
    img = img.recomb([
      [1 + 0.12 * w, 0, 0],
      [0, 1 + 0.03 * w, 0],
      [0, 0, 1 - 0.12 * w],
    ]);
  }
  if (o.grayscale) img = img.grayscale();
  if (o.duotone) {
    const [a, b] = String(o.duotone).split(',').map(hexToRgb);
    const { data, info } = await img.clone().grayscale().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      const t = data[i * info.channels] / 255;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(a[c] + (b[c] - a[c]) * t);
    }
    img = sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png();
  }

  // Finish
  if (o.sharpen) img = img.sharpen();
  if (o.blur) img = img.blur(Math.max(0.3, Number(o.blur)));

  let buf = await img.toBuffer();
  const meta = await sharp(buf).metadata();
  const overlays = [];
  if (o.tint) {
    const strength = Math.max(0, Math.min(1, Number(o['tint-strength'] ?? 0.25)));
    const [r, g, b] = hexToRgb(o.tint);
    overlays.push({ input: { create: { width: meta.width, height: meta.height, channels: 4, background: { r, g, b, alpha: strength } } } });
  }
  if (o.vignette) {
    const v = Math.max(0, Math.min(1, Number(o.vignette)));
    const svg = `<svg width="${meta.width}" height="${meta.height}"><defs><radialGradient id="g" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${v}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    overlays.push({ input: Buffer.from(svg) });
  }
  if (overlays.length) buf = await sharp(buf).composite(overlays).toBuffer();

  let out = sharp(buf);
  let file = output;
  if (o.round) {
    const r = Number(o.round);
    const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><rect width="100%" height="100%" rx="${r}" ry="${r}"/></svg>`);
    out = sharp(await out.ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer());
    if (!/\.png$/i.test(file)) file = file.replace(/\.[a-z0-9]+$/i, '') + '.png';
  }

  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  const quality = Number(o.quality) || 90;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') out = out.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
  else if (ext === '.webp') out = out.webp({ quality });
  else out = out.png();
  const info = await out.toFile(file);
  console.log(`Saved ${path.resolve(file)} (${info.width}×${info.height})`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
