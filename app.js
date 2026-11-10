'use strict';
/* Kleiderschrank – digitale Garderobe mit OneDrive-Speicher
 * Offline-first: Alles liegt zuerst lokal (IndexedDB) und wird mit
 * OneDrive (App-Ordner, Microsoft Graph) synchronisiert.
 */
const APP_VERSION = '1.0.0';

const CFG = {
  authority: 'https://login.microsoftonline.com/consumers/oauth2/v2.0',
  scopes: 'Files.ReadWrite.AppFolder offline_access',
  graph: 'https://graph.microsoft.com/v1.0',
};

const FIELDS = [
  { key: 'kategorie', label: 'Kategorie', defaults: ['T-Shirt', 'Hemd', 'Bluse', 'Pullover', 'Hoodie', 'Hose', 'Jeans', 'Shorts', 'Kleid', 'Rock', 'Jacke', 'Mantel', 'Anzug', 'Schuhe', 'Sportbekleidung', 'Unterwäsche', 'Socken', 'Accessoire'] },
  { key: 'farbe', label: 'Farbe', defaults: ['Schwarz', 'Weiß', 'Grau', 'Blau', 'Dunkelblau', 'Rot', 'Grün', 'Braun', 'Beige', 'Gelb', 'Rosa', 'Lila', 'Orange', 'Bunt', 'Gemustert'] },
  { key: 'groesse', label: 'Größe', defaults: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { key: 'material', label: 'Material', defaults: ['Baumwolle', 'Wolle', 'Merinowolle', 'Leinen', 'Seide', 'Polyester', 'Viskose', 'Elasthan-Mix', 'Leder', 'Denim', 'Fleece', 'Daune'] },
  { key: 'marke', label: 'Marke', defaults: [] },
  { key: 'lagerort', label: 'Lagerort', defaults: ['Kleiderschrank', 'Kommode', 'Garderobe', 'Keller', 'Dachboden'] },
  { key: 'zustand', label: 'Zustand', defaults: ['Neu', 'Sehr gut', 'Gut', 'Getragen', 'Reparaturbedürftig', 'Aussortieren'] },
];
const ANLASS_DEFAULTS = ['Alltag', 'Arbeit', 'Freizeit', 'Sport', 'Outdoor', 'Festlich', 'Urlaub'];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ---------------- IndexedDB ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('kleiderschrank', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('items', { keyPath: 'id' });
        d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  get(store, key) { return this.tx(store, 'readonly', (s) => s.get(key)); },
  all(store) { return this.tx(store, 'readonly', (s) => s.getAll()); },
  put(store, val) { return this.tx(store, 'readwrite', (s) => s.put(val)); },
  del(store, key) { return this.tx(store, 'readwrite', (s) => s.delete(key)); },
};

/* ---------------- Anmeldung (OAuth 2.0 Auth-Code + PKCE) ---------------- */
class AuthNeeded extends Error { constructor() { super('Anmeldung erforderlich'); } }

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randStr = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

const Auth = {
  get clientId() { return (localStorage.getItem('ks_clientId') || '').trim(); },
  set clientId(v) { localStorage.setItem('ks_clientId', v.trim()); },
  redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); },
  tokens() { try { return JSON.parse(localStorage.getItem('ks_tokens')); } catch { return null; } },
  saveTokens(t) { localStorage.setItem('ks_tokens', JSON.stringify(t)); localStorage.setItem('ks_wasSignedIn', '1'); },
  signedIn() { return !!this.tokens(); },
  wasSignedIn() { return localStorage.getItem('ks_wasSignedIn') === '1'; },

  async login(silent = false) {
    if (!this.clientId) throw new Error('Bitte zuerst die Client-ID eintragen.');
    const verifier = randStr(48);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randStr(16);
    sessionStorage.setItem('ks_pkce', JSON.stringify({ verifier, state, silent }));
    const p = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      response_mode: 'query',
      scope: CFG.scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: silent ? 'none' : 'select_account',
    });
    location.assign(`${CFG.authority}/authorize?${p}`);
  },

  /** Verarbeitet die Rückkehr von der Microsoft-Anmeldeseite. */
  async handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return;
    const saved = JSON.parse(sessionStorage.getItem('ks_pkce') || 'null');
    sessionStorage.removeItem('ks_pkce');
    history.replaceState(null, '', this.redirectUri());
    if (p.get('error')) {
      if (saved?.silent) return; // stille Anmeldung nicht möglich -> Banner zeigt Button
      throw new Error(p.get('error_description') || p.get('error'));
    }
    if (!saved || saved.state !== p.get('state')) throw new Error('Anmeldung abgebrochen (ungültiger Status). Bitte erneut versuchen.');
    await this.tokenRequest({
      grant_type: 'authorization_code',
      code: p.get('code'),
      redirect_uri: this.redirectUri(),
      code_verifier: saved.verifier,
    });
  },

  async tokenRequest(params) {
    const body = new URLSearchParams({ client_id: this.clientId, scope: CFG.scopes, ...params });
    const r = await fetch(`${CFG.authority}/token`, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error_description || j.error || `Token-Fehler ${r.status}`);
      e.code = j.error;
      throw e;
    }
    const t = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (Number(j.expires_in || 3600) - 120) * 1000 };
    this.saveTokens(t);
    return t;
  },

  _refreshing: null,
  async accessToken(force = false) {
    const t = this.tokens();
    if (!t) throw new AuthNeeded();
    if (!force && Date.now() < t.exp) return t.access;
    if (!t.refresh) { this.clear(); throw new AuthNeeded(); }
    this._refreshing ??= this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
      .finally(() => { this._refreshing = null; });
    try {
      return (await this._refreshing).access;
    } catch (e) {
      if (e.code && e.code !== 'temporarily_unavailable') { this.clear(); throw new AuthNeeded(); }
      throw e;
    }
  },
  clear() { localStorage.removeItem('ks_tokens'); },
  logout() { this.clear(); localStorage.removeItem('ks_wasSignedIn'); },
};

/* ---------------- Microsoft Graph (OneDrive-App-Ordner) ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const G = {
  async req(method, path, { body, headers = {} } = {}, attempt = 0) {
    const url = path.startsWith('http') ? path : CFG.graph + path;
    const tok = await Auth.accessToken(attempt > 0 && this._lastWas401);
    const r = await fetch(url, { method, body, headers: { Authorization: `Bearer ${tok}`, ...headers } });
    this._lastWas401 = r.status === 401;
    if ((r.status === 401 || r.status === 429 || r.status >= 500) && attempt < 3) {
      const wait = r.status === 401 ? 0 : (Number(r.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      await sleep(wait);
      return this.req(method, path, { body, headers }, attempt + 1);
    }
    if (r.status === 401) { Auth.clear(); throw new AuthNeeded(); }
    return r;
  },
  path(p) { return '/me/drive/special/approot:/' + p.split('/').map(encodeURIComponent).join('/'); },
  async fail(r, what) {
    let msg = '';
    try { msg = (await r.json()).error?.message || ''; } catch { /* ignore */ }
    return new Error(`${what}: ${r.status} ${msg}`.trim());
  },
  async list(folder) {
    const out = [];
    let url = this.path(folder) + ':/children?$top=200';
    while (url) {
      const r = await this.req('GET', url);
      if (r.status === 404) return out;
      if (!r.ok) throw await this.fail(r, 'Ordner lesen');
      const j = await r.json();
      out.push(...j.value);
      url = j['@odata.nextLink'] || null;
    }
    return out;
  },
  async put(p, blob, type) {
    const r = await this.req('PUT', this.path(p) + ':/content', { body: blob, headers: { 'Content-Type': type } });
    if (!r.ok) throw await this.fail(r, `Hochladen ${p}`);
    return r.json();
  },
  async del(p) {
    const r = await this.req('DELETE', this.path(p));
    if (!r.ok && r.status !== 404) throw await this.fail(r, `Löschen ${p}`);
  },
  /** Lädt eine Datei; nutzt die vorab signierte Download-URL. */
  async download(p, meta) {
    let url = meta?.['@microsoft.graph.downloadUrl'];
    if (!url) {
      const r = await this.req('GET', this.path(p));
      if (r.status === 404) return null;
      if (!r.ok) throw await this.fail(r, `Abrufen ${p}`);
      url = (await r.json())['@microsoft.graph.downloadUrl'];
    }
    const d = await fetch(url);
    if (!d.ok) throw new Error(`Download ${p}: ${d.status}`);
    return d.blob();
  },
};

/* ---------------- Zustand ---------------- */
let items = [];            // sichtbare (nicht gelöschte) Teile
let photoMap = new Map();  // photoId -> Datensatz {id, itemId, thumb, full, pendingUpload, pendingDelete}
const urlCache = new Map();
const filters = JSON.parse(localStorage.getItem('ks_filters') || '{}');

async function loadState() {
  items = (await DB.all('items')).filter((i) => !i._deleted);
  photoMap = new Map((await DB.all('photos')).map((p) => [p.id, p]));
}

function thumbUrl(pid) {
  const key = pid + ':t';
  if (urlCache.has(key)) return urlCache.get(key);
  const rec = photoMap.get(pid);
  const blob = rec?.thumb || rec?.full;
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  urlCache.set(key, u);
  return u;
}

async function fullUrl(pid) {
  const key = pid + ':f';
  if (urlCache.has(key)) return urlCache.get(key);
  let rec = photoMap.get(pid) || await DB.get('photos', pid);
  if (!rec?.full && Auth.signedIn() && navigator.onLine) {
    try {
      const blob = await G.download(`fotos/${pid}.jpg`);
      if (blob) {
        rec = { ...(rec || { id: pid }), full: blob };
        await DB.put('photos', rec);
        photoMap.set(pid, rec);
      }
    } catch (e) { console.warn(e); }
  }
  if (!rec?.full) return thumbUrl(pid);
  const u = URL.createObjectURL(rec.full);
  urlCache.set(key, u);
  return u;
}

function dropUrls(pid) {
  for (const k of [pid + ':t', pid + ':f']) {
    if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); }
  }
}

/* ---------------- Bildverarbeitung ---------------- */
async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { URL.revokeObjectURL(url); }
  }
}
function toJpeg(src, max, q) {
  const w = src.width, h = src.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', q));
}
async function processImage(file) {
  const bmp = await loadBitmap(file);
  const full = await toJpeg(bmp, 1600, 0.85);
  const thumb = await toJpeg(bmp, 480, 0.78);
  bmp.close?.();
  return { full, thumb };
}

/* ---------------- Synchronisation ---------------- */
let syncing = false, syncAgain = false, syncTimer = null;
const syncBtn = $('#syncBtn');

function setSync(state, text) {
  syncBtn.dataset.state = state;
  $('#syncText').textContent = text;
}
function updateSyncIndicator() {
  if (!Auth.clientId || (!Auth.signedIn() && !Auth.wasSignedIn())) return setSync('local', 'Lokal');
  if (!Auth.signedIn()) return setSync('login', 'Anmelden');
  if (!navigator.onLine) return setSync('offline', 'Offline');
  const pending = countPending();
  if (pending) return setSync('busy', `${pending} offen`);
  setSync('ok', 'Synchron');
}
function countPending() {
  let n = 0;
  for (const p of photoMap.values()) if (p.pendingUpload || p.pendingDelete) n++;
  return n + pendingItems;
}
let pendingItems = 0;
async function recountPending() {
  pendingItems = (await DB.all('items')).filter((i) => i._dirty || i._deleted).length;
}

function scheduleSync(ms = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync(), ms);
}

async function sync() {
  if (!Auth.clientId || !Auth.signedIn()) { await recountPending(); updateSyncIndicator(); return; }
  if (!navigator.onLine) { updateSyncIndicator(); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  setSync('busy', 'Sync …');
  try {
    await pushChanges();
    await pullChanges();
    localStorage.setItem('ks_lastSync', new Date().toISOString());
    await loadState();
    await recountPending();
    render();
    hideBanner();
    updateSyncIndicator();
  } catch (e) {
    console.error(e);
    if (e instanceof AuthNeeded) {
      showBanner('Die OneDrive-Anmeldung ist abgelaufen. Tippe hier, um dich erneut anzumelden.', () => Auth.login());
      setSync('login', 'Anmelden');
    } else {
      setSync('error', 'Fehler');
      toast('Synchronisierung fehlgeschlagen: ' + e.message);
    }
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}

function itemForUpload(it) {
  const out = {};
  for (const [k, v] of Object.entries(it)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

async function pushChanges() {
  // 1. Fotos zuerst, damit andere Geräte sie finden, sobald das JSON erscheint
  for (const ph of await DB.all('photos')) {
    if (ph.pendingDelete) {
      await G.del(`fotos/${ph.id}.jpg`);
      await G.del(`fotos/${ph.id}_t.jpg`);
      await DB.del('photos', ph.id);
    } else if (ph.pendingUpload) {
      await G.put(`fotos/${ph.id}.jpg`, ph.full, 'image/jpeg');
      await G.put(`fotos/${ph.id}_t.jpg`, ph.thumb, 'image/jpeg');
      const cur = await DB.get('photos', ph.id);
      if (cur && !cur.pendingDelete) { cur.pendingUpload = false; await DB.put('photos', cur); }
    }
  }
  // 2. Teile
  for (const it of await DB.all('items')) {
    if (it._deleted) {
      await G.del(`items/${it.id}.json`);
      const cur = await DB.get('items', it.id);
      if (cur?._deleted) await DB.del('items', it.id);
    } else if (it._dirty) {
      const blob = new Blob([JSON.stringify(itemForUpload(it), null, 2)], { type: 'application/json' });
      const meta = await G.put(`items/${it.id}.json`, blob, 'application/json');
      const cur = await DB.get('items', it.id);
      if (cur && !cur._deleted) {
        cur._etag = meta.eTag;
        if (cur.updatedAt === it.updatedAt) cur._dirty = false; // inzwischen erneut geändert? dann später nochmal
        await DB.put('items', cur);
      }
    }
  }
}

async function pullChanges() {
  const remote = await G.list('items');
  const local = new Map((await DB.all('items')).map((i) => [i.id, i]));
  const remoteIds = new Set();

  for (const f of remote) {
    if (!f.file || !f.name.endsWith('.json')) continue;
    const id = f.name.slice(0, -5);
    remoteIds.add(id);
    const l = local.get(id);
    if (l && (l._dirty || l._deleted)) continue;
    if (l && l._etag === f.eTag) continue;
    const blob = await G.download(`items/${f.name}`, f);
    if (!blob) continue;
    let data;
    try { data = JSON.parse(await blob.text()); } catch { console.warn('Defektes JSON', f.name); continue; }
    const cur = await DB.get('items', id);
    if (cur && (cur._dirty || cur._deleted)) continue;
    await DB.put('items', { ...data, id, _etag: f.eTag, _dirty: false });
  }

  // Auf anderem Gerät gelöscht
  for (const l of local.values()) {
    if (!remoteIds.has(l.id) && l._etag && !l._dirty && !l._deleted) await DB.del('items', l.id);
  }

  // Fehlende Vorschaubilder laden, verwaiste lokale Fotos entfernen
  const all = (await DB.all('items')).filter((i) => !i._deleted);
  const referenced = new Set(all.flatMap((i) => i.photos || []));
  const have = new Map((await DB.all('photos')).map((p) => [p.id, p]));
  for (const it of all) {
    for (const pid of it.photos || []) {
      if (have.has(pid)) continue;
      const thumb = await G.download(`fotos/${pid}_t.jpg`);
      if (thumb) await DB.put('photos', { id: pid, itemId: it.id, thumb, full: null });
    }
  }
  for (const p of have.values()) {
    if (!referenced.has(p.id) && !p.pendingUpload && !p.pendingDelete) { await DB.del('photos', p.id); dropUrls(p.id); }
  }
}

/* ---------------- Oberfläche: Liste ---------------- */
function valuesFor(key) {
  const set = new Map();
  for (const it of items) {
    const vals = key === 'anlass' ? (it.anlass || []) : [it[key]];
    for (const v of vals) if (v) set.set(v, (set.get(v) || 0) + 1);
  }
  return set;
}

function renderFilters() {
  const box = $('#filters');
  const defs = [...FIELDS, { key: 'anlass', label: 'Anlass' }];
  box.innerHTML = defs.map((f) => {
    const vals = [...valuesFor(f.key).entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
    const cur = filters[f.key] || '';
    if (cur && !vals.some(([v]) => v === cur)) vals.unshift([cur, 0]);
    return `<label>${esc(f.label)}<select data-filter="${f.key}"><option value="">Alle</option>${
      vals.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('')
    }</select></label>`;
  }).join('') + '<button type="button" class="chipbtn reset" id="resetFilters">Zurücksetzen</button>';
  const n = Object.values(filters).filter(Boolean).length;
  $('#filterCount').textContent = n ? `(${n})` : '';
  $('#filterToggle').classList.toggle('active', n > 0);
}

function filteredItems() {
  const q = $('#search').value.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  let list = items.filter((it) => {
    for (const [k, v] of Object.entries(filters)) {
      if (!v) continue;
      if (k === 'anlass') { if (!(it.anlass || []).includes(v)) return false; }
      else if (it[k] !== v) return false;
    }
    if (!terms.length) return true;
    const hay = [it.name, it.notiz, ...(it.anlass || []), ...FIELDS.map((f) => it[f.key])].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const sort = $('#sort').value;
  const cmp = (a, b, k) => String(a[k] || '').localeCompare(String(b[k] || ''), 'de') || String(a.name || '').localeCompare(String(b.name || ''), 'de');
  if (sort === 'new') list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  else list.sort((a, b) => cmp(a, b, sort));
  return list;
}

function render() {
  renderFilters();
  const list = filteredItems();
  $('#count').textContent = items.length
    ? (list.length === items.length ? `${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}` : `${list.length} von ${items.length} Teilen`)
    : '';
  $('#empty').hidden = items.length > 0;
  $('#grid').innerHTML = list.map((it) => {
    const pid = (it.photos || [])[0];
    const url = pid ? thumbUrl(pid) : '';
    const sub = [it.kategorie, it.farbe, it.groesse].filter(Boolean).join(' · ');
    const n = (it.photos || []).length;
    return `<button type="button" class="card" data-id="${esc(it.id)}">
      ${url ? `<img class="thumb" loading="lazy" src="${url}" alt="">` : `<div class="noimg">${pid ? 'Foto lädt …' : 'Kein Foto'}</div>`}
      ${n > 1 ? `<span class="nphotos">${n} Fotos</span>` : ''}
      ${it._dirty && Auth.clientId ? '<span class="pending" title="Noch nicht synchronisiert"></span>' : ''}
      <div class="info"><div class="title">${esc(it.name || 'Ohne Namen')}</div><div class="sub">${esc(sub || it.lagerort || '')}</div></div>
    </button>`;
  }).join('');
}

/* ---------------- Detailansicht ---------------- */
let detailId = null;
async function openDetail(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  detailId = id;
  $('#detailTitle').textContent = it.name || 'Ohne Namen';
  const rows = [...FIELDS.map((f) => [f.label, it[f.key]]), ['Anlass', (it.anlass || []).join(', ')], ['Notiz', it.notiz]]
    .filter(([, v]) => v);
  $('#detailFields').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd>`).join('')
    || '<dt>–</dt><dd class="muted">Keine Angaben</dd>';
  const gal = $('#detailPhotos');
  const pids = it.photos || [];
  gal.innerHTML = pids.map((pid) => `<img data-pid="${esc(pid)}" src="${thumbUrl(pid)}" alt="">`).join('');
  $('#detail').showModal();
  for (const img of gal.querySelectorAll('img')) {
    fullUrl(img.dataset.pid).then((u) => { if (u) img.src = u; });
  }
}

/* ---------------- Editor ---------------- */
let ed = null; // { id, isNew, photos: [{id, isNew, full, thumb}], removed: [] , anlass: Set }

function buildFieldInputs() {
  $('#fieldGrid').innerHTML = FIELDS.map((f) => `
    <label class="field">${esc(f.label)}
      <input name="${f.key}" list="dl-${f.key}" autocomplete="off">
      <datalist id="dl-${f.key}"></datalist>
    </label>`).join('');
}
function fillDatalists() {
  for (const f of FIELDS) {
    const vals = new Set([...valuesFor(f.key).keys(), ...f.defaults]);
    $(`#dl-${f.key}`).innerHTML = [...vals].sort((a, b) => a.localeCompare(b, 'de')).map((v) => `<option value="${esc(v)}">`).join('');
  }
}
function renderAnlass() {
  const all = new Set([...ANLASS_DEFAULTS, ...valuesFor('anlass').keys(), ...ed.anlass]);
  $('#anlassChips').innerHTML = [...all].map((a) =>
    `<button type="button" class="chipbtn${ed.anlass.has(a) ? ' active' : ''}" data-anlass="${esc(a)}">${esc(a)}</button>`).join('');
}
function renderPhotoStrip() {
  $('#photoStrip').innerHTML = ed.photos.map((p, i) => {
    const url = p.isNew ? p.url : thumbUrl(p.id);
    return `<div class="ph"><img src="${url}" data-idx="${i}" alt=""></div>`;
  }).join('');
}

function openEditor(id = null) {
  const form = $('#editForm');
  form.reset();
  fillDatalists();
  const it = id ? items.find((i) => i.id === id) : null;
  ed = {
    id: it?.id || uid(),
    isNew: !it,
    photos: (it?.photos || []).map((pid) => ({ id: pid, isNew: false })),
    removed: [],
    anlass: new Set(it?.anlass || []),
  };
  $('#editTitle').textContent = it ? 'Bearbeiten' : 'Neues Teil';
  form.elements.bezeichnung.value = it?.name || '';
  for (const f of FIELDS) form.elements[f.key].value = it?.[f.key] || '';
  form.elements.notiz.value = it?.notiz || '';
  if (!it) {
    // Lagerort vom letzten Eintrag vorschlagen – spart Tipparbeit beim Durcherfassen
    const last = JSON.parse(localStorage.getItem('ks_last') || '{}');
    if (last.lagerort) form.elements.lagerort.value = last.lagerort;
  }
  $('#deleteBtn').hidden = !it;
  $('#metaInfo').textContent = it
    ? `Angelegt ${new Date(it.createdAt).toLocaleString('de-DE')} · geändert ${new Date(it.updatedAt).toLocaleString('de-DE')}`
    : '';
  renderAnlass();
  renderPhotoStrip();
  $('#editor').showModal();
}

async function addPhotos(files) {
  for (const file of files) {
    try {
      const { full, thumb } = await processImage(file);
      ed.photos.push({ id: uid(), isNew: true, full, thumb, url: URL.createObjectURL(thumb) });
      renderPhotoStrip();
    } catch (e) {
      toast('Foto konnte nicht gelesen werden: ' + e.message);
    }
  }
}

async function saveEditor() {
  const form = $('#editForm');
  const now = new Date().toISOString();
  const prev = items.find((i) => i.id === ed.id);
  const it = {
    ...(prev || {}),
    id: ed.id,
    name: form.elements.bezeichnung.value.trim(),
    anlass: [...ed.anlass],
    notiz: form.elements.notiz.value.trim(),
    photos: ed.photos.map((p) => p.id),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    _dirty: true,
  };
  for (const f of FIELDS) it[f.key] = form.elements[f.key].value.trim();

  for (const p of ed.photos.filter((x) => x.isNew)) {
    const rec = { id: p.id, itemId: it.id, full: p.full, thumb: p.thumb, pendingUpload: true };
    await DB.put('photos', rec);
    photoMap.set(p.id, rec);
    URL.revokeObjectURL(p.url);
  }
  for (const pid of ed.removed) await removePhotoRecord(pid);
  await DB.put('items', it);
  localStorage.setItem('ks_last', JSON.stringify({ lagerort: it.lagerort }));
  ed = null;
  await loadState();
  await recountPending();
  render();
  updateSyncIndicator();
  scheduleSync();
  return it.id;
}

async function removePhotoRecord(pid) {
  const rec = await DB.get('photos', pid);
  dropUrls(pid);
  if (!rec) {
    // Foto nur in der Cloud vorhanden (z. B. Vorschau noch nicht geladen)
    await DB.put('photos', { id: pid, pendingDelete: true });
  } else if (rec.pendingUpload) {
    await DB.del('photos', pid); // war nie in der Cloud
  } else {
    await DB.put('photos', { id: pid, pendingDelete: true });
  }
}

async function deleteItem(id) {
  const it = await DB.get('items', id);
  if (!it) return;
  for (const pid of it.photos || []) await removePhotoRecord(pid);
  if (!it._etag) await DB.del('items', id);           // nie hochgeladen
  else await DB.put('items', { ...it, _deleted: true, _dirty: true });
  await loadState();
  await recountPending();
  render();
  updateSyncIndicator();
  scheduleSync();
}

/* ---------------- Einstellungen ---------------- */
function renderSettings() {
  $('#clientId').value = Auth.clientId;
  $('#redirectUri').textContent = Auth.redirectUri();
  const signed = Auth.signedIn();
  $('#authState').textContent = !Auth.clientId
    ? 'Nicht verbunden – deine Daten liegen nur auf diesem Gerät.'
    : signed ? 'Verbunden mit OneDrive.' : 'Nicht angemeldet.';
  $('#loginBtn').hidden = signed;
  $('#logoutBtn').hidden = !signed;
  $('#syncNowBtn').hidden = !signed;
  const last = localStorage.getItem('ks_lastSync');
  $('#lastSync').textContent = last ? `Zuletzt synchronisiert: ${new Date(last).toLocaleString('de-DE')}` : '';
  const nPhotos = items.reduce((n, i) => n + (i.photos || []).length, 0);
  $('#stats').textContent = `${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}, ${nPhotos} ${nPhotos === 1 ? 'Foto' : 'Fotos'}.`;
  $('#version').textContent = `Version ${APP_VERSION}`;
}

function exportCsv() {
  const cols = [['Bezeichnung', 'name'], ...FIELDS.map((f) => [f.label, f.key]), ['Anlass', 'anlass'], ['Notiz', 'notiz'], ['Fotos', 'photos'], ['Angelegt', 'createdAt'], ['Geändert', 'updatedAt']];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => c[0]).join(';')];
  for (const it of filteredItems()) {
    lines.push(cols.map(([, k]) => {
      if (k === 'anlass') return cell((it.anlass || []).join(', '));
      if (k === 'photos') return (it.photos || []).length;
      return cell(it[k]);
    }).join(';'));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kleiderschrank-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------- Hilfen ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
let bannerAction = null;
function showBanner(text, action) {
  const b = $('#banner');
  b.textContent = text;
  b.hidden = false;
  bannerAction = action;
}
function hideBanner() { $('#banner').hidden = true; bannerAction = null; }

/* ---------------- Ereignisse ---------------- */
function wireEvents() {
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) close.closest('dialog').close();
  });

  $('#grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });
  $('#addBtn').addEventListener('click', () => openEditor());
  $('#search').addEventListener('input', render);
  $('#sort').addEventListener('change', () => { localStorage.setItem('ks_sort', $('#sort').value); render(); });
  $('#filterToggle').addEventListener('click', () => { $('#filters').hidden = !$('#filters').hidden; });
  $('#filters').addEventListener('change', (e) => {
    const k = e.target.dataset.filter;
    if (!k) return;
    filters[k] = e.target.value;
    localStorage.setItem('ks_filters', JSON.stringify(filters));
    render();
  });
  $('#filters').addEventListener('click', (e) => {
    if (e.target.id !== 'resetFilters') return;
    for (const k of Object.keys(filters)) delete filters[k];
    localStorage.setItem('ks_filters', '{}');
    render();
  });

  // Detail
  $('#detailEdit').addEventListener('click', () => { $('#detail').close(); openEditor(detailId); });

  // Editor
  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = await saveEditor();
    $('#editor').close();
    toast('Gespeichert');
    if (id) detailId = id;
  });
  $('#editor').addEventListener('close', () => {
    if (ed) { for (const p of ed.photos) if (p.isNew) URL.revokeObjectURL(p.url); ed = null; }
  });
  $('#photoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await addPhotos(files);
  });
  $('#anlassChips').addEventListener('click', (e) => {
    const a = e.target.dataset.anlass;
    if (!a) return;
    ed.anlass.has(a) ? ed.anlass.delete(a) : ed.anlass.add(a);
    renderAnlass();
  });
  const addAnlass = () => {
    const v = $('#anlassNew').value.trim();
    if (!v) return;
    ed.anlass.add(v);
    $('#anlassNew').value = '';
    renderAnlass();
  };
  $('#anlassAdd').addEventListener('click', addAnlass);
  $('#anlassNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addAnlass(); } });
  $('#deleteBtn').addEventListener('click', async () => {
    if (!confirm('Dieses Teil mit allen Fotos löschen?')) return;
    const id = ed.id;
    ed = null;
    $('#editor').close();
    await deleteItem(id);
    toast('Gelöscht');
  });

  // Foto-Aktionen im Editor
  let photoIdx = -1;
  $('#photoStrip').addEventListener('click', async (e) => {
    const img = e.target.closest('img');
    if (!img) return;
    photoIdx = Number(img.dataset.idx);
    const p = ed.photos[photoIdx];
    $('#photoBig').src = p.isNew ? URL.createObjectURL(p.full) : thumbUrl(p.id);
    $('#photoCover').hidden = photoIdx === 0;
    $('#photoDlg').showModal();
    if (!p.isNew) { const u = await fullUrl(p.id); if (u) $('#photoBig').src = u; }
  });
  $('#photoCover').addEventListener('click', () => {
    const [p] = ed.photos.splice(photoIdx, 1);
    ed.photos.unshift(p);
    renderPhotoStrip();
    $('#photoDlg').close();
  });
  $('#photoDelete').addEventListener('click', () => {
    const [p] = ed.photos.splice(photoIdx, 1);
    if (p.isNew) URL.revokeObjectURL(p.url); else ed.removed.push(p.id);
    renderPhotoStrip();
    $('#photoDlg').close();
  });

  // Einstellungen
  $('#settingsBtn').addEventListener('click', () => { renderSettings(); $('#settings').showModal(); });
  $('#clientId').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v && !/^[0-9a-f-]{36}$/i.test(v)) toast('Die Client-ID sieht ungewöhnlich aus – bitte prüfen.');
    if (v !== Auth.clientId) { Auth.clientId = v; Auth.logout(); }
    renderSettings();
    updateSyncIndicator();
  });
  $('#copyRedirect').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(Auth.redirectUri()); toast('Kopiert'); } catch { toast(Auth.redirectUri()); }
  });
  $('#loginBtn').addEventListener('click', async () => {
    Auth.clientId = $('#clientId').value;
    try { await Auth.login(); } catch (e) { toast(e.message); }
  });
  $('#logoutBtn').addEventListener('click', () => {
    Auth.logout();
    renderSettings();
    updateSyncIndicator();
    toast('Abgemeldet. Die Daten auf diesem Gerät bleiben erhalten.');
  });
  $('#syncNowBtn').addEventListener('click', () => sync());
  $('#csvBtn').addEventListener('click', exportCsv);

  syncBtn.addEventListener('click', () => {
    if (Auth.clientId && !Auth.signedIn()) return Auth.login().catch((e) => toast(e.message));
    if (!Auth.clientId) { renderSettings(); $('#settings').showModal(); return; }
    sync();
  });
  $('#banner').addEventListener('click', () => bannerAction?.());

  window.addEventListener('online', () => sync());
  window.addEventListener('offline', updateSyncIndicator);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 5 * 60 * 1000);
}

/* ---------------- Start ---------------- */
async function init() {
  buildFieldInputs();
  $('#sort').value = localStorage.getItem('ks_sort') || 'new';
  wireEvents();
  await DB.open();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  await loadState();
  await recountPending();
  render();

  try {
    await Auth.handleRedirect();
  } catch (e) {
    toast('Anmeldung fehlgeschlagen: ' + e.message);
  }

  // Anmeldung abgelaufen? Einmal still erneuern (ohne Rückfrage, wenn die Microsoft-Sitzung noch besteht).
  if (Auth.clientId && Auth.wasSignedIn() && navigator.onLine) {
    let ok = Auth.signedIn();
    if (ok) { try { await Auth.accessToken(); } catch (e) { ok = !(e instanceof AuthNeeded); } }
    if (!ok) {
      if (!sessionStorage.getItem('ks_silentTried')) {
        sessionStorage.setItem('ks_silentTried', '1');
        return Auth.login(true);
      }
      showBanner('Die OneDrive-Anmeldung ist abgelaufen. Tippe hier, um dich erneut anzumelden.', () => Auth.login());
    } else {
      sessionStorage.removeItem('ks_silentTried');
    }
  }
  if (!Auth.clientId && items.length > 0 && !localStorage.getItem('ks_hintShown')) {
    localStorage.setItem('ks_hintShown', '1');
    showBanner('Deine Daten liegen bisher nur auf diesem Gerät. Tippe hier, um OneDrive zu verbinden.', () => { hideBanner(); renderSettings(); $('#settings').showModal(); });
  }
  updateSyncIndicator();
  sync();

  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
    navigator.serviceWorker?.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

init().catch((e) => { console.error(e); toast('Fehler beim Start: ' + e.message); });
