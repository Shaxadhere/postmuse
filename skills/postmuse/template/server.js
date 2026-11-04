// Atelier: serves the post editor and reads/writes posts in ./posts. No framework, no build step.
import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const POSTS = path.join(ROOT, 'posts');
const BRAND = path.join(ROOT, 'brand');
const PHOTOS = path.join(ROOT, 'photos');
const MOVES = path.join(PHOTOS, '.moves.json');
const FONTSOURCE = path.join(ROOT, 'node_modules/@fontsource');
const PORT = Number(process.env.PORT) || 4747;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.md': 'text/markdown; charset=utf-8',
};
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Only these folders are served; everything else (server.js, .claude, …) stays private.
const STATIC = [
  ['/editor/', path.join(ROOT, 'editor')],
  ['/brand/', BRAND],
  ['/posts/', POSTS],
  ['/photos/', PHOTOS],
  ['/vendor/html-to-image/', path.join(ROOT, 'node_modules/html-to-image/dist')],
  ['/vendor/fontsource/', FONTSOURCE],
];

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function readBrand() {
  try { return JSON.parse(await readFile(path.join(BRAND, 'brand.json'), 'utf8')); } catch { return { name: '', colors: [], fonts: [] }; }
}

// @font-face rules for every font in brand.json, pointing at the installed @fontsource package.
// Absolute URLs matter: PNG export can only embed fonts it can fetch by URL.
async function fontsCss() {
  const brand = await readBrand();
  const rules = [];
  const missing = [];
  for (const font of brand.fonts || []) {
    const pkg = font.package;
    if (!pkg || !/^[a-z0-9-]+$/.test(pkg)) continue;
    const styles = font.italic === 'only' ? ['italic'] : font.italic ? ['normal', 'italic'] : ['normal'];
    let found = 0;
    for (const weight of font.weights || [400]) {
      for (const style of styles) {
        for (const subset of ['latin', 'latin-ext']) {
          const file = `${pkg}-${subset}-${weight}-${style}.woff2`;
          if (!(await exists(path.join(FONTSOURCE, pkg, 'files', file)))) continue;
          found++;
          rules.push(`@font-face { font-family: '${font.family}'; font-style: ${style}; font-weight: ${weight}; font-display: block; ` +
            `src: url(/vendor/fontsource/${pkg}/files/${file}) format('woff2');${subset === 'latin-ext' ? ' unicode-range: U+0100-024F, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF;' : ''} }`);
        }
      }
    }
    if (!found) missing.push(`${font.family} (npm install @fontsource/${pkg})`);
  }
  if (missing.length) rules.unshift(`/* Missing font files: ${missing.join(', ')} */`);
  return rules.join('\n') + '\n';
}

async function listPosts() {
  await mkdir(POSTS, { recursive: true });
  const out = [];
  for (const entry of await readdir(POSTS, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
    const dir = path.join(POSTS, entry.name);
    if (!(await exists(path.join(dir, 'post.html')))) continue;
    let meta = {};
    try { meta = JSON.parse(await readFile(path.join(dir, 'post.json'), 'utf8')); } catch {}
    const { mtimeMs } = await stat(path.join(dir, 'post.html'));
    out.push({ slug: entry.name, title: meta.title || entry.name, idea: meta.idea || '', format: meta.format || '', updated: mtimeMs });
  }
  return out.sort((a, b) => b.updated - a.updated);
}

function slugify(text, fallback = 'post') {
  return String(text || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback;
}

async function createPost({ title, w, h, format }) {
  w = Math.min(4000, Math.max(100, Number(w) || 1080));
  h = Math.min(4000, Math.max(100, Number(h) || 1350));
  const brand = await readBrand();
  const bg = brand.colors?.find((c) => /background|paper|base/i.test(c.name))?.hex || '#ffffff';
  const ink = brand.colors?.find((c) => /ink|text/i.test(c.name))?.hex || '#111111';
  const body = brand.fonts?.find((f) => /body/i.test(f.name)) || brand.fonts?.[0];
  const family = body ? `'${body.family}', sans-serif` : 'sans-serif';
  let slug = slugify(title);
  for (let i = 2; await exists(path.join(POSTS, slug)); i++) slug = `${slugify(title)}-${i}`;
  await mkdir(path.join(POSTS, slug), { recursive: true });
  const html = `<div data-post data-w="${w}" data-h="${h}" style="position: relative; overflow: hidden; width: ${w}px; height: ${h}px; background: ${bg}; font-family: ${family}; color: ${ink};">\n</div>\n`;
  await writeFile(path.join(POSTS, slug, 'post.html'), html);
  await writeFile(path.join(POSTS, slug, 'post.json'), JSON.stringify({ title: title || 'Untitled post', idea: '', format: format || `${w}x${h}` }, null, 2) + '\n');
  return slug;
}

// ---------- photo library: photos/<file> (Unsorted) and photos/<folder>/<file>, one level of folders ----------
// Posts use these as src="/photos/<folder>/<file>". The browser sends paths like "folder/file.jpg";
// anything absolute, with "..", a backslash or a dotfile is refused so nothing outside photos/ is touched.
function photoPath(rel, kind = 'file') {
  rel = String(rel ?? '');
  const parts = rel.split('/');
  const bad = !rel || path.isAbsolute(rel) || /[\\\0]/.test(rel) || parts.length > (kind === 'file' ? 2 : 1) ||
    parts.some((p) => !p || p.startsWith('.') || p.length > 128) ||
    (kind === 'file' && !IMAGE_EXT.has(path.extname(rel).toLowerCase()));
  const abs = path.resolve(PHOTOS, rel);
  if (bad || !abs.startsWith(PHOTOS + path.sep)) throw Object.assign(new Error(`Bad ${kind} name`), { status: 400 });
  return abs;
}
const folderPath = (name) => (name ? photoPath(name, 'folder') : PHOTOS);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fileRef = (rel, flags = '') => new RegExp(`/photos/${escapeRe(rel)}(?![\\w.-])`, flags);
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, extra });
const isImageEntry = (e) => e.isFile() && !e.name.startsWith('.') && IMAGE_EXT.has(path.extname(e.name).toLowerCase());
// A src or url() value inside post.html: after a quote, "(" or the ";" of &quot;.
const quotedRef = (ref) => new RegExp(`(["'(;])${escapeRe(ref)}(?![\\w.-])`, 'g');
const usersOf = (rel, posts) => posts.filter((p) => fileRef(rel).test(p.html)).map((p) => ({ slug: p.slug, title: p.title }));

async function postHtmls() {
  const out = [];
  for (const p of await listPosts()) out.push({ ...p, html: await readFile(path.join(POSTS, p.slug, 'post.html'), 'utf8') });
  return out;
}

// Rewrites saved posts after a move or rename so their photos keep working.
async function rewriteRefs(pattern, replacement) {
  const changed = [];
  for (const p of await postHtmls()) {
    const html = p.html.replace(pattern, () => replacement);
    if (html !== p.html) { await writeFile(path.join(POSTS, p.slug, 'post.html'), html); changed.push(p.slug); }
  }
  return changed;
}

// ---------- moves log: lets a post saved from an older editor tab follow photos that moved since ----------
// Entries are { from, to } in post.html form ("/photos/a/x.jpg", or "/photos/a/" for a whole folder),
// plus { post, from: "assets/x.jpg", to } for photos imported from a post's old assets/ folder.
async function readMoves() {
  try { return JSON.parse(await readFile(MOVES, 'utf8')); } catch { return []; }
}
async function logMoves(entries) {
  if (!entries.length) return;
  await mkdir(PHOTOS, { recursive: true });
  await writeFile(MOVES, JSON.stringify([...(await readMoves()), ...entries].slice(-1000)) + '\n');
}
function refFile(slug, ref) {
  const file = ref.startsWith('assets/') ? path.resolve(POSTS, slug, ref) : path.resolve(ROOT, '.' + ref);
  return file.startsWith((ref.startsWith('assets/') ? path.join(POSTS, slug) : PHOTOS) + path.sep) ? file : null;
}
async function fixStaleRefs(slug, html) {
  const moves = await readMoves();
  if (!moves.length) return html;
  const refs = new Set([...html.matchAll(/["'(;](\/photos\/[^"'()\s&]+|assets\/[^"'()\s&]+)/g)].map((m) => m[1]));
  for (const ref of refs) {
    let now = ref;
    for (let hop = 0; hop < 20; hop++) {
      const file = refFile(slug, now);
      if (!file || (await exists(file))) break;
      const m = moves.findLast((m) => (!m.post || m.post === slug) && (now === m.from || (m.from.endsWith('/') && now.startsWith(m.from))));
      if (!m) break;
      now = m.to + now.slice(m.from.length);
    }
    if (now !== ref && refFile(slug, now) && (await exists(refFile(slug, now)))) html = html.replace(quotedRef(ref), (_, pre) => pre + now);
  }
  return html;
}

// ---------- old layout: photos inside posts/<slug>/assets/, imported into photos/<slug>/ on request ----------
async function legacyFiles(slug) {
  try { return (await readdir(path.join(POSTS, slug, 'assets'), { withFileTypes: true })).filter(isImageEntry).map((e) => e.name); } catch { return []; }
}
async function listLegacy() {
  const out = [];
  for (const p of await listPosts()) {
    const count = (await legacyFiles(p.slug)).length;
    if (count) out.push({ slug: p.slug, title: p.title, count });
  }
  return out;
}
async function importLegacy() {
  const moves = [];
  for (const p of await listPosts()) {
    const files = await legacyFiles(p.slug);
    if (!files.length) continue;
    const dir = folderPath(p.slug);
    await mkdir(dir, { recursive: true });
    const htmlFile = path.join(POSTS, p.slug, 'post.html');
    let html = await readFile(htmlFile, 'utf8');
    for (const file of files) {
      const name = await uniqueFile(dir, file);
      await rename(path.join(POSTS, p.slug, 'assets', file), path.join(dir, name));
      const from = `assets/${file}`, to = `/photos/${p.slug}/${name}`;
      html = html.replace(quotedRef(from), (_, pre) => pre + to);
      moves.push({ post: p.slug, from, to });
    }
    await writeFile(htmlFile, html);
    try { await rmdir(path.join(POSTS, p.slug, 'assets')); } catch {} // only goes if nothing else is left in it
  }
  await logMoves(moves);
  return moves.length;
}

async function listPhotos() {
  await mkdir(PHOTOS, { recursive: true });
  const posts = await postHtmls();
  const folders = [{ name: '', photos: [] }];
  const add = async (folder, file) => {
    const rel = folder.name ? `${folder.name}/${file}` : file;
    const { size, mtimeMs } = await stat(path.join(PHOTOS, rel));
    folder.photos.push({ name: file, path: rel, src: `/photos/${rel}`, size, updated: mtimeMs, usedBy: usersOf(rel, posts) });
  };
  for (const entry of await readdir(PHOTOS, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) folders.push({ name: entry.name, photos: [] });
    else if (isImageEntry(entry)) await add(folders[0], entry.name);
  }
  for (const folder of folders.slice(1)) {
    for (const entry of await readdir(path.join(PHOTOS, folder.name), { withFileTypes: true })) if (isImageEntry(entry)) await add(folder, entry.name);
  }
  for (const folder of folders) folder.photos.sort((a, b) => b.updated - a.updated);
  return [folders[0], ...folders.slice(1).sort((a, b) => a.name.localeCompare(b.name))];
}

function usedError(name, usedBy) {
  const titles = [...new Set(usedBy.map((u) => `“${u.title}”`))].join(', ');
  return fail(409, `${name} is used in ${titles}. Remove it from ${usedBy.length > 1 ? 'those posts' : 'that post'} first.`, { usedBy });
}

async function uniqueFile(dir, file) {
  const ext = path.extname(file), base = file.slice(0, -ext.length);
  let name = file;
  for (let i = 2; await exists(path.join(dir, name)); i++) name = `${base}-${i}${ext}`;
  return name;
}

async function handlePhotos(req, res, url, parts) {
  const json = async () => JSON.parse((await readBody(req)).toString('utf8') || '{}');
  const q = (k) => url.searchParams.get(k) || '';

  if (parts.length === 2 && req.method === 'GET') return send(res, 200, { folders: await listPhotos(), legacy: await listLegacy() });

  // POST /api/photos/import  moves every post's old assets/ photos into photos/<slug>/
  if (parts[2] === 'import' && req.method === 'POST') return send(res, 200, { moved: await importLegacy() });

  // POST /api/photos?folder=summer&name=photo.jpg  (raw file body)
  if (parts.length === 2 && req.method === 'POST') {
    const raw = path.basename(q('name') || 'image.png').toLowerCase();
    const ext = path.extname(raw);
    if (!IMAGE_EXT.has(ext)) return send(res, 400, { error: 'Images only' });
    const base = raw.slice(0, -ext.length).replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    const dir = folderPath(q('folder'));
    await mkdir(dir, { recursive: true });
    const name = await uniqueFile(dir, base + ext);
    await writeFile(path.join(dir, name), await readBody(req));
    const rel = q('folder') ? `${q('folder')}/${name}` : name;
    return send(res, 200, { path: rel, src: `/photos/${rel}` });
  }

  // DELETE /api/photos?path=summer/photo.jpg  (refused while a post uses it)
  if (parts.length === 2 && req.method === 'DELETE') {
    const rel = q('path');
    const file = photoPath(rel);
    if (!(await exists(file))) return send(res, 404, { error: 'No such photo' });
    const usedBy = usersOf(rel, await postHtmls());
    if (usedBy.length) throw usedError(`“${path.basename(rel)}”`, usedBy);
    await rm(file);
    return send(res, 200, { ok: true });
  }

  // POST /api/photos/move  { path: "summer/photo.jpg", folder: "winter" }  ("" = Unsorted)
  if (parts[2] === 'move' && req.method === 'POST') {
    const { path: rel, folder = '' } = await json();
    const from = photoPath(rel);
    const dir = folderPath(folder);
    if (!(await exists(from))) return send(res, 404, { error: 'No such photo' });
    if (!(await exists(dir))) return send(res, 404, { error: 'No such folder' });
    if (path.dirname(from) === dir) return send(res, 200, { path: rel, updated: [] });
    const name = await uniqueFile(dir, path.basename(from));
    const to = folder ? `${folder}/${name}` : name;
    await rename(from, path.join(dir, name));
    await logMoves([{ from: `/photos/${rel}`, to: `/photos/${to}` }]);
    return send(res, 200, { path: to, updated: await rewriteRefs(fileRef(rel, 'g'), `/photos/${to}`) });
  }

  if (parts[2] !== 'folders') return send(res, 404, { error: 'Not found' });

  // POST /api/photos/folders  { name: "Summer shoot" } → photos/summer-shoot/
  if (req.method === 'POST') {
    const name = slugify((await json()).name, 'folder');
    const dir = folderPath(name);
    if (await exists(dir)) return send(res, 409, { error: `A folder called “${name}” already exists` });
    await mkdir(dir);
    return send(res, 200, { name });
  }

  // PUT /api/photos/folders  { from: "summer", to: "Summer 2026" }
  if (req.method === 'PUT') {
    const body = await json();
    const from = folderPath(body.from), name = slugify(body.to, 'folder');
    if (!body.from || !(await exists(from))) return send(res, 404, { error: 'No such folder' });
    if (name === body.from) return send(res, 200, { name, updated: [] });
    if (await exists(folderPath(name))) return send(res, 409, { error: `A folder called “${name}” already exists` });
    await rename(from, folderPath(name));
    await logMoves([{ from: `/photos/${body.from}/`, to: `/photos/${name}/` }]);
    return send(res, 200, { name, updated: await rewriteRefs(new RegExp(`/photos/${escapeRe(body.from)}/`, 'g'), `/photos/${name}/`) });
  }

  // DELETE /api/photos/folders?name=summer  (deletes its photos too; refused while a post uses any of them)
  if (req.method === 'DELETE') {
    const name = q('name');
    const dir = folderPath(name);
    if (!name || !(await exists(dir))) return send(res, 404, { error: 'No such folder' });
    const folder = (await listPhotos()).find((f) => f.name === name);
    const usedBy = folder.photos.flatMap((p) => p.usedBy);
    if (usedBy.length) throw usedError(`A photo in “${name}”`, usedBy);
    await rm(dir, { recursive: true });
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method not allowed' });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'posts', slug, …]
  if (parts[1] === 'brand' && req.method === 'GET') return send(res, 200, await readBrand());
  if (parts[1] === 'photos') return handlePhotos(req, res, url, parts);
  if (parts[1] !== 'posts') return send(res, 404, { error: 'Not found' });
  if (parts.length === 2 && req.method === 'GET') return send(res, 200, await listPosts());
  if (parts.length === 2 && req.method === 'POST') {
    const slug = await createPost(JSON.parse((await readBody(req)).toString('utf8') || '{}'));
    return send(res, 200, { slug });
  }

  const slug = parts[2];
  if (!SLUG.test(slug || '')) return send(res, 400, { error: 'Bad post name' });
  const dir = path.join(POSTS, slug);
  if (!(await exists(dir))) return send(res, 404, { error: 'No such post' });

  if (parts.length === 3 && req.method === 'GET') {
    const html = await readFile(path.join(dir, 'post.html'), 'utf8');
    let meta = {};
    try { meta = JSON.parse(await readFile(path.join(dir, 'post.json'), 'utf8')); } catch {}
    return send(res, 200, { slug, meta, html });
  }

  if (parts.length === 3 && req.method === 'PUT') {
    const { html } = JSON.parse((await readBody(req)).toString('utf8'));
    if (typeof html !== 'string' || !html.includes('data-post')) return send(res, 400, { error: 'Missing post root' });
    // The editor may still hold paths to photos that were moved since it opened; save the current ones.
    const fixed = await fixStaleRefs(slug, html.trimEnd());
    await writeFile(path.join(dir, 'post.html'), fixed + '\n');
    return send(res, 200, fixed === html.trimEnd() ? { ok: true } : { ok: true, html: fixed });
  }

  return send(res, 405, { error: 'Method not allowed' });
}

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/editor/index.html';
  if (pathname === '/brand/fonts.css') return send(res, 200, await fontsCss(), TYPES['.css']);
  for (const [prefix, dir] of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.normalize(path.join(dir, pathname.slice(prefix.length)));
    if (!file.startsWith(dir + path.sep)) break;
    try {
      const body = await readFile(file);
      return send(res, 200, body, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch {
      break;
    }
  }
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (err) {
    send(res, err.status || 500, { error: err.message, ...err.extra });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Atelier is open → http://localhost:${PORT}`);
});
