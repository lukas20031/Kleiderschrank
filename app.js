'use strict';
/* Kleiderschrank – digitale Garderobe mit OneDrive- oder Dropbox-Speicher
 * Offline-first: Alles liegt zuerst lokal (IndexedDB) und wird mit
 * dem App-Ordner in OneDrive (Microsoft Graph) oder Dropbox synchronisiert.
 */
const APP_VERSION = '2.1.0';


/* Felder: feste Auswahl (optionen.js) oder Freitext mit Vorschlägen
 *   multi  – Mehrfachauswahl im Auswahldialog, gespeichert als Array
 *   single – Einfachauswahl im Auswahldialog
 *   chips  – Einfachauswahl direkt im Editor
 *   text   – Freitext mit Vorschlägen
 *   price  – Zahl in Euro (gespeichert als Zahl, angezeigt als „12,99 €“)
 *   date   – Datum aus dem Kalender (gespeichert als JJJJ-MM-TT), darf leer bleiben
 *   url    – Link, in der Detailansicht als Knopf zum Öffnen */
const FARB_MAP = new Map(FARBEN);
const FIELDS = [
  { key: 'farben', label: 'Farbe', type: 'multi', options: FARBEN.map((f) => f[0]), swatch: true, wide: true },
  { key: 'materialien', label: 'Material', type: 'multi', options: MATERIALIEN, wide: true },
  { key: 'groesse', label: 'Größe', type: 'single', groups: GROESSEN, wide: true },
  { key: 'marke', label: 'Marke', type: 'text', defaults: [], wide: true },
  { key: 'preis', label: 'Preis', type: 'price', wide: true, noFilter: true },
  { key: 'kaufdatum', label: 'Kaufdatum', type: 'date', wide: true, noFilter: true },
  { key: 'link', label: 'Link zum Produkt', type: 'url', wide: true, noFilter: true },
  { key: 'lagerort', label: 'Lagerort', type: 'text', defaults: ['Kleiderschrank', 'Kommode', 'Garderobe', 'Keller', 'Dachboden'], wide: true },
  { key: 'zustand', label: 'Zustand', type: 'chips', options: ZUSTAENDE, wide: true },
];
const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
for (const f of FIELDS) {
  const all = f.groups ? f.groups.flatMap(([, v]) => v) : f.options;
  if (all) { f.all = all; f.order = new Map(all.map((v, i) => [v, i])); }
}
const isMulti = (key) => key === 'anlass' || key === 'jahreszeit' || FIELD[key]?.type === 'multi';
const hasValue = (v) => v !== undefined && v !== null && v !== '';
const fieldValues = (it, key) => (isMulti(key) ? (Array.isArray(it[key]) ? it[key] : []) : (hasValue(it[key]) ? [it[key]] : []));
const INPUT_TYPES = ['text', 'price', 'date', 'url'];           // Felder mit normalem Eingabefeld
const isInputField = (f) => INPUT_TYPES.includes(f.type);
const priceFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPrice = (v) => (hasValue(v) && !Number.isNaN(Number(v)) ? `${priceFmt.format(Number(v))} €` : '');
const formatDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? new Date(`${v}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
/** „12,99“, „12.99“, „1.299,00“, „12 €“ → 12.99; leer/ungültig → '' */
function parsePrice(s) {
  let t = String(s || '').replace(/[€\s]/g, '');
  if (!t) return '';
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : '';
}
/** Nur http(s)-Links; „www.zalando.de/…“ bekommt automatisch https:// */
function normalizeUrl(s) {
  let t = String(s || '').trim();
  if (!t) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
  try { const u = new URL(t); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
const fieldText = (it, key) => {
  const t = FIELD[key]?.type;
  if (t === 'price') return formatPrice(it[key]);
  if (t === 'date') return formatDate(it[key]);
  return fieldValues(it, key).join(', ');
};
const swatch = (name) => `<span class="sw" style="background:${FARB_MAP.get(name) || '#ccc'}"></span>`;
const DATA_VERSION = 2;

/* Kategorien: feste Liste aus kategorien.js, gespeichert als drei Felder */
const CAT_KEYS = [
  { key: 'kategorie', label: 'Kategorie' },
  { key: 'unterkategorie', label: 'Unterkategorie' },
  { key: 'typ', label: 'Art' },
];
const CAT_NONE = '__none__';
const CAT = (() => {
  const order = new Map();   // "K|U|A", "K|U", "K" -> Reihenfolge
  const l1 = new Set();
  const leaves = new Map();  // kleingeschriebene Art -> erster Pfad
  const groups = new Map();  // kleingeschriebene Unterkategorie -> erster Pfad
  let n = 0;
  for (const [k, gs] of KATEGORIEN) {
    l1.add(k);
    order.set(k, n++);
    for (const [u, as] of gs) {
      order.set(`${k}|${u}`, n++);
      if (!groups.has(u.toLowerCase())) groups.set(u.toLowerCase(), [k, u, '']);
      for (const a of as) {
        order.set(`${k}|${u}|${a}`, n++);
        if (!leaves.has(a.toLowerCase())) leaves.set(a.toLowerCase(), [k, u, a]);
      }
    }
  }
  return { order, l1, leaves, groups };
})();
/** Anzeigetitel: Bezeichnung, sonst die genaueste gewählte Kategorie */
const itemTitle = (it) => it.name || it.typ || it.unterkategorie || it.kategorie || 'Ohne Bezeichnung';
const catPath = (it) => [it.kategorie, it.unterkategorie, it.typ].filter(Boolean).join(' › ');
const catRank = (it) => {
  if (!it.kategorie) return 1e9;
  return CAT.order.get([it.kategorie, it.unterkategorie, it.typ].filter(Boolean).join('|')) ?? CAT.order.get(it.kategorie) ?? 1e8;
};
// Ältere freie Kategorie-Werte (Version 1.0/1.1) auf die feste Liste abbilden
const CAT_ALIASES = {
  hemd: ['Oberteile', 'Hemden', ''], anzug: ['Ganzkörper', 'Anzüge', ''], schuhe: ['Schuhe', '', ''],
  accessoire: ['Accessoires', '', ''], unterwäsche: ['Unterwäsche & Nachtwäsche', 'Unterwäsche', ''],
  tasche: ['Taschen', 'Freizeittaschen', 'Tasche'], oberteil: ['Oberteile', '', ''], top: ['Oberteile', 'Top', ''],
};
function mapOldCategory(old) {
  const k = old.trim().toLowerCase();
  if (!k) return null;
  for (const l of CAT.l1) if (l.toLowerCase() === k) return [l, '', ''];
  return CAT.leaves.get(k) || CAT.groups.get(k) || CAT_ALIASES[k] || null;
}
// Ältere freie Werte (Farbe, Material, Größe, Zustand) auf die festen Listen abbilden
const VAL_ALIASES = {
  farben: { bunt: 'Mehrfarbig', gemustert: 'Mehrfarbig', lila: 'Violett', creme: 'Ecru', navy: 'Dunkelblau', weiss: 'Weiß', petrol: 'Türkis', silbern: 'Silber', golden: 'Gold' },
  materialien: { merinowolle: 'Wolle', merino: 'Wolle', elasthan: 'Elastan', 'elasthan-mix': 'Elastan', jeans: 'Denim', wildleder: 'Wildleder', kunstleder: 'Veganes Leder' },
  zustand: { 'neu mit etikett': 'Neu mit Etikett', 'wie neu': 'Wie neu' },
};
function matchOption(key, raw) {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const f = FIELD[key];
  return f.all.find((o) => o.toLowerCase() === v) || VAL_ALIASES[key]?.[v] || null;
}
function normalizeSize(raw) {
  let v = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  v = v.replace(/^XXXXXL$/, '5XL').replace(/^XXXXL$/, '4XL').replace(/^XXXL$/, '3XL').replace('.', ',');
  const m = v.match(/^W?(\d{2})[\/XL]+L?(\d{2})$/);
  if (m) v = `W${m[1]}/L${m[2]}`;
  if (/^EINHEITSGR(Ö|OE)SSE$|^ONESIZE$/.test(v)) v = 'Einheitsgröße';
  return FIELD.groesse.order.has(v) ? v : null;
}
async function migrateItems(list) {
  let changed = 0;
  for (const it of list) {
    const needCat = it.kategorie && !CAT.l1.has(it.kategorie);
    if (it.v === DATA_VERSION && !needCat) continue;
    const upd = { ...it, _dirty: true, v: DATA_VERSION };
    const alt = { ...(it.alt || {}) };
    if (needCat) {
      const m = mapOldCategory(it.kategorie);
      if (m) { [upd.kategorie, upd.unterkategorie, upd.typ] = m; delete upd.kategorieAlt; }
      else { upd.kategorieAlt = it.kategorie; upd.kategorie = ''; upd.unterkategorie = ''; upd.typ = ''; }
    }
    // Farbe/Material: früher ein Textfeld, jetzt Listen
    for (const [oldKey, key] of [['farbe', 'farben'], ['material', 'materialien']]) {
      if (typeof it[oldKey] !== 'string') continue;
      const vals = new Set(Array.isArray(it[key]) ? it[key] : []);
      const unknown = [];
      for (const part of it[oldKey].split(/[,;/+&]|\sund\s/i)) {
        if (!part.trim()) continue;
        const m = matchOption(key, part);
        if (m) vals.add(m); else unknown.push(part.trim());
      }
      upd[key] = FIELD[key].all.filter((o) => vals.has(o));
      if (unknown.length) alt[key] = unknown.join(', ');
      delete upd[oldKey];
    }
    if (it.groesse && !FIELD.groesse.order.has(it.groesse)) {
      const m = normalizeSize(it.groesse);
      if (m) upd.groesse = m; else { alt.groesse = it.groesse; upd.groesse = ''; }
    }
    if (it.zustand && !FIELD.zustand.order.has(it.zustand)) {
      const m = matchOption('zustand', it.zustand);
      if (m) upd.zustand = m; else { alt.zustand = it.zustand; upd.zustand = ''; }
    }
    if (Object.keys(alt).length) upd.alt = alt; else delete upd.alt;
    await DB.put('items', upd);
    Object.assign(it, upd);
    for (const k of ['farbe', 'material']) if (!(k in upd)) delete it[k];
    changed++;
  }
  return changed;
}

const JAHRESZEITEN = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
const ANLASS_DEFAULTS = ['Alltag', 'Arbeit', 'Freizeit', 'Sport', 'Outdoor', 'Festlich', 'Urlaub'];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ---------------- IndexedDB ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('kleiderschrank', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const name of ['items', 'photos', 'outfits']) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
        }
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

/* ---------------- Cloud-Anbieter ---------------- */
const PROVIDERS = {
  onedrive: {
    name: 'OneDrive',
    authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    authParams: (silent) => ({
      response_mode: 'query',
      scope: 'Files.ReadWrite.AppFolder offline_access',
      prompt: silent ? 'none' : 'select_account',
    }),
    tokenParams: { scope: 'Files.ReadWrite.AppFolder offline_access' },
    supportsSilent: true,
    idLabel: 'Anwendungs-ID (Client-ID) aus Microsoft Entra',
    idPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    redirectLabel: 'Umleitungs-URI (in Entra als Plattform „Single-Page-Anwendung“ eintragen)',
    where: 'OneDrive unter <b>Apps › (Name deiner App-Registrierung)</b>',
  },
  dropbox: {
    name: 'Dropbox',
    authorize: 'https://www.dropbox.com/oauth2/authorize',
    token: 'https://api.dropboxapi.com/oauth2/token',
    authParams: () => ({ token_access_type: 'offline' }),
    tokenParams: {},
    supportsSilent: false, // Dropbox-Refresh-Tokens laufen nicht ab
    idLabel: 'App-Key aus der Dropbox App Console',
    idPlaceholder: 'z. B. a1b2c3d4e5f6g7h',
    idPattern: /^[a-z0-9]{8,24}$/i,
    redirectLabel: 'Redirect-URI (in der Dropbox App Console unter Settings › OAuth 2 › Redirect URIs eintragen)',
    where: 'Dropbox unter <b>Apps › (Name deiner Dropbox-App)</b>',
  },
};
const provKey = () => (PROVIDERS[localStorage.getItem('ks_provider')] ? localStorage.getItem('ks_provider') : '');
const prov = () => PROVIDERS[provKey()] || null;
const provName = () => prov()?.name || 'Cloud';

/* ---------------- Anmeldung (OAuth 2.0 Auth-Code + PKCE) ---------------- */
class AuthNeeded extends Error { constructor() { super('Anmeldung erforderlich'); } }

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randStr = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

const Auth = {
  get clientId() { return provKey() ? (localStorage.getItem('ks_clientId_' + provKey()) || '').trim() : ''; },
  set clientId(v) { if (provKey()) localStorage.setItem('ks_clientId_' + provKey(), v.trim()); },
  /** Anbieter gewählt und ID eingetragen */
  get configured() { return !!prov() && !!this.clientId; },
  redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); },
  tokens() { try { return JSON.parse(localStorage.getItem('ks_tokens')); } catch { return null; } },
  saveTokens(t) { localStorage.setItem('ks_tokens', JSON.stringify(t)); localStorage.setItem('ks_wasSignedIn', '1'); },
  signedIn() { return this.configured && !!this.tokens(); },
  wasSignedIn() { return localStorage.getItem('ks_wasSignedIn') === '1'; },

  async login(silent = false) {
    const P = prov();
    if (!P) throw new Error('Bitte zuerst einen Cloud-Speicher wählen.');
    if (!this.clientId) throw new Error(`Bitte zuerst die ${P === PROVIDERS.dropbox ? 'App-Key' : 'Client-ID'} eintragen.`);
    const verifier = randStr(48);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randStr(16);
    sessionStorage.setItem('ks_pkce', JSON.stringify({ verifier, state, silent, provider: provKey() }));
    const p = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...P.authParams(silent),
    });
    location.assign(`${P.authorize}?${p}`);
  },

  /** Verarbeitet die Rückkehr von der Anmeldeseite. */
  async handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return;
    const saved = JSON.parse(sessionStorage.getItem('ks_pkce') || 'null');
    sessionStorage.removeItem('ks_pkce');
    history.replaceState(null, '', this.redirectUri());
    if (p.get('error')) {
      if (saved?.silent) return; // stille Anmeldung nicht möglich -> Banner zeigt Button
      if (p.get('error') === 'access_denied') throw new Error('Zugriff wurde nicht erlaubt.');
      throw new Error(p.get('error_description') || p.get('error'));
    }
    if (!saved || saved.state !== p.get('state') || (saved.provider || 'onedrive') !== provKey()) {
      throw new Error('Anmeldung abgebrochen (ungültiger Status). Bitte erneut versuchen.');
    }
    await this.tokenRequest({
      grant_type: 'authorization_code',
      code: p.get('code'),
      redirect_uri: this.redirectUri(),
      code_verifier: saved.verifier,
    });
  },

  async tokenRequest(params) {
    const P = prov();
    const body = new URLSearchParams({ client_id: this.clientId, ...P.tokenParams, ...params });
    const r = await fetch(P.token, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error_description || j.error || `Token-Fehler ${r.status}`);
      e.code = j.error || 'http_' + r.status;
      throw e;
    }
    const t = {
      access: j.access_token,
      // Dropbox liefert beim Erneuern keinen neuen Refresh-Token – den alten behalten
      refresh: j.refresh_token || params.refresh_token,
      exp: Date.now() + (Number(j.expires_in || 3600) - 120) * 1000,
    };
    this.saveTokens(t);
    return t;
  },

  _refreshing: null,
  async accessToken(force = false) {
    const t = this.tokens();
    if (!t || !this.configured) throw new AuthNeeded();
    if (!force && Date.now() < t.exp) return t.access;
    if (!t.refresh) { this.clear(); throw new AuthNeeded(); }
    this._refreshing ??= this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
      .finally(() => { this._refreshing = null; });
    try {
      return (await this._refreshing).access;
    } catch (e) {
      if (e.code && e.code !== 'temporarily_unavailable' && !/^http_5/.test(e.code)) { this.clear(); throw new AuthNeeded(); }
      throw e;
    }
  },
  clear() { localStorage.removeItem('ks_tokens'); },
  logout() { this.clear(); localStorage.removeItem('ks_wasSignedIn'); },
};

/* ---------------- Gemeinsamer HTTP-Zugriff mit Token, Wiederholung bei 429/5xx ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last401 = false;
async function authFetch(url, opts = {}, attempt = 0) {
  const tok = await Auth.accessToken(attempt > 0 && last401);
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tok}` } });
  last401 = r.status === 401;
  if ((r.status === 401 || r.status === 429 || r.status >= 500) && attempt < 3) {
    const wait = r.status === 401 ? 0 : (Number(r.headers.get('Retry-After')) || 2 ** attempt) * 1000;
    await sleep(wait);
    return authFetch(url, opts, attempt + 1);
  }
  if (r.status === 401) { Auth.clear(); throw new AuthNeeded(); }
  return r;
}
async function httpError(r, what) {
  let msg = '';
  try {
    const t = await r.text();
    try { const j = JSON.parse(t); msg = j.error?.message || j.error_summary || t; } catch { msg = t; }
  } catch { /* ignore */ }
  return new Error(`${what}: ${r.status} ${String(msg).slice(0, 200)}`.trim());
}

/* Beide Speicher bieten dieselben vier Funktionen:
 *   list(ordner)        -> [{ name, etag, meta }]   (nur Dateien; leerer/fehlender Ordner -> [])
 *   put(pfad, blob, typ) -> etag
 *   del(pfad)           (fehlende Datei ist kein Fehler)
 *   download(pfad, meta) -> Blob | null
 */

/* ---------------- OneDrive (Microsoft Graph, App-Ordner) ---------------- */
const OneDriveStore = {
  base: 'https://graph.microsoft.com/v1.0',
  path(p) { return this.base + '/me/drive/special/approot:/' + p.split('/').map(encodeURIComponent).join('/'); },
  async list(folder) {
    const out = [];
    let url = this.path(folder) + ':/children?$top=200';
    while (url) {
      const r = await authFetch(url);
      if (r.status === 404) return out;
      if (!r.ok) throw await httpError(r, 'Ordner lesen');
      const j = await r.json();
      for (const f of j.value) if (f.file) out.push({ name: f.name, etag: f.eTag, meta: f });
      url = j['@odata.nextLink'] || null;
    }
    return out;
  },
  async put(p, blob, type) {
    const r = await authFetch(this.path(p) + ':/content', { method: 'PUT', body: blob, headers: { 'Content-Type': type } });
    if (!r.ok) throw await httpError(r, `Hochladen ${p}`);
    return (await r.json()).eTag;
  },
  async del(p) {
    const r = await authFetch(this.path(p), { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw await httpError(r, `Löschen ${p}`);
  },
  async download(p, meta) {
    let url = meta?.['@microsoft.graph.downloadUrl'];
    if (!url) {
      const r = await authFetch(this.path(p));
      if (r.status === 404) return null;
      if (!r.ok) throw await httpError(r, `Abrufen ${p}`);
      url = (await r.json())['@microsoft.graph.downloadUrl'];
    }
    const d = await fetch(url); // vorab signierte URL, kein Token nötig
    if (!d.ok) throw new Error(`Download ${p}: ${d.status}`);
    return d.blob();
  },
};

/* ---------------- Dropbox (API v2, App-Ordner) ---------------- */
const DropboxStore = {
  api: 'https://api.dropboxapi.com/2',
  content: 'https://content.dropboxapi.com/2',
  rpc(endpoint, body) {
    return authFetch(this.api + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
  async notFound(r) {
    if (r.status !== 409) return false;
    const t = await r.clone().text().catch(() => '');
    return t.includes('not_found');
  },
  async list(folder) {
    const out = [];
    let r = await this.rpc('/files/list_folder', { path: '/' + folder, limit: 2000 });
    for (;;) {
      if (await this.notFound(r)) return out;
      if (!r.ok) throw await httpError(r, 'Ordner lesen');
      const j = await r.json();
      for (const e of j.entries) if (e['.tag'] === 'file') out.push({ name: e.name, etag: e.rev, meta: e });
      if (!j.has_more) return out;
      r = await this.rpc('/files/list_folder/continue', { cursor: j.cursor });
    }
  },
  async put(p, blob) {
    const r = await authFetch(this.content + '/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: '/' + p, mode: 'overwrite', mute: true }),
      },
      body: blob,
    });
    if (!r.ok) throw await httpError(r, `Hochladen ${p}`);
    return (await r.json()).rev;
  },
  async del(p) {
    const r = await this.rpc('/files/delete_v2', { path: '/' + p });
    if (r.ok || await this.notFound(r)) return;
    throw await httpError(r, `Löschen ${p}`);
  },
  async download(p) {
    const r = await authFetch(this.content + '/files/download', {
      method: 'POST',
      headers: { 'Dropbox-API-Arg': JSON.stringify({ path: '/' + p }) },
    });
    if (await this.notFound(r)) return null;
    if (!r.ok) throw await httpError(r, `Download ${p}`);
    return r.blob();
  },
};

const Store = () => (provKey() === 'dropbox' ? DropboxStore : OneDriveStore);

/* ---------------- Zustand ---------------- */
let items = [];
let outfits = [];          // { id, name, itemIds: [], notiz, createdAt, updatedAt }            // sichtbare (nicht gelöschte) Teile
let photoMap = new Map();  // photoId -> Datensatz {id, itemId, thumb, full, pendingUpload, pendingDelete}
const urlCache = new Map();
const filters = JSON.parse(localStorage.getItem('ks_filters') || '{}');

async function loadState() {
  items = (await DB.all('items')).filter((i) => !i._deleted);
  outfits = (await DB.all('outfits')).filter((o) => !o._deleted);
  if (await migrateItems(items) && Auth.signedIn()) scheduleSync();
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
      const blob = await Store().download(photoFile(pid));
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

/* ---------------- Foto-Dateien ----------------
 * Fotos mit transparentem Hintergrund haben eine ID mit Endung ".png" und werden als PNG gespeichert,
 * alle anderen als JPG:  fotos/<id>.jpg + fotos/<id>_t.jpg  bzw.  fotos/<id>.png + fotos/<id>_t.png */
// Freigestellte Fotos: ID endet auf ".png" (verlustfrei) oder ".webp" (verkleinert, mit Transparenz)
const cutExt = (pid) => (pid.endsWith('.png') ? 'png' : pid.endsWith('.webp') ? 'webp' : null);
const isPng = (pid) => cutExt(pid) !== null; // = freigestellt (transparent)
// Zu freigestellten Fotos wird zusätzlich das Original ohne Freistellung gespeichert (fotos/<id>_o.jpg),
// damit es später erneut bearbeitet werden kann.
const photoFile = (pid, variant = false) => {
  const ext = cutExt(pid) || 'jpg';
  const base = cutExt(pid) ? pid.slice(0, -(ext.length + 1)) : pid;
  if (variant === 'orig') return `fotos/${base}_o.${ext === 'webp' ? 'webp' : 'jpg'}`; // Original im selben Format/Qualität
  return `fotos/${base}${variant ? '_t' : ''}.${ext}`;
};
const photoMime = (pid) => ({ png: 'image/png', webp: 'image/webp' }[cutExt(pid)] || 'image/jpeg');

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
function scaled(src, max) {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  return c;
}
function toBlob(c, type, q) {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht umgewandelt werden'))), type, q));
}
function toJpeg(src, max, q) {
  const c = scaled(src, max);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return toBlob(c, 'image/jpeg', q);
}
function toPng(src, max) {
  const c = scaled(src, max);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return toBlob(c, 'image/png');
}
/** Bild (Datei/Blob) in eine Arbeitsfläche laden, höchstens 3200 px Kantenlänge */
async function fileToCanvas(file) {
  const bmp = await loadBitmap(file);
  const s = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}
/* Bildqualität (Einstellungen, 50–100 %):
 *  - normale Fotos: JPG-Qualität
 *  - freigestellte Fotos: WebP mit Transparenz in dieser Qualität; bei 100 % verlustfreies PNG.
 *    Kann der Browser kein WebP erzeugen (Safari), wird stattdessen die Auflösung verkleinert. */
const photoQuality = () => Math.min(100, Math.max(50, Number(localStorage.getItem('ks_quality')) || 85));
const webpSupported = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
function toWebp(src, max, q) {
  const c = scaled(src, max);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return toBlob(c, 'image/webp', q);
}
/** Gibt die Bilddateien und die Endung für die Foto-ID zurück ('' = JPG, '.png', '.webp') */
async function canvasToPhoto(canvas, transparent = false, origCanvas = null) {
  const q = photoQuality() / 100;
  const jpgQ = 0.45 + q * 0.47;                    // 50 % → 0,69 · 85 % → 0,85 · 100 % → 0,92
  if (!transparent) return { full: await toJpeg(canvas, 1600, jpgQ), thumb: await toJpeg(canvas, 480, 0.78), ext: '' };
  // Das mitgespeicherte Original bekommt dieselbe Qualität/Auflösung wie das freigestellte Foto
  if (q >= 1) {
    return { full: await toPng(canvas, 1600), thumb: await toPng(canvas, 480), orig: origCanvas ? await toJpeg(origCanvas, 1600, jpgQ) : null, ext: '.png' };
  }
  if (webpSupported) {
    return { full: await toWebp(canvas, 1600, jpgQ), thumb: await toWebp(canvas, 480, 0.75), orig: origCanvas ? await toWebp(origCanvas, 1600, jpgQ) : null, ext: '.webp' };
  }
  // Ohne WebP: Auflösung verkleinern (50 % → 900 px, 99 % → 1590 px)
  const max = Math.round(200 + 1400 * q);
  return { full: await toPng(canvas, max), thumb: await toPng(canvas, 360), orig: origCanvas ? await toJpeg(origCanvas, max, jpgQ) : null, ext: '.png' };
}

/* ---------------- Hintergrund entfernen (@imgly/background-removal, läuft im Browser) ----------------
 * Bibliothek und KI-Modell (~40 MB) werden beim ersten Gebrauch geladen und vom Service Worker zwischengespeichert. */
let bgLib = null;
function loadBgLib() {
  bgLib ??= import('@imgly/background-removal').catch((e) => { bgLib = null; throw e; });
  return bgLib;
}
// Fortschritt: Die Bibliothek merkt sich die Einstellungen der ersten Nutzung (inkl. Callback),
// daher leitet ein fester Callback an den jeweils aktuellen Empfänger weiter.
// Wichtig: der Callback darf nichts zurückgeben, sonst bricht die Bibliothek ab.
let bgProgress = null;
// Modelle: „Schnell“ = isnet_quint8 (~40 MB), „Genau“ = isnet_fp16 (~84 MB). Beide laufen auf dem Prozessor
// (WebGPU unterstützt dieses Netz derzeit nicht).
const BG_MODELS = ['isnet_quint8', 'isnet_fp16'];
const bgModel = () => (BG_MODELS.includes(localStorage.getItem('ks_bgModel')) ? localStorage.getItem('ks_bgModel') : 'isnet_quint8');
const bgConfigs = {};
/** Feste Einstellungsobjekte je Modell – die Bibliothek erkennt daran eine bereits geladene Sitzung wieder */
function bgConfig() {
  const model = bgModel();
  bgConfigs[model] ??= { model, output: { format: 'image/png' }, progress: (key, cur, total) => { bgProgress?.(key, cur, total); } };
  return bgConfigs[model];
}
let bgWarm = null;
/** KI-Modell im Hintergrund vorbereiten, damit das Freistellen beim Antippen sofort startet */
function warmUpBg() {
  const model = bgModel();
  if (bgWarm?.model === model || localStorage.getItem('ks_bgUsed') !== '1') return;
  const p = loadBgLib().then((lib) => lib.preload(bgConfig())).catch((e) => { if (bgWarm === p) bgWarm = null; console.warn('Vorladen fehlgeschlagen', e); });
  bgWarm = p; p.model = model;
}
/** Reste entfernen: fast unsichtbare Pixel (Alpha < 32) sowie abgetrennte Flecken.
 *  Behalten werden das größte zusammenhängende Motiv und alle Teile mit mindestens 15 % seiner Fläche
 *  (z. B. der zweite Schuh eines Paars). */
function cleanAlpha(c) {
  // 1. Zusammenhängende Flächen auf verkleinerter Maske finden
  const t = scaled(c, 512);
  const tctx = t.getContext('2d');
  tctx.drawImage(c, 0, 0, t.width, t.height);
  const w = t.width, h = t.height;
  const td = tctx.getImageData(0, 0, w, h).data;
  const label = new Int32Array(w * h);
  const areas = [0];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i] || td[i * 4 + 3] <= 128) continue;
    const id = areas.length;
    let area = 0;
    label[i] = id; stack.push(i);
    while (stack.length) {
      const p = stack.pop(); area++;
      const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !label[q] && td[q * 4 + 3] > 128) { label[q] = id; stack.push(q); }
      }
    }
    areas.push(area);
  }
  const maxArea = Math.max(0, ...areas);
  const keepLabel = areas.map((a) => a >= maxArea * 0.15 && a > 0);
  // 2. Behaltene Flächen um 3 px erweitern, damit weiche Kanten erhalten bleiben
  let keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (keepLabel[label[i]]) keep[i] = 1;
  for (let r = 0; r < 3; r++) {
    const k2 = keep.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (keep[i]) continue;
      if ((x > 0 && keep[i - 1]) || (x < w - 1 && keep[i + 1]) || (y > 0 && keep[i - w]) || (y < h - 1 && keep[i + w])) k2[i] = 1;
    }
    keep = k2;
  }
  // 3. Auf das Bild in voller Auflösung anwenden
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const fx = w / c.width, fy = h / c.height;
  for (let y = 0; y < c.height; y++) {
    const row = Math.min(h - 1, Math.floor(y * fy)) * w;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4 + 3;
      if (d[i] < 32 || !keep[row + Math.min(w - 1, Math.floor(x * fx))]) d[i] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}
/** Begrenzungsrahmen des sichtbaren Motivs (für automatischen Zuschnitt).
 *  Zählt deckende Pixel je Zeile/Spalte, damit vereinzelte Reste im Hintergrund den Rahmen nicht aufblähen. */
function alphaBounds(c) {
  const t = scaled(c, 400);
  const ctx = t.getContext('2d');
  ctx.drawImage(c, 0, 0, t.width, t.height);
  const w = t.width, h = t.height;
  const d = ctx.getImageData(0, 0, w, h).data;
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 128) { cols[x]++; rows[y]++; }
  }
  const minC = Math.max(2, h * 0.02), minR = Math.max(2, w * 0.02);
  let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1;
  while (x0 < w && cols[x0] < minC) x0++;
  while (x1 > x0 && cols[x1] < minC) x1--;
  while (y0 < h && rows[y0] < minR) y0++;
  while (y1 > y0 && rows[y1] < minR) y1--;
  if (x0 >= w || y0 >= h) return null;
  const f = c.width / w;
  return { x: x0 * f, y: y0 * f, w: (x1 - x0 + 1) * f, h: (y1 - y0 + 1) * f };
}

/* ---------------- Foto-Editor: drehen, zuschneiden, freistellen, nachbessern ----------------
 * Intern getrennt gespeichert:  base = Bildpunkte (gedreht),  mask = Freistell-Maske (Alpha) oder null.
 * So kann der Pinsel „Wiederherstellen“ weggeschnittene Stellen aus dem Original zurückholen. */
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const copyCanvas = (src) => { const c = newCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };
function rotateCanvas(o, dir) {
  const c = newCanvas(o.height, o.width);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(dir * Math.PI / 2);
  ctx.drawImage(o, -o.width / 2, -o.height / 2);
  return c;
}

/* „Einfarbiger Untergrund“: alles entfernen, was vom Bildrand aus erreichbar ist und farblich zum Rand passt.
 * Teil 1 (einmal pro Bild): Farbabstand jedes Pixels zu den typischen Randfarben. */
function prepareColorMask(base) {
  const t = scaled(base, 700);
  const ctx = t.getContext('2d');
  ctx.drawImage(base, 0, 0, t.width, t.height);
  const w = t.width, h = t.height, n = w * h;
  const d = ctx.getImageData(0, 0, w, h).data;
  // In Helligkeit/Farbe zerlegen; Helligkeit zählt weniger, damit Schatten eher als Untergrund gelten
  const Y = new Float32Array(n), U = new Float32Array(n), V = new Float32Array(n), A = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    Y[i] = (0.299 * r + 0.587 * g + 0.114 * b) * 0.6;
    U[i] = -0.169 * r - 0.331 * g + 0.5 * b;
    V[i] = 0.5 * r - 0.419 * g - 0.081 * b;
    A[i] = d[i * 4 + 3] >= 128; // bereits freigestellte (transparente) Stellen zählen als Untergrund
  }
  // Randpixel (2 px breit) sammeln und in bis zu 4 Farbgruppen einteilen (k-means)
  const border = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) border.push(y * w + x);
  for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) border.push(y * w + x);
  const opaqueBorder = border.filter((i) => A[i]);
  const K = 4;
  const kb = opaqueBorder.length ? opaqueBorder : border;
  let cs = Array.from({ length: K }, (_, k) => { const i = kb[Math.floor((k + 0.5) * kb.length / K)]; return [Y[i], U[i], V[i]]; });
  let counts = new Array(K).fill(0);
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0]); counts = new Array(K).fill(0);
    for (const i of kb) {
      let best = 0, bd = Infinity;
      cs.forEach((c, k) => { const dd = (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
      sum[best][0] += Y[i]; sum[best][1] += U[i]; sum[best][2] += V[i]; counts[best]++;
    }
    cs = cs.map((c, k) => (counts[k] ? sum[k].map((v) => v / counts[k]) : c));
  }
  // Seltene Randfarben (z. B. ein Ärmel, der den Rand berührt) nicht als Untergrund werten
  const centers = opaqueBorder.length ? cs.filter((_, k) => counts[k] >= kb.length * 0.08) : [];
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!A[i]) { dist[i] = 0; continue; }
    let bd = Infinity;
    for (const c of centers) { const dd = (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2; if (dd < bd) bd = dd; }
    dist[i] = Math.sqrt(bd);
  }
  return { w, h, dist, border };
}
/* Teil 2 (bei jeder Toleranz-Änderung): vom Rand aus füllen und Maske in voller Größe erzeugen */
function colorMask(prep, tol, W, H) {
  const { w, h, dist, border } = prep;
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (const i of border) if (!bg[i] && dist[i] <= tol) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0 && !bg[p - 1] && dist[p - 1] <= tol) { bg[p - 1] = 1; stack.push(p - 1); }
    if (x < w - 1 && !bg[p + 1] && dist[p + 1] <= tol) { bg[p + 1] = 1; stack.push(p + 1); }
    if (p >= w && !bg[p - w] && dist[p - w] <= tol) { bg[p - w] = 1; stack.push(p - w); }
    if (p < w * (h - 1) && !bg[p + w] && dist[p + w] <= tol) { bg[p + w] = 1; stack.push(p + w); }
  }
  const small = newCanvas(w, h);
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = bg[i] ? 0 : 255; }
  sctx.putImageData(img, 0, 0);
  cleanAlpha(small); // abgetrennte Flecken entfernen
  const m = newCanvas(W, H);
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, W, H); // weiches Hochskalieren = weiche Kanten
  return m;
}

/* „Motiv in der Mitte“: Annahme, dass das Kleidungsstück die Bildmitte ausfüllt.
 * Von der vorherrschenden Farbe in der Bildmitte aus wachsen, dann eingeschlossene Stellen (Aufdruck, Etikett) auffüllen.
 * Teil 1 (einmal pro Bild): Farben umrechnen, Startfarbe und Startpunkte bestimmen. */
function prepareCenterMask(base, size = 700) {
  const t = scaled(base, size);
  const ctx = t.getContext('2d');
  ctx.drawImage(base, 0, 0, t.width, t.height);
  const w = t.width, h = t.height, n = w * h;
  const d = ctx.getImageData(0, 0, w, h).data;
  const Y = new Float32Array(n), U = new Float32Array(n), V = new Float32Array(n), A = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    A[i] = d[i * 4 + 3] >= 128; // bereits transparente Stellen gehören nie zum Motiv
    Y[i] = (0.299 * r + 0.587 * g + 0.114 * b) * 0.6; // Helligkeit schwächer gewichtet (Falten, Schatten)
    U[i] = -0.169 * r - 0.331 * g + 0.5 * b;
    V[i] = 0.5 * r - 0.419 * g - 0.081 * b;
  }
  // Mittlere Bildhälfte (halbe Breite × halbe Höhe); darin die häufigste Farbgruppe bestimmen (k-means, 4 Gruppen).
  // Der Stoff überwiegt dort fast immer – auch wenn ein großer Aufdruck genau in der Mitte sitzt.
  const x0 = Math.round(w * 0.25), x1 = Math.round(w * 0.75), y0 = Math.round(h * 0.25), y1 = Math.round(h * 0.75);
  const win = [];
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) if (A[y * w + x]) win.push(y * w + x);
  if (!win.length) win.push((h >> 1) * w + (w >> 1));
  let cs = [0.1, 0.4, 0.6, 0.9].map((f) => { const i = win[Math.floor(f * (win.length - 1))]; return [Y[i], U[i], V[i]]; });
  let lab = new Uint8Array(win.length);
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0]), cnt = cs.map(() => 0);
    win.forEach((i, j) => {
      let best = 0, bd = Infinity;
      cs.forEach((c, k) => { const dd = (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
      lab[j] = best; sum[best][0] += Y[i]; sum[best][1] += U[i]; sum[best][2] += V[i]; cnt[best]++;
    });
    cs = cs.map((c, k) => (cnt[k] ? sum[k].map((v) => v / cnt[k]) : c));
  }
  const cnt = cs.map(() => 0); lab.forEach((k) => cnt[k]++);
  const K = cnt.indexOf(Math.max(...cnt)), ref = cs[K];
  const seeds = win.filter((_, j) => lab[j] === K);
  const dref = new Float32Array(n);
  for (let i = 0; i < n; i++) dref[i] = A[i] ? Math.sqrt((Y[i] - ref[0]) ** 2 + (U[i] - ref[1]) ** 2 + (V[i] - ref[2]) ** 2) : 1e9;
  return { w, h, Y, U, V, dref, seeds };
}
/* Teil 2: wachsen lassen und Löcher füllen. Ergebnis: 1 = Hintergrund (vom Rand erreichbar), 0 = Motiv */
function centerGrow(prep, tol) {
  const { w, h, Y, U, V, dref, seeds } = prep;
  const n = w * h, tl = Math.max(4, tol * 0.2); // Schritt zum Nachbarpixel klein, Abstand zur Stoffarbe bis „tol“
  const reg = new Uint8Array(n);
  const q = new Int32Array(n);
  let qh = 0, qt = 0;
  for (const i of seeds) if (dref[i] <= tol) { reg[i] = 1; q[qt++] = i; }
  const step = (p, o) => {
    if (reg[o] || dref[o] > tol) return;
    if (Math.sqrt((Y[o] - Y[p]) ** 2 + (U[o] - U[p]) ** 2 + (V[o] - V[p]) ** 2) > tl) return;
    reg[o] = 1; q[qt++] = o;
  };
  while (qh < qt) {
    const p = q[qh++], x = p % w;
    if (x > 0) step(p, p - 1);
    if (x < w - 1) step(p, p + 1);
    if (p >= w) step(p, p - w);
    if (p < n - w) step(p, p + w);
  }
  // Eingeschlossene Stellen auffüllen: alles, was nicht vom Rand aus erreichbar ist, gehört zum Motiv
  const out = new Uint8Array(n);
  qh = qt = 0;
  const seedOut = (i) => { if (!reg[i] && !out[i]) { out[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { seedOut(x); seedOut(n - w + x); }
  for (let y = 0; y < h; y++) { seedOut(y * w); seedOut(y * w + w - 1); }
  while (qh < qt) {
    const p = q[qh++], x = p % w;
    if (x > 0) seedOut(p - 1);
    if (x < w - 1) seedOut(p + 1);
    if (p >= w) seedOut(p - w);
    if (p < n - w) seedOut(p + w);
  }
  return out;
}
/** Toleranz automatisch wählen: so hoch wie möglich, aber deutlich unter dem Wert, ab dem die Auswahl
 *  in den Hintergrund „ausläuft“ (erkennbar daran, dass sie plötzlich große Teile des Bildrands berührt). */
function autoCenterTol(prep) {
  const { w, h } = prep;
  let leak = null;
  for (let tol = 15; tol <= 120; tol += 5) {
    const out = centerGrow(prep, tol);
    let edge = 0, tot = 0;
    for (let x = 0; x < w; x++) { edge += !out[x] + !out[(h - 1) * w + x]; tot += 2; }
    for (let y = 0; y < h; y++) { edge += !out[y * w] + !out[y * w + w - 1]; tot += 2; }
    if (edge / tot >= 0.12) { leak = tol; break; }
  }
  if (leak === null) return 80;
  return Math.max(15, Math.round((leak * 0.8) / 5) * 5);
}
/* Teil 3: Maske in voller Größe erzeugen */
function centerMask(prep, tol, W, H) {
  const { w, h } = prep, n = w * h;
  const out = centerGrow(prep, tol);
  const small = newCanvas(w, h);
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(w, h);
  for (let i = 0; i < n; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = out[i] ? 0 : 255; }
  sctx.putImageData(img, 0, 0);
  cleanAlpha(small);
  const m = newCanvas(W, H);
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, W, H);
  return m;
}

const Crop = {
  base: null, mask: null, comp: null, rect: null, ratio: null, scale: 1, drag: null, resolve: null,
  tool: 'crop', brush: 40, undo: [], colorPrep: {}, colorMode: 'center', tols: { center: 65, edge: 28 },

  get src() { return this.mask ? this.comp : this.base; },
  get transparent() { return !!this.mask || this.baseTransparent; },

  /** Öffnet den Editor. Ergebnis: { canvas, transparent } | { …, skipRest } | null (verworfen) */
  /** initMask: vorhandene Freistellung (beim erneuten Bearbeiten eines gespeicherten Fotos mit Original) */
  edit(canvas, title, moreLeft = false, transparent = false, initMask = null) {
    this.session = (this.session || 0) + 1;
    this.setBusy(null);
    this.orig = canvas;
    this.origTransparent = transparent;
    this.initMask = initMask;
    $('#cropTitle').textContent = title;
    $('#cropSkipRest').hidden = !moreLeft;
    $('#cropDlg').showModal();
    this.undo = [];
    this.reset(false);
    if (initMask) this.setMask(copyCanvas(initMask));
    setTimeout(warmUpBg, 400);
    return new Promise((res) => { this.resolve = res; });
  },
  finish(result) {
    if (result) {
      result.transparent = this.transparent;
      // Original (ohne Freistellung, gleicher Ausschnitt) mitgeben, damit es später erneut bearbeitet werden kann
      result.orig = this.mask && !this.baseTransparent ? this.cropOf(this.base) : null;
    }
    this.session++;
    this.setBusy(null);
    this.undo = []; this.colorPrep = {};
    const r = this.resolve;
    this.resolve = null;
    $('#cropDlg').close();
    r?.(result);
  },
  /** Alles zurück auf das Originalfoto (ohne Freistellung). Vom Nutzer ausgelöst: per ↶ rückgängig machbar. */
  reset(byUser = true) {
    if (byUser && this.mask && this.base === this.orig) this.pushUndo();
    else if (byUser) this.undo = [];
    this.base = this.orig;
    this.baseTransparent = this.origTransparent;
    this.mask = null; this.comp = null;
    this.colorPrep = {};
    this.ratio = null;
    for (const b of $('#cropRatio').children) b.classList.toggle('active', b.dataset.r === '');
    this.setTool('crop');
    this.showColorPanel(false);
    this.resetRect();
    this.layout();
  },
  /** Bild + Maske zusammensetzen */
  composite() {
    if (!this.mask) { this.comp = null; return; }
    if (!this.comp || this.comp.width !== this.base.width || this.comp.height !== this.base.height) this.comp = newCanvas(this.base.width, this.base.height);
    const ctx = this.comp.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.base, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  },
  setMask(m, { autoCrop = true } = {}) {
    this.mask = m;
    this.composite();
    if (autoCrop && m) this.autoCrop(); else if (!m) this.resetRect();
    this.layout();
    this.updateTools();
  },
  pushUndo() {
    this.undo.push(this.mask ? copyCanvas(this.mask) : null);
    if (this.undo.length > 5) this.undo.shift();
    this.updateTools();
  },
  popUndo() {
    if (!this.undo.length) return;
    this.setMask(this.undo.pop(), { autoCrop: false });
  },
  autoCrop() {
    this.setRatio(null, false);
    const b = alphaBounds(this.comp);
    if (!b) return;
    const m = Math.max(b.w, b.h) * 0.04, W = this.base.width, H = this.base.height;
    const x = Math.max(0, b.x - m), y = Math.max(0, b.y - m);
    this.rect = { x, y, w: Math.min(W, b.x + b.w + m) - x, h: Math.min(H, b.y + b.h + m) - y };
  },
  resetRect() {
    const W = this.base.width, H = this.base.height;
    if (!this.ratio) { this.rect = { x: 0, y: 0, w: W, h: H }; return; }
    let w = W, h = W / this.ratio;
    if (h > H) { h = H; w = H * this.ratio; }
    this.rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  },
  layout() {
    const stage = $('#cropStage');
    const maxW = stage.clientWidth - 32, maxH = stage.clientHeight - 32;
    const W = this.base.width, H = this.base.height;
    this.scale = Math.min(maxW / W, maxH / H);
    const cw = Math.round(W * this.scale), ch = Math.round(H * this.scale);
    const dpr = window.devicePixelRatio || 1;
    const cv = $('#cropCanvas');
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    this.redraw();
    this.drawBox();
  },
  redraw() {
    const cv = $('#cropCanvas');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(this.src, 0, 0, cv.width, cv.height);
  },
  drawBox() {
    const b = $('#cropBox').style, r = this.rect, s = this.scale;
    b.left = r.x * s + 'px'; b.top = r.y * s + 'px'; b.width = r.w * s + 'px'; b.height = r.h * s + 'px';
  },
  rotate(dir) {
    this.base = rotateCanvas(this.base, dir);
    if (this.mask) this.mask = rotateCanvas(this.mask, dir);
    this.undo = []; this.colorPrep = {};
    this.composite();
    this.resetRect();
    this.layout();
    this.updateTools();
    if (!$('#colorPanel').hidden) this.applyColor(false);
  },
  setRatio(r, apply = true) {
    this.ratio = r || null;
    for (const b of $('#cropRatio').children) b.classList.toggle('active', b.dataset.r === (r ? String(r) : ''));
    if (apply) { this.resetRect(); this.drawBox(); }
  },
  cropOf(src) {
    const r = this.rect;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    if (x === 0 && y === 0 && w === src.width && h === src.height) return src;
    const c = newCanvas(w, h);
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    return c;
  },
  result() {
    const src = this.src, r = this.rect;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    if (x === 0 && y === 0 && w === src.width && h === src.height) return src;
    const c = newCanvas(w, h);
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    return c;
  },

  /* Werkzeuge: Rahmen (Zuschneiden) oder Pinsel */
  setTool(t) {
    this.tool = t;
    for (const b of $('#cropTools').children) b.classList.toggle('active', b.dataset.tool === t);
    $('#cropWrap').classList.toggle('painting', t !== 'crop');
    $('#brushRow').hidden = t === 'crop';
    $('#cropRatio').hidden = t !== 'crop';
  },
  updateTools() {
    $('#cropUndo').disabled = this.busy || !this.undo.length;
  },
  showColorPanel(on) {
    $('#colorPanel').hidden = !on;
    $('#cropColor').classList.toggle('active', on && this.colorMode === 'edge');
    $('#cropCenter').classList.toggle('active', on && this.colorMode === 'center');
    if (on) $('#colorTol').value = this.tols[this.colorMode];
  },

  // Ziehen: Rahmen verschieben/größer ziehen – oder mit dem Pinsel malen
  pos(e) {
    const r = $('#cropCanvas').getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  },
  down(e) {
    if (this.busy) return;
    if (this.tool !== 'crop') {
      e.preventDefault();
      $('#cropWrap').setPointerCapture?.(e.pointerId);
      this.pushUndo();
      if (!this.mask) { // erster Pinselstrich ohne Freistellung: volle Maske anlegen
        const m = newCanvas(this.base.width, this.base.height);
        const c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, m.width, m.height);
        this.mask = m;
      }
      this.paintLast = this.pos(e);
      this.painting = true;
      this.paint(this.paintLast);
      return;
    }
    const h = e.target.dataset.h || (e.target.closest('#cropBox') ? 'move' : null);
    if (!h) return;
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    this.drag = { h, px: e.clientX, py: e.clientY, r: { ...this.rect } };
  },
  paint(p) {
    const ctx = this.mask.getContext('2d');
    ctx.globalCompositeOperation = this.tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = this.brush / this.scale;
    ctx.beginPath();
    ctx.moveTo(this.paintLast.x, this.paintLast.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    this.paintLast = p;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.composite(); this.redraw(); });
  },
  move(e) {
    if (this.painting) { this.paint(this.pos(e)); return; }
    const d = this.drag;
    if (!d) return;
    const W = this.base.width, H = this.base.height, s = this.scale;
    const dx = (e.clientX - d.px) / s, dy = (e.clientY - d.py) / s;
    const r0 = d.r, min = 48 / s;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    if (d.h === 'move') {
      this.rect = { ...r0, x: clamp(r0.x + dx, 0, W - r0.w), y: clamp(r0.y + dy, 0, H - r0.h) };
    } else {
      const west = d.h.includes('w'), north = d.h.includes('n');
      const ax = west ? r0.x + r0.w : r0.x, ay = north ? r0.y + r0.h : r0.y;   // feste Gegenecke
      let tx = (west ? r0.x : r0.x + r0.w) + dx, ty = (north ? r0.y : r0.y + r0.h) + dy;
      tx = west ? clamp(tx, 0, ax - min) : clamp(tx, ax + min, W);
      ty = north ? clamp(ty, 0, ay - min) : clamp(ty, ay + min, H);
      let w = Math.abs(tx - ax), h = Math.abs(ty - ay);
      if (this.ratio) { if (w / h > this.ratio) w = h * this.ratio; else h = w / this.ratio; }
      this.rect = { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
    }
    this.drawBox();
  },
  up() {
    this.drag = null;
    if (this.painting) { this.painting = false; this.composite(); this.redraw(); }
  },

  setBusy(text) {
    this.busy = !!text;
    $('#cropBusy').hidden = !text;
    if (text) $('#cropBusyText').textContent = text;
    for (const b of document.querySelectorAll('#cropDlg .croptools button, #cropDlg .croptools input, #cropOk')) b.disabled = !!text;
    if (!text) this.updateTools();
  },

  /** Farbbasiertes Freistellen (fast sofort, ohne Download):
   *  'center' = Motiv in der Mitte, 'edge' = einfarbiger Untergrund */
  applyColor(push = true) {
    if (push) this.pushUndo();
    const mode = this.colorMode, W = this.base.width, H = this.base.height;
    if (mode === 'center') {
      if (!this.colorPrep.center) {
        this.colorPrep.center = prepareCenterMask(this.base);
        // Für jedes neue Foto passende Toleranz automatisch bestimmen (auf kleinerer Auflösung, schnell)
        this.tols.center = autoCenterTol(prepareCenterMask(this.base, 350));
        $('#colorTol').value = this.tols.center;
      }
      this.setMask(centerMask(this.colorPrep.center, this.tols.center, W, H));
    } else {
      this.colorPrep.edge ??= prepareColorMask(this.base);
      this.setMask(colorMask(this.colorPrep.edge, this.tols.edge, W, H));
    }
  },
  toggleColor(mode) {
    if (this.busy) return;
    if (!$('#colorPanel').hidden && this.colorMode === mode) { this.showColorPanel(false); return; }
    this.colorMode = mode;
    this.showColorPanel(true);
    this.applyColor();
  },

  /** KI-Freistellung (@imgly/background-removal) */
  async removeBg() {
    if (this.busy) return;
    this.showColorPanel(false);
    const session = this.session;
    this.setBusy('Wird vorbereitet …');
    try {
      const { removeBackground } = await loadBgLib();
      // Eingabe auf höchstens 2000 px verkleinern – schneller; gespeichert werden ohnehin 1600 px
      const input = scaled(this.base, 2000);
      const ictx = input.getContext('2d');
      ictx.fillStyle = '#fff'; ictx.fillRect(0, 0, input.width, input.height); // bereits transparente Stellen weiß
      ictx.drawImage(this.base, 0, 0, input.width, input.height);
      const blob = await toBlob(input, 'image/jpeg', 0.95);
      bgProgress = (key, cur, total) => {
        if (session !== this.session) return;
        if (key.startsWith('fetch:/models')) this.setBusy(`KI-Modell wird geladen … ${Math.round((cur / total) * 100)} %`);
        else if (key.startsWith('compute')) this.setBusy('Hintergrund wird entfernt …');
      };
      if (bgWarm) this.setBusy('KI-Modell wird vorbereitet …');
      const out = await removeBackground(blob, bgConfig());
      localStorage.setItem('ks_bgUsed', '1');
      if (session !== this.session) return; // inzwischen abgebrochen
      // Ergebnis als Maske in Originalgröße übernehmen
      const res = await fileToCanvas(out);
      cleanAlpha(res);
      const m = newCanvas(this.base.width, this.base.height);
      m.getContext('2d').drawImage(res, 0, 0, m.width, m.height);
      this.pushUndo();
      this.setMask(m);
    } catch (e) {
      console.error(e);
      if (session === this.session) {
        toast(navigator.onLine ? `Freistellen fehlgeschlagen: ${e.message}` : 'Zum ersten Freistellen wird eine Internetverbindung gebraucht (KI-Modell wird geladen).');
      }
    } finally {
      if (session === this.session) this.setBusy(null);
    }
  },
};

/* ---------------- Farbe automatisch erkennen ----------------
 * Pixel des Fotos (freigestellt: nur das Motiv, sonst die mittlere Bildhälfte) werden der nächstgelegenen
 * Farbe aus der festen Liste zugeordnet (Abstand im Lab-Farbraum). Die häufigste Farbe gewinnt,
 * eine zweite kommt dazu, wenn sie mindestens 30 % ausmacht. */
function toLab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Yv = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Yv) - 16, 500 * (h(X) - h(Yv)), 200 * (h(Yv) - h(Z))];
}
// Nur Farben mit eindeutigem Farbton; Effektfarben (Gold, Mehrfarbig, Transparent …) und Neon-Doppelungen bleiben außen vor
const AUTO_COLORS = FARBEN
  .filter(([name, css]) => /^#[0-9a-f]{6}$/i.test(css) && !name.startsWith('Neon'))
  .map(([name, css]) => [name, toLab(parseInt(css.slice(1, 3), 16), parseInt(css.slice(3, 5), 16), parseInt(css.slice(5, 7), 16))])
  .concat([['Jeansblau', toLab(0x76, 0x94, 0xb8)]]);
function detectColors(canvas, transparent) {
  const t = scaled(canvas, 120);
  const ctx = t.getContext('2d');
  ctx.drawImage(canvas, 0, 0, t.width, t.height);
  const d = ctx.getImageData(0, 0, t.width, t.height).data;
  const counts = new Map();
  let total = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
    if (!transparent && (x < t.width * 0.25 || x > t.width * 0.75 || y < t.height * 0.25 || y > t.height * 0.75)) continue;
    const i = (y * t.width + x) * 4;
    if (d[i + 3] < 200) continue;
    const lab = toLab(d[i], d[i + 1], d[i + 2]);
    let best = null, bd = Infinity;
    for (const [name, c] of AUTO_COLORS) {
      const dd = (lab[0] - c[0]) ** 2 + (lab[1] - c[1]) ** 2 + (lab[2] - c[2]) ** 2;
      if (dd < bd) { bd = dd; best = name; }
    }
    counts.set(best, (counts.get(best) || 0) + 1);
    total++;
  }
  if (!total) return [];
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const out = [ranked[0][0]];
  if (ranked[1] && ranked[1][1] / total >= 0.3) out.push(ranked[1][0]);
  return FIELD.farben.all.filter((o) => out.includes(o)); // feste Reihenfolge
}

/** Fotos nacheinander im Editor öffnen und übernehmen */
async function addPhotos(files) {
  for (let i = 0; i < files.length; i++) {
    try {
      let canvas = await fileToCanvas(files[i]);
      let transparent = false, origCanvas = null;
      if (!skipEditing) {
        const res = await Crop.edit(canvas, files.length > 1 ? `Foto ${i + 1} von ${files.length}` : 'Foto bearbeiten', i < files.length - 1);
        if (!res) continue; // verworfen
        canvas = res.canvas;
        transparent = res.transparent;
        origCanvas = res.orig;
        if (res.skipRest) skipEditing = true;
      }
      const { full, thumb, orig, ext } = await canvasToPhoto(canvas, transparent, origCanvas);
      if (!ed) return;
      ed.photos.push({ id: uid() + ext, isNew: true, full, thumb, orig, url: URL.createObjectURL(thumb) });
      // Farbe vorschlagen, solange noch keine gewählt ist (nur beim ersten Foto = Titelbild)
      if (ed.photos.length === 1 && !ed.vals.farben.length) {
        const found = detectColors(canvas, transparent);
        if (found.length) { ed.vals.farben = found; ed.autoColor = true; renderPickFields(); }
      }
      renderPhotoStrip();
    } catch (e) {
      toast('Foto konnte nicht gelesen werden: ' + e.message);
    }
  }
  skipEditing = false;
}
let skipEditing = false;
// Laufende Fotoverarbeitung (Umwandeln/Freistellen) – Speichern wartet darauf, damit kein Foto verloren geht
const photoTasks = new Set();
function trackPhoto(p) { photoTasks.add(p); p.finally(() => photoTasks.delete(p)); return p; }

/** Vorhandenes Foto im Editor erneut drehen/zuschneiden */
async function reEditPhoto(idx) {
  const p = ed.photos[idx];
  let blob = p.isNew ? p.full : (photoMap.get(p.id)?.full || null);
  if (!blob && !p.isNew) {
    const u = await fullUrl(p.id);
    if (u) blob = await (await fetch(u)).blob();
  }
  if (!blob) return toast('Das Foto ist gerade nicht verfügbar.');
  let res;
  const png = isPng(p.id);
  // Freigestelltes Foto: Original holen (lokal oder aus der Cloud), Freistellung als Maske darüberlegen
  let origBlob = png ? (p.isNew ? p.orig : photoMap.get(p.id)?.orig) || null : null;
  if (png && !origBlob && !p.isNew && Auth.signedIn() && navigator.onLine) {
    try { origBlob = await Store().download(photoFile(p.id, 'orig')); } catch (e) { console.warn(e); }
  }
  if (origBlob) {
    const base = await fileToCanvas(origBlob);
    const cut = await fileToCanvas(blob);
    const mask = newCanvas(base.width, base.height);
    mask.getContext('2d').drawImage(cut, 0, 0, mask.width, mask.height);
    res = await Crop.edit(base, 'Foto bearbeiten', false, false, mask);
  } else {
    // Ältere freigestellte Fotos ohne gespeichertes Original: weiter bearbeiten nur auf dem freigestellten Bild
    res = await Crop.edit(await fileToCanvas(blob), 'Foto bearbeiten', false, png);
  }
  if (!res || !ed) return;
  const { full, thumb, orig, ext } = await canvasToPhoto(res.canvas, res.transparent, res.orig);
  if (p.isNew) URL.revokeObjectURL(p.url); else ed.removed.push(p.id);
  // Bearbeitetes Foto ersetzt das alte an derselben Stelle
  ed.photos[idx] = { id: uid() + ext, isNew: true, full, thumb, orig, url: URL.createObjectURL(thumb) };
  renderPhotoStrip();
}

/* ---------------- Synchronisation ---------------- */
let syncing = false, syncAgain = false, syncTimer = null;
const syncBtn = $('#syncBtn');

function setSync(state, text) {
  syncBtn.dataset.state = state;
  $('#syncText').textContent = text;
}
function updateSyncIndicator() {
  if (!Auth.configured || (!Auth.signedIn() && !Auth.wasSignedIn())) return setSync('local', 'Lokal');
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
  pendingItems = [...await DB.all('items'), ...await DB.all('outfits')].filter((i) => i._dirty || i._deleted).length;
}

function scheduleSync(ms = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync(), ms);
}

async function sync() {
  if (!Auth.signedIn()) { await recountPending(); updateSyncIndicator(); return; }
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
      showBanner(`Die ${provName()}-Anmeldung ist abgelaufen. Tippe hier, um dich erneut anzumelden.`, () => Auth.login());
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
  const S = Store();
  for (const ph of await DB.all('photos')) {
    if (ph.pendingDelete) {
      await S.del(photoFile(ph.id));
      await S.del(photoFile(ph.id, true));
      if (isPng(ph.id)) await S.del(photoFile(ph.id, 'orig'));
      await DB.del('photos', ph.id);
    } else if (ph.pendingUpload) {
      await S.put(photoFile(ph.id), ph.full, photoMime(ph.id));
      await S.put(photoFile(ph.id, true), ph.thumb, photoMime(ph.id));
      if (ph.orig) await S.put(photoFile(ph.id, 'orig'), ph.orig, ph.orig.type || 'image/jpeg');
      const cur = await DB.get('photos', ph.id);
      if (cur && !cur.pendingDelete) { cur.pendingUpload = false; await DB.put('photos', cur); }
    }
  }
  // 2. Teile und Outfits (je ein JSON pro Eintrag in items/ bzw. outfits/)
  await pushCollection(S, 'items');
  await pushCollection(S, 'outfits');
}
async function pushCollection(S, store) {
  for (const it of await DB.all(store)) {
    if (it._deleted) {
      await S.del(`${store}/${it.id}.json`);
      const cur = await DB.get(store, it.id);
      if (cur?._deleted) await DB.del(store, it.id);
    } else if (it._dirty) {
      const blob = new Blob([JSON.stringify(itemForUpload(it), null, 2)], { type: 'application/json' });
      const etag = await S.put(`${store}/${it.id}.json`, blob, 'application/json');
      const cur = await DB.get(store, it.id);
      if (cur && !cur._deleted) {
        cur._etag = etag;
        if (cur.updatedAt === it.updatedAt) cur._dirty = false; // inzwischen erneut geändert? dann später nochmal
        await DB.put(store, cur);
      }
    }
  }
}

async function pullCollection(S, store) {
  const remote = await S.list(store);
  const local = new Map((await DB.all(store)).map((i) => [i.id, i]));
  const remoteIds = new Set();

  for (const f of remote) {
    if (!f.name.endsWith('.json')) continue;
    const id = f.name.slice(0, -5);
    remoteIds.add(id);
    const l = local.get(id);
    if (l && (l._dirty || l._deleted)) continue;
    if (l && l._etag === f.etag) continue;
    const blob = await S.download(`${store}/${f.name}`, f.meta);
    if (!blob) continue;
    let data;
    try { data = JSON.parse(await blob.text()); } catch { console.warn('Defektes JSON', f.name); continue; }
    const cur = await DB.get(store, id);
    if (cur && (cur._dirty || cur._deleted)) continue;
    await DB.put(store, { ...data, id, _etag: f.etag, _dirty: false });
  }

  // Auf anderem Gerät gelöscht
  for (const l of local.values()) {
    if (!remoteIds.has(l.id) && l._etag && !l._dirty && !l._deleted) await DB.del(store, l.id);
  }
}

async function pullChanges() {
  const S = Store();
  await pullCollection(S, 'items');
  await pullCollection(S, 'outfits');

  // Fehlende Vorschaubilder laden, verwaiste lokale Fotos entfernen
  const all = (await DB.all('items')).filter((i) => !i._deleted);
  const referenced = new Set(all.flatMap((i) => i.photos || []));
  const have = new Map((await DB.all('photos')).map((p) => [p.id, p]));
  for (const it of all) {
    for (const pid of it.photos || []) {
      if (have.has(pid)) continue;
      const thumb = await S.download(photoFile(pid, true));
      if (thumb) await DB.put('photos', { id: pid, itemId: it.id, thumb, full: null });
    }
  }
  for (const p of have.values()) {
    if (!referenced.has(p.id) && !p.pendingUpload && !p.pendingDelete) { await DB.del('photos', p.id); dropUrls(p.id); }
  }
}

/* ---------------- Oberfläche: Liste ---------------- */
function valuesFor(key, pool = items) {
  const set = new Map();
  for (const it of pool) for (const v of fieldValues(it, key)) set.set(v, (set.get(v) || 0) + 1);
  return set;
}

const SEASON_DEF = { key: 'jahreszeit', label: 'Jahreszeit', order: new Map(JAHRESZEITEN.map((v, i) => [v, i])) };
/** Auswahlfelder der Filter als HTML (für die Übersicht und die Teile-Auswahl im Outfit) */
function filterSelectsHtml(fState) {
  const defs = [...CAT_KEYS, ...FIELDS.filter((f) => !f.noFilter), { key: 'anlass', label: 'Anlass' }, SEASON_DEF];
  // Unterkategorie/Art nur aus der gewählten Kategorie anbieten
  const poolK = fState.kategorie ? items.filter((i) => i.kategorie === fState.kategorie) : items;
  const poolU = fState.unterkategorie ? poolK.filter((i) => i.unterkategorie === fState.unterkategorie) : poolK;
  return defs.map((f) => {
    const pool = f.key === 'unterkategorie' ? poolK : f.key === 'typ' ? poolU : items;
    const vals = [...valuesFor(f.key, pool).entries()];
    if (CAT_KEYS.some((c) => c.key === f.key)) {
      const rank = (v) => {
        const sample = pool.find((i) => i[f.key] === v) || {};
        return CAT.order.get(f.key === 'kategorie' ? v : f.key === 'unterkategorie' ? `${sample.kategorie}|${v}` : `${sample.kategorie}|${sample.unterkategorie}|${v}`) ?? 1e9;
      };
      vals.sort((a, b) => rank(a[0]) - rank(b[0]));
    } else if (f.order) {
      vals.sort((a, b) => (f.order.get(a[0]) ?? 1e9) - (f.order.get(b[0]) ?? 1e9));
    } else {
      vals.sort((a, b) => a[0].localeCompare(b[0], 'de'));
    }
    const cur = fState[f.key] || '';
    if (cur && cur !== CAT_NONE && !vals.some(([v]) => v === cur)) vals.unshift([cur, 0]);
    const none = f.key === 'kategorie' ? items.filter((i) => !i.kategorie).length : 0;
    return `<label>${esc(f.label)}<select data-filter="${f.key}"><option value="">Alle</option>${
      vals.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('')
    }${none ? `<option value="${CAT_NONE}"${cur === CAT_NONE ? ' selected' : ''}>Nicht zugeordnet (${none})</option>` : ''}</select></label>`;
  }).join('') + '<button type="button" class="chipbtn reset" data-reset-filters>Zurücksetzen</button>';
}
/** Filterwert ändern; übergeordnete Kategorie setzt Unterkategorie/Art zurück */
function setFilter(fState, k, v) {
  fState[k] = v;
  if (k === 'kategorie') { delete fState.unterkategorie; delete fState.typ; }
  if (k === 'unterkategorie') delete fState.typ;
}

function renderFilters() {
  $('#filters').innerHTML = filterSelectsHtml(filters);
  const n = Object.values(filters).filter(Boolean).length;
  $('#filterCount').textContent = n ? `(${n})` : '';
  $('#filterToggle').classList.toggle('active', n > 0);
}

/** Teile nach Suchtext, Filtern und Sortierung */
function filterItems(query, fState, sort = 'new') {
  const q = String(query || '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  let list = items.filter((it) => {
    for (const [k, v] of Object.entries(fState)) {
      if (!v) continue;
      if (v === CAT_NONE) { if (it[k]) return false; }
      else if (!fieldValues(it, k).includes(v)) return false;
    }
    if (!terms.length) return true;
    const hay = [it.name, it.notiz, it.kategorie, it.unterkategorie, it.typ, ...(it.anlass || []), ...(it.jahreszeit || []), ...FIELDS.map((f) => fieldText(it, f.key))].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const cmp = (a, b, k) => (k === 'name' ? 0 : String(a[k] || '').localeCompare(String(b[k] || ''), 'de')) || itemTitle(a).localeCompare(itemTitle(b), 'de');
  if (sort === 'new') list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  else if (sort === 'kategorie') list.sort((a, b) => catRank(a) - catRank(b) || cmp(a, b, 'name'));
  else list.sort((a, b) => cmp(a, b, sort));
  return list;
}
function filteredItems() { return filterItems($('#search').value, filters, $('#sort').value); }

/** Karte eines Teils (Übersicht, Teile-Auswahl, Outfit-Detail) */
function itemCardHtml(it, { selected = null } = {}) {
  const pid = (it.photos || [])[0];
  const url = pid ? thumbUrl(pid) : '';
  // Ohne Bezeichnung steht die Kategorie schon im Titel – dann Marke statt Kategorie zeigen
  const sub = [it.name ? (it.typ || it.unterkategorie || it.kategorie) : it.marke, it.groesse].filter(Boolean).join(' · ');
  const farben = fieldValues(it, 'farben');
  const n = (it.photos || []).length;
  return `<button type="button" class="card${selected ? ' selected' : ''}" data-id="${esc(it.id)}">
      ${url ? `<img class="thumb${isPng(pid) ? ' cut' : ''}" loading="lazy" src="${url}" alt="">` : `<div class="noimg">${pid ? 'Foto lädt …' : 'Kein Foto'}</div>`}
      ${n > 1 && selected === null ? `<span class="nphotos">${n} Fotos</span>` : ''}
      ${selected !== null ? `<span class="check">${selected ? '✓' : ''}</span>` : ''}
      ${it._dirty && Auth.configured && selected === null ? '<span class="pending" title="Noch nicht synchronisiert"></span>' : ''}
      <div class="info"><div class="title${it.name ? '' : ' auto'}">${esc(itemTitle(it))}</div>
        <div class="sub">${farben.length ? `<span class="dots" title="${esc(farben.join(', '))}">${farben.slice(0, 5).map(swatch).join('')}</span>` : ''}${esc(sub || it.lagerort || '')}</div></div>
    </button>`;
}

let tab = localStorage.getItem('ks_tab') === 'outfits' ? 'outfits' : 'items';
function render() {
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('#tabbar [data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
  if (tab === 'outfits') return renderOutfits();
  renderFilters();
  const list = filteredItems();
  $('#count').textContent = items.length
    ? (list.length === items.length ? `${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}` : `${list.length} von ${items.length} Teilen`)
    : '';
  $('#empty').hidden = items.length > 0;
  $('#emptyOutfits').hidden = true;
  $('#grid').className = 'grid';
  $('#grid').innerHTML = list.map((it) => itemCardHtml(it)).join('');
}

/* ---------------- Outfits ---------------- */
const outfitItems = (o) => (o.itemIds || []).map((id) => items.find((i) => i.id === id)).filter(Boolean);
const outfitTitle = (o) => o.name || outfitItems(o).map(itemTitle).slice(0, 3).join(' + ') || 'Outfit';
const outfitsWith = (itemId) => outfits.filter((o) => (o.itemIds || []).includes(itemId));
/** Collage aus bis zu 4 Teilen */
function collageHtml(o) {
  const its = outfitItems(o).slice(0, 4);
  if (!its.length) return '<div class="noimg">Noch keine Teile</div>';
  return `<div class="collage n${its.length}">${its.map((it) => {
    const pid = (it.photos || [])[0];
    const url = pid ? thumbUrl(pid) : '';
    return url ? `<img class="${isPng(pid) ? 'cut' : ''}" loading="lazy" src="${url}" alt="">` : '<span class="ph">–</span>';
  }).join('')}</div>`;
}
// Filter für Outfits (eigener Zustand, gespeichert)
const outfitFilters = JSON.parse(localStorage.getItem('ks_ofilters') || '{}');
function outfitFilterHtml() {
  return [{ key: 'anlass', label: 'Anlass' }, SEASON_DEF].map((f) => {
    const vals = [...valuesFor(f.key, outfits).entries()];
    if (f.order) vals.sort((a, b) => (f.order.get(a[0]) ?? 1e9) - (f.order.get(b[0]) ?? 1e9)); else vals.sort((a, b) => a[0].localeCompare(b[0], 'de'));
    const cur = outfitFilters[f.key] || '';
    if (cur && !vals.some(([v]) => v === cur)) vals.unshift([cur, 0]);
    return `<label>${esc(f.label)}<select data-filter="${f.key}"><option value="">Alle</option>${
      vals.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('')}</select></label>`;
  }).join('') + '<button type="button" class="chipbtn reset" data-reset-filters>Zurücksetzen</button>';
}
function renderOutfits() {
  $('#filters').innerHTML = outfitFilterHtml();
  const nf = Object.values(outfitFilters).filter(Boolean).length;
  $('#filterCount').textContent = nf ? `(${nf})` : '';
  $('#filterToggle').classList.toggle('active', nf > 0);
  const q = $('#search').value.trim().toLowerCase();
  const list = outfits
    .filter((o) => Object.entries(outfitFilters).every(([k, v]) => !v || (o[k] || []).includes(v)))
    .filter((o) => !q || [outfitTitle(o), o.notiz, ...(o.anlass || []), ...(o.jahreszeit || []), ...outfitItems(o).map(itemTitle)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#count').textContent = outfits.length
    ? (list.length === outfits.length ? `${outfits.length} ${outfits.length === 1 ? 'Outfit' : 'Outfits'}` : `${list.length} von ${outfits.length} Outfits`)
    : '';
  $('#empty').hidden = true;
  $('#emptyOutfits').hidden = outfits.length > 0;
  $('#grid').className = 'grid outfits';
  $('#grid').innerHTML = list.map((o) => {
    const n = outfitItems(o).length;
    return `<button type="button" class="card outfit" data-outfit="${esc(o.id)}">
      ${collageHtml(o)}
      ${o._dirty && Auth.configured ? '<span class="pending" title="Noch nicht synchronisiert"></span>' : ''}
      <div class="info"><div class="title${o.name ? '' : ' auto'}">${esc(outfitTitle(o))}</div><div class="sub">${esc([`${n} ${n === 1 ? 'Teil' : 'Teile'}`, ...(o.anlass || []).slice(0, 2)].join(' · '))}</div></div>
    </button>`;
  }).join('');
}

/* Outfit-Detailansicht */
let outfitDetailId = null;
function openOutfitDetail(id) {
  const o = outfits.find((x) => x.id === id);
  if (!o) return;
  outfitDetailId = id;
  $('#outfitDetailTitle').textContent = outfitTitle(o);
  const its = outfitItems(o);
  $('#outfitDetailItems').innerHTML = its.map((it) => itemCardHtml(it)).join('') || '<p class="muted">Noch keine Teile.</p>';
  $('#outfitDetailNote').textContent = o.notiz || '';
  $('#outfitDetailNote').hidden = !o.notiz;
  const meta = [['Anlass', (o.anlass || []).join(', ')], ['Jahreszeit', (o.jahreszeit || []).join(', ')]].filter(([, v]) => v);
  $('#outfitDetailMeta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#outfitDetailMeta').hidden = !meta.length;
  if ($('#outfitDetail').open) $('#outfitDetail').close();
  $('#outfitDetail').showModal();
}

/* Outfit-Editor */
let oed = null; // { id, isNew, itemIds: [] }
function openOutfitEditor(id = null) {
  const o = id ? outfits.find((x) => x.id === id) : null;
  oed = {
    id: o?.id || uid(), isNew: !o, itemIds: [...(o?.itemIds || [])].filter((x) => items.some((i) => i.id === x)),
    anlass: new Set(o?.anlass || []), jahreszeit: new Set(o?.jahreszeit || []),
  };
  renderOutfitChips();
  $('#outfitEditTitle').textContent = o ? 'Outfit bearbeiten' : 'Neues Outfit';
  $('#outfitForm').elements.oname.value = o?.name || '';
  $('#outfitForm').elements.onotiz.value = o?.notiz || '';
  $('#outfitDelete').hidden = !o;
  renderOutfitItems();
  $('#outfitEditor').showModal();
}
function renderOutfitChips() {
  $('#oAnlassChips').innerHTML = chipsHtml(allAnlaesse(oed.anlass), oed.anlass, 'anlass');
  $('#oSeasonChips').innerHTML = chipsHtml(JAHRESZEITEN, oed.jahreszeit, 'season');
}
function renderOutfitItems() {
  const its = oed.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean);
  $('#outfitItems').innerHTML = its.map((it) => {
    const pid = (it.photos || [])[0];
    const url = pid ? thumbUrl(pid) : '';
    return `<div class="oitem">${url ? `<img class="${isPng(pid) ? 'cut' : ''}" src="${url}" alt="">` : '<span class="noimg">–</span>'}
      <span class="oname">${esc(itemTitle(it))}</span>
      <button type="button" class="oremove" data-remove="${esc(it.id)}" aria-label="Entfernen">✕</button></div>`;
  }).join('') || '<p class="hint">Noch keine Teile. Füge über „+ Teile hinzufügen“ Kleidungsstücke hinzu.</p>';
  $('#outfitCount').textContent = its.length ? `${its.length} ${its.length === 1 ? 'Teil' : 'Teile'}` : '';
}
async function saveOutfit() {
  const f = $('#outfitForm').elements;
  const now = new Date().toISOString();
  const prev = outfits.find((x) => x.id === oed.id);
  const o = {
    ...(prev || {}),
    id: oed.id,
    name: f.oname.value.trim(),
    notiz: f.onotiz.value.trim(),
    itemIds: oed.itemIds,
    anlass: [...oed.anlass],
    jahreszeit: JAHRESZEITEN.filter((j) => oed.jahreszeit.has(j)),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    _dirty: true,
  };
  await DB.put('outfits', o);
  const id = oed.id;
  oed = null;
  await loadState(); await recountPending(); render(); updateSyncIndicator(); scheduleSync();
  return id;
}
async function deleteOutfit(id) {
  const o = await DB.get('outfits', id);
  if (!o) return;
  if (!o._etag) await DB.del('outfits', id);
  else await DB.put('outfits', { ...o, _deleted: true, _dirty: true });
  await loadState(); await recountPending(); render(); updateSyncIndicator(); scheduleSync();
}

/* Teile-Auswahl für ein Outfit: gleiche Suche und Filter wie in der Übersicht */
const pick = { filters: {}, selected: new Set() };
function openItemPicker() {
  pick.filters = {};
  pick.selected = new Set(oed.itemIds);
  $('#pickSearch').value = '';
  $('#pickFilters').hidden = true;
  renderPicker();
  $('#pickDlg').showModal();
}
function renderPicker() {
  $('#pickFilters').innerHTML = filterSelectsHtml(pick.filters);
  const n = Object.values(pick.filters).filter(Boolean).length;
  $('#pickFilterCount').textContent = n ? `(${n})` : '';
  $('#pickFilterToggle').classList.toggle('active', n > 0);
  const list = filterItems($('#pickSearch').value, pick.filters, 'kategorie');
  $('#pickGrid').innerHTML = list.map((it) => itemCardHtml(it, { selected: pick.selected.has(it.id) })).join('')
    || '<p class="muted">Keine passenden Teile.</p>';
  $('#pickDone').textContent = `Fertig (${pick.selected.size})`;
}

/* ---------------- Detailansicht ---------------- */
let detailId = null;
async function openDetail(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  detailId = id;
  $('#detailTitle').textContent = itemTitle(it);
  const withAlt = (key, text) => [text, it.alt?.[key] ? `(bisher: ${it.alt[key]})` : ''].filter(Boolean).join(' ');
  const rows = [
    ['Kategorie', catPath(it) || (it.kategorieAlt ? `nicht zugeordnet (bisher: ${it.kategorieAlt})` : '')],
    ...FIELDS.filter((f) => f.type !== 'url').map((f) => [f.label, withAlt(f.key, fieldText(it, f.key)), f.swatch ? fieldValues(it, f.key) : null]),
    ['Anlass', (it.anlass || []).join(', ')], ['Jahreszeit', (it.jahreszeit || []).join(', ')], ['Notiz', it.notiz],
  ].filter(([, v]) => v);
  const link = normalizeUrl(it.link);
  $('#detailLink').hidden = !link;
  if (link) { $('#detailLink').href = link; $('#detailLinkHost').textContent = new URL(link).hostname.replace(/^www\./, ''); }
  $('#detailFields').innerHTML = rows.map(([k, v, sw]) => `<dt>${esc(k)}</dt><dd>${sw?.length ? `<span class="dots">${sw.map(swatch).join('')}</span>` : ''}${esc(v).replace(/\n/g, '<br>')}</dd>`).join('')
    || '<dt>–</dt><dd class="muted">Keine Angaben</dd>';
  const gal = $('#detailPhotos');
  const pids = it.photos || [];
  gal.innerHTML = pids.map((pid) => `<img data-pid="${esc(pid)}" src="${thumbUrl(pid)}" alt=""${isPng(pid) ? ' class="cut"' : ''}>`).join('');
  // In welchen Outfits kommt das Teil vor?
  const ofs = outfitsWith(id);
  $('#detailOutfitsBox').hidden = !ofs.length;
  $('#detailOutfits').innerHTML = ofs.map((o) => `<button type="button" class="ochiplink" data-outfit="${esc(o.id)}">${collageHtml(o)}<span>${esc(outfitTitle(o))}</span></button>`).join('');
  // Bereits offen (z. B. unter einem Outfit)? Dann nach oben holen
  if ($('#detail').open) $('#detail').close();
  $('#detail').showModal();
  for (const img of gal.querySelectorAll('img')) {
    fullUrl(img.dataset.pid).then((u) => { if (u) img.src = u; });
  }
}

/* ---------------- Editor ---------------- */
let ed = null; // { id, isNew, photos: [{id, isNew, full, thumb}], removed: [] , anlass: Set }

function buildFieldInputs() {
  $('#fieldGrid').innerHTML = FIELDS.map((f) => {
    const cls = `field${f.wide ? ' wide' : ''}`;
    const alt = `<span class="hint legacy" id="alt-${f.key}" hidden></span>`;
    if (f.type === 'text') {
      return `<label class="${cls}">${esc(f.label)}<input name="${f.key}" list="dl-${f.key}" autocomplete="off"><datalist id="dl-${f.key}"></datalist>${alt}</label>`;
    }
    if (f.type === 'price') {
      return `<label class="${cls}">${esc(f.label)}<span class="unit money"><input name="${f.key}" inputmode="decimal" autocomplete="off" placeholder="0,00"><span>€</span></span>${alt}</label>`;
    }
    if (f.type === 'date') {
      return `<div class="${cls}">${esc(f.label)}<span class="unit"><input type="date" name="${f.key}" max="${new Date().toISOString().slice(0, 10)}"><button type="button" class="clearbtn" data-clear="${f.key}" aria-label="Datum leeren">✕</button></span>${alt}</div>`;
    }
    if (f.type === 'url') {
      return `<label class="${cls}">${esc(f.label)}<input type="url" name="${f.key}" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…">${alt}</label>`;
    }
    if (f.type === 'chips') {
      return `<div class="${cls}">${esc(f.label)}<div class="chips" id="chips-${f.key}"></div>${alt}</div>`;
    }
    const auto = f.key === 'farben' ? '<span class="hint autohint" id="auto-farben" hidden>✨ Automatisch erkannt – tippe zum Ändern</span>' : '';
    return `<div class="${cls}">${esc(f.label)}<button type="button" class="katbtn pickbtn" data-pick="${f.key}"></button>${auto}${alt}</div>`;
  }).join('');
}
function fillDatalists() {
  for (const f of FIELDS.filter((x) => x.type === 'text')) {
    const vals = new Set([...valuesFor(f.key).keys(), ...f.defaults]);
    $(`#dl-${f.key}`).innerHTML = [...vals].sort((a, b) => a.localeCompare(b, 'de')).map((v) => `<option value="${esc(v)}">`).join('');
  }
}
/** Auswahlfelder im Editor (Knöpfe, Chips, Hinweise auf alte Werte) neu zeichnen */
function renderPickFields() {
  $('#auto-farben').hidden = !ed.autoColor;
  for (const f of FIELDS) {
    const altEl = $(`#alt-${f.key}`);
    const altVal = ed.alt[f.key];
    altEl.hidden = !altVal;
    if (altVal) altEl.textContent = `Bisher „${altVal}“ – bitte neu auswählen.`;
    if (isInputField(f)) continue;
    if (f.type === 'chips') {
      $(`#chips-${f.key}`).innerHTML = f.options.map((o) =>
        `<button type="button" class="chipbtn${ed.vals[f.key] === o ? ' active' : ''}" data-chip="${f.key}" data-val="${esc(o)}">${esc(o)}</button>`).join('');
      continue;
    }
    const vals = f.type === 'multi' ? ed.vals[f.key] : (ed.vals[f.key] ? [ed.vals[f.key]] : []);
    const btn = $(`[data-pick="${f.key}"]`);
    btn.classList.toggle('empty', !vals.length);
    btn.innerHTML = `<span class="picked">${vals.length
      ? vals.map((v) => `<span class="tag">${f.swatch ? swatch(v) : ''}${esc(v)}</span>`).join('')
      : `${esc(f.label)} wählen`}</span><span aria-hidden="true">›</span>`;
  }
}

/* ---------------- Auswahldialog für Farbe, Material, Größe ---------------- */
let optKey = null;
let optOpen = -1; // aufgeklappte Gruppe (nur bei Feldern mit Gruppen, z. B. Größe)
function openOptions(key) {
  optKey = key;
  $('#optSearch').value = '';
  $('#optDone').textContent = FIELD[key].type === 'multi' ? 'Fertig' : 'Schließen';
  const f = FIELD[key];
  const sel = fieldValues(ed.vals, key);
  optOpen = f.groups ? f.groups.findIndex(([, opts]) => opts.some((o) => sel.includes(o))) : -1;
  renderOptions();
  $('#optDlg').showModal();
  ($('#optList .ochip.active') || $('#optList .kl2.open'))?.scrollIntoView({ block: 'center' });
}
function renderOptions() {
  const f = FIELD[optKey];
  const q = $('#optSearch').value.trim().toLowerCase();
  const sel = new Set(fieldValues(ed.vals, optKey));
  $('#optTitle').textContent = f.type === 'multi' && sel.size ? `${f.label} (${sel.size})` : f.label;
  const groups = f.groups || [[null, f.options]];
  const chips = (hits) => `<div class="ochips${f.swatch ? ' swatches' : ''}">${hits.map((o) =>
    `<button type="button" class="ochip${sel.has(o) ? ' active' : ''}" data-val="${esc(o)}">${f.swatch ? swatch(o) : ''}${esc(o)}</button>`).join('')}</div>`;
  const html = groups.map(([g, opts], gi) => {
    const hits = opts.filter((o) => !q || o.toLowerCase().includes(q) || (g && g.toLowerCase().includes(q)));
    if (!hits.length) return '';
    if (!g) return chips(hits);
    const open = !!q || optOpen === gi;
    const picked = opts.filter((o) => sel.has(o));
    return `<button type="button" class="kl2${open ? ' open' : ''}${picked.length ? ' chosen' : ''}" data-og="${gi}" aria-expanded="${open}">
      <span>${esc(g)}${picked.length && !open ? `<small>${esc(picked.join(', '))}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>${open ? chips(hits) : ''}`;
  }).join('');
  $('#optList').innerHTML = html || '<p class="muted">Nichts gefunden.</p>';
}

/** Alle bekannten Anlässe: Vorgaben + bei Teilen und Outfits verwendete */
function allAnlaesse(extra = []) {
  return new Set([...ANLASS_DEFAULTS, ...valuesFor('anlass').keys(), ...valuesFor('anlass', outfits).keys(), ...extra]);
}
function chipsHtml(options, selected, attr) {
  return [...options].map((a) => `<button type="button" class="chipbtn${selected.has(a) ? ' active' : ''}" data-${attr}="${esc(a)}">${esc(a)}</button>`).join('');
}
function renderAnlass() {
  $('#anlassChips').innerHTML = chipsHtml(allAnlaesse(ed.anlass), ed.anlass, 'anlass');
  $('#seasonChips').innerHTML = chipsHtml(JAHRESZEITEN, ed.jahreszeit, 'season');
}
function renderPhotoStrip() {
  $('#photoStrip').innerHTML = ed.photos.map((p, i) => {
    const url = p.isNew ? p.url : thumbUrl(p.id);
    return `<div class="ph"><img src="${url}" data-idx="${i}" alt=""${isPng(p.id) ? ' class="cut"' : ''}></div>`;
  }).join('');
}

/* ---------------- Kategorie-Auswahl ---------------- */
function renderKatButton() {
  const p = catPath(ed.kat);
  $('#katText').textContent = p || 'Kategorie wählen';
  $('#katBtn').classList.toggle('empty', !p);
  $('#katAlt').hidden = !(ed.katAlt && !p);
  $('#katAlt').textContent = `Bisher „${ed.katAlt}“ – bitte neu zuordnen.`;
}
// Ohne Suche zuerst nur die Oberkategorien; Antippen klappt Unterkategorien auf, diese wiederum die Arten.
let katOpenK = -1;     // aufgeklappte Oberkategorie (Index)
let katOpen = null;    // aufgeklappte Unterkategorie ("i|j")
function renderKatList() {
  const q = $('#katSearch').value.trim().toLowerCase();
  const cur = `${ed.kat.kategorie}|${ed.kat.unterkategorie}|${ed.kat.typ}`;
  let html = '';
  KATEGORIEN.forEach(([k, gs], i) => {
    const openK = !!q || katOpenK === i;
    let inner = '';
    let any = false;
    gs.forEach(([u, as], j) => {
      const all = !q || k.toLowerCase().includes(q) || u.toLowerCase().includes(q);
      const hits = as.map((a, n) => [a, n]).filter(([a]) => all || a.toLowerCase().includes(q));
      if (!hits.length) return;
      any = true;
      if (!openK) return;
      const open = !!q || katOpen === `${i}|${j}`;
      const chosen = ed.kat.kategorie === k && ed.kat.unterkategorie === u;
      inner += `<button type="button" class="kl2${open ? ' open' : ''}${chosen ? ' chosen' : ''}" data-g="${i}|${j}" aria-expanded="${open}">
        <span>${esc(u)}${chosen && !open && ed.kat.typ ? `<small>${esc(ed.kat.typ)}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>`;
      if (open) {
        inner += `<div class="kleaves">${hits.map(([a, n]) =>
          `<button type="button" class="kleaf${`${k}|${u}|${a}` === cur ? ' active' : ''}" data-k="${i}|${j}|${n}">${esc(a)}</button>`).join('')}</div>`;
      }
    });
    if (!any) return;
    const chosenK = ed.kat.kategorie === k;
    html += `<section><button type="button" class="kl1 kl1btn${openK ? ' open' : ''}${chosenK ? ' chosen' : ''}" data-kk="${i}" aria-expanded="${openK}">
      <span>${esc(k)}${chosenK && !openK ? `<small>${esc([ed.kat.unterkategorie, ed.kat.typ].filter(Boolean).join(' › '))}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>${inner}</section>`;
  });
  $('#katList').innerHTML = html || '<p class="muted">Nichts gefunden.</p>';
}
function openKatPicker() {
  $('#katSearch').value = '';
  // Gewählte Ober- und Unterkategorie gleich aufklappen
  katOpenK = -1; katOpen = null;
  KATEGORIEN.forEach(([k, gs], i) => {
    if (k === ed.kat.kategorie) katOpenK = i;
    gs.forEach(([u], j) => { if (k === ed.kat.kategorie && u === ed.kat.unterkategorie) katOpen = `${i}|${j}`; });
  });
  renderKatList();
  $('#katDlg').showModal();
  const act = $('#katList .kleaf.active') || $('#katList .kl2.open') || $('#katList .kl1btn.open');
  if (act) act.scrollIntoView({ block: 'center' });
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
    jahreszeit: new Set(it?.jahreszeit || []),
    kat: { kategorie: it?.kategorie || '', unterkategorie: it?.unterkategorie || '', typ: it?.typ || '' },
    vals: Object.fromEntries(FIELDS.filter((f) => !isInputField(f)).map((f) => [f.key, f.type === 'multi' ? [...fieldValues(it || {}, f.key)] : (it?.[f.key] || '')])),
    alt: { ...(it?.alt || {}) },
    katAlt: it?.kategorieAlt || '',
  };
  renderKatButton();
  $('#editTitle').textContent = it ? 'Bearbeiten' : 'Neues Teil';
  form.elements.bezeichnung.value = it?.name || '';
  for (const f of FIELDS.filter(isInputField)) {
    const v = it?.[f.key];
    form.elements[f.key].value = f.type === 'price' ? (hasValue(v) ? priceFmt.format(Number(v)) : '') : (v || '');
  }
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
  renderPickFields();
  renderPhotoStrip();
  $('#editor').showModal();
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
    jahreszeit: JAHRESZEITEN.filter((j) => ed.jahreszeit.has(j)),
    notiz: form.elements.notiz.value.trim(),
    photos: ed.photos.map((p) => p.id),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    _dirty: true,
  };
  for (const f of FIELDS) {
    const raw = isInputField(f) ? form.elements[f.key].value.trim() : null;
    if (f.type === 'price') it[f.key] = parsePrice(raw);
    else if (f.type === 'url') it[f.key] = normalizeUrl(raw);
    else if (f.type === 'date') it[f.key] = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
    else it[f.key] = isInputField(f) ? raw : ed.vals[f.key];
    if (fieldValues(it, f.key).length) delete ed.alt[f.key];
  }
  if (Object.keys(ed.alt).length) it.alt = ed.alt; else delete it.alt;
  it.v = DATA_VERSION;
  Object.assign(it, ed.kat);
  if (it.kategorie) delete it.kategorieAlt;

  for (const p of ed.photos.filter((x) => x.isNew)) {
    const rec = { id: p.id, itemId: it.id, full: p.full, thumb: p.thumb, orig: p.orig || null, pendingUpload: true };
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
  // Aus allen Outfits entfernen
  for (const o of outfitsWith(id)) {
    await DB.put('outfits', { ...o, itemIds: o.itemIds.filter((x) => x !== id), updatedAt: new Date().toISOString(), _dirty: true });
  }
  await loadState();
  await recountPending();
  render();
  updateSyncIndicator();
  scheduleSync();
}

/* ---------------- Einstellungen ---------------- */
function renderSettings() {
  const P = prov();
  for (const b of $('#provSeg').children) b.classList.toggle('active', b.dataset.prov === provKey());
  $('#provBox').hidden = !P;
  const signed = Auth.signedIn();
  $('#authState').textContent = !P
    ? 'Die Daten liegen nur auf diesem Gerät.'
    : signed ? `Verbunden mit ${P.name}.`
      : Auth.clientId ? 'Nicht angemeldet.' : `Trage die ${P.idLabel.split(' ')[0]} ein und melde dich an.`;
  if (P) {
    $('#clientIdLabel').textContent = P.idLabel;
    $('#clientId').placeholder = P.idPlaceholder;
    $('#clientId').value = Auth.clientId;
    $('#redirectLabel').textContent = P.redirectLabel;
    $('#redirectUri').textContent = Auth.redirectUri();
    $('#loginBtn').textContent = `Mit ${P.name} anmelden`;
  }
  $('#loginBtn').hidden = signed;
  $('#logoutBtn').hidden = !signed;
  $('#syncNowBtn').hidden = !signed;
  const last = localStorage.getItem('ks_lastSync');
  $('#lastSync').textContent = last && signed ? `Zuletzt synchronisiert: ${new Date(last).toLocaleString('de-DE')}` : '';
  const nPhotos = items.reduce((n, i) => n + (i.photos || []).length, 0);
  $('#stats').textContent = `${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}, ${nPhotos} ${nPhotos === 1 ? 'Foto' : 'Fotos'}.`;
  $('#whereHint').innerHTML = P
    ? `Gespeichert wird in ${P.where}: ein JSON pro Teil im Ordner <code>items</code>, Fotos in <code>fotos</code>.`
    : 'Ohne Cloud-Speicher liegen die Daten nur in diesem Browser. Für eine Sicherung und mehrere Geräte OneDrive oder Dropbox wählen.';
  for (const b of $('#bgModelSeg').children) b.classList.toggle('active', b.dataset.m === bgModel());
  $('#qualitySlider').value = photoQuality();
  renderQualityText();
  const cores = self.crossOriginIsolated ? (navigator.hardwareConcurrency || 1) : 1;
  $('#version').textContent = `Version ${APP_VERSION} · Freistellen mit ${cores} ${cores === 1 ? 'Prozessorkern' : 'Prozessorkernen'}`;
}

function renderQualityText() {
  const q = photoQuality();
  $('#qualityValue').textContent = `${q} %`;
  $('#qualityHint').textContent = q >= 100
    ? 'Höchste Qualität: freigestellte Fotos verlustfrei als PNG (große Dateien).'
    : webpSupported
      ? 'Freigestellte Fotos als WebP mit transparentem Hintergrund – deutlich kleiner als PNG. Gilt auch für die JPG-Qualität normaler Fotos.'
      : 'Dieser Browser kann kein WebP erzeugen: der Regler verkleinert stattdessen die Auflösung freigestellter Fotos (PNG). Gilt auch für die JPG-Qualität normaler Fotos.';
}

/** Wechselt den Cloud-Speicher. Alles, was auf diesem Gerät liegt, wird in den neuen Speicher hochgeladen;
 *  der bisherige Speicher bleibt unverändert. */
async function switchProvider(key) {
  Auth.logout();
  sessionStorage.removeItem('ks_silentTried');
  if (key) localStorage.setItem('ks_provider', key); else localStorage.removeItem('ks_provider');
  localStorage.removeItem('ks_lastSync');
  for (const store of ['items', 'outfits']) {
    for (const it of await DB.all(store)) {
      if (it._deleted) { await DB.del(store, it.id); continue; }
      await DB.put(store, { ...it, _etag: null, _dirty: true });
    }
  }
  for (const p of await DB.all('photos')) {
    if (p.pendingDelete || (!p.full && !p.thumb)) { await DB.del('photos', p.id); continue; }
    // Fehlt das große Bild lokal (nur Vorschau aus der alten Cloud geladen), wird die Vorschau verwendet.
    await DB.put('photos', { ...p, full: p.full || p.thumb, pendingUpload: true, pendingDelete: false });
  }
  await loadState();
  await recountPending();
  render();
  renderSettings();
  updateSyncIndicator();
}

function exportCsv() {
  const cols = [['Bezeichnung', 'name'], ...CAT_KEYS.map((f) => [f.label, f.key]), ...FIELDS.map((f) => [f.label, f.key]), ['Anlass', 'anlass'], ['Jahreszeit', 'jahreszeit'], ['Notiz', 'notiz'], ['Fotos', 'photos'], ['Angelegt', 'createdAt'], ['Geändert', 'updatedAt']];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => c[0]).join(';')];
  for (const it of filteredItems()) {
    lines.push(cols.map(([, k]) => {
      if (k === 'anlass' || k === 'jahreszeit' || FIELD[k]) return cell(fieldText(it, k));
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
  // In den obersten offenen Dialog hängen, sonst liegt die Meldung hinter dem Dialog
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentElement !== host) host.append(t);
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
    if (!card) return;
    if (card.dataset.outfit) openOutfitDetail(card.dataset.outfit); else openDetail(card.dataset.id);
  });
  $('#addBtn').addEventListener('click', () => (tab === 'outfits' ? openOutfitEditor() : openEditor()));
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    localStorage.setItem('ks_tab', tab);
    $('#search').value = '';
    $('#filters').hidden = true;
    render();
    window.scrollTo(0, 0);
  });

  // Outfits: Detail, Editor, Teile-Auswahl
  $('#detailOutfits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-outfit]');
    if (b) openOutfitDetail(b.dataset.outfit);
  });
  $('#outfitDetailItems').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) openDetail(c.dataset.id);
  });
  $('#outfitDetailEdit').addEventListener('click', () => { $('#outfitDetail').close(); openOutfitEditor(outfitDetailId); });
  $('#outfitAddItems').addEventListener('click', openItemPicker);
  $('#oAnlassChips').addEventListener('click', (e) => {
    const a = e.target.dataset.anlass;
    if (!a) return;
    oed.anlass.has(a) ? oed.anlass.delete(a) : oed.anlass.add(a);
    renderOutfitChips();
  });
  $('#oSeasonChips').addEventListener('click', (e) => {
    const j = e.target.dataset.season;
    if (!j) return;
    oed.jahreszeit.has(j) ? oed.jahreszeit.delete(j) : oed.jahreszeit.add(j);
    renderOutfitChips();
  });
  const addOAnlass = () => {
    const v = $('#oAnlassNew').value.trim();
    if (!v) return;
    oed.anlass.add(v);
    $('#oAnlassNew').value = '';
    renderOutfitChips();
  };
  $('#oAnlassAdd').addEventListener('click', addOAnlass);
  $('#oAnlassNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOAnlass(); } });
  $('#outfitItems').addEventListener('click', (e) => {
    const r = e.target.closest('[data-remove]');
    if (!r) return;
    oed.itemIds = oed.itemIds.filter((x) => x !== r.dataset.remove);
    renderOutfitItems();
  });
  $('#outfitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = await saveOutfit();
    $('#outfitEditor').close();
    toast('Outfit gespeichert');
    if ($('#detail').open && detailId) openDetail(detailId); // „In Outfits“ aktualisieren
    if ($('#outfitDetail').open && outfitDetailId === id) openOutfitDetail(id);
  });
  $('#outfitEditor').addEventListener('close', () => { oed = null; });
  $('#outfitDelete').addEventListener('click', async () => {
    if (!confirm('Dieses Outfit löschen? Die Teile selbst bleiben erhalten.')) return;
    const id = oed.id;
    oed = null;
    $('#outfitEditor').close();
    if ($('#outfitDetail').open) $('#outfitDetail').close();
    await deleteOutfit(id);
    if ($('#detail').open && detailId) openDetail(detailId);
    toast('Outfit gelöscht');
  });
  $('#pickSearch').addEventListener('input', renderPicker);
  $('#pickFilterToggle').addEventListener('click', () => { $('#pickFilters').hidden = !$('#pickFilters').hidden; });
  $('#pickFilters').addEventListener('change', (e) => {
    const k = e.target.dataset.filter;
    if (!k) return;
    setFilter(pick.filters, k, e.target.value);
    renderPicker();
  });
  $('#pickFilters').addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset-filters]')) return;
    pick.filters = {};
    renderPicker();
  });
  $('#pickGrid').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (!c) return;
    const id = c.dataset.id;
    pick.selected.has(id) ? pick.selected.delete(id) : pick.selected.add(id);
    renderPicker();
  });
  $('#pickDone').addEventListener('click', () => {
    // Bisherige Reihenfolge behalten, neu Ausgewählte hinten anhängen
    oed.itemIds = [...oed.itemIds.filter((x) => pick.selected.has(x)), ...[...pick.selected].filter((x) => !oed.itemIds.includes(x))];
    $('#pickDlg').close();
    renderOutfitItems();
  });
  $('#search').addEventListener('input', render);
  $('#sort').addEventListener('change', () => { localStorage.setItem('ks_sort', $('#sort').value); render(); });
  $('#filterToggle').addEventListener('click', () => { $('#filters').hidden = !$('#filters').hidden; });
  $('#filters').addEventListener('change', (e) => {
    const k = e.target.dataset.filter;
    if (!k) return;
    if (tab === 'outfits') {
      outfitFilters[k] = e.target.value;
      localStorage.setItem('ks_ofilters', JSON.stringify(outfitFilters));
      return render();
    }
    setFilter(filters, k, e.target.value);
    localStorage.setItem('ks_filters', JSON.stringify(filters));
    render();
  });
  $('#filters').addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset-filters]')) return;
    if (tab === 'outfits') {
      for (const k of Object.keys(outfitFilters)) delete outfitFilters[k];
      localStorage.setItem('ks_ofilters', '{}');
      return render();
    }
    for (const k of Object.keys(filters)) delete filters[k];
    localStorage.setItem('ks_filters', '{}');
    render();
  });

  // Datum leeren, Preis beim Verlassen schön formatieren, ungültigen Preis/Link markieren
  $('#fieldGrid').addEventListener('click', (e) => {
    const c = e.target.closest('[data-clear]');
    if (c) { $('#editForm').elements[c.dataset.clear].value = ''; }
  });
  $('#fieldGrid').addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.name === 'preis' && el.value.trim()) {
      const n = parsePrice(el.value);
      el.classList.toggle('invalid', n === '');
      if (n !== '') el.value = priceFmt.format(n);
    }
    if (el.name === 'link' && el.value.trim()) {
      const u = normalizeUrl(el.value);
      el.classList.toggle('invalid', !u);
      if (u) el.value = u;
    }
  });
  // Auswahlfelder
  $('#fieldGrid').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) return openOptions(pick.dataset.pick);
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const k = chip.dataset.chip;
      ed.vals[k] = ed.vals[k] === chip.dataset.val ? '' : chip.dataset.val; // erneut tippen = abwählen
      renderPickFields();
    }
  });
  $('#optSearch').addEventListener('input', renderOptions);
  $('#optList').addEventListener('click', (e) => {
    const g = e.target.closest('.kl2');
    if (g) {
      const gi = Number(g.dataset.og);
      optOpen = optOpen === gi ? -1 : gi;
      renderOptions();
      $(`#optList .kl2[data-og="${gi}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const b = e.target.closest('.ochip');
    if (!b) return;
    const f = FIELD[optKey], v = b.dataset.val;
    if (f.type === 'multi') {
      const set = new Set(ed.vals[optKey]);
      set.has(v) ? set.delete(v) : set.add(v);
      ed.vals[optKey] = f.all.filter((o) => set.has(o)); // feste Reihenfolge
      if (optKey === 'farben') ed.autoColor = false;
      renderOptions();
    } else {
      ed.vals[optKey] = v;
      $('#optDlg').close();
    }
  });
  $('#optClear').addEventListener('click', () => {
    ed.vals[optKey] = FIELD[optKey].type === 'multi' ? [] : '';
    if (optKey === 'farben') ed.autoColor = false;
    if (FIELD[optKey].type === 'multi') renderOptions(); else $('#optDlg').close();
  });
  $('#optDlg').addEventListener('close', () => { if (ed) renderPickFields(); });

  // Kategorie-Auswahl
  $('#katBtn').addEventListener('click', openKatPicker);
  $('#katSearch').addEventListener('input', renderKatList);
  $('#katList').addEventListener('click', (e) => {
    const kk = e.target.closest('.kl1btn');
    if (kk) {
      const i = Number(kk.dataset.kk);
      katOpenK = katOpenK === i ? -1 : i;
      if (!katOpen?.startsWith(`${i}|`)) katOpen = null;
      renderKatList();
      $(`#katList .kl1btn[data-kk="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const g = e.target.closest('.kl2');
    if (g) {
      katOpen = katOpen === g.dataset.g ? null : g.dataset.g;
      renderKatList();
      $(`#katList .kl2[data-g="${g.dataset.g}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const b = e.target.closest('.kleaf');
    if (!b) return;
    const [i, j, n] = b.dataset.k.split('|').map(Number);
    const [k, gs] = KATEGORIEN[i];
    ed.kat = { kategorie: k, unterkategorie: gs[j][0], typ: gs[j][1][n] };
    renderKatButton();
    $('#katDlg').close();
  });
  $('#katReset').addEventListener('click', () => {
    ed.kat = { kategorie: '', unterkategorie: '', typ: '' };
    renderKatButton();
    $('#katDlg').close();
  });

  // Detail
  $('#detailEdit').addEventListener('click', () => { $('#detail').close(); openEditor(detailId); });

  // Editor
  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (photoTasks.size) {
      toast('Fotos werden noch verarbeitet …');
      await Promise.allSettled([...photoTasks]);
      if (!ed) return;
    }
    const id = await saveEditor();
    $('#editor').close();
    toast('Gespeichert');
    if (id) detailId = id;
  });
  $('#editor').addEventListener('close', () => {
    if (ed) { for (const p of ed.photos) if (p.isNew) URL.revokeObjectURL(p.url); ed = null; }
  });
  $('#cameraInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await trackPhoto(addPhotos(files));
  });
  // Foto-Editor
  $('#cropOk').addEventListener('click', () => Crop.finish({ canvas: Crop.result() }));
  $('#cropSkipRest').addEventListener('click', () => Crop.finish({ canvas: Crop.result(), skipRest: true }));
  $('#cropCancel').addEventListener('click', () => Crop.finish(null));
  $('#cropDlg').addEventListener('cancel', (e) => { e.preventDefault(); Crop.finish(null); });
  $('#rotL').addEventListener('click', () => Crop.rotate(-1));
  $('#rotR').addEventListener('click', () => Crop.rotate(1));
  $('#cropReset').addEventListener('click', () => Crop.reset());
  $('#cropBg').addEventListener('click', () => Crop.removeBg());
  $('#cropColor').addEventListener('click', () => Crop.toggleColor('edge'));
  $('#cropCenter').addEventListener('click', () => Crop.toggleColor('center'));
  let tolTimer;
  $('#colorTol').addEventListener('input', (e) => {
    Crop.tols[Crop.colorMode] = Number(e.target.value);
    clearTimeout(tolTimer);
    tolTimer = setTimeout(() => Crop.applyColor(false), 60);
  });
  $('#cropTools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) Crop.setTool(b.dataset.tool); });
  $('#brushSize').addEventListener('input', (e) => { Crop.brush = Number(e.target.value); });
  $('#cropUndo').addEventListener('click', () => Crop.popUndo());
  $('#cropRatio').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) Crop.setRatio(Number(b.dataset.r) || null); });
  $('#cropWrap').addEventListener('pointerdown', (e) => Crop.down(e));
  window.addEventListener('pointermove', (e) => Crop.move(e));
  window.addEventListener('pointerup', () => Crop.up());
  window.addEventListener('pointercancel', () => Crop.up());
  window.addEventListener('resize', () => { if ($('#cropDlg').open) Crop.layout(); });

  $('#photoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await trackPhoto(addPhotos(files));
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
  $('#seasonChips').addEventListener('click', (e) => {
    const j = e.target.dataset.season;
    if (!j) return;
    ed.jahreszeit.has(j) ? ed.jahreszeit.delete(j) : ed.jahreszeit.add(j);
    renderAnlass();
  });
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
  $('#photoEdit').addEventListener('click', async () => {
    $('#photoDlg').close();
    await trackPhoto(reEditPhoto(photoIdx));
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
  $('#provSeg').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-prov]');
    if (!b || b.dataset.prov === provKey()) return;
    const target = PROVIDERS[b.dataset.prov]?.name || 'Nur lokal';
    if (provKey() && items.length && !confirm(`Zu „${target}“ wechseln?\n\nDie Teile auf diesem Gerät bleiben erhalten${b.dataset.prov ? ` und werden nach ${target} hochgeladen` : ''}. Die Daten in ${provName()} bleiben dort unverändert.`)) return;
    await switchProvider(b.dataset.prov);
  });
  $('#clientId').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v && !prov().idPattern.test(v)) toast(`${prov().idLabel.split(' ')[0]} sieht ungewöhnlich aus – bitte prüfen.`);
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
  $('#qualitySlider').addEventListener('input', (e) => {
    localStorage.setItem('ks_quality', e.target.value);
    renderQualityText();
  });
  $('#bgModelSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    localStorage.setItem('ks_bgModel', b.dataset.m);
    renderSettings();
  });

  syncBtn.addEventListener('click', () => {
    if (Auth.configured && !Auth.signedIn()) return Auth.login().catch((e) => toast(e.message));
    if (!Auth.configured) { renderSettings(); $('#settings').showModal(); return; }
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
  // Version 1.0 kannte nur OneDrive
  if (localStorage.getItem('ks_clientId') && !localStorage.getItem('ks_provider')) {
    localStorage.setItem('ks_provider', 'onedrive');
    localStorage.setItem('ks_clientId_onedrive', localStorage.getItem('ks_clientId'));
  }
  localStorage.removeItem('ks_clientId');
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
  if (Auth.configured && Auth.wasSignedIn() && navigator.onLine) {
    let ok = Auth.signedIn();
    if (ok) { try { await Auth.accessToken(); } catch (e) { ok = !(e instanceof AuthNeeded); } }
    if (!ok) {
      if (prov().supportsSilent && !sessionStorage.getItem('ks_silentTried')) {
        sessionStorage.setItem('ks_silentTried', '1');
        return Auth.login(true);
      }
      showBanner(`Die ${provName()}-Anmeldung ist abgelaufen. Tippe hier, um dich erneut anzumelden.`, () => Auth.login());
    } else {
      sessionStorage.removeItem('ks_silentTried');
    }
  }
  if (!Auth.configured && items.length > 0 && !localStorage.getItem('ks_hintShown')) {
    localStorage.setItem('ks_hintShown', '1');
    showBanner('Deine Daten liegen bisher nur auf diesem Gerät. Tippe hier, um OneDrive oder Dropbox zu verbinden.', () => { hideBanner(); renderSettings(); $('#settings').showModal(); });
  }
  updateSyncIndicator();
  sync();

  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
    navigator.serviceWorker?.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

init().catch((e) => { console.error(e); toast('Fehler beim Start: ' + e.message); });
