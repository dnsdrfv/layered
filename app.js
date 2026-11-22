/* LAYERED — гардероб-коллаж. PWA без сборки: один модуль. */

// ───────────────────────── Константы ─────────────────────────
// Холст манекена — 240×440 условных единиц (как в прототипе).
export const CANVAS_W = 240, CANVAS_H = 440;

export const CATS = {
  tee:       { title: 'Футболка',  gen: 'футболки',  ins: 'футболкой',  layer: 3, group: 'Верх', where: 'Поверх низа, под кофтой и жилеткой',        place: { cx: 120, cy: 169, w: 160 } },
  shirt:     { title: 'Рубашка',   gen: 'рубашки',   ins: 'рубашкой',   layer: 4, group: 'Верх', where: 'Поверх футболки, под жилеткой и курткой',    place: { cx: 120, cy: 164, w: 176 } },
  sweater:   { title: 'Кофта',     gen: 'кофты',     ins: 'кофтой',     layer: 4, group: 'Верх', where: 'Поверх футболки, под жилеткой и курткой',    place: { cx: 120, cy: 162, w: 180 } },
  vest:      { title: 'Жилет',     gen: 'жилета',    ins: 'жилетом',    layer: 5, group: 'Верх', where: 'Поверх кофты, под курткой',                   place: { cx: 120, cy: 161, w: 116 } },
  jacket:    { title: 'Куртка',    gen: 'куртки',    ins: 'курткой',    layer: 6, group: 'Верх', where: 'Поверх всего верха, под аксессуарами',       place: { cx: 120, cy: 166, w: 196 } },
  pants:     { title: 'Брюки',     gen: 'брюк',      ins: 'брюками',    layer: 2, group: 'Низ',  where: 'Сразу над манекеном, под всем верхом',       place: { cx: 120, cy: 329, w: 92 }, slot: 'bottom' },
  skirt:     { title: 'Юбка',      gen: 'юбки',      ins: 'юбкой',      layer: 2, group: 'Низ',  where: 'Сразу над манекеном, под всем верхом',       place: { cx: 120, cy: 292, w: 108 }, slot: 'bottom' },
  shoes:     { title: 'Обувь',     gen: 'обуви',     ins: 'обувью',     layer: 2, group: 'Обувь', where: 'На уровне низа, у ног манекена',            place: { cx: 120, cy: 423, w: 84 } },
  accessory: { title: 'Аксессуар', gen: 'аксессуара', ins: 'аксессуаром', layer: 7, group: 'Аксессуары', where: 'Поверх всего образа',               place: { cx: 186, cy: 150, w: 70 } },
};
export const LAYERS = [
  { n: 7, label: 'Аксессуары', name: 'Аксессуары' },
  { n: 6, label: 'Верхняя одежда', name: 'Верхняя одежда' },
  { n: 5, label: 'Жилетки', name: 'Жилетки' },
  { n: 4, label: 'Кофты, рубашки', name: 'Средний слой' },
  { n: 3, label: 'Футболки, топы', name: 'Базовый слой' },
  { n: 2, label: 'Низ, обувь', name: 'Низ и обувь' },
  { n: 1, label: 'Манекен', name: 'Манекен' },
];
const GROUPS = ['Все', 'Верх', 'Низ', 'Обувь', 'Аксессуары'];
const OCCASIONS = ['Работа', 'Выходные', 'Свидание', 'Путешествие'];
const WEATHER = ['Тепло', 'Прохладно', 'Холодно'];

// ───────────────────────── IndexedDB ─────────────────────────
const DB_NAME = 'layered', DB_VER = 1;
let dbp;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('looks')) d.createObjectStore('looks', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function dbAll(store) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbPut(store, obj) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function dbDel(store, id) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

// ───────────────────────── Состояние ─────────────────────────
const S = {
  items: [],      // { id, name, category, createdAt, favorite, blob, w, h }
  looks: [],      // { id, name, occasions, weather, placements, thumb, createdAt, favorite }
  view: 'home',
  homeFav: false,
  wardrobeGroup: 'Все',
  wardrobeQuery: '',
  editorGroup: 'Все',
  draft: { lookId: null, placements: [], selected: null, msg: 'Нажмите вещь внизу — она встанет на свой слой' },
  pending: null,  // { file, original: ImageBitmap|HTMLImageElement, cutout: Blob|null, category, tol, view, busy, mlFailed }
  save: { name: '', occasions: ['Работа'], weather: 'Прохладно', story: false },
};
const urlCache = new Map();
function blobURL(blob, key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const u = URL.createObjectURL(blob); urlCache.set(key, u); return u;
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const item = (id) => S.items.find((i) => i.id === id);
const plural = (n, one, few, many) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? few : many); };
const looksMeta = (pl) => plural(pl.length, 'вещь', 'вещи', 'вещей') + ' · ' + plural(new Set(pl.map((p) => CATS[item(p.itemId)?.category]?.layer).filter(Boolean)).size, 'слой', 'слоя', 'слоёв');

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}

// ───────────────────────── Изображения ─────────────────────────
async function loadImage(src) {
  if (src instanceof Blob) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch (_) { /* fallthrough */ }
    }
    src = URL.createObjectURL(src);
  }
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
const imgW = (im) => im.naturalWidth || im.width;
const imgH = (im) => im.naturalHeight || im.height;
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));

/**
 * Автовырезка фона: заливка от краёв кадра по близости к цвету фона.
 * Работает хорошо для «разложи ровно на контрастном фоне». tol — допуск 10–120.
 */
export function cutoutFloodFill(im, tol = 42) {
  const maxSide = 1000;
  const sc = Math.min(1, maxSide / Math.max(imgW(im), imgH(im)));
  const w = Math.max(1, Math.round(imgW(im) * sc)), h = Math.max(1, Math.round(imgH(im) * sc));
  const c = canvasOf(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;

  // Оценка цвета фона: медиана пикселей вдоль рамки.
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const br = med(rs), bg = med(gs), bb = med(bs);

  // BFS от всех краевых пикселей, похожих на фон.
  const bgMask = new Uint8Array(w * h);
  const stack = new Int32Array(w * h); let sp = 0;
  const t2 = tol * tol;
  // Тень на фоне: тот же оттенок (хроматичность), но темнее — тоже фон, если не темнее чем вдвое.
  const bsum = br + bg + bb || 1, bcr = br / bsum, bcg = bg / bsum, bluma = 0.299 * br + 0.587 * bg + 0.114 * bb;
  const close = (i) => {
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2], dr = r - br, dg = g - bg, db = b - bb;
    if (dr * dr + dg * dg + db * db <= t2 * 3) return true;
    const sum = r + g + b || 1, cr = r / sum - bcr, cg = g / sum - bcg, luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return (cr * cr + cg * cg) < 0.0022 * (tol / 42) && luma < bluma && luma > bluma * 0.4;
  };
  const seed = (i) => { if (!bgMask[i] && close(i)) { bgMask[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  // Если залилось почти всё — фон не отличить от вещи.
  let bgCount = 0; for (let i = 0; i < bgMask.length; i++) bgCount += bgMask[i];
  const coverage = 1 - bgCount / bgMask.length;
  if (coverage < 0.01) return null;

  // Эрозия маски вещи на 1 px (убирает цветную кайму) и мягкий край.
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (bgMask[i]) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || bgMask[i - 1] || bgMask[i + 1] || bgMask[i - w] || bgMask[i + w];
    fg[i] = edge ? 0 : 1;
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    // альфа = среднее по окну 3×3 → мягкий край
    let a = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      a += fg[yy * w + xx]; n++;
    }
    const alpha = Math.round((a / n) * 255);
    d[i * 4 + 3] = alpha;
    if (alpha > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  ctx.putImageData(img, 0, 0);
  // Обрезка по границам вещи с полем 3 %.
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03) + 2;
  const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const sw = Math.min(w, maxX + pad) - sx, sh = Math.min(h, maxY + pad) - sy;
  const out = canvasOf(sw, sh);
  out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return { canvas: out, coverage };
}

/** Нейросетевая вырезка (по желанию): @imgly/background-removal, грузится по требованию. */
async function cutoutML(blob) {
  const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm');
  const removeBackground = mod.removeBackground || mod.default;
  const out = await removeBackground(blob, { output: { format: 'image/png', quality: 1 } });
  const im = await loadImage(out);
  return cropTransparent(im);
}
function cropTransparent(im) {
  const w = imgW(im), h = imgH(im), c = canvasOf(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return { canvas: c, coverage: 0 };
  const pad = 4, sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const out = canvasOf(Math.min(w, maxX + pad) - sx, Math.min(h, maxY + pad) - sy);
  out.getContext('2d').drawImage(c, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, coverage: 1 };
}

// ───────────────────────── Демо-вещи (векторные) ─────────────────────────
// Пути из прототипа; рисуем в PNG, чтобы коллаж можно было попробовать без фото.
const DEMO = [
  { name: 'Футболка базовая', category: 'tee', vb: [0, 0, 160, 174], fill: ['#E9E7E3', '#FFFFFF', '#E5E3DF'], ln: 'rgba(0,0,0,0.14)', d: 'M50 6 L66 2 Q80 16 94 2 L110 6 L156 32 L140 60 L126 50 L128 170 L32 170 L34 50 L20 60 L4 32 Z', d2: 'M66 2 Q80 20 94 2 M33 162 L127 162' },
  { name: 'Кофта оверсайз', category: 'sweater', vb: [0, 0, 180, 164], fill: ['#B49B7B', '#CDB89C', '#AE9474'], ln: 'rgba(70,45,20,0.35)', d: 'M56 6 L72 2 Q90 18 108 2 L124 6 L164 34 L178 146 L156 150 L142 66 L144 160 L36 160 L38 66 L24 150 L2 146 L16 34 Z', d2: 'M72 2 Q90 24 108 2 M37 148 L143 148 M3 134 L25 138 M177 134 L155 138' },
  { name: 'Стёганый жилет', category: 'vest', vb: [0, 0, 116, 154], fill: ['#1F1F1F', '#3B3B3B', '#1A1A1A'], ln: 'rgba(255,255,255,0.28)', d: 'M28 4 L44 0 L58 62 L72 0 L88 4 Q92 30 108 44 L108 150 L8 150 L8 44 Q24 30 28 4 Z', d2: 'M58 62 L58 150 M18 104 L42 104 M74 104 L98 104' },
  { name: 'Брюки прямые', category: 'pants', vb: [0, 0, 92, 190], fill: ['#1F2633', '#34405A', '#1C2230'], ln: 'rgba(255,255,255,0.16)', d: 'M2 0 L90 0 L92 186 L58 186 L46 56 L34 186 L0 186 Z', d2: 'M2 12 L90 12 M46 12 L46 56' },
  { name: 'Юбка плиссе', category: 'skirt', vb: [0, 0, 108, 120], fill: ['#5B563F', '#857F61', '#55503A'], ln: 'rgba(255,255,255,0.2)', d: 'M18 0 L90 0 L106 116 L2 116 Z', d2: 'M17 10 L91 10 M30 10 L22 116 M54 10 L54 116 M78 10 L86 116' },
  { name: 'Кеды кожаные', category: 'shoes', vb: [0, 0, 84, 26], fill: ['#FFFFFF', '#FFFFFF', '#E2E2E2'], ln: 'rgba(0,0,0,0.28)', d: 'M2 22 L2 10 Q10 2 22 6 L36 14 L38 22 Z M46 22 L48 14 L62 6 Q74 2 82 10 L82 22 Z', d2: 'M2 18 L38 18 M46 18 L82 18' },
];
async function renderDemo(spec) {
  const [x0, y0, vw, vh] = spec.vb, k = 4;
  const c = canvasOf(Math.round(vw * k) + 16, Math.round(vh * k) + 16), ctx = c.getContext('2d');
  ctx.translate(8, 8); ctx.scale(k, k); ctx.translate(-x0, -y0);
  const g = ctx.createLinearGradient(x0, 0, x0 + vw, 0);
  g.addColorStop(0, spec.fill[0]); g.addColorStop(0.45, spec.fill[1]); g.addColorStop(1, spec.fill[2]);
  const p = new Path2D(spec.d);
  ctx.fillStyle = g; ctx.fill(p);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.stroke(p);
  ctx.save(); ctx.clip(p); ctx.strokeStyle = spec.ln; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke(new Path2D(spec.d2)); ctx.restore();
  return toBlob(c);
}
async function addDemoItems() {
  for (const spec of DEMO) {
    const blob = await renderDemo(spec);
    const im = await loadImage(blob);
    await putItem({ id: uid(), name: spec.name, category: spec.category, createdAt: Date.now(), favorite: false, blob, w: imgW(im), h: imgH(im) });
  }
  toast('Добавили 6 примеров в гардероб');
  render();
}

// ───────────────────────── Данные ─────────────────────────
async function putItem(it) { await dbPut('items', it); const i = S.items.findIndex((x) => x.id === it.id); if (i >= 0) S.items[i] = it; else S.items.push(it); }
async function deleteItem(id) {
  await dbDel('items', id);
  S.items = S.items.filter((i) => i.id !== id);
  S.draft.placements = S.draft.placements.filter((p) => p.itemId !== id);
  for (const l of S.looks) {
    const before = l.placements.length;
    l.placements = l.placements.filter((p) => p.itemId !== id);
    if (l.placements.length !== before) { l.thumb = await renderLookThumb(l.placements); await dbPut('looks', l); }
  }
}
async function putLook(l) { await dbPut('looks', l); const i = S.looks.findIndex((x) => x.id === l.id); if (i >= 0) S.looks[i] = l; else S.looks.push(l); }
async function deleteLook(id) { await dbDel('looks', id); S.looks = S.looks.filter((l) => l.id !== id); if (S.draft.lookId === id) resetDraft(); }
function resetDraft() { S.draft = { lookId: null, placements: [], selected: null, msg: 'Нажмите вещь внизу — она встанет на свой слой' }; }

// ───────────────────────── Логика слоёв ─────────────────────────
function describe(id, placements) {
  const me = CATS[item(id).category];
  let below = null, above = null;
  for (const p of placements) {
    if (p.itemId === id) continue;
    const c = CATS[item(p.itemId)?.category]; if (!c) continue;
    if (c.layer < me.layer && (!below || c.layer >= below.layer)) below = c;
    if (c.layer > me.layer && (!above || c.layer < above.layer)) above = c;
  }
  return `${me.title} — слой ${me.layer}: ${below ? 'поверх ' + below.gen : 'поверх манекена'}${above ? ', под ' + above.ins : ', сверху'}`;
}
function toggleInDraft(id) {
  const d = S.draft, it = item(id); if (!it) return;
  const cat = CATS[it.category];
  const idx = d.placements.findIndex((p) => p.itemId === id);
  if (idx >= 0) {
    d.placements.splice(idx, 1); d.selected = null;
    d.msg = `Снято: ${cat.title.toLowerCase()} — слой ${cat.layer} свободен`;
    return;
  }
  let note = '';
  if (cat.slot) {
    const rival = d.placements.find((p) => CATS[item(p.itemId)?.category]?.slot === cat.slot);
    if (rival) { d.placements = d.placements.filter((p) => p !== rival); note = ' · заменили: ' + CATS[item(rival.itemId).category].title.toLowerCase(); }
  }
  const order = Math.max(0, ...d.placements.map((p) => p.order)) + 1;
  d.placements.push({ itemId: id, cx: cat.place.cx, cy: cat.place.cy, w: cat.place.w, order });
  d.selected = id;
  d.msg = describe(id, d.placements) + note;
}
const sortedPlacements = (pl) => pl.slice().sort((a, b) => (CATS[item(a.itemId)?.category]?.layer ?? 0) - (CATS[item(b.itemId)?.category]?.layer ?? 0) || a.order - b.order);

// ───────────────────────── Рендер коллажа в PNG ─────────────────────────
const MANNEQUIN = {
  arms: ['M76 98 L54 226', 'M164 98 L186 226'],
  torso: 'M72 92 Q120 80 168 92 L164 240 L76 240 Z',
  legs: 'M80 238 L160 238 L156 418 L126 418 L120 280 L114 418 L84 418 Z',
};
function drawMannequin(ctx, k) {
  ctx.save(); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(120, 433, 74, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#DAD6CF'; ctx.lineWidth = 15; ctx.lineCap = 'round';
  for (const a of MANNEQUIN.arms) ctx.stroke(new Path2D(a));
  const g = ctx.createLinearGradient(0, 0, 240, 0); g.addColorStop(0, '#DFDBD4'); g.addColorStop(0.5, '#EEEBE6'); g.addColorStop(1, '#D9D4CC');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(120, 42, 24, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(110, 64, 20, 26, 6); ctx.fill();
  ctx.fill(new Path2D(MANNEQUIN.torso)); ctx.fill(new Path2D(MANNEQUIN.legs));
  ctx.restore();
}
async function drawLook(ctx, placements, k, withShadow = true) {
  drawMannequin(ctx, k);
  for (const p of sortedPlacements(placements)) {
    const it = item(p.itemId); if (!it) continue;
    const im = await loadImage(it.blob);
    const w = p.w * k, h = w * (it.h / it.w);
    if (withShadow) { ctx.shadowColor = 'rgba(0,0,0,0.14)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetY = 4 * k; }
    ctx.drawImage(im, p.cx * k - w / 2, p.cy * k - h / 2, w, h);
    ctx.shadowColor = 'transparent';
  }
}
async function renderLookThumb(placements) {
  const k = 2, c = canvasOf(CANVAS_W * k, CANVAS_H * k);
  await drawLook(c.getContext('2d'), placements, k);
  return toBlob(c);
}
async function renderStoryCard(look) {
  const W = 1080, H = 1920, c = canvasOf(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#F2F1EF'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111'; ctx.font = '700 44px "Inter Tight", system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.letterSpacing = '12px'; ctx.fillText('LAYERED', W / 2, 180); ctx.letterSpacing = '0px';
  const k = 2.9; ctx.save(); ctx.translate((W - CANVAS_W * k) / 2, 300); await drawLook(ctx, look.placements, k); ctx.restore();
  ctx.font = 'italic 500 96px "Cormorant Garamond", Georgia, serif'; ctx.fillText(look.name || 'Образ', W / 2, 1680);
  ctx.font = '400 34px "Inter Tight", system-ui, sans-serif'; ctx.fillStyle = '#6B6B6B';
  ctx.fillText([looksMeta(look.placements), ...(look.occasions || []), look.weather].filter(Boolean).join(' · '), W / 2, 1750);
  return toBlob(c);
}
async function shareBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ───────────────────────── Рендер экранов ─────────────────────────
const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const icon = (n, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const thumbImg = (look, alt) => look.thumb ? `<img src="${blobURL(look.thumb, 'look:' + look.id + ':' + (look.updatedAt || 0))}" alt="${esc(alt)}">` : '';
const itemImg = (it, cls = '') => `<img class="${cls}" src="${blobURL(it.blob, 'item:' + it.id)}" alt="${esc(it.name)}">`;

function render() {
  const v = S.view;
  const noTabs = ['add', 'cutout', 'save'].includes(v);
  document.body.classList.toggle('no-tabs', noTabs);
  tabbar.classList.toggle('hidden', noTabs);
  for (const t of tabbar.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === v);
  app.innerHTML = ({ home: renderHome, wardrobe: renderWardrobe, add: renderAdd, cutout: renderCutout, editor: renderEditor, save: renderSave })[v]();
  if (v === 'editor') bindEditor();
  if (v === 'cutout') bindCutout();
  window.scrollTo(0, 0);
}

function renderHome() {
  const looks = S.looks.filter((l) => !S.homeFav || l.favorite).sort((a, b) => b.createdAt - a.createdAt);
  const hero = looks[0];
  let body;
  if (!hero) {
    body = `<div class="empty">
      <div class="big">Пока нет образов</div>
      <p>${S.items.length ? 'Соберите первый образ в коллаже: вещи уже в гардеробе.' : 'Сфотографируйте вещь — фон вырежем сами, — и соберите образ на манекене.'}</p>
      ${S.items.length ? '<a class="btn primary" href="#editor">Собрать образ</a>' : '<a class="btn primary" href="#add">Добавить вещь</a><button class="btn ghost" data-act="demo">Загрузить примеры</button>'}
    </div>`;
  } else {
    const rest = looks.slice(1);
    body = `
      <a class="hero" href="#look/${hero.id}" aria-label="Открыть образ «${esc(hero.name)}»">
        <div class="text"><span class="eyebrow">ОБРАЗ ДНЯ</span><span class="name">${esc(hero.name)}</span><span class="sub">${looksMeta(hero.placements)}</span></div>
        <span class="cta">Открыть в коллаже ${icon('back')}</span>
        <div class="doll">${thumbImg(hero, hero.name)}</div>
      </a>
      <div class="section-h"><h2>Сохранённые <span>· ${S.looks.length}</span></h2></div>
      <div class="grid2">${rest.map((l) => `
        <div class="card">
          <a class="thumb" href="#look/${l.id}" aria-label="Открыть образ «${esc(l.name)}»">${thumbImg(l, l.name)}
            ${l.occasions?.[0] ? `<span class="badge">${esc(l.occasions[0].toUpperCase())}</span>` : ''}
            <span class="actions"><button data-act="share-look" data-id="${l.id}" aria-label="Поделиться карточкой">${icon('share')}</button><button data-act="del-look" data-id="${l.id}" aria-label="Удалить образ">${icon('trash')}</button></span>
          </a>
          <div class="meta"><div class="col"><span class="t">${esc(l.name)}</span><span class="m">${looksMeta(l.placements)}</span></div>
            <button class="heart ${l.favorite ? 'on' : ''}" data-act="fav-look" data-id="${l.id}" aria-label="В избранное" aria-pressed="${!!l.favorite}">${icon(l.favorite ? 'heart-fill' : 'heart')}</button></div>
        </div>`).join('')}
        ${rest.length === 0 && !S.homeFav ? `<a class="card" href="#editor"><span class="thumb" style="align-items:center"><span class="sub" style="text-align:center;padding:16px">+ новый образ</span></span></a>` : ''}
      </div>`;
  }
  return `<section class="screen">
    <div class="topbar"><span class="brand">LAYERED</span>
      <div style="display:flex">
        <button class="iconbtn ${S.homeFav ? 'on' : ''}" data-act="home-fav" aria-label="Только избранное" aria-pressed="${S.homeFav}">${icon(S.homeFav ? 'heart-fill' : 'heart')}</button>
        ${hero ? `<button class="iconbtn" data-act="share-look" data-id="${hero.id}" aria-label="Поделиться образом дня">${icon('share')}</button>` : ''}
      </div></div>
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${!S.homeFav}" data-act="home-all">Мои образы</button><button role="tab" aria-selected="${S.homeFav}" data-act="home-fav">Избранное</button></div>
    ${body}
    ${installHint()}
  </section>`;
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
function installHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || localStorage.getItem('hideInstall')) return '';
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return `<div class="install-hint"><span>${ios ? 'Чтобы открывать как приложение: Поделиться → «На экран „Домой“».' : 'Можно установить как приложение.'}</span>
    ${installPrompt ? '<button data-act="install">Установить</button>' : '<button data-act="hide-install">Скрыть</button>'}</div>`;
}

function renderWardrobe() {
  const q = S.wardrobeQuery.trim().toLowerCase();
  const items = S.items.filter((i) => (S.wardrobeGroup === 'Все' || CATS[i.category].group === S.wardrobeGroup) && (!q || i.name.toLowerCase().includes(q) || CATS[i.category].title.toLowerCase().includes(q))).sort((a, b) => b.createdAt - a.createdAt);
  const usedIn = (id) => S.looks.filter((l) => l.placements.some((p) => p.itemId === id)).length;
  return `<section class="screen">
    <div class="topbar" style="align-items:flex-end;height:auto;padding-top:6px">
      <div><h1 class="page">Гардероб</h1><span class="sub">${S.items.length ? plural(S.items.length, 'вещь', 'вещи', 'вещей') + ' · все с вырезанным фоном' : 'пока пусто'}</span></div>
      <a class="iconbtn" href="#add" aria-label="Добавить вещь">${icon('plus')}</a></div>
    <label class="search">${icon('search')}<input type="search" id="wq" placeholder="Поиск: «кофта», «кеды»" value="${esc(S.wardrobeQuery)}" aria-label="Поиск по гардеробу"></label>
    <div class="tabs" role="tablist" style="margin-top:6px">${GROUPS.map((g) => `<button role="tab" aria-selected="${g === S.wardrobeGroup}" data-act="wgroup" data-g="${g}">${g}</button>`).join('')}</div>
    ${S.items.length === 0 ? `<div class="empty"><div class="big">Гардероб пуст</div><p>Добавьте первую вещь: фото с камеры или из галереи. Фон вырежем автоматически.</p><a class="btn primary" href="#add">Добавить вещь</a><button class="btn ghost" data-act="demo">Загрузить примеры</button></div>` :
      items.length === 0 ? `<div class="empty"><p>Ничего не нашли</p></div>` :
      `<div class="grid2" style="padding-top:16px">${items.map((it) => {
        const c = CATS[it.category], n = usedIn(it.id);
        return `<div class="card">
          <a class="thumb" href="#tryon/${it.id}" aria-label="${esc(it.name)}: примерить в коллаже">${itemImg(it, 'item-img')}<span class="badge">СЛОЙ ${c.layer}</span>
            <span class="actions"><button data-act="del-item" data-id="${it.id}" aria-label="Удалить вещь">${icon('trash')}</button></span></a>
          <div class="meta"><div class="col"><span class="t">${esc(it.name)}</span><span class="m">${c.title} · ${c.group.toLowerCase()}</span><span class="m" style="color:var(--ink)">${n ? 'в ' + plural(n, 'образе', 'образах', 'образах') : 'ещё не в образах'}</span></div>
            <button class="heart ${it.favorite ? 'on' : ''}" data-act="fav-item" data-id="${it.id}" aria-label="В избранное" aria-pressed="${!!it.favorite}">${icon(it.favorite ? 'heart-fill' : 'heart')}</button></div>
        </div>`; }).join('')}
        <a class="card" href="#add"><span class="thumb" style="align-items:center;border:1px dashed var(--chip);background:#fff"><span class="sub" style="text-align:center;padding:16px">+ добавить вещь</span></span></a>
      </div>`}
  </section>`;
}

function renderAdd() {
  return `<section class="screen dark full" style="padding-top:0">
    <div class="cam-stage">
      <div class="top"><a class="iconbtn" href="#wardrobe" aria-label="Закрыть">${icon('close')}</a><span class="title">Новая вещь</span><span style="width:44px"></span></div>
      <svg class="tee" viewBox="0 0 180 164" aria-hidden="true"><path d="M56 6 L72 2 Q90 18 108 2 L124 6 L164 34 L178 146 L156 150 L142 66 L144 160 L36 160 L38 66 L24 150 L2 146 L16 34 Z" fill="#C2AB8C" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/></svg>
      <div class="frame"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
      <div class="hint">Разложите вещь ровно — фон уберём сами</div>
    </div>
    <div class="cam-controls">
      <div class="modes"><span data-act="pick-gallery" role="button">ГАЛЕРЕЯ</span><span class="on">ФОТО</span></div>
      <div class="shutter-row">
        <button class="cam-side" data-act="pick-gallery" aria-label="Выбрать из галереи">${icon('gallery')}</button>
        <button class="shutter" data-act="pick-camera" aria-label="Сделать снимок"><span></span></button>
        <span style="width:48px"></span>
      </div>
      <div class="cam-tips"><span>контрастный фон</span><span>без теней</span><span>вся вещь в кадре</span></div>
    </div>
  </section>`;
}

function renderCutout() {
  const p = S.pending;
  if (!p) return renderAdd();
  const cat = CATS[p.category];
  const row = LAYERS.find((l) => l.n === cat.layer);
  const cutURL = p.cutout ? blobURL(p.cutout, 'pending:' + p.rev) : null;
  const isCut = p.view === 'cut' && cutURL;
  return `<section class="screen full">
    <div class="navbar"><a class="iconbtn" href="#add" aria-label="Назад">${icon('back')}</a><span class="title">Новая вещь</span><span class="spacer">2 / 3</span></div>
    <div class="progress" aria-hidden="true"><span class="on"></span><span class="on"></span><span></span></div>
    <div class="stage ${isCut ? '' : 'photo'}">
      <img src="${isCut ? cutURL : p.originalURL}" alt="${isCut ? 'Вещь с удалённым фоном' : 'Исходное фото'}">
      <div class="seg" role="group" aria-label="Сравнение"><button data-act="view-photo" aria-pressed="${!isCut}">До</button><button data-act="view-cut" aria-pressed="${!!isCut}" ${cutURL ? '' : 'disabled'}>После</button></div>
      ${isCut ? `<span class="pill ${p.coverage < 0.03 || p.coverage > 0.92 ? 'warn' : ''}">${icon('scissors')}${p.ml ? 'Фон удалён нейросетью' : p.coverage > 0.92 ? 'Фон почти не отличить' : 'Фон удалён'}</span>` : (p.cutout ? '' : `<span class="pill warn">Не удалось отделить фон</span>`)}
      ${!p.busy ? `<button class="edge" data-act="toggle-edge">${p.edge ? 'Скрыть' : 'Поправить края'}</button>` : ''}
      ${p.busy ? `<div class="busy">${esc(p.busy)}</div>` : ''}
    </div>
    ${p.edge ? `<div class="edge-panel">
      <label>Чувствительность к фону <b id="tolv">${p.tol}</b></label>
      <input type="range" id="tol" min="10" max="120" step="2" value="${p.tol}" aria-label="Чувствительность к фону">
      <div class="row2"><button class="btn ghost" data-act="recut">Пересчитать</button><button class="btn ghost" data-act="ml" ${p.mlFailed ? 'disabled' : ''}>${p.mlFailed ? 'Нейросеть недоступна' : 'Вырезать нейросетью'}</button></div>
      <span class="sub">Нейросеть точнее на сложном фоне, но один раз скачает модель (~40 МБ).</span>
    </div>` : ''}
    <div class="h-row"><h2>Тип вещи</h2><span class="sub">определяет слой</span></div>
    <div class="chips scroll">${Object.entries(CATS).map(([k, c]) => `<button class="chip" data-act="cat" data-k="${k}" aria-pressed="${k === p.category}">${c.title}</button>`).join('')}</div>
    <section class="layer-card" aria-label="Слой вещи">
      <div class="left"><span class="eyebrow" style="color:var(--muted)">ЛЯЖЕТ НА СЛОЙ</span><span class="num">${cat.layer}</span><span class="lname">${row?.name || ''}</span><span class="where">${cat.where}</span></div>
      <ol class="stack" aria-label="Порядок слоёв">${LAYERS.map((l) => `<li class="${l.n === cat.layer ? 'on' : ''}"><b>${l.n}</b>${l.label}</li>`).join('')}</ol>
    </section>
    <div class="name-field"><label for="iname">НАЗВАНИЕ</label><input id="iname" type="text" placeholder="${esc(cat.title)}" value="${esc(p.name || '')}" autocomplete="off"></div>
    <div class="bottom-actions row2">
      <button class="btn" data-act="save-item" data-then="editor" ${p.busy ? 'disabled' : ''}>Примерить</button>
      <button class="btn primary" data-act="save-item" data-then="wardrobe" ${p.busy ? 'disabled' : ''}>В гардероб</button>
    </div>
  </section>`;
}

function renderEditor() {
  const d = S.draft;
  const look = d.lookId ? S.looks.find((l) => l.id === d.lookId) : null;
  const layers = sortedPlacements(d.placements).reverse();
  const trayItems = S.items.filter((i) => S.editorGroup === 'Все' || CATS[i.category].group === S.editorGroup).sort((a, b) => CATS[b.category].layer - CATS[a.category].layer || b.createdAt - a.createdAt);
  const k = 221 / CANVAS_W;
  return `<section class="screen editor">
    <div class="navbar"><a class="iconbtn" href="#home" aria-label="Назад к образам">${icon('back')}</a><span class="title">${look ? esc(look.name) : 'Новый образ'}</span>
      <div class="right"><button class="iconbtn" data-act="undo" aria-label="Снять последнюю вещь" ${d.placements.length ? '' : 'disabled'}>${icon('undo')}</button><button class="btn primary small" data-act="done" ${d.placements.length ? '' : 'disabled'}>Готово</button></div></div>
    <div class="stage-wrap">
      <div class="collage" id="collage">
        <div class="doll-bg"><svg viewBox="0 0 240 440" aria-hidden="true"><use href="#mannequin"/></svg></div>
        ${sortedPlacements(d.placements).map((p, i) => { const it = item(p.itemId); if (!it) return ''; return `<div class="piece ${d.selected === it.id ? 'selected' : ''}" data-id="${it.id}" style="left:${p.cx * k}px;top:${p.cy * k}px;width:${p.w * k}px;z-index:${(CATS[it.category].layer) * 100 + i}">${itemImg(it)}</div>`; }).join('')}
      </div>
      <section class="layers" aria-label="Слои образа">
        <div class="h"><span>СЛОИ</span>${icon('drag')}</div>
        ${layers.length ? `<ol>${layers.map((p) => { const it = item(p.itemId), c = CATS[it.category]; return `<li class="${d.selected === it.id ? 'on' : ''}" data-act="select" data-id="${it.id}"><b>${c.layer}</b><span>${esc(it.name)}</span><button data-act="remove" data-id="${it.id}" aria-label="Снять ${esc(it.name)}">${icon('close')}</button></li>`; }).join('')}</ol>` : '<span class="empty-l">Пусто</span>'}
      </section>
    </div>
    <div class="status" role="status"><span>${esc(d.msg)}</span></div>
    <div class="tray">
      <span class="handle" aria-hidden="true"></span>
      <div class="tabs" role="tablist" aria-label="Гардероб">${GROUPS.map((g) => `<button role="tab" aria-selected="${g === S.editorGroup}" data-act="egroup" data-g="${g}">${g}</button>`).join('')}</div>
      ${S.items.length === 0 ? `<div class="tray-empty">В гардеробе пока нет вещей.<div class="row2"><a class="btn primary" href="#add">Добавить вещь</a><button class="btn ghost" data-act="demo">Примеры</button></div></div>` :
      `<div class="tray-items">${trayItems.map((it) => { const on = d.placements.some((p) => p.itemId === it.id), c = CATS[it.category]; return `<button class="tray-item" data-act="toggle" data-id="${it.id}" aria-pressed="${on}"><span class="box">${itemImg(it)}${on ? `<span class="ck">${icon('check')}</span>` : ''}<span class="lz">СЛОЙ ${c.layer}</span></span><span class="n">${esc(it.name)}</span></button>`; }).join('')}
        <a class="tray-item" href="#add"><span class="box" style="border:1px dashed var(--chip);background:#fff">${icon('plus')}</span><span class="n">Добавить</span></a></div>`}
    </div>
  </section>`;
}

function renderSave() {
  const d = S.draft, s = S.save;
  const look = d.lookId ? S.looks.find((l) => l.id === d.lookId) : null;
  const chip = (l, on, act) => `<button class="chip" data-act="${act}" data-v="${esc(l)}" aria-pressed="${on}">${esc(l)}</button>`;
  return `<section class="screen full">
    <div class="navbar"><a class="iconbtn" href="#editor" aria-label="Закрыть">${icon('close')}</a><span class="title">${look ? 'Сохранить изменения' : 'Сохранить образ'}</span><span style="width:44px"></span></div>
    <div class="preview">${S.saveThumb ? `<img src="${S.saveThumb}" alt="Предпросмотр образа">` : ''}<span class="badge">${looksMeta(d.placements).toUpperCase()}</span><a class="edit" href="#editor">Изменить</a></div>
    <div class="field">
      <input class="lookname" id="lookname" type="text" placeholder="Например: офис, пятница" value="${esc(s.name)}" aria-label="Название образа" autocomplete="off">
      <h2>ПОВОД</h2><div class="chips">${OCCASIONS.map((o) => chip(o, s.occasions.includes(o), 'occ')).join('')}</div>
      <h2>ПОГОДА</h2><div class="chips">${WEATHER.map((w) => chip(w, s.weather === w, 'wx')).join('')}</div>
      <label class="switch-row"><span class="l"><b>Карточка для сторис</b><span>После сохранения — поделиться коллажем 9:16</span></span><input class="sw" type="checkbox" role="switch" id="story" ${s.story ? 'checked' : ''}></label>
    </div>
    <div class="bottom-actions"><button class="btn primary" data-act="save-look" style="width:100%">${look ? 'Сохранить изменения' : 'Сохранить в образы'}</button>
      ${look ? `<button class="btn ghost" data-act="del-look" data-id="${look.id}" style="width:100%;margin-top:10px">Удалить образ</button>` : ''}</div>
  </section>`;
}

// ───────────────────────── Редактор: перетаскивание и масштаб ─────────────────────────
function bindEditor() {
  const stage = document.getElementById('collage'); if (!stage) return;
  const k = stage.clientWidth / CANVAS_W;
  const pointers = new Map();
  let g = null; // { el, p, startCx, startCy, startW, p0, dist0 }
  stage.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.piece');
    if (!el) { if (S.draft.selected) { S.draft.selected = null; render(); } return; }
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = S.draft.placements.find((q) => q.itemId === el.dataset.id);
    if (!g || g.el !== el) {
      g = { el, p, startCx: p.cx, startCy: p.cy, startW: p.w, p0: { x: e.clientX, y: e.clientY }, moved: false };
      // поднимаем выбранную вещь внутри слоя
      p.order = Math.max(0, ...S.draft.placements.map((q) => q.order)) + 1;
      S.draft.selected = p.itemId;
      for (const n of stage.querySelectorAll('.piece')) n.classList.toggle('selected', n === el);
      el.style.zIndex = CATS[item(p.itemId).category].layer * 100 + 99;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      g.dist0 = Math.hypot(a.x - b.x, a.y - b.y); g.startW = p.w;
      g.mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; g.startCx = p.cx; g.startCy = p.cy;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!g || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = g.p;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      p.w = Math.min(CANVAS_W * 1.6, Math.max(20, g.startW * (dist / g.dist0)));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.cx = g.startCx + (mid.x - g.mid0.x) / k; p.cy = g.startCy + (mid.y - g.mid0.y) / k;
    } else {
      const dx = (e.clientX - g.p0.x) / k, dy = (e.clientY - g.p0.y) / k;
      if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
      p.cx = g.startCx + dx; p.cy = g.startCy + dy;
    }
    p.cx = Math.max(-20, Math.min(CANVAS_W + 20, p.cx)); p.cy = Math.max(-20, Math.min(CANVAS_H + 20, p.cy));
    g.el.style.left = p.cx * k + 'px'; g.el.style.top = p.cy * k + 'px'; g.el.style.width = p.w * k + 'px';
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) { const [a] = [...pointers.values()]; g.p0 = a; g.startCx = g.p.cx; g.startCy = g.p.cy; }
    if (pointers.size === 0 && g) {
      const it = item(g.p.itemId);
      S.draft.msg = describe(it.id, S.draft.placements);
      g = null; render();
    }
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
}

function bindCutout() {
  const tol = document.getElementById('tol');
  if (tol) tol.addEventListener('input', () => { S.pending.tol = +tol.value; document.getElementById('tolv').textContent = tol.value; });
  const nm = document.getElementById('iname');
  if (nm) nm.addEventListener('input', () => (S.pending.name = nm.value));
}

// ───────────────────────── Вырезка: поток ─────────────────────────
async function startCutout(file) {
  if (!file) return;
  const original = await loadImage(file);
  S.pending = { file, original, originalURL: URL.createObjectURL(file), cutout: null, category: 'tee', tol: 42, view: 'cut', busy: 'Вырезаем фон…', rev: 0, name: '', edge: false, coverage: 0 };
  go('cutout');
  await recut();
}
async function recut() {
  const p = S.pending; if (!p) return;
  p.busy = 'Вырезаем фон…'; render();
  await new Promise((r) => setTimeout(r, 30));
  const res = cutoutFloodFill(p.original, p.tol);
  p.busy = null; p.ml = false;
  if (res) { p.cutout = await toBlob(res.canvas); p.coverage = res.coverage; p.cutW = res.canvas.width; p.cutH = res.canvas.height; p.rev++; p.view = 'cut'; }
  else { p.cutout = null; p.view = 'photo'; toast('Фон не отделился — попробуйте нейросеть или другое фото'); }
  render();
}
async function recutML() {
  const p = S.pending; if (!p) return;
  p.busy = 'Нейросеть вырезает фон… первый раз это может занять минуту'; render();
  try {
    const res = await cutoutML(p.file);
    p.cutout = await toBlob(res.canvas); p.coverage = 1; p.cutW = res.canvas.width; p.cutH = res.canvas.height; p.rev++; p.view = 'cut'; p.ml = true;
  } catch (e) { console.warn(e); p.mlFailed = true; toast('Нейросеть недоступна офлайн или в этом браузере'); }
  p.busy = null; render();
}
async function saveItem(then) {
  const p = S.pending; if (!p) return;
  let blob = p.cutout, w = p.cutW, h = p.cutH;
  if (!blob) { // фон не отделился: сохраняем как есть, уменьшив
    const res = cropTransparent(p.original); blob = await toBlob(res.canvas); w = res.canvas.width; h = res.canvas.height;
  }
  const it = { id: uid(), name: (p.name || '').trim() || CATS[p.category].title, category: p.category, createdAt: Date.now(), favorite: false, blob, w, h };
  await putItem(it);
  URL.revokeObjectURL(p.originalURL); S.pending = null;
  if (then === 'editor') { toggleInDraft(it.id); go('editor'); }
  else { toast(`«${it.name}» в гардеробе · слой ${CATS[it.category].layer}`); go('wardrobe'); }
}

// ───────────────────────── Навигация и действия ─────────────────────────
function go(view) { location.hash = view; }
async function route() {
  const h = location.hash.slice(1) || 'home';
  const [v, arg] = h.split('/');
  if (v === 'look' && arg) {
    const l = S.looks.find((x) => x.id === arg);
    if (l) { S.draft = { lookId: l.id, placements: l.placements.map((p) => ({ ...p })), selected: null, msg: `«${l.name}» — ${looksMeta(l.placements)}. Можно менять.` }; }
    return go('editor');
  }
  if (v === 'tryon' && arg) {
    if (item(arg) && !S.draft.placements.some((p) => p.itemId === arg)) toggleInDraft(arg);
    return go('editor');
  }
  if (v === 'cutout' && !S.pending) return go('add');
  if (v === 'save') {
    if (!S.draft.placements.length) return go('editor');
    const look = S.draft.lookId ? S.looks.find((l) => l.id === S.draft.lookId) : null;
    S.save = look ? { name: look.name, occasions: [...(look.occasions || [])], weather: look.weather || null, story: false } : { name: '', occasions: ['Работа'], weather: 'Прохладно', story: false };
    const t = await renderLookThumb(S.draft.placements); S.saveThumbBlob = t; S.saveThumb = URL.createObjectURL(t);
  }
  S.view = ['home', 'wardrobe', 'add', 'cutout', 'editor', 'save'].includes(v) ? v : 'home';
  render();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (b.tagName === 'BUTTON' || b.closest('a')) e.preventDefault();
  switch (act) {
    case 'demo': await addDemoItems(); break;
    case 'home-fav': S.homeFav = !S.homeFav; render(); break;
    case 'home-all': S.homeFav = false; render(); break;
    case 'install': installPrompt?.prompt(); break;
    case 'hide-install': localStorage.setItem('hideInstall', '1'); render(); break;
    case 'wgroup': S.wardrobeGroup = b.dataset.g; render(); break;
    case 'egroup': S.editorGroup = b.dataset.g; render(); break;
    case 'fav-item': { const it = item(id); it.favorite = !it.favorite; await putItem(it); render(); break; }
    case 'del-item': { const it = item(id); if (confirm(`Удалить «${it.name}» из гардероба и из всех образов?`)) { await deleteItem(id); render(); } break; }
    case 'fav-look': { const l = S.looks.find((x) => x.id === id); l.favorite = !l.favorite; await putLook(l); render(); break; }
    case 'del-look': { const l = S.looks.find((x) => x.id === id); if (confirm(`Удалить образ «${l.name}»?`)) { await deleteLook(id); go('home'); render(); } break; }
    case 'share-look': { const l = S.looks.find((x) => x.id === id); toast('Готовим карточку…'); await shareBlob(await renderStoryCard(l), `layered-${l.name || 'look'}.png`, l.name); break; }
    case 'pick-camera': document.getElementById('file-camera').click(); break;
    case 'pick-gallery': document.getElementById('file-gallery').click(); break;
    case 'view-photo': S.pending.view = 'photo'; render(); break;
    case 'view-cut': S.pending.view = 'cut'; render(); break;
    case 'toggle-edge': S.pending.edge = !S.pending.edge; render(); break;
    case 'recut': await recut(); break;
    case 'ml': await recutML(); break;
    case 'cat': S.pending.category = b.dataset.k; render(); break;
    case 'save-item': await saveItem(b.dataset.then); break;
    case 'toggle': toggleInDraft(id); render(); break;
    case 'select': S.draft.selected = id; S.draft.msg = describe(id, S.draft.placements); render(); break;
    case 'remove': toggleInDraft(id); render(); break;
    case 'undo': { const last = S.draft.placements.reduce((m, p) => (!m || p.order > m.order ? p : m), null); if (last) { toggleInDraft(last.itemId); render(); } break; }
    case 'done': go('save'); break;
    case 'occ': { const v = b.dataset.v, o = S.save.occasions; const i = o.indexOf(v); i >= 0 ? o.splice(i, 1) : o.push(v); render(); break; }
    case 'wx': S.save.weather = S.save.weather === b.dataset.v ? null : b.dataset.v; render(); break;
    case 'save-look': {
      const name = (document.getElementById('lookname')?.value || '').trim() || 'Образ ' + (S.looks.length + 1);
      const story = document.getElementById('story')?.checked;
      const existing = S.draft.lookId ? S.looks.find((l) => l.id === S.draft.lookId) : null;
      const look = { id: existing?.id || uid(), name, occasions: [...S.save.occasions], weather: S.save.weather, placements: S.draft.placements.map((p) => ({ ...p })), thumb: S.saveThumbBlob, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), favorite: existing?.favorite || false };
      await putLook(look);
      resetDraft(); toast(existing ? 'Образ обновлён' : `«${name}» сохранён`);
      go('home');
      if (story) await shareBlob(await renderStoryCard(look), `layered-${name}.png`, name);
      break;
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'wq') { S.wardrobeQuery = e.target.value; const grid = app.querySelector('.grid2, .empty'); const tmp = document.createElement('div'); tmp.innerHTML = renderWardrobe(); const fresh = tmp.querySelector('.grid2, .empty'); if (grid && fresh) grid.replaceWith(fresh); }
  if (e.target.id === 'lookname') S.save.name = e.target.value;
});
for (const inputId of ['file-camera', 'file-gallery']) {
  document.getElementById(inputId).addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) { try { await startCutout(f); } catch (err) { console.error(err); toast('Не удалось открыть фото'); } }
  });
}
window.addEventListener('hashchange', route);

// ───────────────────────── Старт ─────────────────────────
(async function init() {
  try { [S.items, S.looks] = await Promise.all([dbAll('items'), dbAll('looks')]); }
  catch (e) { console.error(e); toast('Хранилище недоступно — данные не сохранятся'); }
  await route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
