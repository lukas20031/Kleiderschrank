'use strict';
/* ---------------- Lupe: Teile per Beschreibung oder Foto finden (ähnlich Google Lens) ----------------
 * Text: Abgleich mit allen Feldern eines Teils – Wortstämme („rote“ = „Rot“), zusammengesetzte Wörter
 *       („Winterjacke“), kleine Tippfehler und einige Synonyme („Pulli“, „navy“, „Sneaker“ …).
 * Foto: Bildmerkmale mit MobileCLIP (läuft komplett auf dem Gerät, Modell wird einmalig geladen)
 *       plus Farbverteilung. Ohne Modell (z. B. offline beim ersten Mal) wird nur nach Farben gesucht.
 * Text im Bild: Der Suchtext wird auf dem Gerät ins Englische übersetzt (opus-mt-de-en), mit dem Textteil von MobileCLIP
 *       in Merkmale umgewandelt und mit den Fotos verglichen – so findet „Skorpion“ auch einen Ring mit Skorpion,
 *       ohne dass das Wort beim Teil steht. Lässt sich im Dialog abschalten.
 * Die Bildmerkmale der eigenen Fotos werden in einer eigenen IndexedDB („kleiderschrank-lupe“) zwischengespeichert;
 * sie werden nicht synchronisiert und bei Bedarf neu berechnet. */

const LENS_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0';
const LENS_MODEL = 'Xenova/mobileclip_s0';
const LENS_KEY = 'mclip_s0'; // Präfix im Zwischenspeicher – bei Modellwechsel ändern
const LENS_TRANSLATE = 'Xenova/opus-mt-de-en';
const lensKiOn = () => localStorage.getItem('ks_lensKi') !== '0'; // Text auch im Bildinhalt suchen

/* ---------- Zwischenspeicher für Bildmerkmale ---------- */
const LensDB = {
  db: null,
  open() {
    this.db ??= new Promise((res, rej) => {
      const r = indexedDB.open('kleiderschrank-lupe', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('vec', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch((e) => { this.db = null; throw e; });
    return this.db;
  },
  async req(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('vec', mode);
      const q = fn(t.objectStore('vec'));
      t.oncomplete = () => res(q?.result);
      t.onerror = () => rej(t.error);
    });
  },
};
const lensVecs = new Map();   // Foto-ID -> Float32Array (Bildmerkmale)
const lensHists = new Map();  // Foto-ID -> Float32Array (Farbverteilung, nur im Speicher)
let lensVecsLoaded = null;
function loadLensVecs() {
  lensVecsLoaded ??= LensDB.req('readonly', (s) => s.getAll()).then((all) => {
    const stale = [];
    for (const r of all || []) {
      const [k, pid] = [r.id.slice(0, r.id.indexOf('|')), r.id.slice(r.id.indexOf('|') + 1)];
      if (k === LENS_KEY && photoMap.has(pid)) lensVecs.set(pid, r.v); else stale.push(r.id);
    }
    // Merkmale gelöschter Fotos (oder eines alten Modells) aufräumen
    if (stale.length) LensDB.req('readwrite', (s) => { for (const id of stale) s.delete(id); }).catch(() => {});
  }).catch((e) => { console.warn('Lupe: Zwischenspeicher nicht lesbar', e); });
  return lensVecsLoaded;
}

/* ---------- KI-Modell (MobileCLIP, nur der Bildteil) ---------- */
let lensLib = null;
let lensProgress = null; // (geladen, gesamt) während des Downloads
const lensSizes = new Map();
const progress_callback = (p) => {
  if (p.status !== 'progress' || !p.total) return;
  lensSizes.set(`${p.name}/${p.file}`, [p.loaded, p.total]);
  let l = 0, t = 0;
  for (const [a, b] of lensSizes.values()) { l += a; t += b; }
  lensProgress?.(l, t);
};
function loadLensModel() {
  lensLib ??= (async () => {
    const T = await import(LENS_LIB);
    T.env.allowLocalModels = false;
    const processor = await T.AutoProcessor.from_pretrained(LENS_MODEL, { progress_callback });
    const model = await T.CLIPVisionModelWithProjection.from_pretrained(LENS_MODEL, { device: 'wasm', dtype: 'fp32', progress_callback });
    return { T, processor, model };
  })().catch((e) => { lensLib = null; throw e; });
  return lensLib;
}
/** Bild (Canvas/Bitmap) auf ein Quadrat mit weißem Grund bringen – so zählt das ganze Teil, nicht nur die Mitte */
function lensSquare(src, size = 256) {
  const c = newCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  const s = Math.min((size * 0.94) / src.width, (size * 0.94) / src.height);
  const w = src.width * s, h = src.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
  return c;
}
let lensQueue = Promise.resolve(); // Modell immer nur einmal gleichzeitig rechnen lassen
function lensEmbed(src) {
  const job = lensQueue.then(async () => {
    const { T, processor, model } = await loadLensModel();
    const c = lensSquare(src);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const rgb = new Uint8ClampedArray(c.width * c.height * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    const inputs = await processor(new T.RawImage(rgb, c.width, c.height, 3));
    const { image_embeds } = await model(inputs);
    const v = Float32Array.from(image_embeds.data);
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  });
  lensQueue = job.catch(() => {});
  return job;
}
/** Textteil von MobileCLIP + Übersetzer Deutsch → Englisch (werden erst bei der ersten Textsuche im Bild geladen) */
let lensTextLib = null;
function loadLensText() {
  lensTextLib ??= (async () => {
    const { T } = await loadLensModel();
    const tokenizer = await T.AutoTokenizer.from_pretrained(LENS_MODEL, { progress_callback });
    const textModel = await T.CLIPTextModelWithProjection.from_pretrained(LENS_MODEL, { device: 'wasm', dtype: 'q8', progress_callback });
    const translator = await T.pipeline('translation', LENS_TRANSLATE, { device: 'wasm', dtype: 'q8', progress_callback });
    return { tokenizer, textModel, translator };
  })().catch((e) => { lensTextLib = null; throw e; });
  return lensTextLib;
}
const unit = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; };
const lensTextCache = new Map(); // Suchtext -> { en, vec }
/** Suchtext übersetzen und in Bildmerkmale umwandeln */
function lensTextEmbed(text) {
  const key = fold(text);
  if (lensTextCache.has(key)) return Promise.resolve(lensTextCache.get(key));
  const job = lensQueue.then(async () => {
    const { tokenizer, textModel, translator } = await loadLensText();
    let en = text;
    try {
      // Einzelne Wörter groß schreiben, damit sie als Substantiv übersetzt werden („skorpion“ → „Skorpion“)
      const de = /\s/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
      const [out] = await translator(de, { max_new_tokens: 40 });
      en = (out?.translation_text || text).replace(/[.!?]+$/, '').trim() || text;
    } catch (e) { console.warn('Lupe: Übersetzung fehlgeschlagen', e); }
    const inputs = tokenizer([`a photo of ${en}`], { padding: 'max_length', truncation: true });
    const { text_embeds } = await textModel(inputs);
    const res = { en, vec: unit(Float32Array.from(text_embeds.data)) };
    lensTextCache.set(key, res);
    return res;
  });
  lensQueue = job.catch(() => {});
  return job;
}
const dotp = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/* ---------- Farbverteilung ---------- */
const LENS_PAL = AUTO_COLORS.map(([, lab]) => lab);
const LENS_PAL_SIM = LENS_PAL.map((a) => LENS_PAL.map((b) => Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) / (2 * 22 ** 2))));
/** Anteil jeder Palettenfarbe; freigestellt: nur das Motiv, sonst die mittlere Bildfläche */
function colorHist(src, transparent) {
  const t = scaled(src, 72);
  const ctx = t.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, t.width, t.height);
  const d = ctx.getImageData(0, 0, t.width, t.height).data;
  const h = new Float32Array(LENS_PAL.length);
  let total = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
    if (!transparent && (x < t.width * 0.2 || x > t.width * 0.8 || y < t.height * 0.2 || y > t.height * 0.8)) continue;
    const i = (y * t.width + x) * 4;
    if (d[i + 3] < 200) continue;
    const lab = toLab(d[i], d[i + 1], d[i + 2]);
    let best = 0, bd = Infinity;
    for (let k = 0; k < LENS_PAL.length; k++) {
      const c = LENS_PAL[k];
      const dd = (lab[0] - c[0]) ** 2 + (lab[1] - c[1]) ** 2 + (lab[2] - c[2]) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    }
    h[best]++; total++;
  }
  if (total) for (let k = 0; k < h.length; k++) h[k] /= total;
  return h;
}
/** Ähnlichkeit zweier Farbverteilungen (0–1); ähnliche Farbtöne zählen teilweise mit */
function histSim(a, b) {
  const q = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) if (x[i]) for (let j = 0; j < y.length; j++) if (y[j]) s += x[i] * y[j] * LENS_PAL_SIM[i][j]; return s; };
  const n = Math.sqrt(q(a, a) * q(b, b));
  return n ? q(a, b) / n : 0;
}

/* ---------- Textsuche ---------- */
const fold = (s) => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const LENS_STOP = new Set(['mit', 'und', 'ein', 'eine', 'einen', 'einer', 'eines', 'der', 'die', 'das', 'den', 'dem', 'des', 'in', 'im', 'von', 'vom',
  'fuer', 'aus', 'am', 'an', 'auf', 'zum', 'zur', 'oder', 'mein', 'meine', 'meinen', 'meiner', 'ich', 'suche', 'alle', 'etwas', 'sehr', 'so', 'wie', 'the', 'a', 'with']);
/** Einfacher Wortstamm: Endungen wie in „rote“, „schwarzer“, „Jacken“, „Schuhe“ abschneiden */
function stem(w) {
  for (const suf of ['ern', 'en', 'er', 'es', 'em', 'e', 'n', 's']) {
    if (suf === 's' && w.endsWith('ss')) continue;
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}
/** Wörter eines Textes: Teile („t“, „shirt“) und zusammengeschrieben („tshirt“) */
function lensWords(text) {
  const out = new Set();
  for (const chunk of fold(text).split(/\s+/)) {
    const parts = chunk.split(/[^a-z0-9]+/).filter(Boolean);
    for (const p of parts) out.add(stem(p));
    if (parts.length > 1) out.add(stem(parts.join('')));
  }
  out.delete('');
  return [...out];
}
// Gefaltete Suchwörter -> zusätzliche Begriffe (gelten etwas schwächer als das Wort selbst)
const LENS_SYN = {
  shirt: ['t-shirt', 'kurzarmshirt', 'langarmshirt'], tshirt: ['t-shirt'], tee: ['t-shirt'], top: ['tanktop'],
  pulli: ['pullover', 'sweatshirt'], pullis: ['pullover', 'sweatshirt'], sweater: ['pullover', 'sweatshirt'], jumper: ['pullover'], strickpulli: ['pullover', 'strick'],
  hoody: ['hoodie'], kapuzenpulli: ['hoodie'], kapuzenpullover: ['hoodie'], sweatjacke: ['sweatshirtjacke'], kapuzenjacke: ['sweatshirtjacke', 'hoodie'],
  jacket: ['jacke'], coat: ['mantel'], pants: ['hose'], trousers: ['hose'], jeanshose: ['jeans'], kurze: ['shorts'], bermuda: ['bermudashorts'],
  sneaker: ['turnschuh', 'sneaker'], sneakers: ['turnschuh', 'sneaker'], turnschuh: ['sneaker'], turnschuhe: ['sneaker'], stiefel: ['boots'], boots: ['stiefel'],
  dress: ['kleid'], skirt: ['rock'], muetze: ['beanie', 'muetze'], beanie: ['muetze'], kappe: ['cap', 'basecap'], cap: ['kappe', 'basecap'], basecap: ['cap'],
  navy: ['dunkelblau'], marine: ['dunkelblau'], marineblau: ['dunkelblau'], hellblau: ['himmelblau'], lila: ['violett', 'lavendel'], purple: ['violett'],
  weinrot: ['bordeaux'], dunkelrot: ['bordeaux'], creme: ['ecru', 'beige'], cremefarben: ['ecru', 'beige'], anthrazit: ['grau'], dunkelgrau: ['grau'], hellgrau: ['grau'],
  oliv: ['olivgruen'], khakigruen: ['olivgruen', 'khaki'], bunt: ['mehrfarbig'], camel: ['hellbraun', 'beige'],
  red: ['rot'], blue: ['blau'], black: ['schwarz'], white: ['weiss'], grey: ['grau'], gray: ['grau'], green: ['gruen'], yellow: ['gelb'], brown: ['braun'], pink: ['pink', 'rosa'],
  wool: ['wolle'], cotton: ['baumwolle'], leather: ['leder'], kaschmir: ['cashmere'], cashmere: ['kaschmir'], jeansstoff: ['denim'], denim: ['jeans'],
  warm: ['winter'], kalt: ['winter'], heiss: ['sommer'], regen: ['regenmantel', 'regenjacke'],
  buero: ['arbeit'], business: ['arbeit'], hochzeit: ['festlich'], party: ['festlich'], gym: ['sport'], fitness: ['sport'], joggen: ['sport'], laufen: ['sport'], wandern: ['outdoor'],
};
const LENS_FIELDS = [
  ['name', 1], ['typ', 1], ['unterkategorie', 0.9], ['kategorie', 0.7], ['farben', 0.9], ['marke', 0.9], ['materialien', 0.8],
  ['groesse', 0.6], ['passform', 0.45], ['herkunft', 0.5], ['lagerort', 0.5], ['zustand', 0.4], ['pflege', 0.3],
  ['anlass', 0.6], ['jahreszeit', 0.6], ['notiz', 0.5], ['status', 0.5], ['_tags', 0.5], ['_waesche', 0.5],
];
// Gewicht je Farbrolle: Teile, bei denen die gesuchte Farbe Hauptfarbe ist, kommen zuerst
const LENS_ROLLE_W = { Hauptfarbe: 1, Nebenfarbe: 0.75, Akzentfarbe: 0.55, '': 0.85 };
function lensDoc(it) {
  return LENS_FIELDS.flatMap(([key, w]) => {
    if (key === 'farben') return fieldValues(it, 'farben').map((c) => [w * LENS_ROLLE_W[farbRolle(it, c)], lensWords(c)]);
    return [lensDocField(it, key, w)];
  }).filter(([, ws]) => ws.length);
}
function lensDocField(it, key, w) {
  let vals;
  if (key === '_tags') vals = Object.values(it.photoTags || {}).flat();
  else if (key === '_waesche') vals = washN(it) ? ['Wäsche'] : [];
  else if (FIELD[key]) vals = ['price', 'date', 'url', 'count'].includes(FIELD[key].type) ? [] : fieldValues(it, key);
  else vals = asList(it[key]);
  return [w, lensWords(vals.join(' '))];
}
function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** Wie gut passt ein Suchwort zu einem Wort des Teils? (beide als Stamm) */
function wordMatch(q, w, strict = false) {
  if (q === w) return 1;
  if (q.length >= 3 && w.startsWith(q)) return 0.85;         // „pull“ → „pullover“
  if (strict) return 0;                                      // Synonyme: nur ganze Wörter bzw. Wortanfang
  if (q.length >= 3 && w.includes(q)) return 0.7;            // „jack“ → „winterjack“
  if (w.length >= 3 && q.startsWith(w)) return 0.7;          // „lederjack“ → „leder“
  if (w.length >= 4 && q.includes(w)) return 0.6;            // „winterjack“ → „jack“
  if (q.length >= 4 && w.length >= 4) {                      // Tippfehler
    const max = q.length >= 7 ? 2 : 1;
    if (levenshtein(q, w, max) <= max) return 0.6;
  }
  return 0;
}
/** Suchbegriffe: jedes Wort mit seinen Alternativen [[stamm, gewicht, nurGanzeWörter], …] */
function lensTerms(text) {
  const terms = [];
  for (const raw of fold(text).split(/\s+/)) {
    const parts = raw.split(/[^a-z0-9]+/).filter(Boolean);
    if (!parts.length) continue;
    const joined = parts.join('');
    if (parts.length === 1 && LENS_STOP.has(joined)) continue;
    const alts = [[stem(joined), 1]];
    if (parts.length > 1) for (const p of parts) if (p.length >= 3) alts.push([stem(p), 0.8]);
    for (const s of LENS_SYN[joined] || []) for (const w of lensWords(s)) alts.push([w, 0.9, true]);
    terms.push(alts);
  }
  return terms;
}
/** Text-Treffer: Map id -> Wert (0–1) */
function lensTextScores(text, pool) {
  const terms = lensTerms(text);
  const out = new Map();
  if (!terms.length) return out;
  for (const it of pool) {
    const doc = lensDoc(it);
    let sum = 0, hit = 0;
    for (const alts of terms) {
      let best = 0;
      for (const [q, aw, strict] of alts) for (const [fw, words] of doc) {
        if (aw * fw <= best) continue;
        for (const w of words) { const m = wordMatch(q, w, strict) * aw * fw; if (m > best) best = m; }
      }
      sum += best;
      if (best >= 0.3) hit++;
    }
    // Wörter, die gar nicht passen, ziehen stark nach unten (alle Wörter sollen möglichst passen)
    const score = (sum / terms.length) * (0.4 + 0.6 * (hit / terms.length));
    if (score >= 0.25) out.set(it.id, score);
  }
  return out;
}

/* ---------- Dialog ---------- */
const Lens = { photo: null, run: 0, info: '' };
const lensPool = () => (tab === 'wish' ? wishes : items.filter((it) => matchSpecial(it, { status: filters.status })));

function openLens() {
  $('#lensTitle').textContent = tab === 'wish' ? 'Wünsche finden' : 'Teile finden';
  $('#lensDlg').showModal();
  toTop($('#lensDlg'));
  loadLensVecs();
  lensSearch();
}
function lensStatus(text, frac = null) {
  $('#lensStatus').hidden = !text;
  $('#lensStatusText').textContent = text || '';
  $('#lensStatus').classList.toggle('indet', frac === null);
  $('#lensBar').style.width = frac === null ? '' : `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
}
function renderLensPhoto() {
  const p = Lens.photo;
  $('#lensPhoto').hidden = !p;
  if (p) $('#lensImg').src = p.url;
}
async function lensSetFile(file) {
  if (!file) return;
  let canvas;
  try { canvas = await fileToCanvas(file); } catch (e) { return toast('Foto konnte nicht gelesen werden: ' + e.message); }
  await lensCrop(canvas);
}
/** Ausschnitt wählen (und optional freistellen), dann suchen */
async function lensCrop(orig) {
  const res = await Crop.edit(orig, 'Suchbereich wählen');
  if (!res) return;
  if (Lens.photo) URL.revokeObjectURL(Lens.photo.url);
  const thumb = await toJpeg(lensSquare(res.canvas, 200), 200, 0.85);
  Lens.photo = { orig, canvas: res.canvas, transparent: res.transparent, url: URL.createObjectURL(thumb), vec: null, hist: null };
  renderLensPhoto();
  lensSearch();
}
function lensClearPhoto() {
  if (Lens.photo) URL.revokeObjectURL(Lens.photo.url);
  Lens.photo = null;
  renderLensPhoto();
  lensSearch();
}

/** Bildmerkmale/Farben für die Fotos berechnen, die noch fehlen. Gibt false zurück, wenn abgebrochen. */
async function lensIndex(pids, run, withVec) {
  const todo = pids.filter((pid) => (withVec && !lensVecs.has(pid)) || !lensHists.has(pid));
  let done = 0;
  for (const pid of todo) {
    if (run !== Lens.run || !$('#lensDlg').open) return false;
    const rec = photoMap.get(pid);
    const blob = rec?.thumb || rec?.full;
    done++;
    if (!blob) continue;
    let bmp;
    try {
      bmp = await loadBitmap(blob);
      if (!lensHists.has(pid)) lensHists.set(pid, colorHist(bmp, isPng(pid)));
      if (withVec && !lensVecs.has(pid)) {
        const v = await lensEmbed(bmp);
        lensVecs.set(pid, v);
        LensDB.req('readwrite', (s) => s.put({ id: `${LENS_KEY}|${pid}`, v })).catch(() => {});
      }
    } catch (e) { console.warn('Lupe: Foto übersprungen', pid, e); } finally { bmp?.close?.(); }
    if (todo.length > 2 && run === Lens.run) lensStatus(`Deine Fotos werden analysiert … ${done} / ${todo.length}`, done / todo.length);
  }
  return true;
}

let lensTimer = null;
function lensSearchSoon() { clearTimeout(lensTimer); lensTimer = setTimeout(lensSearch, 180); }

async function lensSearch() {
  clearTimeout(lensTimer);
  const run = ++Lens.run;
  const pool = lensPool();
  const text = $('#lensText').value.trim();
  const ph = Lens.photo;
  Lens.info = '';
  if (!text && !ph) { lensStatus(''); return lensShow([], 'start'); }
  const textScores = text ? lensTextScores(text, pool) : null;
  if (!ph) {
    lensStatus('');
    lensShow(lensRank(pool, textScores, null), 'text');
    if (lensKiOn() && fold(text).replace(/[^a-z0-9]/g, '').length >= 3) await lensTextVisual(run, text, pool, textScores);
    return;
  }

  // Foto: zuerst das Suchfoto selbst analysieren
  ph.hist ??= colorHist(ph.canvas, ph.transparent);
  let useVec = true;
  if (!ph.vec) {
    try {
      lensProgress = (l, t) => { if (run === Lens.run) lensStatus(`Bilderkennung wird geladen (einmalig) … ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB`, l / t); };
      lensStatus('Bilderkennung wird vorbereitet …');
      await loadLensModel();
      lensProgress = null;
      if (run !== Lens.run) return;
      lensStatus('Foto wird analysiert …');
      ph.vec = await lensEmbed(ph.canvas);
    } catch (e) {
      console.warn('Lupe: Bilderkennung nicht verfügbar', e);
      useVec = false;
      Lens.info = navigator.onLine ? 'Die Bilderkennung konnte nicht geladen werden – Suche nur nach Farben.' : 'Offline: Die Bilderkennung wird beim ersten Mal aus dem Netz geladen – bis dahin nur Suche nach Farben.';
    }
  }
  if (run !== Lens.run) return;
  await loadLensVecs();
  // Erst die Titelbilder (schnelles erstes Ergebnis), dann die übrigen Fotos
  const first = pool.map((it) => (it.photos || [])[0]).filter(Boolean);
  const rest = pool.flatMap((it) => (it.photos || []).slice(1));
  if (!await lensIndex(first, run, useVec)) return;
  lensShow(lensRank(pool, textScores, useVec ? ph : { ...ph, vec: null }), 'photo');
  if (rest.some((pid) => (useVec && !lensVecs.has(pid)) || !lensHists.has(pid))) {
    if (!await lensIndex(rest, run, useVec)) return;
    lensShow(lensRank(pool, textScores, useVec ? ph : { ...ph, vec: null }), 'photo');
  }
  if (run === Lens.run) lensStatus('');
}

/** Text zusätzlich im Bildinhalt suchen (nach kurzer Tipp-Pause) */
async function lensTextVisual(run, text, pool, textScores) {
  await sleep(450);
  if (run !== Lens.run) return;
  let q;
  try {
    lensProgress = (l, t) => { if (run === Lens.run) lensStatus(`KI-Modelle werden geladen (einmalig) … ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB`, l / t); };
    lensStatus('Suche im Bildinhalt wird vorbereitet …');
    await loadLensModel();
    await loadLensText();
    lensProgress = null;
    if (run !== Lens.run) return;
    lensStatus('Suchtext wird übersetzt …');
    q = await lensTextEmbed(text);
  } catch (e) {
    console.warn('Lupe: Suche im Bildinhalt nicht verfügbar', e);
    lensProgress = null;
    if (run !== Lens.run) return;
    Lens.info = navigator.onLine ? 'Suche im Bildinhalt nicht verfügbar.' : 'Offline: Die Suche im Bildinhalt braucht beim ersten Mal Netz.';
    lensStatus('');
    return lensShow(lensRank(pool, textScores, null), 'text');
  }
  if (run !== Lens.run) return;
  await loadLensVecs();
  const first = pool.map((it) => (it.photos || [])[0]).filter(Boolean);
  const rest = pool.flatMap((it) => (it.photos || []).slice(1));
  const show = () => {
    Lens.info = q.en && fold(q.en) !== fold(text) ? `im Bild gesucht: „${q.en}“` : '';
    lensShow(lensRankVisual(pool, textScores, q.vec), 'text');
  };
  if (!await lensIndex(first, run, true)) return;
  show();
  if (rest.some((pid) => !lensVecs.has(pid))) {
    if (!await lensIndex(rest, run, true)) return;
    show();
  }
  if (run === Lens.run) lensStatus('');
}
/** Text-Treffer (Angaben) mit Treffern im Bildinhalt zusammenführen.
 *  Die Text-Bild-Werte liegen eng beieinander – deshalb zählt, wie weit ein Teil über dem Durchschnitt liegt. */
function lensRankVisual(pool, textScores, qVec) {
  const sims = [];
  for (const it of pool) {
    let v = -Infinity;
    for (const pid of it.photos || []) { const e = lensVecs.get(pid); if (e) v = Math.max(v, dotp(qVec, e)); }
    if (v > -Infinity) sims.push([it, v]);
  }
  const vis = new Map();
  if (sims.length >= 3) {
    const mean = sims.reduce((a, [, v]) => a + v, 0) / sims.length;
    const sd = Math.sqrt(sims.reduce((a, [, v]) => a + (v - mean) ** 2, 0) / sims.length) || 1;
    const best = Math.max(...sims.map(([, v]) => v));
    for (const [it, v] of sims) {
      const z = (v - mean) / sd;
      // nur deutliche Ausreißer nach oben, und nicht weit hinter dem besten Treffer
      const w = Math.max(0, Math.min(1, (z - 1.2) / 2)) * (v >= best - 0.04 ? 1 : 0.4);
      if (w > 0) vis.set(it.id, w);
    }
  }
  const out = [];
  for (const it of pool) {
    const t = textScores.get(it.id) || 0, v = vis.get(it.id) || 0;
    const score = t + 0.55 * v;
    if (score >= 0.25) out.push({ it, score, rel: Math.min(1, score), ki: v > 0.15 && t < 0.3 });
  }
  return out.sort((a, b) => b.score - a.score || !!b.it.favorit - !!a.it.favorit).slice(0, 80);
}

/** Rangliste: [{ it, score, rel }] – rel (0–1) steuert den Balken auf der Karte */
function lensRank(pool, textScores, ph) {
  if (!ph) {
    return [...textScores].map(([id, s]) => ({ it: pool.find((x) => x.id === id), score: s, rel: Math.min(1, s) }))
      .sort((a, b) => b.score - a.score || !!b.it.favorit - !!a.it.favorit).slice(0, 80);
  }
  // Bildähnlichkeit je Teil = bestes seiner Fotos
  const img = [];
  for (const it of pool) {
    let v = -Infinity, c = 0, any = false;
    for (const pid of it.photos || []) {
      const h = lensHists.get(pid);
      if (h) { c = Math.max(c, histSim(ph.hist, h)); any = true; }
      const e = ph.vec && lensVecs.get(pid);
      if (e) v = Math.max(v, dotp(ph.vec, e));
    }
    if (!any) continue;
    img.push({ it, s: ph.vec && v > -Infinity ? v + 0.08 * c : c });
  }
  if (!img.length) return [];
  img.sort((a, b) => b.s - a.s);
  const best = img[0].s;
  // Spanne, in der Treffer noch als ähnlich gelten (CLIP-Werte liegen eng beieinander)
  const span = ph.vec ? 0.16 : 0.45;
  let list = img.map(({ it, s }) => {
    const rel = Math.max(0, Math.min(1, 1 - (best - s) / span));
    const t = textScores ? (textScores.get(it.id) || 0) : null;
    return { it, rel, score: t === null ? rel : 0.55 * rel + 0.45 * t, t };
  });
  if (textScores) list = list.filter((r) => r.t > 0 || r.rel > 0.85);
  list.sort((a, b) => b.score - a.score);
  const keep = list.filter((r, i) => i < 6 || r.score > 0.25).slice(0, 40);
  for (const r of keep) r.rel = textScores ? r.score : r.rel;
  return keep;
}

function lensShow(list, mode) {
  const grid = $('#lensGrid');
  const empty = $('#lensEmpty');
  const pool = lensPool();
  const what = tab === 'wish' ? ['Wunsch', 'Wünsche'] : ['Teil', 'Teile'];
  if (mode === 'start') {
    grid.innerHTML = '';
    $('#lensCount').textContent = '';
    empty.hidden = false;
    empty.innerHTML = `<p>Was suchst du?</p><p class="muted">Beschreibe das ${what[0]}, z. B. <b>„schwarze Lederjacke“</b>, <b>„Pulli Wolle Winter“</b> oder eine Marke – oder mach ein Foto davon. Die besten Treffer stehen oben.</p>
      <p class="muted small">Mit ✨ sucht die App deinen Text auch in den Fotos selbst – „Skorpion“ findet so z. B. einen Ring mit Skorpion, auch wenn das Wort nirgends steht. Die KI läuft auf deinem Gerät; beim ersten Mal werden die Modelle einmalig geladen.</p>`;
    return;
  }
  empty.hidden = list.length > 0;
  if (!list.length) empty.innerHTML = pool.length
    ? `<p>Nichts Passendes gefunden.</p><p class="muted">Versuche es mit anderen oder weniger Wörtern.</p>`
    : `<p>Noch keine ${what[1]} vorhanden.</p>`;
  $('#lensCount').textContent = [list.length ? `${list.length} ${list.length === 1 ? 'Treffer' : 'Treffer'}, beste zuerst` : '', Lens.info].filter(Boolean).join(' · ');
  grid.innerHTML = list.map(({ it, rel, ki }, i) => itemCardHtml(it).replace(/<\/button>\s*$/,
    `${ki ? '<span class="lensai" title="Im Foto erkannt">✨ im Bild</span>' : ''}<span class="lensmatch${i === 0 ? ' top' : ''}" title="Übereinstimmung"><span style="width:${Math.round(15 + 85 * rel)}%"></span></span></button>`)).join('');
}

function wireLens() {
  $('#lensBtn').addEventListener('click', openLens);
  $('#lensText').addEventListener('input', lensSearchSoon);
  $('#lensText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); lensSearch(); } });
  for (const id of ['#lensCamera', '#lensGallery']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; lensSetFile(f); });
  }
  $('#lensClear').addEventListener('click', lensClearPhoto);
  $('#lensKi').checked = lensKiOn();
  $('#lensKi').addEventListener('change', (e) => { localStorage.setItem('ks_lensKi', e.target.checked ? '1' : '0'); lensSearch(); });
  $('#lensRecrop').addEventListener('click', () => { if (Lens.photo) lensCrop(Lens.photo.orig); });
  $('#lensGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });
  $('#lensDlg').addEventListener('close', () => { Lens.run++; lensStatus(''); });
  // Daneben klicken schließt (Laptop)
  const dlg = $('#lensDlg');
  let downOutside = false;
  const outside = (e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  dlg.addEventListener('pointerdown', (e) => { downOutside = e.target === dlg && outside(e); });
  dlg.addEventListener('click', (e) => { if (downOutside && e.target === dlg && outside(e)) dlg.close(); downOutside = false; });
  // Bild aus der Zwischenablage einfügen (Strg+V)
  document.addEventListener('paste', (e) => {
    if (!$('#lensDlg').open || [...document.querySelectorAll('dialog[open]')].pop() !== dlg) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (!f) return;
    e.preventDefault();
    lensSetFile(f);
  });
}
wireLens();
