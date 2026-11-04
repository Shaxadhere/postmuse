// Atelier editor. A post is one <div data-post> whose editable parts carry data-el="Name".
// Colors and fonts come from brand/brand.json (served at /api/brand).
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const slug = params.get('post');

let brandKit = { name: '', colors: [], fonts: [] };
let BRAND = [];   // swatch hex values
let FONTS = {};   // key "Family|style" → { label, family, style }
let WEIGHTS = []; // weight options offered in the panel

async function loadBrand() {
  try { brandKit = await (await fetch('/api/brand')).json(); } catch {}
  BRAND = [...new Set([...(brandKit.colors || []).map((c) => c.hex.toLowerCase()), '#ffffff', '#000000'])];
  FONTS = {};
  const weights = new Set([400]);
  for (const f of brandKit.fonts || []) {
    const styles = f.italic === 'only' ? ['italic'] : f.italic ? ['normal', 'italic'] : ['normal'];
    for (const style of styles) {
      FONTS[`${f.family}|${style}`] = { label: f.family + (style === 'italic' ? ' Italic' : ''), family: `'${f.family}', ${/serif/i.test(f.family) && !/sans/i.test(f.family) ? 'serif' : 'sans-serif'}`, style };
    }
    (f.weights || []).forEach((w) => weights.add(Number(w)));
  }
  if (!Object.keys(FONTS).length) FONTS['system-ui|normal'] = { label: 'System', family: 'system-ui, sans-serif', style: 'normal' };
  WEIGHTS = [...weights].sort((a, b) => a - b).map((w) => [String(w), String(w)]);
  $('brandName').textContent = brandKit.name || '';
}
const brandFont = (role) => (brandKit.fonts || []).find((f) => f.name?.toLowerCase() === role) || (brandKit.fonts || [])[0];
const brandColor = (re, fallback) => (brandKit.colors || []).find((c) => re.test(c.name))?.hex || fallback;

let post = null;          // the [data-post] element inside the stage
let W = 1080, H = 1350;
let scale = 0.5;
let selected = null;
let editingText = null;
let current = '';         // serialized post as last committed
const history = [];
const future = [];
let savedHtml = '';

// ---------- small helpers ----------
const px = (v) => (v === '' || v == null ? '' : `${Math.round(v)}px`);
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const isCurve = (el) => el?.matches?.('svg[data-curve]');
const isImage = (el) => el?.tagName === 'IMG';
const isTextEl = (el) => el && !isImage(el) && !isCurve(el) && el.tagName !== 'svg' &&
  [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
const elements = () => (post ? [...post.querySelectorAll('[data-el]')] : []);
const isAbsolute = (el) => getComputedStyle(el).position === 'absolute';
// SVG elements have no offset* properties, so fall back to their inline style / rendered size.
const boxLeft = (el) => el.offsetLeft ?? num(el.style.left);
const boxTop = (el) => el.offsetTop ?? num(el.style.top);
const boxWidth = (el) => el.offsetWidth ?? num(el.style.width, el.getBoundingClientRect().width / scale);
const boxHeight = (el) => el.offsetHeight ?? num(el.style.height, el.getBoundingClientRect().height / scale);
const moveTargetFor = (el) => {
  for (let n = el; n && n !== post; n = n.parentElement) if (n.hasAttribute('data-el') && isAbsolute(n)) return n;
  return null;
};

function toHex(color) {
  if (!color || color === 'transparent') return '#000000';
  if (color.startsWith('#')) return color.length === 4 ? '#' + [...color.slice(1)].map((c) => c + c).join('') : color.slice(0, 7);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return '#000000';
  const [r, g, b] = m[1].split(/[\s,\/]+/).map(Number);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function rotationOf(el) { const m = (el.style.transform || '').match(/rotate\((-?[\d.]+)deg\)/); return m ? num(m[1]) : 0; }
function setStatus(text, dirty = false) { const s = $('status'); s.textContent = text; s.classList.toggle('dirty', dirty); }

// ---------- asset paths: post.html stores "assets/x.png"; the editor needs "/posts/<slug>/assets/x.png" ----------
const assetBase = () => `/posts/${slug}/assets/`;
function absolutizeAssets(root) {
  for (const el of root.querySelectorAll('[src], image[href]')) {
    const attr = el.hasAttribute('src') ? 'src' : 'href';
    const v = el.getAttribute(attr);
    if (v && v.startsWith('assets/')) el.setAttribute(attr, assetBase() + v.slice(7));
  }
  for (const el of root.querySelectorAll('[style*="assets/"]')) {
    el.setAttribute('style', el.getAttribute('style').replace(/url\((['"]?)assets\//g, `url($1${assetBase()}`));
  }
}

// ---------- serialize / restore ----------
function serialize() {
  const clone = post.cloneNode(true);
  for (const el of clone.querySelectorAll('[contenteditable]')) { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); }
  for (const el of clone.querySelectorAll('[draggable]')) el.removeAttribute('draggable');
  return clone.outerHTML.split(assetBase()).join('assets/');
}

function mount(html) {
  const stage = $('stage');
  stage.innerHTML = html;
  post = stage.querySelector('[data-post]');
  if (!post) { stage.innerHTML = '<p style="padding:40px">This post has no &lt;div data-post&gt; root.</p>'; return; }
  absolutizeAssets(post);
  W = num(post.dataset.w, 1080); H = num(post.dataset.h, 1350);
  post.style.width = px(W); post.style.height = px(H);
  post.querySelectorAll('svg[data-curve]').forEach(layoutCurve);
  for (const img of post.querySelectorAll('img')) { img.draggable = false; img.addEventListener('load', updateSelBox); }
  applyZoom();
  renderLayers();
}

function restore(html) {
  const idx = selected ? elements().indexOf(selected) : -1;
  mount(html);
  select(idx >= 0 ? elements()[idx] || null : null);
  updateDirty();
}

function commit() {
  if (!post) return;
  const now = serialize();
  if (now === current) return;
  history.push(current);
  if (history.length > 150) history.shift();
  future.length = 0;
  current = now;
  updateDirty();
  renderLayers();
  updateSelBox();
}
function undo() { if (!history.length) return; finishTextEdit(); future.push(current); current = history.pop(); restore(current); }
function redo() { if (!future.length) return; finishTextEdit(); history.push(current); current = future.pop(); restore(current); }
function updateDirty() {
  const dirty = current !== savedHtml;
  setStatus(dirty ? 'Unsaved changes' : 'Saved', dirty);
  $('undo').disabled = !history.length; $('redo').disabled = !future.length;
}

// ---------- curved text ----------
function layoutCurve(svg) {
  const w = num(svg.style.width, svg.clientWidth || 600);
  const h = num(svg.style.height, svg.clientHeight || 200);
  const bend = num(svg.dataset.bend, 100);
  let path = svg.querySelector('path');
  if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.prepend(path); }
  if (!path.id || document.querySelectorAll(`[id="${path.id}"]`).length > 1) path.id = 'curve-' + Math.random().toString(36).slice(2, 8);
  const base = h - 12;
  path.setAttribute('d', `M 0 ${base} Q ${w / 2} ${base - bend * 2} ${w} ${base}`);
  path.setAttribute('fill', 'none');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.overflow = 'visible';
  const tp = svg.querySelector('textPath');
  if (tp) { tp.setAttribute('href', '#' + path.id); tp.setAttribute('startOffset', '50%'); }
  const text = svg.querySelector('text');
  if (text) text.setAttribute('text-anchor', 'middle');
}

// ---------- zoom ----------
function fitScale() {
  const vp = $('viewport');
  const pad = vp.clientWidth < 600 ? 32 : 64;
  return Math.max(0.1, Math.min((vp.clientWidth - pad) / W, (vp.clientHeight - pad) / H, 1));
}
function applyZoom() {
  $('stage').style.transform = `scale(${scale})`;
  $('stageWrap').style.width = px(W * scale);
  $('stageWrap').style.height = px(H * scale);
  $('zoom').value = Math.round(scale * 100);
  $('zoomVal').textContent = Math.round(scale * 100) + '%';
  updateSelBox();
}

// ---------- selection ----------
function select(el) {
  if (selected !== el) finishTextEdit();
  selected = el;
  updateSelBox();
  renderLayers();
  renderPanel();
}
function updateSelBox() {
  const box = $('selBox');
  if (!selected || !selected.isConnected) { box.hidden = true; return; }
  const wrap = $('stageWrap').getBoundingClientRect();
  const r = selected.getBoundingClientRect();
  Object.assign(box.style, { left: px(r.left - wrap.left), top: px(r.top - wrap.top), width: px(r.width), height: px(r.height) });
  box.hidden = false;
}

function renderLayers() {
  const list = $('layerList');
  list.innerHTML = '';
  for (const el of elements()) {
    let depth = 0;
    for (let n = el.parentElement; n && n !== post; n = n.parentElement) if (n.hasAttribute('data-el')) depth++;
    const li = document.createElement('li');
    li.textContent = el.dataset.el || el.tagName.toLowerCase();
    li.style.paddingLeft = 8 + depth * 14 + 'px';
    li.classList.toggle('active', el === selected);
    li.onclick = () => select(el);
    list.append(li);
  }
}

// Turn right/bottom anchoring into left/top so dragging behaves.
function normalizeBox(el) {
  const s = el.style;
  if (s.right && s.right !== 'auto') { if (!s.width) s.width = px(boxWidth(el)); s.left = px(boxLeft(el)); s.right = ''; }
  if (s.bottom && s.bottom !== 'auto') { if (!s.height) s.height = px(boxHeight(el)); s.top = px(boxTop(el)); s.bottom = ''; }
  if (!s.left) s.left = px(boxLeft(el));
  if (!s.top) s.top = px(boxTop(el));
}

// ---------- pointer: select, drag, resize ----------
let drag = null;
$('stage').addEventListener('pointerdown', (e) => {
  if (!post || e.button !== 0) return;
  const hit = e.target.closest('[data-el]');
  if (hit && hit === editingText) return;              // clicking inside text being edited
  if (editingText && editingText.contains(e.target)) return;
  if (!hit || !post.contains(hit)) { select(null); return; }
  select(hit);
  const target = moveTargetFor(hit);
  if (!target) return;
  e.preventDefault();
  normalizeBox(target);
  drag = { kind: 'move', el: target, x: e.clientX, y: e.clientY, left: num(target.style.left), top: num(target.style.top), moved: false };
});

$('selBox').addEventListener('pointerdown', (e) => {
  const handle = e.target.dataset.handle;
  if (!handle || !selected) return;
  e.preventDefault(); e.stopPropagation();
  if (isAbsolute(selected)) normalizeBox(selected);
  drag = { kind: 'resize', handle, el: selected, x: e.clientX, y: e.clientY, w: boxWidth(selected), h: boxHeight(selected),
    ratio: boxWidth(selected) / Math.max(1, boxHeight(selected)), moved: false };
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / scale, dy = (e.clientY - drag.y) / scale;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
  drag.moved = true;
  const el = drag.el;
  if (drag.kind === 'move') {
    el.style.left = px(drag.left + dx);
    el.style.top = px(drag.top + dy);
  } else {
    let w = drag.w, h = drag.h;
    if (drag.handle !== 's') w = Math.max(10, drag.w + dx);
    if (drag.handle !== 'e') h = Math.max(10, drag.h + dy);
    if (drag.handle === 'se' && (isImage(el) || e.shiftKey)) h = w / drag.ratio;
    el.style.width = px(w);
    if (drag.handle !== 'e' || isImage(el)) el.style.height = px(h);
    if (isCurve(el)) layoutCurve(el);
  }
  updateSelBox();
  if (drag.kind === 'resize') renderPanel();
});
window.addEventListener('pointerup', () => {
  if (drag?.moved) { commit(); renderPanel(); }
  drag = null;
});

// ---------- text editing ----------
$('stage').addEventListener('dblclick', (e) => {
  const hit = e.target.closest('[data-el]');
  if (!hit || isImage(hit) || isCurve(hit)) return;
  // Edit the innermost text-bearing element so nested spans stay intact.
  let el = hit;
  if (!isTextEl(el)) {
    const inner = [...hit.querySelectorAll('*')].find((n) => isTextEl(n) && n.contains(e.target));
    if (inner) el = inner;
  }
  startTextEdit(el);
});
function startTextEdit(el) {
  finishTextEdit();
  editingText = el;
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('spellcheck', 'false');
  el.focus();
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  el.addEventListener('blur', finishTextEdit, { once: true });
}
function finishTextEdit() {
  const el = editingText;
  if (!el) return;
  editingText = null;
  el.removeAttribute('contenteditable');
  el.removeAttribute('spellcheck');
  commit();
  renderPanel();
}
document.addEventListener('paste', (e) => {
  if (!editingText) return;
  e.preventDefault();
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (editingText) {
    if (e.key === 'Escape') { e.preventDefault(); editingText.blur(); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
    return;
  }
  if (e.target.closest('input, textarea, select')) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (!selected) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
  if (e.key === 'Escape') { select(null); return; }
  if (e.key === 'Enter' && isTextEl(selected)) { e.preventDefault(); startTextEdit(selected); return; }
  const step = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  const target = d && moveTargetFor(selected);
  if (!target) return;
  e.preventDefault();
  normalizeBox(target);
  target.style.left = px(num(target.style.left) + d[0]);
  target.style.top = px(num(target.style.top) + d[1]);
  updateSelBox(); renderPanel();
  clearTimeout(keydown.timer); keydown.timer = setTimeout(commit, 300);
});
const keydown = {};

// ---------- actions ----------
function uniqueName(base) {
  const names = new Set(elements().map((el) => el.dataset.el));
  let name = base;
  for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
  return name;
}
function duplicate() {
  const copy = selected.cloneNode(true);
  copy.dataset.el = uniqueName(selected.dataset.el || 'Copy');
  copy.querySelectorAll('[data-el]').forEach((n) => (n.dataset.el = uniqueName(n.dataset.el)));
  if (isAbsolute(selected)) { normalizeBox(selected); copy.style.left = px(num(selected.style.left) + 24); copy.style.top = px(num(selected.style.top) + 24); }
  selected.after(copy);
  copy.querySelectorAll('svg[data-curve]').forEach((s) => { s.querySelector('path')?.removeAttribute('id'); });
  if (isCurve(copy)) { copy.querySelector('path')?.removeAttribute('id'); layoutCurve(copy); }
  copy.querySelectorAll('svg[data-curve]').forEach(layoutCurve);
  commit(); select(copy);
}
function remove() {
  const next = null;
  selected.remove();
  commit(); select(next);
}
function reorder(dir) {
  if (dir > 0 && selected.nextElementSibling) selected.nextElementSibling.after(selected);
  if (dir < 0 && selected.previousElementSibling) selected.previousElementSibling.before(selected);
  commit(); renderLayers(); updateSelBox();
}

function addText() {
  const el = document.createElement('div');
  el.dataset.el = uniqueName('Text');
  const font = brandFont('display');
  const weight = Math.max(...(font?.weights || [700]));
  el.setAttribute('style', `position: absolute; left: 120px; top: 120px; font-family: '${font?.family || 'system-ui'}', sans-serif; font-weight: ${weight}; font-size: 64px; line-height: 1.1; color: ${brandColor(/ink|text|dark/i, '#111111')}; white-space: nowrap;`);
  el.textContent = 'Your text';
  post.append(el);
  commit(); select(el); startTextEdit(el);
}

function addShape() {
  const el = document.createElement('div');
  el.dataset.el = uniqueName('Shape');
  el.setAttribute('style', `position: absolute; left: 200px; top: 200px; width: 320px; height: 200px; border-radius: 24px; background: ${brandColor(/accent|primary|brand/i, '#ff5a36')};`);
  post.append(el);
  commit(); select(el);
}

async function uploadImage(file) {
  setStatus('Uploading…');
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Upload failed'); updateDirty(); return null; }
  return assetBase() + data.src.slice('assets/'.length);
}
let pickMode = 'add';
function pickImage(mode) { pickMode = mode; $('fileInput').value = ''; $('fileInput').click(); }
$('fileInput').addEventListener('change', async () => {
  const file = $('fileInput').files[0];
  if (!file) return;
  const src = await uploadImage(file);
  if (!src) return;
  if (pickMode === 'replace' && isImage(selected)) {
    selected.src = src;
    selected.addEventListener('load', () => { updateSelBox(); commit(); }, { once: true });
  } else addImage(src);
});
function addImage(src) {
  const img = document.createElement('img');
  img.dataset.el = uniqueName('Image');
  img.alt = '';
  img.draggable = false;
  img.src = src;
  img.setAttribute('style', 'position: absolute; left: 0px; top: 0px; width: 540px; height: 540px; object-fit: cover;');
  post.append(img);
  img.addEventListener('load', () => {
    img.style.height = px(540 * img.naturalHeight / Math.max(1, img.naturalWidth));
    commit(); select(img);
  }, { once: true });
}
$('viewport').addEventListener('dragover', (e) => e.preventDefault());
$('viewport').addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  const src = await uploadImage(file);
  if (!src) return;
  const hit = e.target.closest?.('[data-el]');
  if (hit && isImage(hit)) { hit.src = src; hit.addEventListener('load', () => { select(hit); commit(); }, { once: true }); }
  else addImage(src);
});

// ---------- properties panel ----------
function field(label, input, full = false) {
  const l = document.createElement('label');
  if (full) l.className = 'full';
  l.append(label, input);
  return l;
}
function input(type, value, onInput, attrs = {}) {
  const i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') i.type = type;
  i.value = value;
  Object.assign(i, attrs);
  i.addEventListener('input', () => { onInput(i.value); updateSelBox(); });
  i.addEventListener('change', commit);
  return i;
}
function selectBox(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, label] of options) { const o = document.createElement('option'); o.value = v; o.textContent = label; s.append(o); }
  s.value = value;
  s.addEventListener('change', () => { onChange(s.value); commit(); updateSelBox(); });
  return s;
}
function colorField(label, value, onInput) {
  const wrap = document.createElement('div');
  const c = input('color', toHex(value), onInput);
  const sw = document.createElement('div'); sw.className = 'swatches';
  for (const hex of BRAND) {
    const b = document.createElement('button'); b.className = 'swatch'; b.style.background = hex; b.title = hex;
    b.onclick = () => { onInput(hex); c.value = hex; commit(); updateSelBox(); };
    sw.append(b);
  }
  wrap.append(c, sw);
  wrap.style.display = 'grid'; wrap.style.gap = '6px';
  return field(label, wrap, true);
}
function group(title, ...children) {
  const g = document.createElement('div'); g.className = 'group';
  const t = document.createElement('div'); t.className = 'group-title'; t.textContent = title;
  g.append(t, ...children);
  return g;
}
function button(label, onClick, cls = '') { const b = document.createElement('button'); b.textContent = label; b.onclick = onClick; if (cls) b.className = cls; return b; }

function fontKey(cs) {
  const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const style = cs.fontStyle === 'italic' ? 'italic' : 'normal';
  return FONTS[`${family}|${style}`] ? `${family}|${style}` : FONTS[`${family}|normal`] ? `${family}|normal` : Object.keys(FONTS)[0];
}

// Photo adjustments live in the image's CSS filter, so they show in the editor and in the exported PNG.
const ADJUST = [
  ['brightness', 'Brightness', 0, 200, 100, '%'],
  ['contrast', 'Contrast', 0, 200, 100, '%'],
  ['saturate', 'Saturation', 0, 300, 100, '%'],
  ['sepia', 'Warmth', 0, 100, 0, '%'],
  ['hue-rotate', 'Hue', -180, 180, 0, 'deg'],
  ['grayscale', 'Black & white', 0, 100, 0, '%'],
  ['blur', 'Blur', 0, 30, 0, 'px'],
];
function readFilter(str) {
  const out = {};
  for (const m of (str || '').matchAll(/([a-z-]+)\(([^()]*(?:\([^()]*\))*[^()]*)\)/g)) out[m[1]] = m[2];
  return out;
}
function writeFilter(el, name, value) {
  const f = readFilter(el.style.filter);
  const def = ADJUST.find((a) => a[0] === name);
  if (Number(value) === def[4]) delete f[name]; else f[name] = value + def[5];
  el.style.filter = Object.entries(f).map(([k, v]) => `${k}(${v})`).join(' ');
}

function renderPanel() {
  const panel = $('panel');
  if (!selected || !selected.isConnected) {
    panel.innerHTML = '<p class="empty">Click something on the post to edit it.<br><br>Double-click text to retype it. Drag to move. Arrow keys nudge (⇧ for 10px). Drop an image file onto the post to add it, or onto a photo to replace it.</p>';
    return;
  }
  const el = selected, s = el.style, cs = getComputedStyle(el);
  panel.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = el.dataset.el || 'Element';
  panel.append(h);
  panel.append(group('Name', field('Layer name', input('text', el.dataset.el || '', (v) => { el.dataset.el = v; h.textContent = v; renderLayers(); }), true)));

  const target = moveTargetFor(el);
  if (target === el) {
    panel.append(group('Position',
      field('X', input('number', Math.round(boxLeft(el)), (v) => { normalizeBox(el); s.left = px(num(v)); })),
      field('Y', input('number', Math.round(boxTop(el)), (v) => { normalizeBox(el); s.top = px(num(v)); })),
      field('Width', input('number', Math.round(boxWidth(el)), (v) => { s.width = px(num(v)); if (isCurve(el)) layoutCurve(el); })),
      field('Height', input('number', Math.round(boxHeight(el)), (v) => { s.height = px(num(v)); if (isCurve(el)) layoutCurve(el); })),
      field('Rotate°', input('number', rotationOf(el), (v) => { s.transform = num(v) ? `rotate(${num(v)}deg)` : ''; }, { step: 1 })),
      field('Opacity %', input('number', Math.round(num(cs.opacity, 1) * 100), (v) => { s.opacity = Math.min(100, Math.max(0, num(v, 100))) / 100; }, { min: 0, max: 100 })),
    ));
  } else if (target) {
    panel.append(group('Position', Object.assign(document.createElement('p'), { className: 'full', textContent: `Moves with “${target.dataset.el}”. Drag to move the whole group.`, style: 'margin:0;color:var(--ui-muted)' })));
  }

  if (isCurve(el)) {
    const tp = el.querySelector('textPath');
    const text = el.querySelector('text');
    const tcs = getComputedStyle(text);
    panel.append(group('Curved text',
      field('Text', input('text', tp?.textContent || '', (v) => { tp.textContent = v; }), true),
      field('Curve', input('range', num(el.dataset.bend, 100), (v) => { el.dataset.bend = v; layoutCurve(el); }, { min: -300, max: 300 }), true),
      field('Font', selectBox(Object.entries(FONTS).map(([k, f]) => [k, f.label]), fontKey(tcs), (k) => { text.style.fontFamily = FONTS[k].family; text.style.fontStyle = FONTS[k].style; }), true),
      field('Size', input('number', Math.round(num(tcs.fontSize)), (v) => { text.style.fontSize = px(num(v)); })),
      field('Weight', selectBox(WEIGHTS, tcs.fontWeight, (v) => { text.style.fontWeight = v; })),
      field('Letter spacing', input('number', num(tcs.letterSpacing), (v) => { text.style.letterSpacing = px(num(v)); }), true),
      colorField('Color', text.getAttribute('fill') || tcs.fill, (v) => text.setAttribute('fill', v)),
    ));
  } else if (isImage(el)) {
    const pos = (cs.objectPosition || '50% 50%').split(' ').map((v) => num(v, 50));
    panel.append(group('Image',
      Object.assign(button('Replace image…', () => pickImage('replace')), { className: 'full' }),
      field('Fit', selectBox([['cover', 'Fill frame (crop)'], ['contain', 'Show whole image'], ['fill', 'Stretch']], cs.objectFit, (v) => { s.objectFit = v; }), true),
      field('Focus left ↔ right', input('range', pos[0], (v) => { s.objectPosition = `${v}% ${num(s.objectPosition?.split(' ')[1], pos[1])}%`; }, { min: 0, max: 100 }), true),
      field('Focus top ↕ bottom', input('range', pos[1], (v) => { s.objectPosition = `${num(s.objectPosition?.split(' ')[0], pos[0])}% ${v}%`; }, { min: 0, max: 100 }), true),
      field('Corner radius', input('number', num(cs.borderTopLeftRadius), (v) => { s.borderRadius = px(num(v)); })),
    ));
    const f = readFilter(s.filter);
    panel.append(group('Adjust photo',
      ...ADJUST.map(([name, label, min, max, def]) =>
        field(label, input('range', f[name] != null ? num(f[name]) : def, (v) => writeFilter(el, name, v), { min, max }), true)),
      Object.assign(button('Reset adjustments', () => { s.filter = Object.entries(readFilter(s.filter)).filter(([k]) => !ADJUST.some((a) => a[0] === k)).map(([k, v]) => `${k}(${v})`).join(' '); commit(); renderPanel(); }), { className: 'full' }),
    ));
  } else {
    if (isTextEl(el) || el.querySelector('*') === null) {
      panel.append(group('Text',
        Object.assign(button('Edit text (or double-click it)', () => startTextEdit(el)), { className: 'full' }),
        field('Font', selectBox(Object.entries(FONTS).map(([k, f]) => [k, f.label]), fontKey(cs), (k) => { s.fontFamily = FONTS[k].family; s.fontStyle = FONTS[k].style; }), true),
        field('Size', input('number', Math.round(num(cs.fontSize)), (v) => { s.fontSize = px(num(v)); })),
        field('Weight', selectBox(WEIGHTS, cs.fontWeight, (v) => { s.fontWeight = v; })),
        field('Line height', input('number', Math.round((num(cs.lineHeight, num(cs.fontSize) * 1.2) / num(cs.fontSize, 1)) * 100) / 100, (v) => { s.lineHeight = String(num(v, 1.2)); }, { step: 0.05 })),
        field('Letter spacing', input('number', num(cs.letterSpacing), (v) => { s.letterSpacing = px(num(v)); }, { step: 0.5 })),
        field('Align', selectBox([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], cs.textAlign === 'start' ? 'left' : cs.textAlign, (v) => { s.textAlign = v; }), true),
        colorField('Text color', cs.color, (v) => { s.color = v; }),
      ));
    }
    const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    panel.append(group('Box',
      colorField('Background', hasBg ? cs.backgroundColor : '#ffffff', (v) => { s.backgroundColor = v; }),
      Object.assign(button('No background', () => { s.background = 'none'; commit(); renderPanel(); }), { className: 'full' }),
      field('Corner radius', input('number', num(cs.borderTopLeftRadius), (v) => { s.borderRadius = px(num(v)); })),
    ));
  }

  const actions = document.createElement('div'); actions.className = 'row';
  actions.append(button('Duplicate', duplicate), button('Forward', () => reorder(1)), button('Backward', () => reorder(-1)), button('Delete', remove, 'danger'));
  panel.append(group('Arrange', Object.assign(actions, { className: 'row full' })));
}

// ---------- save / export ----------
async function save() {
  finishTextEdit();
  if (!post) return;
  const html = serialize();
  setStatus('Saving…');
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
  if (!res.ok) { setStatus('Save failed', true); return; }
  savedHtml = current = html;
  updateDirty();
}

async function exportPng() {
  finishTextEdit();
  const prev = selected; select(null);
  setStatus('Exporting…');
  try {
    // Building the font CSS up front is much faster and more reliable than letting toPng embed fonts itself.
    const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(post);
    const url = await htmlToImage.toPng(post, { width: W, height: H, pixelRatio: 1, fontEmbedCSS });
    const a = document.createElement('a');
    a.href = url; a.download = `${slug.split('/').pop()}.png`; a.click();
    updateDirty();
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + err.message, true);
  }
  select(prev);
}

// ---------- pages ----------
// The home page: folders on the left ("All posts" first), the open folder's posts on the right.
let homePosts = [];
let homeFolders = [];
let openFolder = params.get('folder') || '';
let draggingPost = null;
const thumbHtml = new Map(); // post id → post.html, so re-renders after a move don't refetch

async function homeApi(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Something went wrong'); return null; }
  return data;
}

async function showHome() {
  $('home').hidden = false;
  await loadBrand();
  $('brandBanner').hidden = !!brandKit.name;
  $('newPost').onsubmit = async (e) => {
    e.preventDefault();
    const [w, h] = $('newSize').value.split('x').map(Number);
    const data = await homeApi('POST', '/api/posts', { title: $('newTitle').value.trim() || 'Untitled post', w, h, folder: openFolder });
    if (data) location.href = `/?post=${data.slug}`;
  };
  $('newFolder').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('folderName').value.trim();
    if (!name) { $('folderName').focus(); return; }
    const data = await homeApi('POST', '/api/folders', { name });
    if (!data) return;
    $('folderName').value = '';
    openFolder = data.name;
    refreshHome();
  };
  await refreshHome();
}

async function refreshHome() {
  [homePosts, homeFolders] = await Promise.all([
    fetch('/api/posts').then((r) => r.json()),
    fetch('/api/folders').then((r) => r.json()),
  ]);
  if (!homeFolders.includes(openFolder)) openFolder = '';
  window.history.replaceState(null, '', openFolder ? `/?folder=${openFolder}` : '/');
  renderFolders();
  await renderPostGrid();
}

function renderFolders() {
  const list = $('folderList');
  list.innerHTML = '';
  for (const name of ['', ...homeFolders]) {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><small></small>';
    li.firstChild.textContent = name || 'All posts';
    li.lastChild.textContent = name ? homePosts.filter((p) => p.folder === name).length : homePosts.length;
    li.classList.toggle('active', name === openFolder);
    li.onclick = () => { openFolder = name; refreshHome(); };
    // Drop a post card here to move it; dropping on "All posts" takes it out of its folder.
    li.ondragover = (e) => { if (draggingPost) { e.preventDefault(); li.classList.add('drop'); } };
    li.ondragleave = () => li.classList.remove('drop');
    li.ondrop = (e) => { e.preventDefault(); li.classList.remove('drop'); if (draggingPost) movePost(draggingPost, name); };
    list.append(li);
  }
}

async function renderPostGrid() {
  $('folderTitle').textContent = openFolder || 'All posts';
  const actions = $('folderActions');
  actions.innerHTML = '';
  if (openFolder) actions.append(button('Rename folder', renameFolder), button('Delete folder', deleteFolder, 'danger'));
  const posts = openFolder ? homePosts.filter((p) => p.folder === openFolder) : homePosts;
  const grid = $('postGrid');
  grid.innerHTML = posts.length ? '' : openFolder
    ? '<p class="hint">This folder is empty. Drag posts onto it, use a post’s “Move to…” menu, or start a blank post while the folder is open.</p>'
    : '<p class="hint">No posts yet. Ask Claude for one, or start a blank post above.</p>';
  for (const p of posts) {
    if (!thumbHtml.has(p.id)) thumbHtml.set(p.id, (await (await fetch(`/api/posts/${encodeURIComponent(p.id)}`)).json()).html);
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.ondragstart = (e) => { draggingPost = p.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); };
    card.ondragend = () => { draggingPost = null; };
    const link = document.createElement('a');
    link.href = `/?post=${p.id}`;
    link.draggable = false;
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const inner = document.createElement('div');
    inner.innerHTML = thumbHtml.get(p.id).split('"assets/').join(`"/posts/${p.id}/assets/`).replace(/url\((['"]?)assets\//g, `url($1/posts/${p.id}/assets/`);
    const root = inner.querySelector('[data-post]');
    const w = num(root?.dataset.w, 1080), h = num(root?.dataset.h, 1350), k = 240 / w;
    inner.style.transform = `scale(${k})`;
    thumb.style.width = '240px'; thumb.style.height = px(h * k);
    thumb.append(inner);
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.innerHTML = '<b></b><span></span>';
    meta.querySelector('b').textContent = p.title;
    meta.querySelector('span').textContent = (!openFolder && p.folder ? `${p.folder} · ` : '') + new Date(p.updated).toLocaleString();
    link.append(thumb, meta);
    const move = document.createElement('select');
    move.setAttribute('aria-label', `Move ${p.title}`);
    move.append(new Option('Move to…', ''));
    if (p.folder) move.append(new Option('No folder', '/'));
    for (const f of homeFolders) if (f !== p.folder) move.append(new Option(f, f));
    move.onchange = () => movePost(p.id, move.value === '/' ? '' : move.value);
    const row = document.createElement('div'); row.className = 'card-actions';
    row.append(move, button('Delete', () => deletePost(p), 'danger'));
    card.append(link, row);
    grid.append(card);
    root?.querySelectorAll('svg[data-curve]').forEach(layoutCurve);
  }
  grid.style.gridTemplateColumns = 'repeat(auto-fill, 240px)';
}

async function movePost(id, folder) {
  if (folder === (id.includes('/') ? id.split('/')[0] : '')) return;
  const data = await homeApi('POST', `/api/posts/${encodeURIComponent(id)}/move`, { folder });
  if (!data) return;
  thumbHtml.set(data.slug, thumbHtml.get(id));
  refreshHome();
}

async function deletePost(p) {
  if (!confirm(`Delete “${p.title}”? Its post.html and photos in posts/${p.id}/ are removed for good.`)) return;
  if (await homeApi('DELETE', `/api/posts/${encodeURIComponent(p.id)}`)) refreshHome();
}

async function renameFolder() {
  const to = prompt('Rename folder', openFolder);
  if (!to || to.trim() === openFolder) return;
  const data = await homeApi('PUT', '/api/folders', { from: openFolder, to: to.trim() });
  if (!data) return;
  thumbHtml.clear();
  openFolder = data.name;
  refreshHome();
}

async function deleteFolder() {
  const n = homePosts.filter((p) => p.folder === openFolder).length;
  if (!confirm(n ? `Delete the folder “${openFolder}”? Its ${n} post${n > 1 ? 's' : ''} move${n > 1 ? '' : 's'} out of it and aren’t deleted.` : `Delete the empty folder “${openFolder}”?`)) return;
  if (!(await homeApi('DELETE', `/api/folders?name=${encodeURIComponent(openFolder)}`))) return;
  thumbHtml.clear();
  openFolder = '';
  refreshHome();
}

async function showEditor() {
  $('workspace').hidden = false;
  $('editTools').hidden = false;
  await loadBrand();
  renderPanel();
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
  if (!res.ok) { $('stage').innerHTML = `<p style="padding:40px">No post called “${slug}”.</p>`; return; }
  const { html, meta } = await res.json();
  document.title = `${meta.title || slug} · Atelier`;
  mount(html);
  scale = fitScale(); applyZoom();
  savedHtml = current = serialize();
  updateDirty();
  await document.fonts.ready; updateSelBox();

  const posts = await (await fetch('/api/posts')).json();
  const picker = $('postPicker');
  for (const p of posts) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.folder ? `${p.folder} / ${p.title}` : p.title; picker.append(o); }
  picker.value = slug;
  picker.onchange = () => { location.href = `/?post=${picker.value}`; };
  if (slug.includes('/')) document.querySelector('.brand').href = `/?folder=${slug.split('/')[0]}`;

  $('save').onclick = save;
  $('export').onclick = exportPng;
  $('undo').onclick = undo;
  $('redo').onclick = redo;
  $('addText').onclick = addText;
  $('addImage').onclick = () => pickImage('add');
  $('addShape').onclick = addShape;
  $('zoom').oninput = () => { scale = num($('zoom').value, 50) / 100; applyZoom(); };
  $('viewport').addEventListener('scroll', updateSelBox);
  window.addEventListener('resize', updateSelBox);
  window.addEventListener('beforeunload', (e) => { if (current !== savedHtml) e.preventDefault(); });
}

slug ? showEditor() : showHome();
