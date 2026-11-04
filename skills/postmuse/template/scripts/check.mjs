#!/usr/bin/env node
// Checks the brand kit's fonts and the posts' HTML against the Atelier post format, without a browser.
// Usage: npm run check            (brand + every post)
//        npm run check -- <slug>  (brand + one post; a post in a folder is <folder>/<slug>)
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui', 'fantasy']);
let errors = 0, warnings = 0;
const err = (where, msg) => { errors++; console.log(`  ✗ ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  ⚠ ${where}: ${msg}`); };
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const num = (v) => (v == null ? null : parseFloat(v));

async function checkBrand() {
  console.log('Brand kit');
  let brand;
  try { brand = JSON.parse(await readFile(path.join(ROOT, 'brand/brand.json'), 'utf8')); }
  catch (e) { err('brand.json', `can't read it (${e.message})`); return { families: new Set() }; }
  if (!brand.name) warn('brand.json', '"name" is empty, so the brand kit is not set up yet');
  for (const c of brand.colors || []) if (!/^#[0-9a-f]{6}$/i.test(c.hex || '')) err('brand.json', `color "${c.name}" needs a 6-digit hex, got "${c.hex}"`);
  if (brand.logo && brand.logo.startsWith('/brand/') && !(await exists(path.join(ROOT, brand.logo)))) err('brand.json', `logo ${brand.logo} not found`);
  const families = new Set();
  for (const f of brand.fonts || []) {
    families.add(f.family);
    const dir = path.join(ROOT, 'node_modules/@fontsource', f.package || '', 'files');
    if (!f.package || !(await exists(dir))) { err('fonts', `${f.family}: package missing, run: npm install @fontsource/${f.package || '<package>'}`); continue; }
    const styles = f.italic === 'only' ? ['italic'] : f.italic ? ['normal', 'italic'] : ['normal'];
    const missing = [];
    for (const w of f.weights || [400]) for (const s of styles) {
      if (!(await exists(path.join(dir, `${f.package}-latin-${w}-${s}.woff2`)))) missing.push(`${w} ${s}`);
    }
    if (missing.length) err('fonts', `${f.family}: no files for ${missing.join(', ')} (check: ls ${path.relative(ROOT, dir)})`);
  }
  if (!errors) console.log('  ✓ fonts and colors look good');
  return { families };
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z-:]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  return out;
}
function styleOf(s = '') {
  const out = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

async function checkPost(slug, families) {
  const dir = path.join(ROOT, 'posts', slug);
  console.log(`\nPost: ${slug}`);
  const before = errors + warnings;
  let html;
  try { html = await readFile(path.join(dir, 'post.html'), 'utf8'); } catch { err(slug, 'post.html missing'); return; }
  if (!(await exists(path.join(dir, 'post.json')))) warn(slug, 'post.json missing (title shows as the folder name)');

  const trimmed = html.trim();
  const root = trimmed.match(/^<div\b[^>]*>/);
  const rootAttrs = root ? attrs(root[0]) : {};
  if (!root || !('data-post' in rootAttrs)) { err(slug, 'must start with <div data-post …> as the only root element'); return; }
  if (!trimmed.endsWith('</div>')) err(slug, 'the root <div data-post> must be the last thing in the file');
  const W = num(rootAttrs['data-w']), H = num(rootAttrs['data-h']);
  if (!W || !H) err(slug, 'root needs data-w and data-h');
  for (const [re, what] of [[/<style\b/i, '<style> blocks'], [/<script\b/i, '<script> tags'], [/<link\b/i, '<link> tags'], [/\sclass\s*=/i, 'class attributes'], [/var\(--/, 'CSS variables'], [/https?:\/\//i, 'remote URLs']]) {
    if (re.test(html)) err(slug, `${what} are not allowed; inline styles and local files only`);
  }
  if (/\p{Extended_Pictographic}/u.test(html.replace(/<[^>]*>/g, ''))) warn(slug, 'emoji in the text; they export inconsistently');

  const names = new Map();
  for (const m of html.matchAll(/<([a-zA-Z0-9]+)\b[^>]*>/g)) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[0]);
    const st = styleOf(a.style);
    const label = a['data-el'] ? `"${a['data-el']}"` : `<${tag}>`;
    if (a['data-el']) names.set(a['data-el'], (names.get(a['data-el']) || 0) + 1);

    for (const fam of (st['font-family'] || '').split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)) {
      if (!GENERIC.has(fam) && !families.has(fam)) warn(label, `font "${fam}" is not in brand.json, so it won't load or export`);
    }
    if (tag === 'img') {
      const src = a.src || '';
      if (!src) err(label, 'image has no src');
      else if (src.startsWith('assets/') && !(await exists(path.join(dir, src)))) err(label, `${src} not found in posts/${slug}/`);
      else if (src.startsWith('/brand/') && !(await exists(path.join(ROOT, src)))) err(label, `${src} not found`);
      else if (!src.startsWith('assets/') && !src.startsWith('/brand/')) err(label, `src must be assets/… or /brand/…, got ${src}`);
      if (!st.width || !st.height) warn(label, 'give images an explicit width and height');
      if (!('alt' in a)) warn(label, 'add alt text');
    }
    if (tag === 'svg' && 'data-curve' in a) {
      const bend = Math.abs(num(a['data-bend']) ?? 100), h = num(st.height);
      if (h != null && h < bend + 20) warn(label, `curved text box (height ${h}) is shorter than its bend (${bend}); text may sit outside it`);
    }
    if (/^h[1-6]$|^p$/.test(tag) && !('margin' in st) && !('margin-top' in st)) warn(label, `<${tag}> has a default margin; add margin: 0`);

    if ((st.position || '') === 'absolute') {
      if (st.right || st.bottom) warn(label, 'uses right/bottom; use left/top so it drags predictably');
      if (st.left == null || st.top == null) warn(label, 'absolute element without left and top');
      if (/translate/i.test(st.transform || '')) warn(label, 'uses translate; use left/top (transform is only for rotate)');
      const L = num(st.left), T = num(st.top), w = num(st.width), h = num(st.height);
      if (W && L != null && w != null && (L >= W || L + w <= 0)) warn(label, 'sits entirely outside the frame horizontally');
      if (H && T != null && h != null && (T >= H || T + h <= 0)) warn(label, 'sits entirely outside the frame vertically');
      if (a['data-el'] && W && H && L != null && T != null && !/sparkle|dot|blob|shape|sun|circle|bg|background|photo|image|strip|band|bar|tape|decor|divider|line|rule|border|frame/i.test(a['data-el'])) {
        const right = w != null ? L + w : L, bottom = h != null ? T + h : T;
        if (L < 40 || T < 40 || right > W - 40 || bottom > H - 40) warn(label, 'is within 40px of the edge (fine for decoration, risky for text)');
      }
    }
  }
  for (const [n, count] of names) if (count > 1) err(slug, `data-el "${n}" is used ${count} times; names must be unique`);
  if (!names.size) warn(slug, 'no data-el names; nothing will show in Layers');
  if (errors + warnings === before) console.log('  ✓ looks good');
}

const { families } = await checkBrand();
const only = process.argv[2];
// Posts sit in posts/<slug>/ or, one level down, in a folder: posts/<folder>/<slug>/.
async function findPosts() {
  const out = [];
  const dirs = async (rel) => (await readdir(path.join(ROOT, 'posts', rel), { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
  for (const name of await dirs('')) {
    if (await exists(path.join(ROOT, 'posts', name, 'post.html'))) out.push(name);
    else for (const sub of await dirs(name)) if (await exists(path.join(ROOT, 'posts', name, sub, 'post.html'))) out.push(`${name}/${sub}`);
  }
  return out;
}
const slugs = only ? [only] : await findPosts();
for (const slug of slugs) await checkPost(slug, families);
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
console.log('Note: this does not measure rendered text. Open the post in Atelier to check for overflow and overlaps.');
process.exit(errors ? 1 : 0);
