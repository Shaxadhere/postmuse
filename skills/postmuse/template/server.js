// Atelier: serves the post editor and reads/writes posts in ./posts. No framework, no build step.
import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const POSTS = path.join(ROOT, 'posts');
const BRAND = path.join(ROOT, 'brand');
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

function slugify(text) {
  return String(text || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'post';
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
  await mkdir(path.join(POSTS, slug, 'assets'), { recursive: true });
  const html = `<div data-post data-w="${w}" data-h="${h}" style="position: relative; overflow: hidden; width: ${w}px; height: ${h}px; background: ${bg}; font-family: ${family}; color: ${ink};">\n</div>\n`;
  await writeFile(path.join(POSTS, slug, 'post.html'), html);
  await writeFile(path.join(POSTS, slug, 'post.json'), JSON.stringify({ title: title || 'Untitled post', idea: '', format: format || `${w}x${h}` }, null, 2) + '\n');
  return slug;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'posts', slug, …]
  if (parts[1] === 'brand' && req.method === 'GET') return send(res, 200, await readBrand());
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
    await writeFile(path.join(dir, 'post.html'), html.trimEnd() + '\n');
    return send(res, 200, { ok: true });
  }

  // POST /api/posts/:slug/assets?name=photo.jpg  (raw file body)
  if (parts[3] === 'assets' && req.method === 'POST') {
    const raw = path.basename(url.searchParams.get('name') || 'image.png').toLowerCase();
    const ext = path.extname(raw);
    if (!IMAGE_EXT.has(ext)) return send(res, 400, { error: 'Images only' });
    const base = raw.slice(0, -ext.length).replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    let name = base + ext;
    for (let i = 2; await exists(path.join(dir, 'assets', name)); i++) name = `${base}-${i}${ext}`;
    await writeFile(path.join(dir, 'assets', name), await readBody(req));
    return send(res, 200, { src: `assets/${name}` });
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
    send(res, err.status || 500, { error: err.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Atelier is open → http://localhost:${PORT}`);
});
