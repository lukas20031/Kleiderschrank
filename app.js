'use strict';
/* Kleiderschrank – digitale Garderobe mit OneDrive- oder Dropbox-Speicher
 * Offline-first: Alles liegt zuerst lokal (IndexedDB) und wird mit
 * dem App-Ordner in OneDrive (Microsoft Graph) oder Dropbox synchronisiert.
 */
const APP_VERSION = '2.23.0';


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
  { key: 'materialien', label: 'Material', type: 'multi', options: MATERIALIEN, wide: true, custom: true },
  { key: 'groesse', label: 'Größe', type: 'single', groups: GROESSEN, wide: true },
  { key: 'passform', label: 'Passform', type: 'chips', options: ['Zu klein', 'Eng', 'Passend', 'Locker', 'Zu groß'], wide: true },
  { key: 'anzahl', label: 'Anzahl', type: 'count', wide: true, noFilter: true },
  { key: 'marke', label: 'Marke', type: 'text', defaults: [], wide: true },
  { key: 'herkunft', label: 'Herkunftsland', type: 'text', wide: true, defaults: LAENDER },
  { key: 'preis', label: 'Preis', type: 'price', wide: true, noFilter: true },
  { key: 'kaufdatum', label: 'Kaufdatum', type: 'date', wide: true, noFilter: true },
  { key: 'link', label: 'Link zum Produkt', type: 'url', wide: true, noFilter: true },
  { key: 'lagerort', label: 'Lagerort', type: 'text', defaults: ['Kleiderschrank', 'Kommode', 'Garderobe', 'Keller', 'Dachboden'], wide: true },
  { key: 'zustand', label: 'Zustand', type: 'chips', options: ZUSTAENDE, wide: true },
  { key: 'pflege', label: 'Waschhinweise', type: 'multi', groups: PFLEGE, flatGroups: true, icon: true, wide: true, noFilter: true, slot: 2 },
];
const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
for (const f of FIELDS) {
  const all = f.groups ? f.groups.flatMap(([, v]) => v) : f.options;
  if (all) { f.all = all; f.order = new Map(all.map((v, i) => [v, i])); }
}
const isMulti = (key) => key === 'anlass' || key === 'jahreszeit' || FIELD[key]?.type === 'multi';
const hasValue = (v) => v !== undefined && v !== null && v !== '';
const fieldValues = (it, key) => (isMulti(key) ? (Array.isArray(it[key]) ? it[key] : []) : (hasValue(it[key]) ? [it[key]] : []));
const INPUT_TYPES = ['text', 'price', 'date', 'url', 'count'];           // Felder mit normalem Eingabefeld
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
/* Anzahl gleicher Teile (Standard 1) und wie viele davon in der Wäsche sind */
const qty = (it) => Math.max(1, parseInt(it?.anzahl, 10) || 1);
const washN = (it) => (it.waesche === true ? qty(it) : Math.min(qty(it), Math.max(0, parseInt(it.waesche, 10) || 0)));
const washAll = (it) => washN(it) >= qty(it);
const washLabel = (it) => (qty(it) > 1 && !washAll(it) ? `${washN(it)}/${qty(it)} Wäsche` : 'Wäsche');
const fieldText = (it, key) => {
  const t = FIELD[key]?.type;
  if (t === 'count') return qty(it) > 1 ? String(qty(it)) : ''; // nur zeigen, wenn mehr als 1
  if (t === 'price') return formatPrice(it[key]);
  if (t === 'date') return formatDate(it[key]);
  if (key === 'materialien') return materialList(it).map(([m, p]) => p ? `${m} ${p} %` : m).join(', ');
  return fieldValues(it, key).join(', ');
};
/** Materialien mit Anteil in Prozent (falls angegeben), größter Anteil zuerst */
function materialList(it) {
  const ant = it.materialAnteile || {};
  return fieldValues(it, 'materialien').map((m, i) => [m, Number(ant[m]) || 0, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([m, p]) => [m, p]);
}
const swatch = (name) => `<span class="sw" style="background:${FARB_MAP.get(name) || '#ccc'}"></span>`;
const DATA_VERSION = 9;
/* Umbau der Shirts (Version 3/4): „T-Shirts“ heißt jetzt „Kurzarmshirts“, Langarm-Shirts haben eine eigene
 * Unterkategorie, Poloshirt ist nach Ärmellänge getrennt, doppelte Arten sind zusammengelegt. */
const SHIRT_MOVES = {
  'Langarmshirt': ['Langarmshirts', 'Langarmshirt'],
  'Langarmshirt mit V-Ausschnitt': ['Langarmshirts', 'Langarmshirt mit V-Ausschnitt'],
  'Grafik-Langarmshirt': ['Langarmshirts', 'Grafik-Langarmshirt'],
  'Poloshirt': ['Kurzarmshirts', 'Poloshirt kurzärmlig'],
  'V-Ausschnitt': ['Kurzarmshirts', 'T-Shirt mit V-Ausschnitt'],
  'Grafik-Kurzarmshirt': ['Kurzarmshirts', 'Grafik-T-Shirt'],
  'Kurzarmshirt': ['Kurzarmshirts', 'T-Shirt'],
};
// 2.17: Schmuck ist eine eigene Kategorie (Ohrschmuck, Ketten, Ringe, Sonstiger Schmuck)
const SCHMUCK_MOVES = {
  'Ohrringe': ['Ohrschmuck', ''], 'Ohrmanschetten': ['Ohrschmuck', 'Ohrmanschette'],
  'Ring': ['Ringe', ''], 'Kette': ['Ketten', ''], 'Choker': ['Ketten', 'Choker'],
  'Echtschmuck': ['Sonstiger Schmuck', ''], 'Anderer Schmuck': ['Sonstiger Schmuck', ''],
  // 2.18: Fußkettchen/Körperkette zu Ketten, Uhren und Piercings eigene Unterkategorien
  'Fußkettchen': ['Ketten', 'Fußkettchen'], 'Körperkette': ['Ketten', 'Körperkette'],
  'Uhr': ['Uhren', ''], 'Körperschmuck': ['Piercings', ''],
  // 2.19: Intimpiercings zusammengefasst
  ...Object.fromEntries(['Klitorisvorhaut (VCH)', 'Schamlippen (Labia)', 'Prinz Albert', 'Frenum (Intim)', 'Hafada'].map((t) => [t, ['Piercings', 'Intimpiercing']])),
};
/** Alte Einteilung in die aktuelle übersetzen: [kategorie, unterkategorie, typ] oder null (unverändert).
 *  forFilter: ohne Art bleibt die Unterkategorie offen (ganzer Schmuck statt „Sonstiger Schmuck“). */
function moveCat(kat, sub, typ, forFilter = false) {
  if (kat === 'Accessoires' && sub === 'Schmuck') {
    if (!typ) return ['Schmuck', forFilter ? '' : 'Sonstiger Schmuck', ''];
    return ['Schmuck', ...(SCHMUCK_MOVES[typ] || ['Sonstiger Schmuck', typ])];
  }
  if (kat === 'Schmuck' && ['Sonstiger Schmuck', 'Ketten', 'Piercings'].includes(sub) && SCHMUCK_MOVES[typ]) {
    const mv = SCHMUCK_MOVES[typ];
    return mv[0] === sub && mv[1] === typ ? null : ['Schmuck', ...mv];
  }
  if (kat === 'Oberteile' && sub === 'Hoodies & Sweatshirts' && typ === 'Sweatjacke') return [kat, sub, 'Sweatshirtjacke'];
  const mv = moveShirt(kat, sub, typ);
  return mv ? [kat, ...mv] : null;
}
/** Alte Unterkategorie/Art aus „T-Shirts“ in die neue Einteilung übersetzen (sonst unverändert) */
function moveShirt(kat, sub, typ) {
  // 2.16: Sweatshirtjacke/-weste von „Pullover und Strickjacken“ zu „Hoodies & Sweatshirts“
  if (kat === 'Oberteile' && sub === 'Pullover und Strickjacken' && (typ === 'Sweatshirtjacke' || typ === 'Sweatshirtweste')) return ['Hoodies & Sweatshirts', typ];
  if (kat === 'Oberteile' && sub === 'Kurzarmshirts' && typ === 'Kurzarmshirt') return ['Kurzarmshirts', 'T-Shirt'];
  if (kat !== 'Oberteile' || sub !== 'T-Shirts') return null;
  return SHIRT_MOVES[typ] || ['Kurzarmshirts', typ || ''];
}

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
  materialien: { merinowolle: 'Wolle', merino: 'Wolle', elastan: 'Elasthan', 'elasthan-mix': 'Elasthan', acryl: 'Polyacryl (Acryl)', polyacryl: 'Polyacryl (Acryl)', jeans: 'Denim', wildleder: 'Wildleder', kunstleder: 'Veganes Leder' },
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
// Umbenannte Materialien: 2.22 „Elasthan“, 2.23 „Polyacryl (Acryl)“
const MAT_RENAME = { Elastan: 'Elasthan', Acryl: 'Polyacryl (Acryl)', Polyacryl: 'Polyacryl (Acryl)' };
/** Wert in einem Listenfeld umbenennen (to = '' löscht ihn); bei Materialien auch den Prozentanteil mitnehmen.
 *  Gibt die geänderten Felder zurück oder null, wenn der Wert nicht vorkommt. */
function renamedMulti(rec, key, from, to) {
  const arr = rec[key];
  if (!Array.isArray(arr) || !arr.includes(from)) return null;
  const out = { [key]: [...new Set(arr.map((v) => (v === from ? to : v)).filter(Boolean))] };
  if (key === 'materialien' && rec.materialAnteile && from in rec.materialAnteile) {
    const ant = { ...rec.materialAnteile };
    if (to) ant[to] = (Number(ant[to]) || 0) + (Number(ant[from]) || 0);
    delete ant[from];
    out.materialAnteile = ant;
  }
  return out;
}
async function migrateItems(list) {
  let changed = 0;
  let newer = false;
  for (const it of list) {
    // Von einer neueren App-Version gespeichert: nicht anfassen (sonst schaukeln sich zwei Geräte gegenseitig hoch)
    if ((it.v || 0) > DATA_VERSION) { newer = true; continue; }
    const needCat = it.kategorie && !CAT.l1.has(it.kategorie);
    const needMat = (it.materialien || []).some((m) => MAT_RENAME[m]); // umbenannte Materialien
    if (it.v === DATA_VERSION && !needCat && !needMat) continue;
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
    const mv = moveCat(upd.kategorie, upd.unterkategorie, upd.typ);
    if (mv) [upd.kategorie, upd.unterkategorie, upd.typ] = mv;
    if (needMat) for (const [from, to] of Object.entries(MAT_RENAME)) Object.assign(upd, renamedMulti(upd, 'materialien', from, to));
    if (Object.keys(alt).length) upd.alt = alt; else delete upd.alt;
    await DB.put('items', upd);
    Object.assign(it, upd);
    for (const k of ['farbe', 'material']) if (!(k in upd)) delete it[k];
    changed++;
  }
  if (newer) outdatedApp();
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
      const r = indexedDB.open('kleiderschrank', 3);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const name of ['items', 'photos', 'outfits', 'packlisten']) {
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
/** Datei wurde inzwischen von einem anderen Gerät geändert (oder existiert schon) */
class Conflict extends Error { constructor(p) { super(`Konflikt bei ${p}`); } }

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
 *   put(pfad, blob, typ, erwartet) -> etag
 *       erwartet: undefined = einfach überschreiben, null = nur neu anlegen, etag = nur überschreiben,
 *       wenn die Datei noch diesen Stand hat – sonst wird Conflict geworfen (gleichzeitige Änderung)
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
  async put(p, blob, type, expect) {
    const headers = { 'Content-Type': type };
    if (expect) headers['If-Match'] = expect;
    const q = expect === null ? '?@microsoft.graph.conflictBehavior=fail' : '';
    const r = await authFetch(this.path(p) + ':/content' + q, { method: 'PUT', body: blob, headers });
    if (r.status === 412 || r.status === 409) throw new Conflict(p);
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
  async put(p, blob, type, expect) {
    const mode = expect === undefined ? 'overwrite' : expect === null ? 'add' : { '.tag': 'update', update: expect };
    const r = await authFetch(this.content + '/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: '/' + p, mode, autorename: false, mute: true }),
      },
      body: blob,
    });
    if (r.status === 409 && (await r.clone().text().catch(() => '')).includes('conflict')) throw new Conflict(p);
    if (!r.ok) throw await httpError(r, `Hochladen ${p}`);
    return (await r.json()).rev;
  },
  async del(p) {
    const r = await this.rpc('/files/delete_v2', { path: '/' + p });
    if (r.ok || await this.notFound(r)) return;
    throw await httpError(r, `Löschen ${p}`);
  },
  /** Gelöschte Datei aus dem Dropbox-Verlauf zurückholen (true, wenn geklappt) */
  async restore(p) {
    const r = await this.rpc('/files/list_revisions', { path: '/' + p, mode: 'path', limit: 5 });
    if (!r.ok) return false;
    const rev = (await r.json()).entries?.[0]?.rev;
    if (!rev) return false;
    return (await this.rpc('/files/restore', { path: '/' + p, rev })).ok;
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
let wishes = [];         // Teile auf der Wunschliste (wunsch: true)
const findItem = (id) => items.find((i) => i.id === id) || wishes.find((i) => i.id === id);
let packlists = [];       // { id, name, von, bis, itemIds: [], want: {id: n}, packed: {id: n}, notiz } (früher: checked: [ids])
let outfits = [];          // { id, name, itemIds: [], notiz, createdAt, updatedAt }            // sichtbare (nicht gelöschte) Teile
let photoMap = new Map();  // photoId -> Datensatz {id, itemId, thumb, full, pendingUpload, pendingDelete}
const urlCache = new Map();
const filters = JSON.parse(localStorage.getItem('ks_filters') || '{}');

async function loadState() {
  const all = (await DB.all('items')).filter((i) => !i._deleted);
  // Papierkorb: als gelöscht markierte Einträge getrennt halten
  trashItems = all.filter((i) => i.geloescht);
  const live = all.filter((i) => !i.geloescht);
  // Wunschliste: eigene Liste, taucht sonst nirgends auf (Outfits, Statistik, Planer …)
  items = live.filter((i) => !i.wunsch);
  wishes = live.filter((i) => i.wunsch);
  const allO = (await DB.all('outfits')).filter((o) => !o._deleted);
  outfits = allO.filter((o) => !o.geloescht); trashOutfits = allO.filter((o) => o.geloescht);
  const allP = (await DB.all('packlisten')).filter((o) => !o._deleted);
  packlists = allP.filter((o) => !o.geloescht); trashPacks = allP.filter((o) => o.geloescht);
  if (await migrateItems(all) && Auth.signedIn()) scheduleSync();
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

/** Fotodatei laden; fehlt sie in der Cloud (z. B. durch gleichzeitige Änderungen auf zwei Geräten gelöscht),
 *  wird einmal versucht, sie aus dem Dropbox-Verlauf wiederherzustellen. */
const restoreTried = new Set();
async function downloadPhoto(S, pid, variant) {
  const blob = await S.download(photoFile(pid, variant));
  if (blob || !S.restore || restoreTried.has(pid)) return blob;
  restoreTried.add(pid);
  let ok = false;
  for (const v of [false, true, ...(isPng(pid) ? ['orig'] : [])]) ok = (await S.restore(photoFile(pid, v)).catch(() => false)) || ok;
  if (!ok) return null;
  console.info('Foto wiederhergestellt:', pid);
  return S.download(photoFile(pid, variant));
}
async function fullUrl(pid) {
  const key = pid + ':f';
  if (urlCache.has(key)) return urlCache.get(key);
  let rec = photoMap.get(pid) || await DB.get('photos', pid);
  if (!rec?.full && Auth.signedIn() && navigator.onLine) {
    try {
      const blob = await downloadPhoto(Store(), pid, false);
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
  // Wie häufig ist jede Randfarbe in der Bildmitte (mittleres Drittel)? Dort liegt meist das Teil.
  const nearest = (i) => { let best = 0, bd = Infinity; cs.forEach((c, k) => { const dd = (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }); return best; };
  const mid = new Array(K).fill(0);
  let midN = 0;
  for (let y = Math.floor(h / 3); y < Math.ceil(h * 2 / 3); y += 2) for (let x = Math.floor(w / 3); x < Math.ceil(w * 2 / 3); x += 2) {
    const i = y * w + x; if (!A[i]) continue; mid[nearest(i)]++; midN++;
  }
  const rgb = (c) => { const y = c[0] / 0.6; return [y + 1.402 * c[2], y - 0.344 * c[1] - 0.714 * c[2], y + 1.772 * c[1]].map((v) => Math.max(0, Math.min(255, Math.round(v)))); };
  const mainK = counts.indexOf(Math.max(...counts));
  const midK = mid.indexOf(Math.max(...mid));
  const clusters = cs.map((c, k) => {
    const share = counts[k] / (kb.length || 1), midShare = midN ? mid[k] / midN : 0;
    // Untergrund = häufig am Rand. Ausnahmen: seltene Randfarben (z. B. ein Ärmel am Rand) und die Farbe,
    // die die Bildmitte beherrscht, aber nicht die Hauptfarbe des Randes ist – das ist fast immer das Teil selbst.
    const on = !!opaqueBorder.length && share >= 0.08 && !(k === midK && k !== mainK && midShare >= 0.3);
    return { c, rgb: rgb(c), share, midShare, on, main: k === mainK };
  }).filter((cl) => cl.share > 0).sort((a, b) => b.share - a.share);
  const d2 = (i, c) => (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2;
  const minD = (i, list) => { let bd = Infinity; for (const c of list) { const dd = d2(i, c); if (dd < bd) bd = dd; } return Math.sqrt(bd); };
  const kmeans = (idx, k) => {
    let cen = Array.from({ length: k }, (_, j) => { const i = idx[Math.floor((j + 0.5) * idx.length / k)]; return [Y[i], U[i], V[i]]; });
    let cnt = new Array(k).fill(0);
    for (let it = 0; it < 8; it++) {
      const sum = cen.map(() => [0, 0, 0]); cnt = new Array(k).fill(0);
      for (const i of idx) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < k; j++) { const dd = d2(i, cen[j]); if (dd < bd) { bd = dd; best = j; } }
        sum[best][0] += Y[i]; sum[best][1] += U[i]; sum[best][2] += V[i]; cnt[best]++;
      }
      cen = cen.map((c, j) => (cnt[j] ? sum[j].map((v) => v / cnt[j]) : c));
    }
    return cen.map((c, j) => ({ c, n: cnt[j] })).filter((x) => x.n);
  };
  // Farben des Teils: bis zu 3 Farbgruppen aus der Bildmitte. Was dem Teil ähnlicher ist als dem Untergrund, bleibt geschützt.
  const midPix = [];
  for (let y = Math.floor(h / 3); y < Math.ceil(h * 2 / 3); y += 2) for (let x = Math.floor(w / 3); x < Math.ceil(w * 2 / 3); x += 2) { const i = y * w + x; if (A[i]) midPix.push(i); }
  const fg = midPix.length > 50 ? kmeans(midPix, 3).filter((x) => x.n >= midPix.length * 0.1).map((x) => x.c) : [];
  // Weitere Untergrund-Farben, die den Rand nicht berühren (z. B. ein Faltbrett unter dem Teil):
  // deutlich anders als das Teil und als die Randfarben, und groß genug.
  const onC = clusters.filter((cl) => cl.on).map((cl) => cl.c);
  const fgUse = fg.filter((f) => onC.every((c) => hueDist(f, c) > 10));
  const minH = (i, list) => { let bd = Infinity; const px = [Y[i], U[i], V[i]]; for (const c of list) { const dd = hueDist(px, c); if (dd < bd) bd = dd; } return bd; };
  if (onC.length && fgUse.length) {
    const cand = []; let total = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = y * w + x; if (!A[i]) continue; total++;
      if (minD(i, onC) > 30 && minH(i, onC) > 45 && minH(i, fgUse) > 45) cand.push(i);
    }
    if (cand.length >= total * 0.03) {
      let ex = kmeans(cand, 2);
      if (ex.length === 2 && Math.hypot(...ex[0].c.map((v, j) => v - ex[1].c[j])) < 28) {
        const nn = ex[0].n + ex[1].n; ex = [{ c: ex[0].c.map((v, j) => (v * ex[0].n + ex[1].c[j] * ex[1].n) / nn), n: nn }];
      }
      for (const x of ex) if (x.n >= total * 0.03) clusters.push({ c: x.c, rgb: rgb(x.c), share: 0, midShare: 0, on: true, main: false, extra: true });
    }
  }
  const prep = { w, h, Y, U, V, A, border, clusters, fg, dist: new Float32Array(n) };
  colorDist(prep);
  return prep;
}
/** Farbabstand, der den Farbton stark und die Helligkeit kaum zählt – trennt z. B. ein olivgrünes Teil
 *  von rosa-grauem Untergrund, auch wenn Sonne und Schatten die Helligkeit stark verändern. */
const hueDist = (a, b) => Math.sqrt(0.15 * (a[0] - b[0]) ** 2 + 6 * ((a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2));
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0; const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc; acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
/** Abstand jedes Pixels zur nächsten eingeschalteten Untergrund-Farbe */
function colorDist(prep) {
  const { Y, U, V, A, dist } = prep;
  const centers = prep.clusters.filter((cl) => cl.on).map((cl) => cl.c);
  // Teil-Farben, die (fast) einer eingeschalteten Untergrund-Farbe entsprechen, schützen nicht
  const fg = (prep.fg || []).filter((f) => centers.every((c) => hueDist(f, c) > 10));
  // Je Pixel: Ist es im Farbton dem Teil ähnlicher als dem Untergrund? (geglättet gegen Bildrauschen)
  let like = null;
  if (fg.length && centers.length) {
    const score = new Float32Array(dist.length);
    const hd = (i, c) => 0.15 * (Y[i] - c[0]) ** 2 + 6 * ((U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2);
    for (let i = 0; i < score.length; i++) {
      let b = Infinity, f = Infinity;
      for (const c of centers) { const dd = hd(i, c); if (dd < b) b = dd; }
      for (const c of fg) { const dd = hd(i, c); if (dd < f) f = dd; }
      score[i] = Math.sqrt(b) - Math.sqrt(f);
    }
    like = boxBlur(score, prep.w, prep.h, 3);
  }
  for (let i = 0; i < dist.length; i++) {
    if (!A[i]) { dist[i] = 0; continue; }
    if (!centers.length) { dist[i] = Infinity; continue; }
    let bd = Infinity;
    for (const c of centers) { const dd = (Y[i] - c[0]) ** 2 + (U[i] - c[1]) ** 2 + (V[i] - c[2]) ** 2; if (dd < bd) bd = dd; }
    bd = Math.sqrt(bd);
    // Dem Teil ähnlicher als dem Untergrund: nur mit deutlich höherer Toleranz entfernbar
    dist[i] = like && like[i] > 0 ? bd + 45 : bd;
  }
}
/* Teil 2 (bei jeder Toleranz-Änderung): vom Rand aus füllen und Maske in voller Größe erzeugen */
function floodBg(prep, tol) {
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
  let kept = 0;
  for (let i = 0; i < bg.length; i++) if (!bg[i] && prep.A[i]) kept++;
  return { bg, kept: kept / bg.length };
}
/** Sicherheitsnetz: bleibt vom Teil (fast) nichts übrig, war eine Untergrund-Farbe in Wahrheit das Teil.
 *  Dann nur die Hauptfarbe des Randes verwenden und notfalls die Toleranz senken. */
const MIN_KEPT = 0.04;
function colorMask(prep, tol, W, H) {
  const { w, h } = prep;
  prep.fixed = '';
  let { bg, kept } = floodBg(prep, tol);
  if (kept < MIN_KEPT && prep.clusters.filter((cl) => cl.on).length > 1) {
    for (const cl of prep.clusters) cl.on = cl.main || !!cl.extra;
    colorDist(prep);
    ({ bg, kept } = floodBg(prep, tol));
    prep.fixed = 'farben';
  }
  for (let i = 0; i < 4 && kept < MIN_KEPT && tol > 8; i++) {
    tol = Math.round(tol * 0.65);
    ({ bg, kept } = floodBg(prep, tol));
    prep.fixed = 'toleranz';
  }
  prep.usedTol = tol;
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
  tool: 'crop', zoom: 1, tx: 0, ty: 0, pointers: new Map(), brush: 40, undo: [], colorPrep: {}, colorMode: 'center', tols: { center: 65, edge: 28 },

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
    this.redraw();
    this.drawBox();
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
  layout(keepZoom = false) {
    const stage = $('#cropStage');
    // Platz = Bühne minus Innenabstand (Rand für die Rahmen-Griffe)
    const cs = getComputedStyle(stage);
    const maxW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const maxH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (maxW <= 0 || maxH <= 0) return;
    const z = keepZoom ? this.zoom : 1;
    // Gezoomt: Bildpunkt in der Mitte der Bühne merken, damit er nach dem Neueinpassen wieder dort liegt
    const center = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    let focus = null;
    if (keepZoom && z > 1 && this.cw) {
      const sc = center(stage), r = $('#cropWrap').getBoundingClientRect();
      const ox = r.left - this.tx, oy = r.top - this.ty;
      focus = { x: (sc.x - ox - this.tx) / z / this.scale, y: (sc.y - oy - this.ty) / z / this.scale };
    }
    const W = this.base.width, H = this.base.height;
    this.scale = Math.min(maxW / W, maxH / H);
    const cw = Math.round(W * this.scale), ch = Math.round(H * this.scale);
    const dpr = window.devicePixelRatio || 1;
    const cv = $('#cropCanvas');
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    this.cw = cw; this.ch = ch;
    this.zoom = 1; this.tx = 0; this.ty = 0;
    $('#cropWrap').style.transform = '';
    if (focus) {
      const sc = center(stage), r = $('#cropWrap').getBoundingClientRect();
      this.zoom = Math.max(1, Math.min(8, z));
      this.pan(sc.x - r.left - this.zoom * focus.x * this.scale, sc.y - r.top - this.zoom * focus.y * this.scale);
    } else this.setZoom(z);
    this.redraw();
    this.drawBox();
  },
  /* Zoom: nur die Ansicht wird vergrößert (CSS-Transform), das Bild selbst bleibt unverändert */
  setZoom(z, sx = null, sy = null) {
    const wrap = $('#cropWrap');
    z = Math.max(1, Math.min(8, z));
    const r = wrap.getBoundingClientRect();
    const ox = r.left - this.tx, oy = r.top - this.ty;          // Lage ohne Verschiebung
    if (sx === null) { sx = ox + this.cw / 2; sy = oy + this.ch / 2; }
    // Punkt unter dem Finger bzw. in der Mitte bleibt an seiner Stelle
    const px = (sx - ox - this.tx) / this.zoom, py = (sy - oy - this.ty) / this.zoom;
    this.zoom = z;
    this.pan(sx - ox - z * px, sy - oy - z * py);
  },
  pan(tx, ty) {
    const z = this.zoom;
    this.tx = Math.min(0, Math.max(this.cw - z * this.cw, tx));
    this.ty = Math.min(0, Math.max(this.ch - z * this.ch, ty));
    $('#cropWrap').style.transform = z === 1 ? '' : `translate(${this.tx}px, ${this.ty}px) scale(${z})`;
    $('#zoomSlider').value = Math.round(z * 100);
    $('#zoomValue').textContent = `${Math.round(z * 100)} %`;
    $('#cropTools [data-tool="zoom"]').classList.toggle('zoomed', z > 1);
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
    $('#cropWrap').classList.toggle('painting', t === 'restore' || t === 'erase');
    $('#cropWrap').classList.toggle('zooming', t === 'zoom');
    $('#brushRow').hidden = !(t === 'restore' || t === 'erase');
    $('#zoomRow').hidden = t !== 'zoom';
    $('#cropRatio').hidden = t !== 'crop';
    this.pointers.clear();
  },
  updateTools() {
    $('#cropUndo').disabled = this.busy || !this.undo.length;
  },
  showColorPanel(on) {
    $('#colorPanel').hidden = !on;
    $('#bgSwatches').hidden = !on || this.colorMode !== 'edge' || !this.colorPrep.edge;
    $('#cropColor').classList.toggle('active', on && this.colorMode === 'edge');
    $('#cropCenter').classList.toggle('active', on && this.colorMode === 'center');
    if (on) $('#colorTol').value = this.tols[this.colorMode];
  },

  // Ziehen: Rahmen verschieben/größer ziehen – oder mit dem Pinsel malen
  pos(e) {
    const r = $('#cropCanvas').getBoundingClientRect();
    const s = this.scale * this.zoom;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  },
  down(e) {
    if (this.busy) return;
    if (this.tool === 'zoom') {
      e.preventDefault();
      try { $('#cropWrap').setPointerCapture?.(e.pointerId); } catch { /* egal */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.gesture = null;
      return;
    }
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
    ctx.lineWidth = this.brush / (this.scale * this.zoom); // Pinsel bleibt auf dem Bildschirm gleich groß → beim Zoomen feiner
    ctx.beginPath();
    ctx.moveTo(this.paintLast.x, this.paintLast.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    this.paintLast = p;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.composite(); this.redraw(); });
  },
  move(e) {
    if (this.tool === 'zoom' && this.pointers.has(e.pointerId)) {
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...this.pointers.values()];
      if (pts.length >= 2) {
        // Zwei Finger: zoomen um die Mitte zwischen den Fingern und gleichzeitig verschieben
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.gesture) {
          this.pan(this.tx + mx - this.gesture.mx, this.ty + my - this.gesture.my);
          this.setZoom(this.zoom * dist / this.gesture.dist, mx, my);
        }
        this.gesture = { dist, mx, my };
      } else {
        this.pan(this.tx + e.clientX - prev.x, this.ty + e.clientY - prev.y); // ein Finger: verschieben
      }
      return;
    }
    if (this.painting) { this.paint(this.pos(e)); return; }
    const d = this.drag;
    if (!d) return;
    const W = this.base.width, H = this.base.height, s = this.scale * this.zoom;
    const dx = (e.clientX - d.px) / s, dy = (e.clientY - d.py) / s;
    const r0 = d.r, min = 48 / s;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    if (d.h === 'move') {
      this.rect = { ...r0, x: clamp(r0.x + dx, 0, W - r0.w), y: clamp(r0.y + dy, 0, H - r0.h) };
    } else {
      const west = d.h.includes('w'), north = d.h.includes('n');
      const horiz = west || d.h.includes('e'), vert = north || d.h.includes('s');
      if (!horiz || !vert) {
        // Seitengriff: nur eine Richtung ändern (bei festem Seitenverhältnis die andere mitziehen)
        let { x, y, w, h } = r0;
        if (horiz) { const nx = west ? clamp(r0.x + dx, 0, r0.x + r0.w - min) : r0.x; w = west ? r0.x + r0.w - nx : clamp(r0.w + dx, min, W - r0.x); x = nx; }
        if (vert) { const ny = north ? clamp(r0.y + dy, 0, r0.y + r0.h - min) : r0.y; h = north ? r0.y + r0.h - ny : clamp(r0.h + dy, min, H - r0.y); y = ny; }
        if (this.ratio) {
          if (horiz) { h = Math.min(w / this.ratio, H); w = h * this.ratio; y = clamp(r0.y + (r0.h - h) / 2, 0, H - h); if (west) x = r0.x + r0.w - w; }
          else { w = Math.min(h * this.ratio, W); h = w / this.ratio; x = clamp(r0.x + (r0.w - w) / 2, 0, W - w); if (north) y = r0.y + r0.h - h; }
        }
        this.rect = { x, y, w, h };
        this.drawBox();
        return;
      }
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
  up(e) {
    if (e) { this.pointers.delete(e.pointerId); this.gesture = null; }
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
  /** Nur der Bereich innerhalb des Rahmens wird beurteilt. Bei neuem Rahmen wird neu analysiert. */
  region() {
    const r = this.rect;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    const key = `${x},${y},${w},${h}`;
    if (this.colorPrep.key !== key) {
      const full = x === 0 && y === 0 && w === this.base.width && h === this.base.height;
      let src = this.base;
      if (!full) { src = newCanvas(w, h); src.getContext('2d').drawImage(this.base, x, y, w, h, 0, 0, w, h); }
      this.colorPrep = { key, x, y, w, h, src };
    }
    return this.colorPrep;
  },
  /** Maske des Rahmen-Bereichs in eine Maske für das ganze Bild einsetzen (außerhalb = entfernt) */
  setRegionMask(m) {
    const g = this.colorPrep;
    let full = m;
    if (g.w !== this.base.width || g.h !== this.base.height) {
      full = newCanvas(this.base.width, this.base.height);
      full.getContext('2d').drawImage(m, g.x, g.y);
    }
    this.setMask(full, { autoCrop: false }); // Rahmen bleibt, wo er ist
  },
  applyColor(push = true) {
    if (push) this.pushUndo();
    const mode = this.colorMode;
    const g = this.region(), W = g.w, H = g.h;
    if (mode === 'center') {
      if (!this.colorPrep.center) {
        this.colorPrep.center = prepareCenterMask(g.src);
        // Für jedes neue Foto passende Toleranz automatisch bestimmen (auf kleinerer Auflösung, schnell)
        this.tols.center = autoCenterTol(prepareCenterMask(g.src, 350));
        $('#colorTol').value = this.tols.center;
      }
      this.setRegionMask(centerMask(this.colorPrep.center, this.tols.center, W, H));
    } else {
      this.colorPrep.edge ??= prepareColorMask(g.src);
      const prep = this.colorPrep.edge;
      this.setRegionMask(colorMask(prep, this.tols.edge, W, H));
      if (prep.usedTol !== this.tols.edge) { this.tols.edge = prep.usedTol; $('#colorTol').value = prep.usedTol; }
      if (prep.fixed) toast(prep.fixed === 'farben' ? 'Eine Randfarbe gehörte zum Teil – sie wird nicht mehr als Untergrund gewertet.' : 'Toleranz verringert, damit das Teil erhalten bleibt.');
    }
    this.renderBgSwatches();
  },
  /** Untergrund-Farben zum An-/Abwählen (nur beim Modus „Untergrund“) */
  renderBgSwatches() {
    const box = $('#bgSwatches');
    const prep = this.colorMode === 'edge' ? this.colorPrep.edge : null;
    box.hidden = !prep || !prep.clusters.length;
    if (box.hidden) return;
    box.innerHTML = `<span>Untergrund:</span>${prep.clusters.map((cl, i) => `<button type="button" class="bgsw${cl.on ? ' on' : ''}" data-bgc="${i}"
      style="background:rgb(${cl.rgb.join(',')})" title="${cl.on ? 'Wird entfernt – antippen, um zu behalten' : 'Bleibt erhalten – antippen, um zu entfernen'}" aria-pressed="${cl.on}"></button>`).join('')}
      <small>antippen = an/aus</small>`;
  },
  toggleBgColor(i) {
    const prep = this.colorPrep.edge;
    if (!prep || this.busy) return;
    prep.clusters[i].on = !prep.clusters[i].on;
    colorDist(prep);
    this.pushUndo();
    this.setRegionMask(colorMask(prep, this.tols.edge, this.colorPrep.w, this.colorPrep.h));
    if (prep.usedTol !== this.tols.edge) { this.tols.edge = prep.usedTol; $('#colorTol').value = prep.usedTol; }
    this.renderBgSwatches();
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
  const c = phCtx;
  if (!c) return;
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
      if (phCtx !== c) return;
      c.photos.push({ id: uid() + ext, isNew: true, full, thumb, orig, url: URL.createObjectURL(thumb), tags: [] });
      // Farbe vorschlagen, solange noch keine gewählt ist (nur beim ersten Foto eines Teils = Titelbild)
      if (c === ed && ed.photos.length === 1 && !ed.vals.farben.length) {
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
  const c = phCtx;
  const p = c.photos[idx];
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
  if (!res || phCtx !== c) return;
  const { full, thumb, orig, ext } = await canvasToPhoto(res.canvas, res.transparent, res.orig);
  if (p.isNew) URL.revokeObjectURL(p.url); else c.removed.push(p.id);
  // Bearbeitetes Foto ersetzt das alte an derselben Stelle (Tags bleiben)
  c.photos[idx] = { id: uid() + ext, isNew: true, full, thumb, orig, url: URL.createObjectURL(thumb), tags: p.tags || [] };
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
  pendingItems = [...await DB.all('items'), ...await DB.all('outfits'), ...await DB.all('packlisten')].filter((i) => i._dirty || i._deleted).length;
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
    if (await purgeOldTrash()) await loadState();
    await recountPending();
    render();
    hideBanner(); // erledigte Hinweise (z. B. abgelaufene Anmeldung) ausblenden – Update-Hinweise bleiben stehen
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
    if (ph.pendingDelete) continue; // Löschen erst nach den Teilen (siehe unten)
    if (ph.pendingUpload) {
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
  await pushCollection(S, 'packlisten');
  // 3. Fotos löschen – aber nur, wenn kein Teil/Outfit sie (z. B. nach einem Konflikt) doch noch verwendet
  const used = new Set([...await DB.all('items'), ...await DB.all('outfits')].filter((i) => !i._deleted).flatMap((i) => i.photos || []));
  for (const ph of await DB.all('photos')) {
    if (!ph.pendingDelete) continue;
    if (used.has(ph.id)) { await DB.del('photos', ph.id); dropUrls(ph.id); continue; } // wird noch gebraucht: Vorschau neu laden
    await S.del(photoFile(ph.id));
    await S.del(photoFile(ph.id, true));
    if (isPng(ph.id)) await S.del(photoFile(ph.id, 'orig'));
    await DB.del('photos', ph.id);
  }
}
async function pushCollection(S, store) {
  let listing = null; // Cloud-Inhalt, nur bei Konflikten (einmal) geladen
  const remoteOf = async (id) => {
    listing ||= new Map((await S.list(store)).map((f) => [f.name, f]));
    return listing.get(`${id}.json`);
  };
  for (const it of await DB.all(store)) {
    if (it._deleted) {
      await S.del(`${store}/${it.id}.json`);
      const cur = await DB.get(store, it.id);
      if (cur?._deleted) await DB.del(store, it.id);
    } else if (it._dirty) {
      const path = `${store}/${it.id}.json`;
      const blob = new Blob([JSON.stringify(itemForUpload(it), null, 2)], { type: 'application/json' });
      let etag;
      try {
        // Nur überschreiben, wenn die Cloud-Datei noch den Stand hat, den dieses Gerät zuletzt gesehen hat
        etag = await S.put(path, blob, 'application/json', it._etag || null);
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
        etag = await resolveConflict(S, store, it, path, blob, await remoteOf(it.id));
        if (etag === null) continue; // Cloud-Stand übernommen
      }
      const cur = await DB.get(store, it.id);
      if (cur && !cur._deleted) {
        cur._etag = etag;
        if (cur.updatedAt === it.updatedAt) cur._dirty = false; // inzwischen erneut geändert? dann später nochmal
        await DB.put(store, cur);
      }
    }
  }
}

/** Gleichzeitig auf zwei Geräten geändert: die neuere Änderung (updatedAt) gewinnt.
 *  Gibt den neuen etag zurück, wenn der lokale Stand hochgeladen wurde, sonst null (Cloud-Stand übernommen). */
async function resolveConflict(S, store, it, path, blob, remote) {
  const rblob = remote && await S.download(path, remote.meta);
  let data = null;
  try { data = rblob && JSON.parse(await rblob.text()); } catch { /* defekt: lokal gewinnt */ }
  if (data && (data.updatedAt || '') >= (it.updatedAt || '')) {
    console.info('Konflikt – neuere Version aus der Cloud übernommen:', path);
    const cur = await DB.get(store, it.id);
    if (cur?.updatedAt === it.updatedAt) await DB.put(store, { ...data, id: it.id, _etag: remote.etag, _dirty: false });
    else if (cur) await DB.put(store, { ...cur, _etag: remote.etag }); // inzwischen erneut geändert: beim nächsten Mal
    return null;
  }
  console.info('Konflikt – lokale (neuere) Version hochgeladen:', path);
  return S.put(path, blob, 'application/json', remote ? remote.etag : null);
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
  await pullCollection(S, 'packlisten');

  // Fehlende Vorschaubilder laden, verwaiste lokale Fotos entfernen
  const all = [...await DB.all('items'), ...await DB.all('outfits')].filter((i) => !i._deleted);
  const referenced = new Set(all.flatMap((i) => i.photos || []));
  const have = new Map((await DB.all('photos')).map((p) => [p.id, p]));
  for (const it of all) {
    for (const pid of it.photos || []) {
      const h = have.get(pid);
      if (h && (h.thumb || h.full || h.pendingDelete)) continue;
      const thumb = await downloadPhoto(S, pid, true);
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
function filterSelectsHtml(fState, withStatus = true, base = items) {
  const wish = base === wishes;
  const defs = [...CAT_KEYS, ...FIELDS.filter((f) => !f.noFilter && !(wish && WISH_HIDDEN.includes(f.key))), { key: 'anlass', label: 'Anlass' }, SEASON_DEF];
  // Jede Auswahl zeigt nur Werte, die mit den übrigen Filtern noch vorkommen
  return defs.map((f) => {
    const pool = base.filter((it) => matchFilters(it, fState, f.key));
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
    const none = f.key === 'kategorie' ? pool.filter((i) => !i.kategorie).length : 0;
    if (f.swatch) {
      // Farben: aufklappbare Liste mit Farbkreisen und Mehrfachauswahl, die häufigste zuerst
      const sel = asList(fState[f.key]);
      const list = [...vals.filter(([v]) => v !== cur)];
      for (const v of sel) if (!list.some(([x]) => x === v)) list.push([v, 0]);
      list.sort((a, b) => b[1] - a[1] || (f.order.get(a[0]) ?? 1e9) - (f.order.get(b[0]) ?? 1e9));
      const open = openDrop === f.key;
      const summary = sel.length ? `<span class="dots">${sel.map(swatch).join('')}</span>${esc(sel.join(', '))}` : 'Alle';
      return `<div class="fdrop${open ? ' open' : ''}"><span class="flabel">${esc(f.label)}</span>
        <button type="button" class="fdropbtn" data-fdrop="${f.key}" aria-expanded="${open}">${summary}</button>
        ${open ? `<div class="fdroplist">${list.map(([v, n]) => `<button type="button" class="frow${sel.includes(v) ? ' on' : ''}" data-fchip="${f.key}" data-val="${esc(v)}" aria-pressed="${sel.includes(v)}">
          <span class="fcheck"></span>${swatch(v)}<span class="fname">${esc(v)}</span><small>${n}</small></button>`).join('') || '<p class="muted">Keine Farben</p>'}
          ${sel.length ? `<button type="button" class="frow fclear" data-fchip-clear="${f.key}">Auswahl aufheben</button>` : ''}</div>` : ''}</div>`;
    }
    return `<label>${esc(f.label)}<select data-filter="${f.key}"><option value="">Alle</option>${
      vals.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('')
    }${none ? `<option value="${CAT_NONE}"${cur === CAT_NONE ? ' selected' : ''}>Nicht zugeordnet (${none})</option>` : ''}</select></label>`;
  }).join('') + (wish ? `<label>Favoriten<select data-filter="fav"><option value="">Alle</option><option value="ja"${fState.fav === 'ja' ? ' selected' : ''}>Nur Favoriten (${wishes.filter((i) => i.favorit).length})</option></select></label>`
    : specialFiltersHtml(fState, withStatus)) + '<button type="button" class="chipbtn reset" data-reset-filters>Zurücksetzen</button>';
}
/** Filterwert ändern; übergeordnete Kategorie setzt Unterkategorie/Art zurück */
function setFilter(fState, k, v) {
  if (Array.isArray(v) && !v.length) v = '';
  if (v === '' || v === undefined) delete fState[k]; else fState[k] = v;
  if (k === 'kategorie') { delete fState.unterkategorie; delete fState.typ; }
  if (k === 'unterkategorie') delete fState.typ;
}

function renderFilters() {
  $('#filters').innerHTML = filterSelectsHtml(filters);
  const n = Object.entries(filters).filter(([, v]) => v).length;
  $('#filterCount').textContent = n ? `(${n})` : '';
  $('#filterToggle').classList.toggle('active', n > 0);
}

/** Teile nach Suchtext, Filtern und Sortierung */
/** Ohne Angabe bei Anlass/Jahreszeit passt ein Eintrag zu jedem Filterwert */
const OPEN_KEYS = ['anlass', 'jahreszeit', 'passform'];
/** Passt ein Teil zu allen Filtern (optional ohne einen bestimmten, für die Auswahlmöglichkeiten)? */
function matchFilters(it, fState, skip = null) {
  if (!matchSpecial(it, skip && SPECIAL_KEYS.includes(skip) ? { ...fState, [skip]: '' } : fState)) return false;
  for (const [k, v] of Object.entries(fState)) {
    if (!v || k === skip || SPECIAL_KEYS.includes(k)) continue;
    if (v === CAT_NONE) { if (it[k]) return false; continue; }
    const vals = fieldValues(it, k);
    if (OPEN_KEYS.includes(k) && !vals.length) continue;
    // Mehrfachauswahl (Farben): passt, wenn das Teil mindestens eine der gewählten Farben hat
    if (Array.isArray(v)) { if (v.length && !v.some((x) => vals.includes(x))) return false; continue; }
    if (!vals.includes(v)) return false;
  }
  return true;
}
/** Klicks in der Farbliste: auf-/zuklappen, Farbe an/aus, Auswahl aufheben. true = Filter neu zeichnen */
function onFilterDrop(e, st) {
  const t = e.target;
  const d = t.closest('[data-fdrop]');
  if (d) { openDrop = openDrop === d.dataset.fdrop ? null : d.dataset.fdrop; return true; }
  const fc = t.closest('[data-fchip]');
  if (fc) {
    const k = fc.dataset.fchip, v = fc.dataset.val, cur = asList(st[k]);
    setFilter(st, k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    return true;
  }
  const cl = t.closest('[data-fchip-clear]');
  if (cl) { setFilter(st, cl.dataset.fchipClear, ''); return true; }
  return false;
}
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
let openDrop = null; // aufgeklappte Farbliste im Filter
function filterItems(query, fState, sort = 'new', pool = items) {
  const q = String(query || '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  let list = pool.filter((it) => {
    if (!matchFilters(it, fState)) return false;
    if (!terms.length) return true;
    const hay = [it.name, it.notiz, it.status, washN(it) ? 'Wäsche' : '', it.kategorie, it.unterkategorie, it.typ, ...(it.anlass || []), ...(it.jahreszeit || []), ...FIELDS.map((f) => fieldText(it, f.key))].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const cmp = (a, b, k) => (k === 'name' ? 0 : String(a[k] || '').localeCompare(String(b[k] || ''), 'de')) || itemTitle(a).localeCompare(itemTitle(b), 'de');
  if (sort === 'new') list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  else if (sort === 'fav') list.sort((a, b) => !!b.favorit - !!a.favorit || String(b.createdAt).localeCompare(String(a.createdAt)));
  else if (sort === 'kategorie') list.sort((a, b) => catRank(a) - catRank(b) || cmp(a, b, 'name'));
  else if (sort === 'worn_recent') list.sort((a, b) => lastWorn(b).localeCompare(lastWorn(a)) || cmp(a, b, 'name'));
  else if (sort === 'worn_old') list.sort((a, b) => lastWorn(a).localeCompare(lastWorn(b)) || cmp(a, b, 'name'));
  else if (sort === 'worn_most') list.sort((a, b) => wornCount(b) - wornCount(a) || cmp(a, b, 'name'));
  else if (sort === 'worn_least') list.sort((a, b) => wornCount(a) - wornCount(b) || lastWorn(a).localeCompare(lastWorn(b)) || cmp(a, b, 'name'));
  else if (sort === 'cpw') list.sort((a, b) => (costPerWear(b) ?? -1) - (costPerWear(a) ?? -1) || cmp(a, b, 'name'));
  else if (sort === 'cpw_asc') list.sort((a, b) => byPrice(costPerWear(a), costPerWear(b), 'price_asc') || cmp(a, b, 'name'));
  else if (sort === 'price_desc' || sort === 'price_asc') list.sort((a, b) => byPrice(itemPrice(a), itemPrice(b), sort) || cmp(a, b, 'name'));
  else list.sort((a, b) => cmp(a, b, sort));
  return list;
}
const itemPrice = (it) => (hasValue(it.preis) ? Number(it.preis) : null);
/** Outfit-Preis = Summe der Teile mit Preis; ohne Preise null */
function outfitPrice(o) {
  const ps = outfitItems(o).map(itemPrice).filter((v) => v !== null);
  return ps.length ? ps.reduce((x, y) => x + y, 0) : null;
}
/** Nach Preis sortieren; Einträge ohne Preis immer ans Ende */
function byPrice(a, b, sort) {
  if (a === null || b === null) return (a === null) - (b === null);
  return sort === 'price_asc' ? a - b : b - a;
}
const SORTS = {
  items: [['new', 'Neueste'], ['fav', 'Favoriten zuerst'], ['name', 'Name'], ['kategorie', 'Kategorie'], ['lagerort', 'Lagerort'], ['price_desc', 'Preis: hoch → niedrig'], ['price_asc', 'Preis: niedrig → hoch'],
    ['worn_recent', 'Zuletzt getragen'], ['worn_old', 'Lange nicht getragen'], ['worn_most', 'Am häufigsten getragen'], ['worn_least', 'Am seltensten getragen'], ['cpw', 'Preis pro Tragen: hoch'], ['cpw_asc', 'Preis pro Tragen: niedrig']],
  outfits: [['new', 'Neueste'], ['fav', 'Favoriten zuerst'], ['name', 'Name'], ['worn_recent', 'Zuletzt getragen'], ['worn_old', 'Lange nicht getragen'], ['worn_most', 'Am häufigsten getragen'],
    ['price_desc', 'Preis: hoch → niedrig'], ['price_asc', 'Preis: niedrig → hoch']],
};
SORTS.wish = [['new', 'Neueste'], ['fav', 'Favoriten zuerst'], ['name', 'Name'], ['kategorie', 'Kategorie'], ['price_desc', 'Preis: hoch → niedrig'], ['price_asc', 'Preis: niedrig → hoch']];
const sortKey = (t) => ({ outfits: 'ks_osort', wish: 'ks_wsort' }[t] || 'ks_sort');
/** Sortier-Auswahl passend zum Tab (Teile/Outfits haben eigene Sortierung) */
function renderSortOptions() {
  const t = ['outfits', 'wish'].includes(tab) ? tab : 'items';
  const sel = $('#sort');
  if (sel.dataset.for === t) return;
  sel.dataset.for = t;
  const saved = localStorage.getItem(sortKey(t));
  sel.innerHTML = SORTS[t].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.value = SORTS[t].some(([v]) => v === saved) ? saved : 'new';
}
function sortOutfits(list, sort) {
  const name = (a, b) => outfitTitle(a).localeCompare(outfitTitle(b), 'de');
  const by = {
    new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    fav: (a, b) => !!b.favorit - !!a.favorit || String(b.createdAt).localeCompare(String(a.createdAt)),
    name,
    worn_recent: (a, b) => lastWorn(b).localeCompare(lastWorn(a)) || name(a, b),
    worn_old: (a, b) => lastWorn(a).localeCompare(lastWorn(b)) || name(a, b),
    worn_most: (a, b) => wornCount(b) - wornCount(a) || name(a, b),
    price_desc: (a, b) => byPrice(outfitPrice(a), outfitPrice(b), 'price_desc') || name(a, b),
    price_asc: (a, b) => byPrice(outfitPrice(a), outfitPrice(b), 'price_asc') || name(a, b),
  };
  return list.sort(by[sort] || by.new);
}
function filteredItems() { return filterItems($('#search').value, filters, $('#sort').value); }

/* Welches Bild zeigen die Kacheln? Teile: Titelbild oder erstes Foto mit Tag; Outfits: Outfitfoto oder Collage */
let itemView = localStorage.getItem('ks_itemview') || '';
let outfitView = localStorage.getItem('ks_outfitview') || '';
/** Foto passend zum gewählten Tag, sonst das Titelbild */
function viewPhoto(it) {
  const ps = it.photos || [];
  if (itemView) { const hit = ps.find((pid) => ((it.photoTags || {})[pid] || []).includes(itemView)); if (hit) return hit; }
  return ps[0];
}
function renderViewChips() {
  const box = $('#viewChips');
  let opts = [];
  let cur = '';
  if (tab === 'outfits') {
    if (outfits.some((o) => (o.photos || []).length)) opts = [['', 'Outfitfoto'], ['collage', 'Collage']];
    cur = outfitView;
  } else if (tab === 'items' || tab === 'wish') {
    const used = new Set((tab === 'wish' ? wishes : items).flatMap((it) => Object.values(it.photoTags || {}).flat()));
    const tags = allPhotoTags().filter((t) => used.has(t));
    if (tags.length) opts = [['', 'Titelbild'], ...tags.map((t) => [t, t])];
    cur = itemView;
    if (cur && !tags.includes(cur)) opts.push([cur, cur]);
  }
  box.hidden = !opts.length;
  box.innerHTML = opts.length ? `<span class="vlabel">Bild:</span>${opts.map(([v, l]) =>
    `<button type="button" class="chipbtn${v === cur ? ' active' : ''}" data-view="${esc(v)}">${esc(l)}</button>`).join('')}` : '';
}

/** Karte eines Teils (Übersicht, Teile-Auswahl, Outfit-Detail) */
function itemCardHtml(it, { selected = null } = {}) {
  const pid = selected === null ? viewPhoto(it) : (it.photos || [])[0];
  const url = pid ? thumbUrl(pid) : '';
  // Ohne Bezeichnung steht die Kategorie schon im Titel – dann Marke statt Kategorie zeigen
  const sub = [it.name ? (it.typ || it.unterkategorie || it.kategorie) : it.marke, it.groesse, it.wunsch ? formatPrice(it.preis) : ''].filter(Boolean).join(' · ');
  const farben = fieldValues(it, 'farben');
  const n = (it.photos || []).length;
  const flags = [qty(it) > 1 ? `${qty(it)}×` : '', n > 1 && selected === null ? `${n} Fotos` : '', washN(it) ? washLabel(it) : '', it.status || ''].filter(Boolean);
  return `<button type="button" class="card${selected ? ' selected' : ''}${selected !== null && (washAll(it) || it.status) ? ' dim' : ''}" data-id="${esc(it.id)}">
      ${url ? `<img class="thumb${isPng(pid) ? ' cut' : ''}" loading="lazy" src="${url}" alt="">` : `<div class="noimg">${pid ? 'Foto lädt …' : 'Kein Foto'}</div>`}
      ${flags.length ? `<span class="flags">${flags.map((f) => `<span class="nphotos${f.endsWith('Wäsche') ? ' wash' : f.endsWith('Fotos') || f.endsWith('×') ? '' : ' st'}">${esc(f)}</span>`).join('')}</span>` : ''}
      ${selected !== null ? `<span class="check">${selected ? '✓' : ''}</span>` : ''}
      ${it._dirty && Auth.configured && selected === null ? '<span class="pending" title="Noch nicht synchronisiert"></span>' : ''}
      <div class="info"><div class="title${it.name ? '' : ' auto'}">${it.favorit ? '<span class="fav" title="Favorit">♥</span> ' : ''}${esc(itemTitle(it))}</div>
        <div class="sub">${farben.length ? `<span class="dots" title="${esc(farben.join(', '))}">${farben.slice(0, 5).map(swatch).join('')}</span>` : ''}${esc(sub || it.lagerort || '')}</div></div>
    </button>`;
}

let tab = ['outfits', 'wish', 'plan', 'stats'].includes(localStorage.getItem('ks_tab')) ? localStorage.getItem('ks_tab') : 'items';
function render() {
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('#tabbar [data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#planView').hidden = tab !== 'plan';
  $('#statsView').hidden = tab !== 'stats';
  if (tab === 'plan' || tab === 'stats') {
    $('#grid').innerHTML = ''; $('#count').textContent = ''; $('#empty').hidden = true; $('#emptyOutfits').hidden = true; $('#emptyWish').hidden = true;
    $('#viewChips').hidden = true;
    if (tab === 'plan') { renderPlan(); return weatherOnPlan(); }
    return renderStats();
  }
  renderSortOptions();
  renderViewChips();
  $('#emptyWish').hidden = true;
  if (tab === 'outfits') return renderOutfits();
  if (tab === 'wish') return renderWishes();
  $('#emptyWish').hidden = true;
  renderFilters();
  const list = filteredItems();
  const scope = items.filter((it) => matchSpecial(it, { status: filters.status }));
  const nWash = list.filter((it) => washN(it)).length;
  const pieces = list.reduce((sum, it) => sum + qty(it), 0);
  $('#count').innerHTML = items.length
    ? esc(list.length === scope.length ? `${scope.length} ${scope.length === 1 ? 'Teil' : 'Teile'}` : `${list.length} von ${scope.length} Teilen`)
      + (pieces !== list.length ? esc(` · ${pieces} Stück`) : '')
      + (filters.waesche === 'ja' && nWash ? ' <button type="button" class="chipbtn small" data-unwash-all>Alle aus der Wäsche</button>' : '')
    : '';
  $('#empty').hidden = items.length > 0;
  $('#emptyOutfits').hidden = true;
  $('#grid').className = 'grid';
  $('#grid').innerHTML = list.map((it) => itemCardHtml(it)).join('');
}

/* ---------------- Wunschliste ---------------- */
const WISH_HIDDEN = ['kaufdatum', 'lagerort', 'zustand'];
const wishFilters = JSON.parse(localStorage.getItem('ks_wfilters') || '{}');
function renderWishes() {
  $('#filters').innerHTML = filterSelectsHtml(wishFilters, false, wishes);
  const nf = Object.entries(wishFilters).filter(([, v]) => v).length;
  $('#filterCount').textContent = nf ? `(${nf})` : '';
  $('#filterToggle').classList.toggle('active', nf > 0);
  const list = filterItems($('#search').value, wishFilters, $('#sort').value, wishes);
  const sum = list.reduce((s, it) => s + (hasValue(it.preis) ? Number(it.preis) * qty(it) : 0), 0);
  $('#count').textContent = wishes.length
    ? `${list.length === wishes.length ? wishes.length : `${list.length} von ${wishes.length}`} ${wishes.length === 1 ? 'Wunsch' : 'Wünsche'}${sum ? ` · zusammen ${formatPrice(sum)}` : ''}`
    : '';
  $('#empty').hidden = true;
  $('#emptyOutfits').hidden = true;
  $('#emptyWish').hidden = wishes.length > 0;
  $('#grid').className = 'grid';
  $('#grid').innerHTML = list.map((it) => itemCardHtml(it)).join('');
}
/** Gekauft: von der Wunschliste in den Schrank (Kaufdatum = heute, falls leer) */
async function buyWish(id) {
  const it = await patchRec('items', id, (r) => {
    delete r.wunsch;
    if (!r.kaufdatum) r.kaufdatum = isoDay();
  });
  if (!it) return;
  $('#detail').close();
  await afterChange();
  toast(`„${itemTitle(it)}“ ist jetzt in deinem Schrank`);
}

/* ---------------- Outfits ---------------- */
const outfitItems = (o) => (o.itemIds || []).map((id) => items.find((i) => i.id === id)).filter(Boolean);
const outfitItemsSorted = (o) => sortBySlot(outfitItems(o));
const outfitTitle = (o) => o.name || outfitItemsSorted(o).map(itemTitle).slice(0, 3).join(' + ') || 'Outfit';
const outfitsWith = (itemId) => outfits.filter((o) => (o.itemIds || []).includes(itemId));
/* Anordnung nach Oberkategorie: Oberteile/Jacken oben, Unterteile darunter, Schuhe unten,
   Taschen & Accessoires in einer Seitenspalte. */
const SLOT_OF = {
  'Oberteile': 'top', 'Outdoorbekleidung': 'top', 'Bademode': 'top', 'Ganzkörper': 'full',
  'Unterteile': 'bottom', 'Schuhe': 'shoes',
  'Taschen': 'side', 'Accessoires': 'side', 'Schmuck': 'side', 'Unterwäsche & Nachtwäsche': 'side',
};
const SLOT_RANK = { top: 0, full: 1, bottom: 2, shoes: 3, side: 4 };
const slotOf = (it) => SLOT_OF[it.kategorie] || 'side';
// Innerhalb einer Zeile: Oberteil vor Jacke usw. (Reihenfolge der Kategorienliste)
const sortBySlot = (its) => its.map((it, i) => [it, i])
  .sort((a, b) => SLOT_RANK[slotOf(a[0])] - SLOT_RANK[slotOf(b[0])] || catRank(a[0]) - catRank(b[0]) || a[1] - b[1])
  .map(([it]) => it);
function photoCell(it) {
  const pid = (it.photos || [])[0];
  const url = pid ? thumbUrl(pid) : '';
  return url ? `<img class="${isPng(pid) ? 'cut' : ''}" loading="lazy" src="${url}" alt="${esc(itemTitle(it))}">` : '<span class="ph">–</span>';
}
/** Outfit-Bild: nach Körperbereich übereinander, sonst Collage aus bis zu 4 Teilen */
function collageHtml(o, big = false, usePhoto = true) {
  // Eigenes Outfit-Foto vorhanden? Dann ist das erste davon das Titelbild
  const cover = usePhoto && (o.photos || [])[0];
  if (cover) return `<div class="collage cover"><img loading="lazy" class="${isPng(cover) ? 'cut' : ''}" src="${thumbUrl(cover)}" alt=""></div>`;
  const all = sortBySlot(outfitItems(o));
  if (!all.length) return '<div class="noimg">Noch keine Teile</div>';
  const by = { top: [], full: [], bottom: [], shoes: [], side: [] };
  for (const it of all) by[slotOf(it)].push(it);
  const mainRows = [['top', 4], ['full', 7], ['bottom', 4], ['shoes', 2.2]].filter(([k]) => by[k].length);
  if (mainRows.length >= 2) {
    const cap = big ? 4 : 3;
    const rows = mainRows.map(([k, w]) => `<div class="lrow ${k}" style="flex-grow:${w}">${by[k].slice(0, cap).map(photoCell).join('')}</div>`).join('');
    const side = by.side.slice(0, big ? 5 : 4);
    return `<div class="collage look${side.length ? ' hasside' : ''}"><div class="lmain">${rows}</div>${
      side.length ? `<div class="lside">${side.map(photoCell).join('')}</div>` : ''}</div>`;
  }
  const its = all.slice(0, 4);
  return `<div class="collage n${its.length}">${its.map(photoCell).join('')}</div>`;
}
// Filter für Outfits (eigener Zustand, gespeichert)
const outfitFilters = JSON.parse(localStorage.getItem('ks_ofilters') || '{}');
function matchOutfit(o, fs, skip = null) {
  return Object.entries(fs).every(([k, v]) => !v || k === skip || (k === 'fav' ? !!o.favorit : k === 'wetter' ? todayMax() === null || fitsToday(o)
    : !(o[k] || []).length && OPEN_KEYS.includes(k) ? true : (o[k] || []).includes(v)));
}
function outfitFilterHtml() {
  return [{ key: 'anlass', label: 'Anlass' }, SEASON_DEF].map((f) => {
    const vals = [...valuesFor(f.key, outfits.filter((o) => matchOutfit(o, outfitFilters, f.key))).entries()];
    if (f.order) vals.sort((a, b) => (f.order.get(a[0]) ?? 1e9) - (f.order.get(b[0]) ?? 1e9)); else vals.sort((a, b) => a[0].localeCompare(b[0], 'de'));
    const cur = outfitFilters[f.key] || '';
    if (cur && !vals.some(([v]) => v === cur)) vals.unshift([cur, 0]);
    return `<label>${esc(f.label)}<select data-filter="${f.key}"><option value="">Alle</option>${
      vals.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('')}</select></label>`;
  }).join('') + `<label>Favoriten<select data-filter="fav"><option value="">Alle</option><option value="ja"${outfitFilters.fav === 'ja' ? ' selected' : ''}>Nur Favoriten (${outfits.filter((o) => o.favorit).length})</option></select></label>`
    + wxSelect(outfitFilters.wetter || '', outfits.filter(fitsToday).length)
    + '<button type="button" class="chipbtn reset" data-reset-filters>Zurücksetzen</button>';
}
function renderOutfits() {
  $('#filters').innerHTML = outfitFilterHtml();
  const nf = Object.values(outfitFilters).filter(Boolean).length;
  $('#filterCount').textContent = nf ? `(${nf})` : '';
  $('#filterToggle').classList.toggle('active', nf > 0);
  const q = $('#search').value.trim().toLowerCase();
  const list = outfits
    .filter((o) => matchOutfit(o, outfitFilters))
    .filter((o) => !q || [outfitTitle(o), o.notiz, ...(o.anlass || []), ...(o.jahreszeit || []), ...outfitItems(o).map(itemTitle)].join(' ').toLowerCase().includes(q));
  sortOutfits(list, $('#sort').value);
  $('#count').textContent = outfits.length
    ? (list.length === outfits.length ? `${outfits.length} ${outfits.length === 1 ? 'Outfit' : 'Outfits'}` : `${list.length} von ${outfits.length} Outfits`)
    : '';
  $('#empty').hidden = true;
  $('#emptyOutfits').hidden = outfits.length > 0;
  $('#grid').className = 'grid outfits';
  $('#grid').innerHTML = list.map((o) => outfitCardHtml(o)).join('');
}
function outfitCardHtml(o) {
  const its = outfitItems(o);
  const useCollage = outfitView === 'collage';
  const wash = its.filter(washAll).length;
  const sub = [`${its.length} ${its.length === 1 ? 'Teil' : 'Teile'}`, wash ? `${wash} in der Wäsche` : '', ...(o.anlass || []).slice(0, 2)].filter(Boolean);
  return `<button type="button" class="card outfit" data-outfit="${esc(o.id)}">
      ${collageHtml(o, false, !useCollage)}
      ${o._dirty && Auth.configured ? '<span class="pending" title="Noch nicht synchronisiert"></span>' : ''}
      <div class="info"><div class="title${o.name ? '' : ' auto'}">${o.favorit ? '<span class="fav" title="Favorit">♥</span> ' : ''}${esc(outfitTitle(o))}</div><div class="sub">${esc(sub.join(' · '))}</div></div>
    </button>`;
}

/* Outfit-Detailansicht */
let outfitDetailId = null;
function openOutfitDetail(id) {
  const o = outfits.find((x) => x.id === id);
  if (!o) return;
  outfitDetailId = id;
  $('#outfitDetailTitle').textContent = outfitTitle(o);
  const its = outfitItemsSorted(o);
  const gal = $('#outfitDetailPhotos');
  gal.innerHTML = (o.photos || []).map((pid) => photoFigure(pid, (o.photoTags || {})[pid])).join('');
  gal.hidden = !(o.photos || []).length;
  for (const img of gal.querySelectorAll('img')) fullUrl(img.dataset.pid).then((u) => { if (u) img.src = u; });
  $('#outfitDetailLook').innerHTML = its.length ? collageHtml(o, true, false) : '';
  $('#outfitDetailLook').hidden = !its.length;
  $('#outfitDetailItems').innerHTML = its.map((it) => itemCardHtml(it)).join('') || '<p class="muted">Noch keine Teile.</p>';
  $('#outfitDetailNote').textContent = o.notiz || '';
  $('#outfitDetailNote').hidden = !o.notiz;
  const meta = [['Anlass', (o.anlass || []).join(', ')], ['Jahreszeit', (o.jahreszeit || []).join(', ')]].filter(([, v]) => v);
  $('#outfitDetailMeta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#outfitDetailMeta').hidden = !meta.length;
  renderWearBox('#outfitWear', 'outfit', o);
  renderFav('#outfitFav', o);
  if ($('#outfitDetail').open) $('#outfitDetail').close();
  $('#outfitDetail').showModal();
  toTop($('#outfitDetail'));
}

/* Outfit-Editor */
let oed = null; // { id, isNew, itemIds: [] }
function openOutfitEditor(id = null) {
  const o = id ? outfits.find((x) => x.id === id) : null;
  oed = {
    id: o?.id || uid(), isNew: !o, itemIds: [...(o?.itemIds || [])].filter((x) => items.some((i) => i.id === x)),
    anlass: new Set(o?.anlass || []), jahreszeit: new Set(o?.jahreszeit || []),
    photos: photosFrom(o), removed: [], strip: '#outfitPhotoStrip',
  };
  phCtx = oed;
  renderPhotoStrip();
  renderOutfitChips();
  $('#outfitEditTitle').textContent = o ? 'Outfit bearbeiten' : 'Neues Outfit';
  $('#outfitForm').elements.oname.value = o?.name || '';
  $('#outfitForm').elements.onotiz.value = o?.notiz || '';
  $('#outfitDelete').hidden = !o;
  renderOutfitItems();
  $('#outfitEditor').showModal();
  toTop($('#outfitEditor'));
}
function renderOutfitChips() {
  $('#oAnlassChips').innerHTML = chipsHtml(allAnlaesse(oed.anlass), oed.anlass, 'anlass');
  $('#oSeasonChips').innerHTML = chipsHtml(JAHRESZEITEN, oed.jahreszeit, 'season');
}
function renderOutfitItems() {
  const its = sortBySlot(oed.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean));
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
    photos: oed.photos.map((p) => p.id),
    photoTags: photoTagsOf(oed),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    _dirty: true,
  };
  if (!o.photos.length) delete o.photos;
  if (!Object.keys(o.photoTags).length) delete o.photoTags;
  await storePhotos(oed, o.id);
  await DB.put('outfits', o);
  const id = oed.id;
  oed = null;
  await loadState(); await recountPending(); render(); updateSyncIndicator(); scheduleSync();
  return id;
}
async function purgeOutfit(id) {
  const o = await DB.get('outfits', id);
  if (!o) return;
  for (const pid of o.photos || []) await removePhotoRecord(pid);
  if (!o._etag) await DB.del('outfits', id);
  else await DB.put('outfits', { ...o, _deleted: true, _dirty: true });
  await loadState(); await recountPending(); render(); updateSyncIndicator(); scheduleSync();
}

/* Teile-Auswahl für ein Outfit: gleiche Suche und Filter wie in der Übersicht */
const pick = { filters: {}, selected: new Set(), onDone: null };
/** Teile auswählen; onDone erhält die bisherige Reihenfolge plus neu Ausgewählte hinten */
function openItemPicker(ids = oed.itemIds, onDone = (next) => { oed.itemIds = next; renderOutfitItems(); }, exclude = null) {
  pick.filters = {};
  pick.exclude = exclude;
  pick.selected = new Set(ids);
  pick.base = [...ids];
  pick.onDone = onDone;
  $('#pickSearch').value = '';
  $('#pickFilters').hidden = true;
  renderPicker();
  $('#pickDlg').showModal();
}
function renderPicker() {
  $('#pickFilters').innerHTML = filterSelectsHtml(pick.filters, false);
  const n = Object.entries(pick.filters).filter(([, v]) => v).length;
  $('#pickFilterCount').textContent = n ? `(${n})` : '';
  $('#pickFilterToggle').classList.toggle('active', n > 0);
  const list = filterItems($('#pickSearch').value, pick.filters, 'kategorie').filter((it) => it.id !== pick.exclude);
  $('#pickGrid').innerHTML = list.map((it) => itemCardHtml(it, { selected: pick.selected.has(it.id) })).join('')
    || '<p class="muted">Keine passenden Teile.</p>';
  $('#pickDone').textContent = `Fertig (${pick.selected.size})`;
}

/* ---------------- „Passt zu“: Verweise zwischen Teilen ----------------
 * Gespeichert wird der Verweis nur bei einem der beiden Teile (passtZu: [ids]); angezeigt wird er bei beiden. */
function matchesOf(id) {
  const it = findItem(id);
  const ids = [...(it?.passtZu || []), ...[...items, ...wishes].filter((o) => (o.passtZu || []).includes(id)).map((o) => o.id)];
  return [...new Set(ids)].filter((x) => x !== id && findItem(x));
}
function renderMatchList() {
  $('#matchList').innerHTML = ed.passt.map((id) => {
    const o = findItem(id);
    return o ? `<span class="matchchip">${photoCell(o)}<span>${esc(itemTitle(o))}</span><button type="button" data-unmatch="${esc(id)}" aria-label="Verweis entfernen">✕</button></span>` : '';
  }).join('');
}
/** Beim Speichern: Verweise, die nur beim anderen Teil standen und entfernt wurden, dort löschen */
async function saveMatches(it, before) {
  const keep = new Set(ed.passt);
  const now = new Date().toISOString();
  for (const id of before) {
    if (keep.has(id)) continue;
    const o = await DB.get('items', id);
    if (o && (o.passtZu || []).includes(it.id)) {
      const pz = o.passtZu.filter((x) => x !== it.id);
      await DB.put('items', { ...o, passtZu: pz, updatedAt: now, _dirty: true });
    }
  }
  // Selbst nur speichern, was nicht schon beim anderen Teil steht
  const own = ed.passt.filter((id) => !(findItem(id)?.passtZu || []).includes(it.id));
  if (own.length) it.passtZu = own; else delete it.passtZu;
}

/* ---------------- Detailansicht ---------------- */
let detailId = null;
async function openDetail(id) {
  const it = findItem(id);
  if (!it) return;
  detailId = id;
  $('#detailTitle').textContent = itemTitle(it);
  const withAlt = (key, text) => [text, it.alt?.[key] ? `(bisher: ${it.alt[key]})` : ''].filter(Boolean).join(' ');
  const rows = [
    ['Status', it.status || ''],
    ['Kategorie', catPath(it) || (it.kategorieAlt ? `nicht zugeordnet (bisher: ${it.kategorieAlt})` : '')],
    ...FIELDS.filter((f) => f.type !== 'url').map((f) => [f.label, withAlt(f.key, f.key === 'preis' && qty(it) > 1 && hasValue(it.preis)
      ? `${fieldText(it, f.key)} pro Stück (zusammen ${formatPrice(Number(it.preis) * qty(it))})` : fieldText(it, f.key)), f.swatch ? fieldValues(it, f.key) : null,
      f.icon ? `<span class="carelist">${fieldValues(it, f.key).map((v) => `<span>${careIcon(v)}${esc(v)}</span>`).join('')}</span>` : null]),
    ['Anlass', (it.anlass || []).join(', ')], ['Jahreszeit', (it.jahreszeit || []).join(', ')], ['Notiz', it.notiz],
  ].filter(([, v]) => v);
  const link = normalizeUrl(it.link);
  $('#detailLink').hidden = !link;
  if (link) { $('#detailLink').href = link; $('#detailLinkHost').textContent = new URL(link).hostname.replace(/^www\./, ''); }
  const artInfo = ART_INFO[it.typ];
  $('#detailFields').innerHTML = rows.map(([k, v, sw, html]) => `<dt>${esc(k)}</dt><dd>${sw?.length ? `<span class="dots">${sw.map(swatch).join('')}</span>` : ''}${html || esc(v).replace(/\n/g, '<br>')}${k === 'Kategorie' && artInfo
    ? ` <button type="button" class="kinfo" data-detailinfo aria-label="Was ist ${esc(it.typ)}?" aria-expanded="false">?</button><span class="kexpl" hidden>${esc(artInfo)}</span>` : ''}</dd>`).join('')
    || '<dt>–</dt><dd class="muted">Keine Angaben</dd>';
  const gal = $('#detailPhotos');
  const pids = it.photos || [];
  gal.innerHTML = pids.map((pid) => photoFigure(pid, (it.photoTags || {})[pid])).join('');
  renderWearBox('#detailWear', 'item', it);
  renderFav('#detailFav', it);
  // Wunschliste: kein Tragen/Outfits, dafür „Gekauft“
  const wish = !!it.wunsch;
  $('#detailWear').hidden = wish;
  $('#detailBuyBox').hidden = !wish;
  // Passt zu (beide Richtungen)
  const mt = matchesOf(id).map(findItem);
  $('#detailMatchBox').hidden = !mt.length;
  $('#detailMatch').innerHTML = mt.map((o) => `<button type="button" class="ochiplink" data-item="${esc(o.id)}"><div class="collage cover">${photoCell(o)}</div><span>${esc(itemTitle(o))}</span></button>`).join('');
  // In welchen Outfits kommt das Teil vor?
  const ofs = wish ? [] : outfitsWith(id);
  $('#detailOutfitsBox').hidden = !ofs.length;
  $('#detailOutfits').innerHTML = ofs.map((o) => `<button type="button" class="ochiplink" data-outfit="${esc(o.id)}">${collageHtml(o)}<span>${esc(outfitTitle(o))}</span></button>`).join('');
  // Bereits offen (z. B. unter einem Outfit)? Dann nach oben holen
  if ($('#detail').open) $('#detail').close();
  $('#detail').showModal();
  toTop($('#detail'));
  for (const img of gal.querySelectorAll('img')) {
    fullUrl(img.dataset.pid).then((u) => { if (u) img.src = u; });
  }
}

/* ---------------- Editor ---------------- */
let ed = null; // { id, isNew, photos: [{id, isNew, full, thumb}], removed: [] , anlass: Set }

function buildFieldInputs() {
  const html = FIELDS.map((f) => {
    const cls = `field${f.wide ? ' wide' : ''}" data-field="${f.key}`;
    const alt = `<span class="hint legacy" id="alt-${f.key}" hidden></span>`;
    if (f.type === 'text') {
      return `<label class="${cls}">${esc(f.label)}<input name="${f.key}" list="dl-${f.key}" autocomplete="off"><datalist id="dl-${f.key}"></datalist>${alt}</label>`;
    }
    if (f.type === 'count') {
      return `<div class="${cls}">${esc(f.label)}<span class="unit count"><button type="button" class="chipbtn" data-step="-1" aria-label="Weniger">−</button><input name="${f.key}" type="number" inputmode="numeric" min="1" max="99" step="1"><button type="button" class="chipbtn" data-step="1" aria-label="Mehr">+</button></span>${alt}</div>`;
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
    const shares = f.key === 'materialien' ? '<div class="anteile" id="anteile" hidden></div>' : '';
    return `<div class="${cls}">${esc(f.label)}<button type="button" class="katbtn pickbtn" data-pick="${f.key}"></button>${auto}${shares}${alt}</div>`;
  });
  $('#fieldGrid').innerHTML = html.filter((_, i) => !FIELDS[i].slot).join('');
  $('#fieldGrid2').innerHTML = html.filter((_, i) => FIELDS[i].slot === 2).join('');
}
const careIcon = (v) => PFLEGE_ICON[v] || '';
function onFields(type, fn) { for (const el of document.querySelectorAll('#fieldGrid, #fieldGrid2')) el.addEventListener(type, fn); }
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
      ? vals.map((v) => `<span class="tag${f.icon ? ' icontag' : ''}">${f.swatch ? swatch(v) : ''}${f.icon ? careIcon(v) : ''}${esc(v)}</span>`).join('')
      : `${esc(f.label)} wählen`}</span><span aria-hidden="true">›</span>`;
  }
  renderAnteile();
}
/** Editor: Anteile in Prozent je gewähltem Material */
function renderAnteile() {
  const box = $('#anteile');
  const mats = ed.vals.materialien || [];
  box.hidden = mats.length < 2; // Anteile erst ab zwei Materialien
  box.innerHTML = mats.map((m) => `<label class="anteil"><span>${esc(m)}</span><span class="unit"><input type="number" inputmode="numeric" min="1" max="100" step="1" data-anteil="${esc(m)}" value="${esc(ed.anteile[m] ?? '')}" placeholder="–"><span>%</span></span></label>`).join('')
    + '<p class="hint" id="anteilSum"></p>';
  renderAnteilSum();
}
function renderAnteilSum() {
  const vals = (ed.vals.materialien || []).map((m) => Number(ed.anteile[m]) || 0);
  const sum = vals.reduce((a, b) => a + b, 0);
  const el = $('#anteilSum');
  el.textContent = !sum ? '' : sum === 100 ? 'Summe 100 %' : `Summe ${sum} % – ergibt nicht 100 %`;
  el.classList.toggle('warn', !!sum && sum !== 100);
}

/* ---------------- Auswahldialog für Farbe, Material, Größe ---------------- */
let optKey = null;
let optOpen = -1; // aufgeklappte Gruppe (nur bei Feldern mit Gruppen, z. B. Größe)
/** Auswahlwerte eines Felds inkl. selbst angelegter (z. B. eigene Materialien) */
function optionsOf(key) {
  const f = FIELD[key];
  if (!f.custom) return f.options;
  const extra = [...valuesFor(key, [...items, ...wishes, ...trashItems]).keys(), ...(ed?.vals[key] || [])].filter((v) => !f.order.has(v));
  return [...f.options, ...[...new Set(extra)].sort((a, b) => a.localeCompare(b, 'de'))];
}
function openOptions(key) {
  optKey = key;
  $('#optSearch').value = '';
  $('#optDone').textContent = FIELD[key].type === 'multi' ? 'Fertig' : 'Schließen';
  const f = FIELD[key];
  const sel = fieldValues(ed.vals, key);
  optOpen = f.groups && !f.flatGroups ? f.groups.findIndex(([, opts]) => opts.some((o) => sel.includes(o))) : -1;
  renderOptions();
  $('#optDlg').showModal();
  ($('#optList .ochip.active') || $('#optList .kl2.open'))?.scrollIntoView({ block: 'center' });
}
function renderOptions() {
  const f = FIELD[optKey];
  const q = $('#optSearch').value.trim().toLowerCase();
  const sel = new Set(fieldValues(ed.vals, optKey));
  $('#optTitle').textContent = f.type === 'multi' && sel.size ? `${f.label} (${sel.size})` : f.label;
  const groups = f.groups || [[null, optionsOf(optKey)]];
  const chips = (hits) => `<div class="ochips${f.swatch ? ' swatches' : ''}${f.icon ? ' icons' : ''}">${hits.map((o) =>
    `<button type="button" class="ochip${sel.has(o) ? ' active' : ''}" data-val="${esc(o)}">${f.swatch ? swatch(o) : ''}${f.icon ? careIcon(o) : ''}${esc(o)}</button>`).join('')}</div>`;
  const html = groups.map(([g, opts], gi) => {
    const hits = opts.filter((o) => !q || o.toLowerCase().includes(q) || (g && g.toLowerCase().includes(q)));
    if (!hits.length) return '';
    if (!g) return chips(hits);
    if (f.flatGroups) return `<h4 class="ogroup">${esc(g)}</h4>${chips(hits)}`;
    const open = !!q || optOpen === gi;
    const picked = opts.filter((o) => sel.has(o));
    return `<button type="button" class="kl2${open ? ' open' : ''}${picked.length ? ' chosen' : ''}" data-og="${gi}" aria-expanded="${open}">
      <span>${esc(g)}${picked.length && !open ? `<small>${esc(picked.join(', '))}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>${open ? chips(hits) : ''}`;
  }).join('');
  const raw = $('#optSearch').value.trim();
  const canAdd = f.custom && raw && !optionsOf(optKey).some((o) => o.toLowerCase() === raw.toLowerCase());
  const add = canAdd ? `<button type="button" class="chipbtn addval" data-newval="${esc(raw)}">+ „${esc(raw)}“ als neues ${esc(f.label)} hinzufügen</button>` : '';
  $('#optList').innerHTML = (html || (add ? '' : '<p class="muted">Nichts gefunden.</p>')) + add;
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
  const c = phCtx;
  if (!c) return;
  $(c.strip).innerHTML = c.photos.map((p, i) => {
    const url = p.isNew ? p.url : thumbUrl(p.id);
    return `<div class="ph"><img src="${url}" data-idx="${i}" alt=""${isPng(p.id) ? ' class="cut"' : ''}>${
      (p.tags || []).length ? `<span class="phtag">${esc(p.tags.join(' · '))}</span>` : ''}</div>`;
  }).join('');
}
/* Fotos gehören entweder zum Teil im Editor (ed) oder zum Outfit im Editor (oed) */
let phCtx = null;
const PHOTO_TAGS = ['Vorne', 'Hinten', 'Seite', 'Detail', 'Etikett', 'Getragen', 'Selfie', 'Spiegel'];
function allPhotoTags(extra = []) {
  const set = new Set(PHOTO_TAGS);
  for (const r of [...items, ...outfits]) for (const t of Object.values(r.photoTags || {}).flat()) set.add(t);
  for (const t of extra) set.add(t);
  return [...set];
}
const photosFrom = (rec) => (rec?.photos || []).map((pid) => ({ id: pid, isNew: false, tags: [...((rec.photoTags || {})[pid] || [])] }));
function photoTagsOf(c) {
  const out = {};
  for (const p of c.photos) if ((p.tags || []).length) out[p.id] = p.tags;
  return out;
}
/** Neue Fotos speichern, entfernte zum Löschen vormerken */
async function storePhotos(c, ownerId) {
  for (const p of c.photos.filter((x) => x.isNew)) {
    const rec = { id: p.id, itemId: ownerId, full: p.full, thumb: p.thumb, orig: p.orig || null, pendingUpload: true };
    await DB.put('photos', rec);
    photoMap.set(p.id, rec);
    URL.revokeObjectURL(p.url);
  }
  for (const pid of c.removed) await removePhotoRecord(pid);
}
const photoFigure = (pid, tags) => `<figure><img data-pid="${esc(pid)}" src="${thumbUrl(pid)}" alt=""${isPng(pid) ? ' class="cut"' : ''}>${
  (tags || []).length ? `<figcaption>${esc(tags.join(' · '))}</figcaption>` : ''}</figure>`;

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
        inner += `<div class="kleaves">${hits.map(([a, n]) => {
          const key = `${i}|${j}|${n}`, info = ART_INFO[a], shown = info && katInfo === key;
          return `<div class="kleafrow${`${k}|${u}|${a}` === cur ? ' active' : ''}" data-k="${key}"><button type="button" class="kleaf" data-k="${key}">${esc(a)}</button>${info
            ? `<button type="button" class="kinfo${shown ? ' on' : ''}" data-info="${key}" aria-label="Was ist ${esc(a)}?" aria-expanded="${!!shown}">?</button>` : ''}${shown ? `<p class="kexpl">${esc(info)}</p>` : ''}</div>`;
        }).join('')}</div>`;
      }
    });
    if (!any) return;
    const chosenK = ed.kat.kategorie === k;
    html += `<section><button type="button" class="kl1 kl1btn${openK ? ' open' : ''}${chosenK ? ' chosen' : ''}" data-kk="${i}" aria-expanded="${openK}">
      <span>${esc(k)}${chosenK && !openK ? `<small>${esc([ed.kat.unterkategorie, ed.kat.typ].filter(Boolean).join(' › '))}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>${inner}</section>`;
  });
  $('#katList').innerHTML = html || '<p class="muted">Nichts gefunden.</p>';
}
let katInfo = null; // aufgeklappte Erklärung in der Kategorie-Auswahl
function openKatPicker() {
  $('#katSearch').value = '';
  katInfo = null;
  // Gewählte Ober- und Unterkategorie gleich aufklappen
  katOpenK = -1; katOpen = null;
  KATEGORIEN.forEach(([k, gs], i) => {
    if (k === ed.kat.kategorie) katOpenK = i;
    gs.forEach(([u], j) => { if (k === ed.kat.kategorie && u === ed.kat.unterkategorie) katOpen = `${i}|${j}`; });
  });
  renderKatList();
  $('#katDlg').showModal();
  const act = $('#katList .kleafrow.active') || $('#katList .kl2.open') || $('#katList .kl1btn.open');
  if (act) act.scrollIntoView({ block: 'center' });
}

function openEditor(id = null, copyId = null) {
  const form = $('#editForm');
  form.reset();
  fillDatalists();
  // Beim Duplizieren: alle Angaben übernehmen, aber neue ID, keine Fotos, kein Tragen-Verlauf
  const orig = id ? findItem(id) : null;
  const it = orig || (copyId ? findItem(copyId) : null);
  ed = {
    id: orig?.id || uid(),
    isNew: !orig,
    status: orig?.status || '',
    wunsch: it ? !!it.wunsch : tab === 'wish',
    strip: '#photoStrip',
    photos: photosFrom(orig),
    removed: [],
    anlass: new Set(it?.anlass || []),
    jahreszeit: new Set(it?.jahreszeit || []),
    kat: { kategorie: it?.kategorie || '', unterkategorie: it?.unterkategorie || '', typ: it?.typ || '' },
    vals: Object.fromEntries(FIELDS.filter((f) => !isInputField(f)).map((f) => [f.key, f.type === 'multi' ? [...fieldValues(it || {}, f.key)] : (it?.[f.key] || '')])),
    alt: { ...(it?.alt || {}) },
    anteile: { ...(it?.materialAnteile || {}) },
    passt: orig ? matchesOf(orig.id) : [...(it?.passtZu || [])],
    passtBefore: orig ? matchesOf(orig.id) : [],
    katAlt: it?.kategorieAlt || '',
  };
  renderKatButton();
  $('#editTitle').textContent = orig ? 'Bearbeiten' : it ? 'Kopie' : ed.wunsch ? 'Neuer Wunsch' : 'Neues Teil';
  $('#statusField').hidden = ed.wunsch;
  renderStatusSeg();
  phCtx = ed;
  form.elements.bezeichnung.value = it?.name || '';
  for (const f of FIELDS.filter(isInputField)) {
    const v = it?.[f.key];
    form.elements[f.key].value = f.type === 'price' ? (hasValue(v) ? priceFmt.format(Number(v)) : '') : f.type === 'count' ? qty(it) : (v || '');
  }
  form.elements.notiz.value = it?.notiz || '';
  // Wunschliste: Kaufdatum, Lagerort und Zustand gibt es (noch) nicht
  for (const k of WISH_HIDDEN) $(`#fieldGrid [data-field="${k}"]`).hidden = ed.wunsch;
  $('#deleteBtn').hidden = !orig;
  $('#metaInfo').textContent = orig
    ? `Angelegt ${new Date(it.createdAt).toLocaleString('de-DE')} · geändert ${new Date(it.updatedAt).toLocaleString('de-DE')}`
    : '';
  renderAnlass();
  renderMatchList();
  renderPickFields();
  renderPhotoStrip();
  $('#editor').showModal();
  toTop($('#editor'));
}

async function saveEditor() {
  const form = $('#editForm');
  const now = new Date().toISOString();
  const prev = findItem(ed.id);
  const it = {
    ...(prev || {}),
    id: ed.id,
    name: form.elements.bezeichnung.value.trim(),
    anlass: [...ed.anlass],
    jahreszeit: JAHRESZEITEN.filter((j) => ed.jahreszeit.has(j)),
    notiz: form.elements.notiz.value.trim(),
    status: ed.status || '',
    photos: ed.photos.map((p) => p.id),
    photoTags: photoTagsOf(ed),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    _dirty: true,
  };
  for (const f of FIELDS) {
    const raw = isInputField(f) ? form.elements[f.key].value.trim() : null;
    if (f.type === 'price') it[f.key] = parsePrice(raw);
    else if (f.type === 'count') it[f.key] = Math.min(99, Math.max(1, parseInt(raw, 10) || 1));
    else if (f.type === 'url') it[f.key] = normalizeUrl(raw);
    else if (f.type === 'date') it[f.key] = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
    else it[f.key] = isInputField(f) ? raw : ed.vals[f.key];
    if (fieldValues(it, f.key).length) delete ed.alt[f.key];
  }
  if (Object.keys(ed.alt).length) it.alt = ed.alt; else delete it.alt;
  await saveMatches(it, ed.passtBefore);
  const ant = (it.materialien || []).length < 2 ? {} : Object.fromEntries((it.materialien || []).map((m) => [m, Math.round(Number(ed.anteile[m]))]).filter(([, p]) => p > 0 && p <= 100));
  if (Object.keys(ant).length) it.materialAnteile = ant; else delete it.materialAnteile;
  it.v = DATA_VERSION;
  Object.assign(it, ed.kat);
  if (it.kategorie) delete it.kategorieAlt;
  if (!it.status) delete it.status; else delete it.waesche; // Aussortiertes ist nicht in der Wäsche
  if (ed.wunsch) {
    it.wunsch = true; delete it.status; delete it.waesche;
    for (const k of WISH_HIDDEN) it[k] = '';
  } else delete it.wunsch;

  if (!Object.keys(it.photoTags).length) delete it.photoTags;
  await storePhotos(ed, it.id);
  await DB.put('items', it);
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

async function purgeItem(id) {
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

/* ---------------- Tragen, Wäsche, Status ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayDate = (s) => new Date(`${s}T12:00:00`);
const daysSince = (s) => Math.round((dayDate(isoDay()) - dayDate(s)) / 864e5);
const dayLong = (s) => dayDate(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = (s) => dayDate(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const wornCount = (r) => (r.getragen || []).length;
const lastWorn = (r) => (r.getragen || []).at(-1) || '';
/** Preis pro Tragen; noch nie getragen = voller Preis; ohne Preis null */
const costPerWear = (it) => (hasValue(it.preis) ? Number(it.preis) * qty(it) / Math.max(1, wornCount(it)) : null);
const addDay = (arr, d) => [...new Set([...(arr || []), d])].sort();
const removeDay = (arr, d) => (arr || []).filter((x) => x !== d);
function agoText(s) {
  const n = daysSince(s);
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  if (n < 60) return `vor ${n} Tagen`;
  if (n < 730) return `vor ${Math.round(n / 30.4)} Monaten`;
  return `vor ${Math.round(n / 365)} Jahren`;
}

const STATUS = ['Aussortiert', 'Verkauft', 'Verschenkt'];
const SPECIAL_KEYS = ['status', 'waesche', 'getragen', 'fav', 'wetter'];
/** Status: leer = nur Teile im Schrank, „*“ = alle; Wäsche: ja/nein; Getragen: nie oder seit N Tagen nicht */
function matchSpecial(it, f) {
  const st = f.status || '';
  if (st === '') { if (it.status) return false; } else if (st !== '*' && it.status !== st) return false;
  if (f.fav === 'ja' && !it.favorit) return false;
  if (f.wetter === 'heute' && todayMax() !== null && !fitsToday(it)) return false;
  if (f.waesche === 'ja' && !washN(it)) return false;
  if (f.waesche === 'nein' && washAll(it)) return false; // mindestens eins verfügbar
  if (f.getragen === 'nie' && wornCount(it)) return false;
  if (/^\d+$/.test(f.getragen || '') && lastWorn(it) && daysSince(lastWorn(it)) < Number(f.getragen)) return false;
  return true;
}
function specialFiltersHtml(f, withStatus) {
  const sel = (key, label, opts) => `<label>${label}<select data-filter="${key}">${opts.map(([v, t]) =>
    `<option value="${v}"${(f[key] || '') === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const count = (fn) => items.filter((it) => !it.status && fn(it)).length;
  const favSel = (cur, n) => `<label>Favoriten<select data-filter="fav"><option value="">Alle</option><option value="ja"${cur === 'ja' ? ' selected' : ''}>Nur Favoriten (${n})</option></select></label>`;
  return favSel(f.fav || '', count((i) => i.favorit)) + (withStatus ? sel('status', 'Status', [['', `Im Schrank (${count(() => true)})`], ...STATUS.map((s) => [s, `${s} (${items.filter((i) => i.status === s).length})`]), ['*', `Alle (${items.length})`]]) : '')
    + sel('waesche', 'Wäsche', [['', 'Alle'], ['ja', `In der Wäsche (${count((i) => washN(i))})`], ['nein', 'Verfügbar (nicht in der Wäsche)']])
    + wxSelect(f.wetter || '', count(fitsToday))
    + sel('getragen', 'Getragen', [['', 'Alle'], ['nie', `Noch nie (${count((i) => !wornCount(i))})`], ['30', 'Seit 1 Monat nicht'], ['90', 'Seit 3 Monaten nicht'], ['180', 'Seit 6 Monaten nicht'], ['365', 'Seit 1 Jahr nicht']]);
}

/** Datensatz ändern (Teil, Outfit, Packliste) und zum Hochladen vormerken */
async function patchRec(store, id, fn) {
  const r = await DB.get(store, id);
  if (!r || r._deleted) return null;
  fn(r);
  r.updatedAt = new Date().toISOString();
  r._dirty = true;
  await DB.put(store, r);
  return r;
}
async function afterChange() {
  await loadState(); await recountPending(); render(); updateSyncIndicator(); scheduleSync();
}
async function setItemWorn(id, day, on) {
  await patchRec('items', id, (it) => { it.getragen = on ? addDay(it.getragen, day) : removeDay(it.getragen, day); setWornWx(it, day, on); });
}
/** Outfit getragen: Datum beim Outfit und bei allen enthaltenen Teilen */
async function setOutfitWorn(id, day, on) {
  const o = await patchRec('outfits', id, (r) => {
    r.getragen = on ? addDay(r.getragen, day) : removeDay(r.getragen, day);
    setWornWx(r, day, on);
    if (on) r.geplant = removeDay(r.geplant, day);
  });
  for (const iid of o?.itemIds || []) await setItemWorn(iid, day, on);
}
async function setOutfitPlanned(id, day, on) {
  await patchRec('outfits', id, (r) => { r.geplant = on ? addDay(r.geplant, day) : removeDay(r.geplant, day); });
}
async function setWash(ids, on) {
  for (const id of ids) await patchRec('items', id, (it) => { if (on) it.waesche = true; else delete it.waesche; });
}
/** Bei mehreren gleichen Teilen: wie viele davon in der Wäsche sind */
async function setWashCount(id, n) {
  await patchRec('items', id, (it) => {
    n = Math.max(0, Math.min(qty(it), n));
    if (!n) delete it.waesche; else it.waesche = n >= qty(it) ? true : n;
  });
}

/** Kasten „Getragen“ in der Detailansicht von Teil und Outfit */
function renderWearBox(sel, kind, r) {
  const box = $(sel);
  box.dataset.kind = kind;
  box.dataset.id = r.id;
  const n = wornCount(r);
  const today = isoDay();
  const wornToday = (r.getragen || []).includes(today);
  const stats = [n ? `${n}× getragen` : 'Noch nie getragen', n ? `zuletzt ${agoText(lastWorn(r))}` : '', wornTempText(r)];
  if (kind === 'item' && hasValue(r.preis)) stats.push(`${formatPrice(costPerWear(r))} pro Tragen`);
  const planned = (r.geplant || []).filter((d) => d >= today);
  box.innerHTML = `<h3>Getragen</h3>
    <p class="wearstats">${esc(stats.filter(Boolean).join(' · '))}</p>
    <div class="row wrap">
      <button type="button" class="${wornToday ? 'chipbtn active' : 'primary'}" data-wear-today>${wornToday ? '✓ Heute getragen' : 'Heute getragen'}</button>
      <button type="button" class="chipbtn" data-wear-pick>Anderer Tag …</button>
      ${kind === 'item' && !r.status && qty(r) === 1 ? `<button type="button" class="chipbtn${washN(r) ? ' active' : ''}" data-wash>${washN(r) ? '✓ In der Wäsche' : 'In die Wäsche'}</button>` : ''}
      ${kind === 'item' && !r.status && qty(r) > 1 ? `<span class="washstep${washN(r) ? ' active' : ''}">In der Wäsche:
        <button type="button" class="chipbtn" data-wash-step="-1" aria-label="Eins weniger in der Wäsche"${washN(r) ? '' : ' disabled'}>−</button>
        <b>${washN(r)} von ${qty(r)}</b>
        <button type="button" class="chipbtn" data-wash-step="1" aria-label="Eins mehr in der Wäsche"${washAll(r) ? ' disabled' : ''}>+</button></span>` : ''}
      ${kind === 'outfit' ? '<button type="button" class="chipbtn" data-plan-pick>Einplanen …</button>' : ''}
      <input type="date" class="hiddendate" data-wear-date max="${today}" aria-label="Tag auswählen">
      ${kind === 'outfit' ? '<input type="date" class="hiddendate" data-plan-date aria-label="Tag zum Einplanen">' : ''}
    </div>
    ${planned.length ? `<p class="planned">Geplant: ${planned.map((d) => `<span class="tag">${esc(dayShort(d))} <button type="button" class="x" data-unplan="${d}" aria-label="Nicht mehr einplanen">✕</button></span>`).join(' ')}</p>` : ''}
    ${n ? `<details class="wearhist"><summary>Verlauf (${n})</summary><ul>${[...r.getragen].reverse().map((d) =>
      `<li><span>${esc(dayShort(d))}</span><button type="button" class="x" data-unwear="${d}" aria-label="Eintrag löschen">✕</button></li>`).join('')}</ul></details>` : ''}`;
}
function pickDate(input) {
  input.value = '';
  try { if (input.showPicker) return input.showPicker(); } catch { /* z. B. ohne Nutzeraktion */ }
  input.classList.remove('hiddendate'); input.focus();
}
async function onWearBox(e) {
  const box = e.target.closest('[data-kind]');
  if (!box) return;
  const { kind, id } = box.dataset;
  const t = e.target;
  const rec = kind === 'item' ? items.find((i) => i.id === id) : outfits.find((o) => o.id === id);
  if (!rec) return;
  const worn = (day, on) => (kind === 'item' ? setItemWorn(id, day, on) : setOutfitWorn(id, day, on));
  let msg = '';
  if (t.closest('[data-wear-today]')) {
    const on = !(rec.getragen || []).includes(isoDay());
    await worn(isoDay(), on);
    msg = on ? (kind === 'outfit' ? 'Outfit und Teile als getragen eingetragen' : 'Als getragen eingetragen') : 'Eintrag entfernt';
  } else if (t.closest('[data-wear-pick]')) return pickDate(box.querySelector('[data-wear-date]'));
  else if (t.closest('[data-plan-pick]')) return pickDate(box.querySelector('[data-plan-date]'));
  else if (t.closest('[data-wash]')) { await setWash([id], !washN(rec)); msg = washN(rec) ? 'Aus der Wäsche' : 'In die Wäsche gelegt'; }
  else if (t.closest('[data-wash-step]')) { await setWashCount(id, washN(rec) + Number(t.closest('[data-wash-step]').dataset.washStep)); }
  else if (t.closest('[data-unwear]')) { await worn(t.closest('[data-unwear]').dataset.unwear, false); msg = 'Eintrag entfernt'; }
  else if (t.closest('[data-unplan]')) { await setOutfitPlanned(id, t.closest('[data-unplan]').dataset.unplan, false); }
  else return;
  await afterChange();
  refreshOpenDetails();
  if (msg) toast(msg);
}
async function onWearDate(e) {
  const box = e.target.closest('[data-kind]');
  const v = e.target.value;
  if (!box || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
  const { kind, id } = box.dataset;
  if (e.target.matches('[data-plan-date]')) { await setOutfitPlanned(id, v, true); toast(`Eingeplant für ${dayShort(v)}`); }
  else if (e.target.matches('[data-wear-date]')) {
    if (v > isoDay()) return toast('Das Datum liegt in der Zukunft – dafür „Einplanen“ verwenden');
    await (kind === 'item' ? setItemWorn(id, v, true) : setOutfitWorn(id, v, true));
    toast(`Getragen am ${dayShort(v)} eingetragen`);
  } else return;
  await afterChange();
  refreshOpenDetails();
}
/** Offene Ansichten nach einer Änderung neu zeichnen, ohne die Dialoge neu zu öffnen */
function refreshOpenDetails() {
  if ($('#detail').open && detailId) {
    const it = findItem(detailId);
    if (it) { renderWearBox('#detailWear', 'item', it); $('#detailTitle').textContent = itemTitle(it); }
  }
  if ($('#outfitDetail').open && outfitDetailId) {
    const o = outfits.find((x) => x.id === outfitDetailId);
    if (o) {
      renderWearBox('#outfitWear', 'outfit', o);
      $('#outfitDetailItems').innerHTML = outfitItemsSorted(o).map((it) => itemCardHtml(it)).join('');
    }
  }
  if ($('#dayDlg').open && dayOpen) renderDay();
  if ($('#packDlg').open && pk) renderPack();
}

/* ---------------- Favoriten ---------------- */
function renderFav(sel, r) {
  const b = $(sel);
  b.classList.toggle('active', !!r.favorit);
  b.innerHTML = r.favorit ? '<span class="fav">♥</span> Favorit' : '♡ Als Favorit markieren';
  b.setAttribute('aria-pressed', r.favorit ? 'true' : 'false');
}
async function toggleFav(store, id) {
  const r = await patchRec(store, id, (x) => { if (x.favorit) delete x.favorit; else x.favorit = true; });
  await afterChange();
  if (r) { renderFav(store === 'items' ? '#detailFav' : '#outfitFav', r); toast(r.favorit ? 'Als Favorit markiert' : 'Favorit entfernt'); }
}

/* ---------------- Status im Editor ---------------- */
function renderStatusSeg() {
  $('#statusSeg').innerHTML = [['', 'Im Schrank'], ...STATUS.map((s) => [s, s])].map(([v, t]) =>
    `<button type="button" data-status="${v}" class="${(ed.status || '') === v ? 'active' : ''}">${t}</button>`).join('');
}

/* ---------------- Planer: Kalender und Packlisten ---------------- */
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const outfitsPlannedOn = (d) => outfits.filter((o) => (o.geplant || []).includes(d));
const outfitsWornOn = (d) => outfits.filter((o) => (o.getragen || []).includes(d));
const itemsWornOn = (d) => items.filter((it) => (it.getragen || []).includes(d));
/** Ganzes Outfitbild (Foto oder Collage, wie in der Outfit-Übersicht gewählt) für Kalender & Listen */
function firstPhoto(o) {
  if (!(o.photos || []).length && !outfitItems(o).length) return '';
  return collageHtml(o, false, outfitView !== 'collage');
}
function renderPlan() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const start = new Date(y, m, 1);
  start.setDate(1 - ((start.getDay() + 6) % 7)); // Montag davor
  const today = isoDay();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;
    const ds = isoDay(d);
    const plan = outfitsPlannedOn(ds);
    const worn = outfitsWornOn(ds);
    const wornItems = itemsWornOn(ds).length;
    const show = plan[0] || worn[0];
    const w = wxDay(ds);
    cells.push(`<button type="button" class="day${d.getMonth() !== m ? ' other' : ''}${ds === today ? ' today' : ''}${plan.length ? ' planned' : ''}" data-day="${ds}">
      <span class="dn">${d.getDate()}</span>${w ? `<span class="dwx" title="${esc(wxText(w).line)}">${(WX_CODES[w.code] || ['🌡️'])[0]}${Math.round(w.max)}°</span>` : ''}${show ? `<span class="dthumb">${firstPhoto(show)}</span>` : ''}
      ${plan.length + worn.length > 1 ? `<span class="dmore">+${plan.length + worn.length - 1}</span>` : ''}
      ${wornItems ? '<span class="dworn" title="Getragen">✓</span>' : ''}</button>`);
  }
  // Nächste geplante Outfits
  const upcoming = outfits.flatMap((o) => (o.geplant || []).filter((d) => d >= today).map((d) => [d, o])).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 5);
  const packs = [...packlists].sort((a, b) => String(a.von || '9999').localeCompare(String(b.von || '9999')) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#planView').innerHTML = `
    <div id="wxBox" class="wxcard">${weatherCardInner()}</div>
    <div class="cal">
      <div class="calhead"><button type="button" class="iconbtn" data-cal="-1" aria-label="Voriger Monat">‹</button>
        <h3>${MONTHS[m]} ${y}</h3>
        <button type="button" class="iconbtn" data-cal="1" aria-label="Nächster Monat">›</button></div>
      <div class="calgrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
      <p class="hint">Tippe auf einen Tag, um ein Outfit einzuplanen oder als getragen einzutragen. ✓ = an diesem Tag etwas getragen.</p>
    </div>
    ${upcoming.length ? `<h3>Als Nächstes</h3><div class="rows">${upcoming.map(([d, o]) => `<button type="button" class="orow" data-day="${d}">
      <span class="othumb">${firstPhoto(o) || '<span class="ph">–</span>'}</span><span><b>${esc(dayLong(d))}</b><small>${esc(outfitTitle(o))}</small></span></button>`).join('')}</div>` : ''}
    <div class="sechead"><h3>Packlisten</h3><button type="button" class="chipbtn" data-new-pack>+ Neue Packliste</button></div>
    ${packs.length ? `<div class="rows">${packs.map((p) => {
      const { want, done } = packTotals(p);
      const range = [formatDate(p.von), formatDate(p.bis)].filter(Boolean).join(' – ');
      return `<button type="button" class="prow" data-pack="${esc(p.id)}"><span><b>${esc(p.name || 'Packliste')}</b>
        <small>${esc([range, `${done}/${want} eingepackt`].filter(Boolean).join(' · '))}</small></span>
        <span class="progress"><i style="width:${want ? Math.round(100 * done / want) : 0}%"></i></span></button>`;
    }).join('')}</div>` : '<p class="muted">Noch keine Packlisten. Lege eine für deine nächste Reise an.</p>'}`;
}

/* Tag im Kalender */
let dayOpen = null;
function openDay(d) {
  dayOpen = d;
  renderDay();
  if (!$('#dayDlg').open) $('#dayDlg').showModal();
}
function renderDay() {
  const d = dayOpen;
  const future = d > isoDay();
  $('#dayTitle').textContent = dayLong(d);
  const plan = outfitsPlannedOn(d);
  const worn = outfitsWornOn(d);
  const inOutfits = new Set(worn.flatMap((o) => o.itemIds || []));
  const single = itemsWornOn(d).filter((it) => !inOutfits.has(it.id));
  const orow = (o, btns) => `<div class="orow"><button type="button" class="othumb" data-open-outfit="${esc(o.id)}">${firstPhoto(o) || '<span class="ph">–</span>'}</button>
    <button type="button" class="otitle" data-open-outfit="${esc(o.id)}">${esc(outfitTitle(o))}</button>${btns}</div>`;
  $('#dayBody').innerHTML = `${dayWeatherHtml(d)}
    <h3>Geplant</h3>
    ${plan.map((o) => orow(o, `${future ? '' : `<button type="button" class="chipbtn" data-day-wear="${esc(o.id)}">Getragen</button>`}
      <button type="button" class="x" data-day-unplan="${esc(o.id)}" aria-label="Nicht mehr einplanen">✕</button>`)).join('') || '<p class="muted">Nichts geplant.</p>'}
    <button type="button" class="addphoto" data-day-add>+ Outfit einplanen</button>
    ${future ? '' : `<h3>Getragen</h3>
    ${worn.map((o) => orow(o, `<button type="button" class="x" data-day-unwear="${esc(o.id)}" aria-label="Eintrag löschen">✕</button>`)).join('')}
    ${single.length ? `<div class="grid small">${single.map((it) => itemCardHtml(it)).join('')}</div>` : ''}
    ${!worn.length && !single.length ? '<p class="muted">Nichts eingetragen.</p>' : ''}
    <div class="row wrap"><button type="button" class="chipbtn" data-day-wear-outfit>+ Outfit getragen</button><button type="button" class="chipbtn" data-day-wear-items>+ Teile getragen</button></div>`}`;
}

/* Outfit auswählen (Kalender, Packliste) */
let opickCb = null;
function openOutfitPicker(title, cb) {
  opickCb = cb;
  $('#opickTitle').textContent = title;
  $('#opickSearch').value = '';
  renderOutfitPicker();
  $('#opickDlg').showModal();
}
function renderOutfitPicker() {
  const q = $('#opickSearch').value.trim().toLowerCase();
  const list = outfits.filter((o) => !q || [outfitTitle(o), ...(o.anlass || []), ...(o.jahreszeit || [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#opickGrid').innerHTML = list.map(outfitCardHtml).join('') || '<p class="muted">Keine Outfits gefunden.</p>';
}

/* Packliste */
let pk = null;
const packItemIds = (p) => (p.itemIds || []).filter((id) => items.some((i) => i.id === id));
function openPack(id = null) {
  const p = id ? packlists.find((x) => x.id === id) : null;
  pk = { id: p?.id || uid(), saved: !!p };
  renderPack(true);
  $('#packDlg').showModal();
  toTop($('#packDlg'));
}
/* Stückzahlen je Teil: wie viele mitnehmen (Standard 1) und wie viele davon schon eingepackt */
const packWant = (p, it) => Math.max(1, Math.min(qty(it), parseInt(p.want?.[it.id], 10) || 1));
const packDone = (p, it) => Math.min(packWant(p, it), p.packed?.[it.id] ?? ((p.checked || []).includes(it.id) ? packWant(p, it) : 0));
function packTotals(p) {
  const its = packItemIds(p).map((id) => items.find((i) => i.id === id));
  return { want: its.reduce((s2, it) => s2 + packWant(p, it), 0), done: its.reduce((s2, it) => s2 + packDone(p, it), 0) };
}
/** Altes Format (abgehakte IDs) in Stückzahlen umwandeln */
function normPack(p) {
  const packed = { ...(p.packed || {}) };
  for (const id of p.checked || []) { const it = items.find((i) => i.id === id); if (it && packed[id] === undefined) packed[id] = packWant(p, it); }
  p.packed = packed; p.want = { ...(p.want || {}) }; delete p.checked;
  return p;
}
function curPack() { return packlists.find((x) => x.id === pk.id) || { id: pk.id, name: '', von: '', bis: '', notiz: '', itemIds: [], want: {}, packed: {} }; }
function renderPack(fields = false) {
  const p = curPack();
  if (fields) {
    const f = $('#packForm').elements;
    f.pname.value = p.name || ''; f.pvon.value = p.von || ''; f.pbis.value = p.bis || ''; f.pnotiz.value = p.notiz || '';
    $('#packDelete').hidden = !pk.saved;
  }
  const its = sortBySlot(packItemIds(p).map((id) => items.find((i) => i.id === id)));
  const tot = packTotals(p);
  $('#packTitle').textContent = p.name || 'Packliste';
  $('#packProgress').textContent = its.length ? `${tot.done} von ${tot.want} eingepackt` : '';
  $('#packItems').innerHTML = its.map((it) => {
    const pid = (it.photos || [])[0];
    const url = pid ? thumbUrl(pid) : '';
    const want = packWant(p, it), done = packDone(p, it), full = done >= want;
    // Bei mehreren Stück: Kreis zählt hoch (1/2, 2/2, dann wieder leer), darunter Mitnehmen − n +
    return `<div class="oitem pitem${full ? ' done' : ''}${done && !full ? ' part' : ''}">
      <button type="button" class="pcheck" data-pack-check="${esc(it.id)}" aria-label="Eingepackt">${want > 1 ? (done ? `${done}/${want}` : '') : full ? '✓' : ''}</button>
      ${url ? `<img class="${isPng(pid) ? 'cut' : ''}" src="${url}" alt="">` : '<span class="noimg">–</span>'}
      <span class="oname">${esc(itemTitle(it))}${washN(it) ? ` <small class="washnote">${esc(washLabel(it))}</small>` : ''}
        ${qty(it) > 1 ? `<span class="pwant">Mitnehmen <button type="button" class="chipbtn" data-pack-want="-1:${esc(it.id)}" aria-label="Weniger"${want <= 1 ? ' disabled' : ''}>−</button><b>${want}</b><button type="button" class="chipbtn" data-pack-want="1:${esc(it.id)}" aria-label="Mehr"${want >= qty(it) ? ' disabled' : ''}>+</button> von ${qty(it)}</span>` : ''}</span>
      <button type="button" class="oremove" data-pack-remove="${esc(it.id)}" aria-label="Entfernen">✕</button></div>`;
  }).join('') || '<p class="hint">Noch leer. Füge Teile einzeln oder ganze Outfits hinzu.</p>';
}
/** Packliste ändern; eine neue Liste wird erst gespeichert, wenn sie Name oder Inhalt hat */
async function updatePack(fn) {
  const now = new Date().toISOString();
  const p = { ...curPack() };
  fn(p);
  if (!pk.saved && !p.name && !(p.itemIds || []).length) return;
  p.createdAt = p.createdAt || now; p.updatedAt = now; p._dirty = true;
  await DB.put('packlisten', p);
  pk.saved = true;
  $('#packDelete').hidden = false;
  await afterChange();
  renderPack();
}
async function purgePack(id) {
  const p = await DB.get('packlisten', id);
  if (!p) return;
  if (!p._etag) await DB.del('packlisten', id);
  else await DB.put('packlisten', { ...p, _deleted: true, _dirty: true });
  await afterChange();
}

/* ---------------- Statistik ---------------- */
function barsHtml(rows, fmt = (v) => v) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<div class="bars">${rows.map(([label, v, extra = '', pre = '']) => `<div class="bar"><span class="bl">${pre}${esc(label)}</span>
    <span class="bt"><i style="width:${Math.max(2, Math.round(100 * v / max))}%"></i></span><span class="bv">${esc(fmt(v))}${extra ? `<small>${esc(extra)}</small>` : ''}</span></div>`).join('')}</div>`;
}
function itemRowsHtml(list, right) {
  return `<div class="rows">${list.map((it) => `<button type="button" class="orow" data-item="${esc(it.id)}">
    <span class="othumb">${photoCell(it)}</span><span><b>${esc(itemTitle(it))}</b><small>${esc(right(it))}</small></span></button>`).join('')}</div>`;
}
let statsCpwLow = localStorage.getItem('ks_cpw') === 'low';
let statsWornLow = localStorage.getItem('ks_worn') === 'low';
function renderStats() {
  const act = items.filter((it) => !it.status);
  if (!items.length) { $('#statsView').innerHTML = '<p class="muted">Noch keine Teile erfasst.</p>'; return; }
  const sum = (list) => list.reduce((s, it) => s + (hasValue(it.preis) ? Number(it.preis) * qty(it) : 0), 0);
  const nPieces = act.reduce((s, it) => s + qty(it), 0);
  const since30 = isoDay(new Date(Date.now() - 30 * 864e5));
  const wears30 = act.reduce((s, it) => s + (it.getragen || []).filter((d) => d >= since30).length, 0);
  const worn30 = act.filter((it) => (it.getragen || []).some((d) => d >= since30)).length;
  const count = (list, fn) => { const m = new Map(); for (const it of list) for (const v of fn(it)) m.set(v, (m.get(v) || 0) + 1); return m; };
  // Kategorien in fester Reihenfolge, mit Wert
  const byCat = new Map();
  for (const it of act) { const k = it.kategorie || 'Ohne Kategorie'; const c = byCat.get(k) || [0, 0]; c[0] += qty(it); c[1] += hasValue(it.preis) ? Number(it.preis) * qty(it) : 0; byCat.set(k, c); }
  const catRows = [...byCat.entries()].sort((a, b) => (CAT.order.get(a[0]) ?? 1e9) - (CAT.order.get(b[0]) ?? 1e9))
    .map(([k, [n, v]]) => [k, n, v ? formatPrice(v) : '']);
  const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, n);
  const colors = top(count(act, (it) => fieldValues(it, 'farben'))).map(([k, n]) => [k, n, '', swatch(k)]);
  const brands = top(count(act, (it) => fieldValues(it, 'marke')));
  const zust = count(act, (it) => fieldValues(it, 'zustand'));
  const zustRows = ZUSTAENDE.filter((z) => zust.get(z)).map((z) => [z, zust.get(z)]);
  const wornLow = statsWornLow;
  // Seltensten: auch nie Getragene; bei Gleichstand das am längsten nicht Getragene zuerst
  const most = (wornLow ? [...act].sort((a, b) => wornCount(a) - wornCount(b) || lastWorn(a).localeCompare(lastWorn(b)))
    : [...act].filter(wornCount).sort((a, b) => wornCount(b) - wornCount(a))).slice(0, 5);
  const never = act.filter((it) => !wornCount(it));
  const long = act.filter((it) => wornCount(it) && daysSince(lastWorn(it)) >= 90).sort((a, b) => lastWorn(a).localeCompare(lastWorn(b))).slice(0, 5);
  const cpwLow = statsCpwLow;
  const cpw = act.filter((it) => hasValue(it.preis) && Number(it.preis) > 0)
    .sort((a, b) => (cpwLow ? costPerWear(a) - costPerWear(b) : costPerWear(b) - costPerWear(a)) || itemTitle(a).localeCompare(itemTitle(b), 'de')).slice(0, 5);
  const gone = STATUS.map((s) => [s, items.filter((i) => i.status === s)]).filter(([, l]) => l.length);
  const tile = (v, l, filter) => `<button type="button" class="tile"${filter ? ` data-goto='${esc(JSON.stringify(filter))}'` : ' disabled'}><b>${esc(String(v))}</b><span>${esc(l)}</span></button>`;
  $('#statsView').innerHTML = `
    <div class="tiles">
      ${tile(nPieces, nPieces === 1 ? 'Teil im Schrank' : 'Teile im Schrank', {})}
      ${tile(formatPrice(sum(act)) || '0,00 €', 'Gesamtwert (Kaufpreis)')}
      ${tile(outfits.length, outfits.length === 1 ? 'Outfit' : 'Outfits')}
      ${tile(`${act.length ? Math.round(100 * worn30 / act.length) : 0} %`, `in 30 Tagen getragen (${wears30}× insgesamt)`)}
      ${tile(never.length, 'noch nie getragen', { getragen: 'nie' })}
      ${tile(act.reduce((s2, i) => s2 + washN(i), 0), 'Stück in der Wäsche', { waesche: 'ja' })}
    </div>
    <h3>Nach Kategorie</h3>${barsHtml(catRows)}
    ${colors.length ? `<h3>Farben</h3>${barsHtml(colors)}` : ''}
    ${brands.length ? `<h3>Marken</h3>${barsHtml(brands)}` : ''}
    ${zustRows.length ? `<h3>Zustand</h3>${barsHtml(zustRows)}` : ''}
    ${act.length ? `<div class="sechead"><h3>Getragen</h3><button type="button" class="chipbtn" data-goto-sort="${wornLow ? 'worn_least' : 'worn_most'}">Alle anzeigen</button></div>
      <div class="seg small cpwseg"><button type="button" data-worn="high" class="${wornLow ? '' : 'active'}">Am häufigsten</button><button type="button" data-worn="low" class="${wornLow ? 'active' : ''}">Am seltensten</button></div>
      ${most.length ? itemRowsHtml(most, (it) => (wornCount(it) ? `${wornCount(it)}× · zuletzt ${agoText(lastWorn(it))}` : 'noch nie getragen')) : '<p class="muted">Noch nichts als getragen eingetragen.</p>'}` : ''}
    ${long.length ? `<div class="sechead"><h3>Lange nicht getragen</h3><button type="button" class="chipbtn" data-goto='{"getragen":"90"}'>Alle anzeigen</button></div>${itemRowsHtml(long, (it) => `zuletzt ${agoText(lastWorn(it))} · ${wornCount(it)}×`)}` : ''}
    ${cpw.length ? `<div class="sechead"><h3>Preis pro Tragen</h3><button type="button" class="chipbtn" data-goto-sort="${cpwLow ? 'cpw_asc' : 'cpw'}">Alle anzeigen</button></div>
      <div class="seg small cpwseg"><button type="button" data-cpw="high" class="${cpwLow ? '' : 'active'}">Höchster</button><button type="button" data-cpw="low" class="${cpwLow ? 'active' : ''}">Niedrigster</button></div>${itemRowsHtml(cpw, (it) => `${formatPrice(costPerWear(it))} pro Tragen · ${formatPrice(it.preis)}, ${wornCount(it)}× getragen`)}` : ''}
    ${gone.length ? `<h3>Nicht mehr im Schrank</h3>${barsHtml(gone.map(([s, l]) => [s, l.length, sum(l) ? `Kaufpreis ${formatPrice(sum(l))}` : '']))}` : ''}
`;
}
/** Aus der Statistik in die gefilterte Teile-Liste springen */
function gotoItems(f = {}, sort = null) {
  for (const k of Object.keys(filters)) delete filters[k];
  Object.assign(filters, f);
  localStorage.setItem('ks_filters', JSON.stringify(filters));
  if (sort) localStorage.setItem('ks_sort', sort);
  tab = 'items'; localStorage.setItem('ks_tab', tab);
  $('#sort').dataset.for = '';
  $('#search').value = '';
  render();
  window.scrollTo(0, 0);
}

function wirePlanner() {
  document.addEventListener('click', (e) => { if (e.target.closest('.wearbox')) onWearBox(e); });
  document.addEventListener('change', (e) => { if (e.target.closest('.wearbox') && e.target.type === 'date') onWearDate(e); });
  $('#count').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-unwash-all]')) return;
    await setWash(items.filter((i) => washN(i)).map((i) => i.id), false);
    await afterChange();
    toast('Alles aus der Wäsche');
  });
  $('#detailFav').addEventListener('click', () => toggleFav('items', detailId));
  $('#outfitFav').addEventListener('click', () => toggleFav('outfits', outfitDetailId));
  $('#outfitShare').addEventListener('click', () => shareOutfit(outfitDetailId));
  $('#detailCopy').addEventListener('click', () => { const id = detailId; $('#detail').close(); openEditor(null, id); });
  $('#statusSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    ed.status = b.dataset.status;
    renderStatusSeg();
  });
  // Planer
  $('#planView').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cal]');
    if (c) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(c.dataset.cal), 1); return renderPlan(); }
    const d = e.target.closest('[data-day]');
    if (d) return openDay(d.dataset.day);
    const p = e.target.closest('[data-pack]');
    if (p) return openPack(p.dataset.pack);
    if (e.target.closest('[data-new-pack]')) openPack();
  });
  $('#dayBody').addEventListener('click', async (e) => {
    const t = e.target;
    const d = dayOpen;
    const o = t.closest('[data-open-outfit]');
    if (o) return openOutfitDetail(o.dataset.openOutfit);
    const c = t.closest('.card');
    if (c) return openDetail(c.dataset.id);
    if (t.closest('[data-day-add]')) {
      return openOutfitPicker('Outfit einplanen', async (id) => { await setOutfitPlanned(id, d, true); await afterChange(); renderDay(); toast('Eingeplant'); });
    }
    if (t.closest('[data-day-wear-outfit]')) {
      return openOutfitPicker('Outfit getragen', async (id) => { await setOutfitWorn(id, d, true); await afterChange(); renderDay(); toast('Als getragen eingetragen'); });
    }
    if (t.closest('[data-day-wear-items]')) {
      const before = itemsWornOn(d).map((i) => i.id);
      return openItemPicker(before, async (next) => {
        for (const id of next.filter((x) => !before.includes(x))) await setItemWorn(id, d, true);
        for (const id of before.filter((x) => !next.includes(x))) await setItemWorn(id, d, false);
        await afterChange(); renderDay();
      });
    }
    const w = t.closest('[data-day-wear]');
    if (w) { await setOutfitWorn(w.dataset.dayWear, d, true); await afterChange(); renderDay(); return toast('Als getragen eingetragen'); }
    const up = t.closest('[data-day-unplan]');
    if (up) { await setOutfitPlanned(up.dataset.dayUnplan, d, false); await afterChange(); return renderDay(); }
    const uw = t.closest('[data-day-unwear]');
    if (uw) { await setOutfitWorn(uw.dataset.dayUnwear, d, false); await afterChange(); renderDay(); }
  });
  $('#opickSearch').addEventListener('input', renderOutfitPicker);
  $('#opickGrid').addEventListener('click', (e) => {
    const c = e.target.closest('[data-outfit]');
    if (!c) return;
    $('#opickDlg').close();
    opickCb?.(c.dataset.outfit);
  });
  // Packliste
  const pf = $('#packForm');
  pf.addEventListener('submit', (e) => { e.preventDefault(); $('#packDlg').close(); });
  pf.addEventListener('change', (e) => {
    const f = pf.elements;
    if (!['pname', 'pvon', 'pbis', 'pnotiz'].includes(e.target.name)) return;
    updatePack((p) => { p.name = f.pname.value.trim(); p.von = f.pvon.value; p.bis = f.pbis.value; p.notiz = f.pnotiz.value.trim(); });
  });
  $('#packDlg').addEventListener('close', () => {
    // Noch nicht übernommene Eingaben (Tastatur offen) sichern
    if (!pk) return;
    const f = pf.elements; const p = curPack();
    if ((f.pname.value.trim() !== (p.name || '') || f.pnotiz.value.trim() !== (p.notiz || ''))) {
      updatePack((q) => { q.name = f.pname.value.trim(); q.notiz = f.pnotiz.value.trim(); });
    }
  });
  $('#packItems').addEventListener('click', (e) => {
    const c = e.target.closest('[data-pack-check]');
    if (c) return updatePack((p) => {
      normPack(p); const it = items.find((i) => i.id === c.dataset.packCheck); if (!it) return;
      const want = packWant(p, it), done = packDone(p, it);
      p.packed[it.id] = done >= want ? 0 : done + 1; // ein Stück mehr; wenn alle: wieder leer
    });
    const w = e.target.closest('[data-pack-want]');
    if (w) return updatePack((p) => {
      normPack(p); const [step, id] = w.dataset.packWant.split(/:(.*)/s); const it = items.find((i) => i.id === id); if (!it) return;
      p.want[id] = Math.max(1, Math.min(qty(it), packWant(p, it) + Number(step)));
      if ((p.packed[id] || 0) > p.want[id]) p.packed[id] = p.want[id];
    });
    const r = e.target.closest('[data-pack-remove]');
    if (r) updatePack((p) => { normPack(p); const id = r.dataset.packRemove; p.itemIds = (p.itemIds || []).filter((x) => x !== id); delete p.want[id]; delete p.packed[id]; });
  });
  $('#packAddItems').addEventListener('click', () => {
    openItemPicker(packItemIds(curPack()), (next) => updatePack((p) => {
      normPack(p); p.itemIds = next;
      for (const k of [...Object.keys(p.want), ...Object.keys(p.packed)]) if (!next.includes(k)) { delete p.want[k]; delete p.packed[k]; }
    }));
  });
  $('#packAddOutfit').addEventListener('click', () => {
    openOutfitPicker('Outfit hinzufügen', (id) => {
      const o = outfits.find((x) => x.id === id);
      updatePack((p) => { p.itemIds = [...new Set([...(p.itemIds || []), ...(o?.itemIds || [])])]; });
      toast('Teile des Outfits hinzugefügt');
    });
  });
  $('#packReset').addEventListener('click', () => updatePack((p) => { normPack(p); p.packed = {}; }));
  $('#packDelete').addEventListener('click', async () => {
    const id = pk.id; pk = null;
    $('#packDlg').close();
    await deletePack(id);
  });
  // Statistik
  $('#statsView').addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) return gotoItems(JSON.parse(g.dataset.goto));
    const w = e.target.closest('[data-worn]');
    if (w) { statsWornLow = w.dataset.worn === 'low'; localStorage.setItem('ks_worn', w.dataset.worn); return renderStats(); }
    const c = e.target.closest('[data-cpw]');
    if (c) { statsCpwLow = c.dataset.cpw === 'low'; localStorage.setItem('ks_cpw', c.dataset.cpw); return renderStats(); }
    const s = e.target.closest('[data-goto-sort]');
    if (s) return gotoItems({}, s.dataset.gotoSort);
    const r = e.target.closest('[data-item]');
    if (r) openDetail(r.dataset.item);
  });
}

/* ---------------- Wetter (Open-Meteo, ohne Konto/Schlüssel) ---------------- */
const WX_CODES = {
  0: ['☀️', 'Klar'], 1: ['🌤️', 'Überwiegend klar'], 2: ['⛅', 'Teilweise bewölkt'], 3: ['☁️', 'Bedeckt'],
  45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Nieselregen'], 53: ['🌦️', 'Nieselregen'], 55: ['🌧️', 'Starker Nieselregen'],
  56: ['🌧️', 'Gefrierender Nieselregen'], 57: ['🌧️', 'Gefrierender Nieselregen'],
  61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  66: ['🌧️', 'Gefrierender Regen'], 67: ['🌧️', 'Gefrierender Regen'],
  71: ['🌨️', 'Leichter Schneefall'], 73: ['🌨️', 'Schneefall'], 75: ['❄️', 'Starker Schneefall'], 77: ['🌨️', 'Schneegriesel'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'Kräftige Regenschauer'], 82: ['⛈️', 'Heftige Regenschauer'],
  85: ['🌨️', 'Schneeschauer'], 86: ['🌨️', 'Starke Schneeschauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Gewitter mit Hagel'],
};
const WX_FORECAST_DAYS = 16;
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let wxLoc = readJson('ks_wxloc', null);     // { mode: 'gps' | 'ort', lat, lon, name }
let wxData = readJson('ks_wx', null);       // { key, at, days: { 'JJJJ-MM-TT': { code, max, min, pop } } }
const wx = { loading: false, error: '', edit: false, results: null, gpsChecked: false };
const wxKey = () => (wxLoc ? `${wxLoc.lat},${wxLoc.lon}` : '');
const wxDay = (d) => (wxData && wxData.key === wxKey() ? wxData.days[d] : null);
const round2 = (n) => Math.round(n * 100) / 100;
function wxText(w, long = true) {
  const [ico, txt] = WX_CODES[w.code] || ['🌡️', 'Wetter'];
  const t = `${Math.round(w.max)}° / ${Math.round(w.min)}°`;
  const rain = w.pop === null || w.pop === undefined ? '' : `💧 ${w.pop} %`;
  return { ico, txt, t, rain, line: [long ? txt : '', t, rain ? `Regen ${w.pop} %` : ''].filter(Boolean).join(' · ') };
}
async function loadWeather(force = false) {
  if (!wxLoc || wx.loading) return;
  if (!force && wxData?.key === wxKey() && Date.now() - wxData.at < 60 * 60 * 1000 && wxData.day === isoDay()) return;
  if (!navigator.onLine) { wx.error = 'offline'; return refreshWeatherViews(); }
  wx.loading = true; wx.error = '';
  refreshWeatherViews();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${wxLoc.lat}&longitude=${wxLoc.lon}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + `&timezone=auto&past_days=31&forecast_days=${WX_FORECAST_DAYS}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const d = j.daily || {};
    const days = {};
    (d.time || []).forEach((t, i) => {
      if (d.temperature_2m_max[i] === null) return;
      days[t] = { code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], pop: d.precipitation_probability_max?.[i] ?? null };
    });
    wxData = { key: wxKey(), at: Date.now(), day: isoDay(), days };
    localStorage.setItem('ks_wx', JSON.stringify(wxData));
    backfillWornWx();
  } catch (e) {
    console.warn('Wetter', e);
    wx.error = 'fehler';
  } finally {
    wx.loading = false;
    refreshWeatherViews();
  }
}
function refreshWeatherViews() {
  if (tab === 'plan' && $('#wxBox')) {
    if (wx.edit || !wxLoc) $('#wxBox').innerHTML = weatherCardInner(); else renderPlan();
  }
  if ($('#dayDlg').open && dayOpen) { const b = $('#dayWx'); if (b) b.outerHTML = dayWeatherHtml(dayOpen); }
}
function setWxLoc(loc) {
  wxLoc = loc;
  localStorage.setItem('ks_wxloc', JSON.stringify(loc));
  wx.edit = false; wx.results = null;
  loadWeather(true);
  nameGpsLoc();
}
/** Aktuellen Standort holen; silent = nur wenn die Berechtigung schon erteilt ist (keine Nachfrage) */
async function useGps(silent = false) {
  if (!navigator.geolocation) { if (!silent) toast('Dieses Gerät kann keinen Standort liefern – gib bitte einen Ort ein.'); return; }
  if (silent) {
    try { if ((await navigator.permissions?.query({ name: 'geolocation' }))?.state !== 'granted') return; } catch { return; }
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = round2(pos.coords.latitude), lon = round2(pos.coords.longitude);
    if (silent && wxLoc && Math.abs(wxLoc.lat - lat) < 0.05 && Math.abs(wxLoc.lon - lon) < 0.05) return loadWeather();
    setWxLoc({ mode: 'gps', lat, lon, name: 'Aktueller Standort' });
  }, () => {
    if (!silent) toast('Standort nicht verfügbar oder nicht erlaubt – du kannst stattdessen einen Ort eingeben.');
  }, { maximumAge: 30 * 60 * 1000, timeout: 15000 });
}
/** Ortsname zu Koordinaten (ohne Konto): BigDataCloud, ersatzweise OpenStreetMap/Nominatim */
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=de`);
    if (r.ok) { const j = await r.json(); const n = j.city || j.locality || j.principalSubdivision; if (n) return n; }
  } catch { /* nächster Dienst */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=de`);
    if (r.ok) { const a = (await r.json()).address || {}; const n = a.city || a.town || a.village || a.municipality || a.county; if (n) return n; }
  } catch { /* egal */ }
  return '';
}
/** Für einen per GPS ermittelten Standort den Ortsnamen nachtragen */
async function nameGpsLoc() {
  const loc = wxLoc;
  if (!loc || loc.mode !== 'gps' || loc.named || !navigator.onLine) return;
  const n = await reverseGeocode(loc.lat, loc.lon);
  if (!n || wxLoc !== loc) return;
  wxLoc = { ...loc, name: n, named: true };
  localStorage.setItem('ks_wxloc', JSON.stringify(wxLoc));
  refreshWeatherViews();
}
async function searchPlace(q) {
  q = q.trim();
  wx.q = q;
  if (!q) return;
  wx.results = 'loading';
  refreshWeatherViews();
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
    const j = await r.json();
    wx.results = (j.results || []).map((p) => ({ lat: round2(p.latitude), lon: round2(p.longitude), name: p.name, sub: [p.admin1, p.country].filter(Boolean).join(', ') }));
  } catch { wx.results = 'fehler'; }
  refreshWeatherViews();
}
function weatherCardInner() {
  if (!wxLoc || wx.edit) {
    const res = wx.results === 'loading' ? '<p class="muted">Suche …</p>'
      : wx.results === 'fehler' ? '<p class="muted">Suche fehlgeschlagen – bist du online?</p>'
        : Array.isArray(wx.results) ? (wx.results.length ? `<div class="wxres">${wx.results.map((p, i) =>
          `<button type="button" class="chipbtn" data-wx-pick="${i}">${esc(p.name)}<small>${esc(p.sub)}</small></button>`).join('')}</div>` : '<p class="muted">Kein Ort gefunden.</p>') : '';
    return `<div class="wxhead"><b>Wetter</b>${wxLoc ? '<button type="button" class="textbtn" data-wx-cancel>Abbrechen</button>' : ''}</div>
      <p class="muted">Für das Tageswetter brauche ich deinen Standort.</p>
      <div class="row wrap"><button type="button" class="primary" data-wx-gps>📍 Aktuellen Standort verwenden</button></div>
      <div class="row wxsearch"><input id="wxQuery" type="search" placeholder="… oder Ort eingeben, z. B. Erfurt" autocomplete="off" value="${esc(wx.q || '')}"><button type="button" class="chipbtn" data-wx-search>Suchen</button></div>
      ${res}`;
  }
  const w = wxDay(isoDay());
  const placeName = wxLoc.mode === 'gps' ? (wxLoc.named ? `${wxLoc.name} (aktueller Standort)` : 'Aktueller Standort') : wxLoc.name;
  const place = `<button type="button" class="wxplace" data-wx-edit title="Ort ändern">📍 ${esc(placeName)} · ändern</button>`;
  if (!w) {
    const msg = wx.loading ? 'Wetter wird geladen …' : wx.error === 'offline' ? 'Offline – kein Wetter verfügbar.' : wx.error ? 'Wetter gerade nicht verfügbar.' : 'Wetter wird geladen …';
    return `<div class="wxnow"><span class="wxico">🌡️</span><div><b>Heute</b><p class="muted">${msg}</p>${place}</div></div>`;
  }
  const t = wxText(w);
  return `<div class="wxnow"><span class="wxico">${t.ico}</span><div class="wxmain"><b>Heute · ${esc(t.txt)}</b>
      <p><span class="wxt">${t.t}</span>${t.rain ? ` <span class="wxrain">${t.rain} Regen</span>` : ''}</p>${place}</div></div>`;
}
function dayWeatherHtml(d) {
  if (!wxLoc) return '<p id="dayWx" class="daywx muted">Wetter: Standort im Planer festlegen.</p>';
  const w = wxDay(d);
  if (w) { const t = wxText(w); return `<p id="dayWx" class="daywx"><span class="wxico small">${t.ico}</span><span><b>${esc(t.txt)}</b><br>${t.t}${t.rain ? ` · ${t.rain} Regen` : ''}</span></p>`; }
  const diff = -daysSince(d);
  const why = wx.loading ? 'Wetter wird geladen …' : diff >= WX_FORECAST_DAYS ? `Noch keine Vorhersage – sie reicht ${WX_FORECAST_DAYS} Tage im Voraus.` : diff < -31 ? 'Kein Wetter für so weit zurückliegende Tage.' : 'Wetter gerade nicht verfügbar.';
  return `<p id="dayWx" class="daywx muted">${why}</p>`;
}
function wireWeather() {
  $('#planView').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-wx-gps]')) return useGps();
    if (t.closest('[data-wx-edit]')) { wx.edit = true; wx.results = null; return refreshWeatherViews(); }
    if (t.closest('[data-wx-cancel]')) { wx.edit = false; return refreshWeatherViews(); }
    if (t.closest('[data-wx-search]')) return searchPlace($('#wxQuery').value);
    const p = t.closest('[data-wx-pick]');
    if (p) { const r = wx.results[Number(p.dataset.wxPick)]; setWxLoc({ mode: 'ort', lat: r.lat, lon: r.lon, name: r.name }); }
  });
  $('#planView').addEventListener('keydown', (e) => {
    if (e.target.id === 'wxQuery' && e.key === 'Enter') { e.preventDefault(); searchPlace(e.target.value); }
  });
  window.addEventListener('online', () => { if (tab === 'plan') loadWeather(); });
}
function weatherOnPlan() {
  if (wxLoc?.mode === 'gps' && !wx.gpsChecked) { wx.gpsChecked = true; useGps(true); nameGpsLoc(); }
  loadWeather();
}

/* ---------------- Papierkorb ---------------- */
const TRASH_DAYS = 30;
const TRASH_STORES = { items: 'Teil', outfits: 'Outfit', packlisten: 'Packliste' };
let trashItems = [], trashOutfits = [], trashPacks = [];
const trashCount = () => trashItems.length + trashOutfits.length + trashPacks.length;
/** In den Papierkorb legen (wird mitsynchronisiert, Fotos bleiben erhalten) */
async function trashRec(store, id) {
  await patchRec(store, id, (r) => { r.geloescht = new Date().toISOString(); });
  await afterChange();
}
async function restoreRec(store, id) {
  await patchRec(store, id, (r) => { delete r.geloescht; });
  await afterChange();
  if ($('#trashDlg').open) renderTrash();
}
async function purgeRec(store, id) {
  if (store === 'items') return purgeItem(id);
  if (store === 'outfits') return purgeOutfit(id);
  return purgePack(id);
}
/** Einträge, die länger als 30 Tage im Papierkorb liegen, endgültig löschen */
async function purgeOldTrash() {
  const limit = Date.now() - TRASH_DAYS * 864e5;
  let n = 0;
  for (const [store, list] of [['items', trashItems], ['outfits', trashOutfits], ['packlisten', trashPacks]]) {
    for (const r of list) if (Date.parse(r.geloescht) < limit) { await purgeRec(store, r.id); n++; }
  }
  return n;
}
async function deleteItem(id) {
  const it = findItem(id);
  await trashRec('items', id);
  undoToast(`„${it ? itemTitle(it) : 'Teil'}“ liegt im Papierkorb`, () => restoreRec('items', id));
}
async function deleteOutfit(id) {
  await trashRec('outfits', id);
  undoToast('Outfit liegt im Papierkorb', () => restoreRec('outfits', id));
}
async function deletePack(id) {
  await trashRec('packlisten', id);
  undoToast('Packliste liegt im Papierkorb', () => restoreRec('packlisten', id));
}
let undoFn = null;
function undoToast(msg, fn) {
  toast(msg);
  undoFn = fn;
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="undo" data-undo>Rückgängig</button>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; undoFn = null; }, 7000);
}
function renderTrash() {
  const left = (r) => Math.max(0, TRASH_DAYS - daysSince(isoDay(new Date(r.geloescht))));
  const row = (store, r, thumb, title) => `<div class="orow trow"><span class="othumb">${thumb || '<span class="ph">–</span>'}</span>
    <span><b>${esc(title)}</b><small>${esc(`gelöscht ${agoText(isoDay(new Date(r.geloescht)))} · noch ${left(r)} ${left(r) === 1 ? 'Tag' : 'Tage'}`)}</small></span>
    <button type="button" class="chipbtn" data-restore="${store}:${esc(r.id)}">Wiederherstellen</button>
    <button type="button" class="x" data-purge="${store}:${esc(r.id)}" aria-label="Endgültig löschen">✕</button></div>`;
  const byDate = (a, b) => String(b.geloescht).localeCompare(String(a.geloescht));
  const sec = (title, html) => (html ? `<h3>${title}</h3>${html}` : '');
  const html = sec('Teile & Wünsche', [...trashItems].sort(byDate).map((it) => row('items', it, (it.photos || [])[0] ? photoCell(it) : '', itemTitle(it) + (it.wunsch ? ' (Wunsch)' : ''))).join(''))
    + sec('Outfits', [...trashOutfits].sort(byDate).map((o) => row('outfits', o, firstPhoto(o), outfitTitle(o))).join(''))
    + sec('Packlisten', [...trashPacks].sort(byDate).map((p) => row('packlisten', p, '', p.name || 'Packliste')).join(''));
  $('#trashBody').innerHTML = html
    ? `<p class="hint">Gelöschtes bleibt ${TRASH_DAYS} Tage hier und wird dann endgültig entfernt (auch aus der Cloud).</p>${html}
       <button type="button" class="danger" data-purge-all>Papierkorb leeren</button>`
    : '<p class="muted">Der Papierkorb ist leer.</p>';
}
function wireTrash() {
  $('#toast').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-undo]') || !undoFn) return;
    const fn = undoFn; undoFn = null;
    $('#toast').hidden = true;
    await fn();
    toast('Wiederhergestellt');
  });
  $('#trashBtn').addEventListener('click', () => { renderTrash(); $('#trashDlg').showModal(); });
  $('#trashBody').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) { const [store, id] = r.dataset.restore.split(':'); await restoreRec(store, id); return toast('Wiederhergestellt'); }
    const p = e.target.closest('[data-purge]');
    if (p) {
      if (!confirm('Endgültig löschen? Das lässt sich nicht rückgängig machen.')) return;
      const [store, id] = p.dataset.purge.split(':');
      await purgeRec(store, id); renderTrash(); renderSettings(); return;
    }
    if (e.target.closest('[data-purge-all]')) {
      if (!confirm(`Alle ${trashCount()} Einträge im Papierkorb endgültig löschen?`)) return;
      for (const it of [...trashItems]) await purgeItem(it.id);
      for (const o of [...trashOutfits]) await purgeOutfit(o.id);
      for (const p2 of [...trashPacks]) await purgePack(p2.id);
      renderTrash(); renderSettings(); toast('Papierkorb geleert');
    }
  });
}

/* ---------------- Wetter beim Tragen ---------------- */
const WX_TOL = 4; // ± Grad für „passt zu heute“
const wornTemps = (r) => Object.values(r.wornWx || {}).map((v) => v[0]);
function wornTempText(r) {
  const ts = wornTemps(r);
  if (!ts.length) return '';
  const lo = Math.round(Math.min(...ts)), hi = Math.round(Math.max(...ts));
  return lo === hi ? `getragen bei ${hi}°` : `getragen bei ${lo}–${hi}°`;
}
const todayMax = () => wxDay(isoDay())?.max ?? null;
const fitsToday = (r) => { const t = todayMax(); return t !== null && wornTemps(r).some((x) => Math.abs(x - t) <= WX_TOL); };
function wxSelect(cur, n) {
  const t = todayMax();
  return `<label>Wetter<select data-filter="wetter"><option value="">Alle</option>${t === null
    ? `<option value="heute" disabled${cur === 'heute' ? ' selected' : ''}>Passt zu heute (Wetter im Planer einrichten)</option>`
    : `<option value="heute"${cur === 'heute' ? ' selected' : ''}>Passt zu heute, ${Math.round(t)}° (${n})</option>`}</select></label>`;
}
/** Temperatur zu Trage-Tagen nachtragen, sobald Wetterdaten da sind (z. B. getragen, bevor der Standort eingerichtet war) */
async function backfillWornWx() {
  if (!wxData || wxData.key !== wxKey()) return;
  let n = 0;
  for (const [store, list] of [['items', items], ['outfits', outfits]]) {
    for (const r of list) {
      const missing = (r.getragen || []).filter((d) => !(r.wornWx || {})[d] && wxDay(d));
      if (!missing.length) continue;
      await patchRec(store, r.id, (x) => { x.wornWx = { ...(x.wornWx || {}) }; for (const d of missing) { const w = wxDay(d); x.wornWx[d] = [w.max, w.min]; } });
      n++;
    }
  }
  if (n) await afterChange();
}
const setWornWx = (r, day, on) => {
  const w = wxDay(day);
  const m = { ...(r.wornWx || {}) };
  if (on && w) m[day] = [w.max, w.min]; else delete m[day];
  if (Object.keys(m).length) r.wornWx = m; else delete r.wornWx;
};

/* ---------------- Outfit als Bild teilen ---------------- */
async function loadImg(pid) {
  const url = (await fullUrl(pid).catch(() => null)) || thumbUrl(pid);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try { await img.decode(); return img; } catch { return null; }
}
function drawFit(ctx, img, x, y, w, h, contain) {
  const s = contain ? Math.min(w / img.width, h / img.height) : Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 18); else ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
async function outfitImage(o) {
  const W = 1080, H = 1440, FOOT = 130, P = 28, G = 14;
  const c = document.createElement('canvas');
  c.width = W; c.height = H + FOOT;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3efe8'; ctx.fillRect(0, 0, W, H + FOOT);
  const cell = async (it, x, y, w, h) => {
    ctx.fillStyle = '#e6e0d6';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 18); else ctx.rect(x, y, w, h); ctx.fill();
    const pid = (it.photos || [])[0];
    const img = pid ? await loadImg(pid) : null;
    if (img) drawFit(ctx, img, x + (isPng(pid) ? 10 : 0), y + (isPng(pid) ? 10 : 0), w - (isPng(pid) ? 20 : 0), h - (isPng(pid) ? 20 : 0), isPng(pid));
  };
  const cover = outfitView !== 'collage' && (o.photos || [])[0];
  if (cover) {
    const img = await loadImg(cover);
    if (img) drawFit(ctx, img, P, P, W - 2 * P, H - 2 * P, true);
  } else {
    const all = sortBySlot(outfitItems(o));
    const by = { top: [], full: [], bottom: [], shoes: [], side: [] };
    for (const it of all) by[slotOf(it)].push(it);
    const rows = [['top', 4], ['full', 7], ['bottom', 4], ['shoes', 2.2]].filter(([k]) => by[k].length);
    if (rows.length >= 2) {
      const side = by.side.slice(0, 5);
      const mainW = side.length ? (W - 2 * P - G) * 0.75 : W - 2 * P;
      const sum = rows.reduce((s, r) => s + r[1], 0);
      const freeH = H - 2 * P - G * (rows.length - 1);
      let y = P;
      for (const [k, wgt] of rows) {
        const h = freeH * wgt / sum;
        const its = by[k].slice(0, 4);
        const w = (mainW - G * (its.length - 1)) / its.length;
        for (let i = 0; i < its.length; i++) await cell(its[i], P + i * (w + G), y, w, h);
        y += h + G;
      }
      if (side.length) {
        const sx = P + mainW + G, sw = W - 2 * P - mainW - G;
        const sh = Math.min((H - 2 * P - G * (side.length - 1)) / side.length, sw * 1.3);
        let sy = P + (H - 2 * P - (sh * side.length + G * (side.length - 1))) / 2;
        for (const it of side) { await cell(it, sx, sy, sw, sh); sy += sh + G; }
      }
    } else {
      const its = all.slice(0, 4);
      const iw = W - 2 * P, ih = H - 2 * P, hw = (iw - G) / 2, hh = (ih - G) / 2;
      const boxes = its.length === 1 ? [[P, P, iw, ih]]
        : its.length === 2 ? [[P, P, hw, ih], [P + hw + G, P, hw, ih]]
          : its.length === 3 ? [[P, P, hw, ih], [P + hw + G, P, hw, hh], [P + hw + G, P + hh + G, hw, hh]]
            : [[P, P, hw, hh], [P + hw + G, P, hw, hh], [P, P + hh + G, hw, hh], [P + hw + G, P + hh + G, hw, hh]];
      for (let i = 0; i < its.length; i++) await cell(its[i], ...boxes[i]);
    }
  }
  // Titel unten
  ctx.fillStyle = '#1f2a28';
  ctx.font = '600 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  let title = outfitTitle(o);
  while (ctx.measureText(title).width > W - 2 * P && title.length > 4) title = title.slice(0, -2).trimEnd() + '…';
  ctx.fillText(title, P + 6, H + FOOT / 2 - 6);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}
async function shareOutfit(id) {
  const o = outfits.find((x) => x.id === id);
  if (!o) return;
  toast('Bild wird erstellt …');
  const blob = await outfitImage(o);
  if (!blob) return toast('Bild konnte nicht erstellt werden.');
  const name = `${outfitTitle(o).replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'Outfit'}.jpg`;
  const file = new File([blob], name, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: outfitTitle(o) }); $('#toast').hidden = true; return; } catch (e) { if (e.name === 'AbortError') { $('#toast').hidden = true; return; } }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Bild heruntergeladen');
}

/* ---------------- Bilder per Drag & Drop (Laptop) ---------------- */
const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const droppedImages = (e) => [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
/** Wohin gehört ein abgelegtes Bild? Teil- oder Outfit-Editor, sonst ein neues Teil / ein neuer Wunsch */
function dropTarget() {
  if ($('#cropDlg').open || $('#photoDlg').open) return null; // während der Bildbearbeitung nicht
  if ($('#editor').open) return 'item';
  if ($('#outfitEditor').open) return 'outfit';
  if (document.querySelector('dialog[open]')) return null;
  return tab === 'items' || tab === 'wish' ? 'new' : null;
}
function wireDrop() {
  let depth = 0;
  const hint = $('#dropHint');
  const show = (on) => {
    const t = on ? dropTarget() : null;
    hint.hidden = !t;
    if (t) hint.textContent = t === 'outfit' ? 'Bilder hier ablegen – als Fotos vom Outfit' : t === 'new' ? `Bilder hier ablegen – ${tab === 'wish' ? 'neuer Wunsch' : 'neues Teil'} mit diesen Fotos` : 'Bilder hier ablegen – als Fotos dieses Teils';
    // Hinweis über dem obersten offenen Dialog anzeigen
    const top = [...document.querySelectorAll('dialog[open]')].pop();
    (top || document.body).append(hint);
  };
  document.addEventListener('dragenter', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); depth++; show(true); });
  document.addEventListener('dragleave', (e) => { if (!isFileDrag(e)) return; depth = Math.max(0, depth - 1); if (!depth) show(false); });
  document.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault(); // sonst öffnet der Browser das Bild statt es abzulegen
    e.dataTransfer.dropEffect = dropTarget() ? 'copy' : 'none';
  });
  document.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    depth = 0; show(false);
    const t = dropTarget();
    const files = droppedImages(e);
    if (!t) return;
    if (!files.length) return toast('Nur Bilddateien können abgelegt werden.');
    if (t === 'new') openEditor();
    phCtx = t === 'outfit' ? oed : ed;
    await trackPhoto(addPhotos(files));
  });
}

/* ---------------- Einstellungen ---------------- */
function renderSettings() {
  $('#trashBtn').textContent = `Papierkorb${trashCount() ? ` (${trashCount()})` : ''}`;
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
  const cols = [['Bezeichnung', 'name'], ...CAT_KEYS.map((f) => [f.label, f.key]), ...FIELDS.map((f) => [f.label, f.key]), ['Anlass', 'anlass'], ['Jahreszeit', 'jahreszeit'], ['Notiz', 'notiz'], ['Status', 'status'], ['In der Wäsche', 'waesche'], ['Getragen (Anzahl)', 'nworn'], ['Zuletzt getragen', 'lastworn'], ['Wunschliste', 'wunsch'], ['Fotos', 'photos'], ['Angelegt', 'createdAt'], ['Geändert', 'updatedAt']];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => c[0]).join(';')];
  for (const it of [...filteredItems(), ...wishes]) {
    lines.push(cols.map(([, k]) => {
      if (k === 'wunsch') return it.wunsch ? 'ja' : '';
      if (k === 'anlass' || k === 'jahreszeit' || FIELD[k]) return cell(fieldText(it, k));
      if (k === 'photos') return (it.photos || []).length;
      if (k === 'waesche') return washN(it) ? (qty(it) > 1 ? washN(it) : 'ja') : '';
      if (k === 'nworn') return wornCount(it);
      if (k === 'lastworn') return formatDate(lastWorn(it));
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
/** Wiederverwendete Dialoge immer oben beginnen (sonst bleibt die Scrollposition vom letzten Mal) */
function toTop(dlg) {
  const reset = () => dlg.querySelectorAll('.sheetbody').forEach((b) => { b.scrollTop = 0; });
  reset(); requestAnimationFrame(reset);
}
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
/** Ein anderes Gerät nutzt schon eine neuere Version: Update suchen und Hinweis zeigen */
let outdatedShown = false;
function outdatedApp() {
  if (outdatedShown) return;
  outdatedShown = true;
  swReg?.update().catch(() => {});
  showBanner('Auf einem anderen Gerät läuft eine neuere Version der App. Tippe hier, um zu aktualisieren.', () => location.reload(), true);
}
let bannerSticky = false;
/** sticky: bleibt stehen, bis man darauf tippt (Update-Hinweise) */
function showBanner(text, action, sticky = false) {
  if (bannerSticky && !sticky) return; // ein Update-Hinweis hat Vorrang
  const b = $('#banner');
  b.textContent = text;
  b.hidden = false;
  bannerAction = action;
  bannerSticky = sticky;
}
function hideBanner(force = false) {
  if (bannerSticky && !force) return;
  $('#banner').hidden = true; bannerAction = null; bannerSticky = false;
}

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
  $('#addBtn').addEventListener('click', () => (tab === 'outfits' ? openOutfitEditor() : tab === 'plan' ? openPack() : openEditor()));
  $('#detailBuy').addEventListener('click', () => buyWish(detailId));
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
  $('#detailMatch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (b) openDetail(b.dataset.item);
  });
  $('#matchAdd').addEventListener('click', () => openItemPicker(ed.passt, (next) => { ed.passt = next; renderMatchList(); }, ed.id));
  $('#matchList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unmatch]');
    if (!b) return;
    ed.passt = ed.passt.filter((x) => x !== b.dataset.unmatch);
    renderMatchList();
  });
  $('#cleanupBtn').addEventListener('click', cleanupPhotos);
  $('#detailOutfits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-outfit]');
    if (b) openOutfitDetail(b.dataset.outfit);
  });
  $('#outfitDetailItems').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) openDetail(c.dataset.id);
  });
  $('#outfitDetailEdit').addEventListener('click', () => { $('#outfitDetail').close(); openOutfitEditor(outfitDetailId); });
  $('#outfitAddItems').addEventListener('click', () => openItemPicker());
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
    if (photoTasks.size) {
      toast('Fotos werden noch verarbeitet …');
      await Promise.allSettled([...photoTasks]);
      if (!oed) return;
    }
    const id = await saveOutfit();
    $('#outfitEditor').close();
    toast('Outfit gespeichert');
    if ($('#detail').open && detailId) openDetail(detailId); // „In Outfits“ aktualisieren
    if ($('#outfitDetail').open && outfitDetailId === id) openOutfitDetail(id);
  });
  $('#outfitEditor').addEventListener('close', () => {
    if (oed) for (const p of oed.photos) if (p.isNew) URL.revokeObjectURL(p.url);
    oed = null;
  });
  for (const sel of ['#oCameraInput', '#oPhotoInput']) {
    $(sel).addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      phCtx = oed;
      await trackPhoto(addPhotos(files));
    });
  }
  $('#outfitDelete').addEventListener('click', async () => {
    const id = oed.id;
    oed = null;
    $('#outfitEditor').close();
    if ($('#outfitDetail').open) $('#outfitDetail').close();
    await deleteOutfit(id);
    if ($('#detail').open && detailId) openDetail(detailId);
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
    if (onFilterDrop(e, pick.filters)) return renderPicker();
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
    const next = [...pick.base.filter((x) => pick.selected.has(x)), ...[...pick.selected].filter((x) => !pick.base.includes(x))];
    $('#pickDlg').close();
    pick.onDone?.(next);
  });
  $('#search').addEventListener('input', render);
  $('#viewChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    if (tab === 'outfits') { outfitView = b.dataset.view; localStorage.setItem('ks_outfitview', outfitView); }
    else { itemView = b.dataset.view; localStorage.setItem('ks_itemview', itemView); }
    render();
  });
  $('#sort').addEventListener('change', () => { localStorage.setItem(sortKey(tab), $('#sort').value); render(); });
  $('#filterToggle').addEventListener('click', () => { $('#filters').hidden = !$('#filters').hidden; openDrop = null; render(); });
  document.addEventListener('click', (e) => {
    if (!openDrop || e.target.closest('.fdrop')) return;
    openDrop = null;
    if (!$('#filters').hidden) render();
    if ($('#pickDlg').open) renderPicker();
  });
  $('#filters').addEventListener('change', (e) => {
    const k = e.target.dataset.filter;
    if (!k) return;
    if (tab === 'outfits') {
      outfitFilters[k] = e.target.value;
      localStorage.setItem('ks_ofilters', JSON.stringify(outfitFilters));
      return render();
    }
    const [st, key] = tab === 'wish' ? [wishFilters, 'ks_wfilters'] : [filters, 'ks_filters'];
    setFilter(st, k, e.target.value);
    localStorage.setItem(key, JSON.stringify(st));
    render();
  });
  $('#filters').addEventListener('click', (e) => {
    if (tab !== 'outfits') {
      const [st, key] = tab === 'wish' ? [wishFilters, 'ks_wfilters'] : [filters, 'ks_filters'];
      if (onFilterDrop(e, st)) { localStorage.setItem(key, JSON.stringify(st)); return render(); }
    }
    if (!e.target.closest('[data-reset-filters]')) return;
    if (tab === 'outfits') {
      for (const k of Object.keys(outfitFilters)) delete outfitFilters[k];
      localStorage.setItem('ks_ofilters', '{}');
      return render();
    }
    const [st, key] = tab === 'wish' ? [wishFilters, 'ks_wfilters'] : [filters, 'ks_filters'];
    for (const k of Object.keys(st)) delete st[k];
    localStorage.setItem(key, '{}');
    render();
  });

  // Datum leeren, Preis beim Verlassen schön formatieren, ungültigen Preis/Link markieren
  onFields('click', (e) => {
    const st = e.target.closest('[data-step]');
    if (st) { const inp = st.parentElement.querySelector('input'); inp.value = Math.min(99, Math.max(1, (parseInt(inp.value, 10) || 1) + Number(st.dataset.step))); return; }
    const c = e.target.closest('[data-clear]');
    if (c) { $('#editForm').elements[c.dataset.clear].value = ''; }
  });
  onFields('focusout', (e) => {
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
  onFields('click', (e) => {
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
    const nv = e.target.closest('[data-newval]');
    if (nv) {
      const v = nv.dataset.newval.charAt(0).toUpperCase() + nv.dataset.newval.slice(1);
      ed.vals[optKey] = [...(ed.vals[optKey] || []), v];
      $('#optSearch').value = '';
      renderOptions();
      return;
    }
    const b = e.target.closest('.ochip');
    if (!b) return;
    const f = FIELD[optKey], v = b.dataset.val;
    if (f.type === 'multi') {
      const set = new Set(ed.vals[optKey]);
      set.has(v) ? set.delete(v) : set.add(v);
      ed.vals[optKey] = (f.custom ? optionsOf(optKey) : f.all).filter((o) => set.has(o)); // feste Reihenfolge
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
  onFields('input', (e) => {
    const m = e.target.dataset?.anteil;
    if (m === undefined || !ed) return;
    const v = e.target.value.trim();
    if (v === '') delete ed.anteile[m]; else ed.anteile[m] = Math.max(0, Math.min(100, Number(v) || 0));
    renderAnteilSum();
  });

  // Kategorie-Auswahl
  $('#katBtn').addEventListener('click', openKatPicker);
  $('#katSearch').addEventListener('input', renderKatList);
  $('#detailFields').addEventListener('click', (e) => {
    const b = e.target.closest('[data-detailinfo]');
    if (!b) return;
    const ex = b.nextElementSibling;
    ex.hidden = !ex.hidden;
    b.classList.toggle('on', !ex.hidden);
    b.setAttribute('aria-expanded', String(!ex.hidden));
  });
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
    const info = e.target.closest('.kinfo');
    if (info) {
      katInfo = katInfo === info.dataset.info ? null : info.dataset.info;
      renderKatList();
      $(`#katList .kinfo[data-info="${info.dataset.info}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('.kexpl')) return;
    const b = e.target.closest('.kleafrow');
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
    phCtx = ed;
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
  $('#bgSwatches').addEventListener('click', (e) => { const b = e.target.closest('[data-bgc]'); if (b) Crop.toggleBgColor(Number(b.dataset.bgc)); });
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
  window.addEventListener('pointerup', (e) => Crop.up(e));
  window.addEventListener('pointercancel', (e) => Crop.up(e));
  // Werkzeuge ein-/ausblenden (Farbregler, Pinsel, Zoom …) ändert den Platz fürs Bild → neu einpassen
  let relayout = 0;
  new ResizeObserver(() => {
    if (!$('#cropDlg').open || !Crop.base) return;
    cancelAnimationFrame(relayout);
    relayout = requestAnimationFrame(() => { if ($('#cropDlg').open && Crop.base && Crop.src) Crop.layout(true); });
  }).observe($('#cropStage'));
  $('#zoomSlider').addEventListener('input', (e) => Crop.setZoom(Number(e.target.value) / 100));
  $('#zoomReset').addEventListener('click', () => Crop.setZoom(1));
  // Mausrad / Touchpad: zoomen am Mauszeiger
  $('#cropStage').addEventListener('wheel', (e) => {
    if (!$('#cropDlg').open || Crop.busy) return;
    e.preventDefault();
    Crop.setZoom(Crop.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  window.addEventListener('resize', () => { if ($('#cropDlg').open) Crop.layout(); });

  $('#photoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    phCtx = ed;
    await trackPhoto(addPhotos(files));
  });
  wireDrop();
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
    const id = ed.id;
    ed = null;
    $('#editor').close();
    await deleteItem(id);
  });

  // Foto-Aktionen im Editor
  let photoIdx = -1;
  const renderPhotoTags = () => {
    const p = phCtx.photos[photoIdx];
    $('#photoTags').innerHTML = chipsHtml(allPhotoTags(p.tags), new Set(p.tags), 'ptag');
  };
  const onStrip = async (e) => {
    const img = e.target.closest('img');
    if (!img) return;
    phCtx = e.currentTarget.id === 'photoStrip' ? ed : oed;
    photoIdx = Number(img.dataset.idx);
    const p = phCtx.photos[photoIdx];
    $('#photoBig').src = p.isNew ? URL.createObjectURL(p.full) : thumbUrl(p.id);
    $('#photoCover').hidden = photoIdx === 0;
    $('#photoTagNew').value = '';
    renderPhotoTags();
    $('#photoDlg').showModal();
    if (!p.isNew) { const u = await fullUrl(p.id); if (u) $('#photoBig').src = u; }
  };
  $('#photoStrip').addEventListener('click', onStrip);
  $('#outfitPhotoStrip').addEventListener('click', onStrip);
  const toggleTag = (t) => {
    const p = phCtx.photos[photoIdx];
    p.tags = p.tags || [];
    p.tags = p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t];
    renderPhotoTags();
    renderPhotoStrip();
  };
  $('#photoTags').addEventListener('click', (e) => { const t = e.target.closest('[data-ptag]')?.dataset.ptag; if (t) toggleTag(t); });
  const addTag = () => {
    const t = $('#photoTagNew').value.trim().replace(/\s+/g, ' ').slice(0, 30);
    $('#photoTagNew').value = '';
    const p = phCtx.photos[photoIdx];
    if (t && !(p.tags || []).includes(t)) toggleTag(t);
  };
  $('#photoTagAdd').addEventListener('click', addTag);
  $('#photoTagNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
  $('#photoEdit').addEventListener('click', async () => {
    $('#photoDlg').close();
    await trackPhoto(reEditPhoto(photoIdx));
  });
  $('#photoCover').addEventListener('click', () => {
    const [p] = phCtx.photos.splice(photoIdx, 1);
    phCtx.photos.unshift(p);
    renderPhotoStrip();
    $('#photoDlg').close();
  });
  $('#photoDelete').addEventListener('click', () => {
    const [p] = phCtx.photos.splice(photoIdx, 1);
    if (p.isNew) URL.revokeObjectURL(p.url); else phCtx.removed.push(p.id);
    renderPhotoStrip();
    $('#photoDlg').close();
  });

  // Einstellungen
  // Ansichtsfenster schließen, wenn man daneben klickt (nicht bei Fenstern, in denen bearbeitet wird)
  for (const sel of ['#detail', '#outfitDetail', '#dayDlg', '#trashDlg', '#settings']) {
    const dlg = $(sel);
    let downOutside = false;
    const outside = (e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    dlg.addEventListener('pointerdown', (e) => { downOutside = e.target === dlg && outside(e); });
    dlg.addEventListener('click', (e) => { if (downOutside && e.target === dlg && outside(e)) dlg.close(); downOutside = false; });
  }
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
/** Gespeicherte Filter auf die neue Kategorie-Einteilung umstellen (Shirts, Sweatshirtjacke/-weste) */
function migrateSavedFilters() {
  for (const key of ['ks_filters', 'ks_wfilters']) {
    const f = readJson(key, null);
    if (!f || !['T-Shirts', 'Kurzarmshirts', 'Pullover und Strickjacken', 'Schmuck', 'Hoodies & Sweatshirts', 'Sonstiger Schmuck', 'Ketten', 'Piercings'].includes(f.unterkategorie)) continue;
    const kat = f.kategorie || (f.unterkategorie === 'Schmuck' ? 'Accessoires' : ['Sonstiger Schmuck', 'Ketten', 'Piercings'].includes(f.unterkategorie) ? 'Schmuck' : 'Oberteile');
    const mv = moveCat(kat, f.unterkategorie, f.typ, true);
    if (!mv) continue;
    f.kategorie = mv[0]; f.unterkategorie = mv[1]; if (f.typ) f.typ = mv[2];
    localStorage.setItem(key, JSON.stringify(f));
    if (key === 'ks_filters') Object.assign(filters, f); else Object.assign(wishFilters, f);
  }
}
async function init() {
  migrateSavedFilters();
  // Version 1.0 kannte nur OneDrive
  if (localStorage.getItem('ks_clientId') && !localStorage.getItem('ks_provider')) {
    localStorage.setItem('ks_provider', 'onedrive');
    localStorage.setItem('ks_clientId_onedrive', localStorage.getItem('ks_clientId'));
  }
  localStorage.removeItem('ks_clientId');
  buildFieldInputs();
  renderSortOptions();
  wireEvents();
  wirePlanner();
  wireWeather();
  wireTrash();
  wireValues();
  registerSW();
  $('#updateBtn').addEventListener('click', checkForUpdate);
  await DB.open();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  await loadState();
  if (await purgeOldTrash()) await loadState();
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

}
/* ---------------- App-Updates ---------------- */
let swReg = null;
/** Ist gerade etwas in Bearbeitung, das beim Neuladen verloren ginge? */
const editing = () => ['#cropDlg', '#editor', '#outfitEditor', '#packDlg'].some((sel) => $(sel)?.open) || photoTasks.size > 0;
window.addEventListener('beforeunload', (e) => {
  if (!editing()) return;
  e.preventDefault();
  e.returnValue = ''; // Browser fragt „Seite verlassen?“
});
async function registerSW() {
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  } catch (e) { console.warn('SW', e); return; }
  // Erste Installation übernimmt nur die Kontrolle – erst ein späterer Wechsel ist ein Update
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; staleCheck(); return; }
    reloadForUpdate();
  });
  // Regelmäßig nachsehen: beim Zurückkehren in die App und stündlich
  const check = () => { staleCheck(); swReg?.update().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  staleCheck();
  setInterval(check, 60 * 60 * 1000);
}
/** Neue Version ist aktiv: Seite neu laden – sofort, oder sobald keine Bearbeitung mehr offen ist */
let reloadTimer = null;
function reloadForUpdate() {
  if (reloadTimer) return;
  const tryReload = () => {
    if (editing() || syncing) return false;
    clearInterval(reloadTimer);
    location.reload();
    return true;
  };
  reloadTimer = setInterval(tryReload, 1500);
  if (!tryReload()) showBanner('Eine neue Version der App ist da. Sie wird geladen, sobald du fertig bist – oder tippe hier.', () => location.reload(), true);
}
/** Läuft hier noch eine alte Version, obwohl der Service Worker schon eine neuere hat? (z. B. Update im Hintergrund) */
async function staleCheck() {
  try {
    if (!navigator.serviceWorker?.controller) return;
    const keys = (await caches.keys()).filter((k) => /^ks-\d+\.\d+\.\d+$/.test(k));
    if (!keys.length || keys.includes(`ks-${APP_VERSION}`)) return;
    const target = keys.sort().pop();
    // Nur einmal pro Zielversion versuchen – verhindert eine Neulade-Schleife
    if (sessionStorage.getItem('ks_reloaded_for') === target) return;
    sessionStorage.setItem('ks_reloaded_for', target);
    reloadForUpdate();
  } catch { /* egal */ }
}
/** Einstellungen: Fotodateien löschen, die kein Teil, Wunsch, Outfit oder Papierkorb-Eintrag mehr verwendet.
 *  Sicherheitsnetze: vorher synchronisieren, nur ohne offene Änderungen, nur wenn alle Cloud-Einträge lokal bekannt sind,
 *  und nur Dateien, die älter als ein Tag sind (ein anderes Gerät lädt Fotos vor dem zugehörigen Teil hoch). */
const fileBase = (name) => name.replace(/\.[a-z0-9]+$/i, '').replace(/_[to]$/, '');
async function cleanupPhotos() {
  const out = $('#cleanupInfo');
  const btn = $('#cleanupBtn');
  btn.disabled = true;
  try {
    const used = async () => {
      const recs = [...await DB.all('items'), ...await DB.all('outfits')].filter((i) => !i._deleted);
      const set = new Set(recs.flatMap((i) => i.photos || []).map((pid) => fileBase(pid)));
      for (const p of await DB.all('photos')) if (p.pendingUpload) set.add(fileBase(p.id));
      return set;
    };
    // Lokale Kopien ohne Verwendung
    let local = 0;
    const ref = await used();
    for (const p of await DB.all('photos')) {
      if (!ref.has(fileBase(p.id)) && !p.pendingUpload && !p.pendingDelete) { await DB.del('photos', p.id); dropUrls(p.id); local++; }
    }
    if (!Auth.signedIn() || !navigator.onLine) {
      out.textContent = `${local} lokale Fotos entfernt.${Auth.signedIn() ? ' Für die Cloud bitte online gehen.' : ''}`;
      return;
    }
    out.textContent = 'Synchronisiere …';
    while (syncing) await sleep(300);
    await sync();
    await recountPending();
    if (countPending()) { out.textContent = 'Es gibt noch nicht hochgeladene Änderungen – bitte erst synchronisieren.'; return; }
    out.textContent = 'Prüfe Cloud …';
    const S = Store();
    for (const store of ['items', 'outfits']) {
      const localIds = new Set((await DB.all(store)).map((i) => i.id));
      const missing = (await S.list(store)).filter((f) => f.name.endsWith('.json') && !localIds.has(f.name.slice(0, -5)));
      if (missing.length) { out.textContent = 'Nicht alle Einträge aus der Cloud sind auf diesem Gerät – bitte erneut synchronisieren.'; return; }
    }
    const keep = await used();
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const when = (m) => Date.parse(m?.server_modified || m?.lastModifiedDateTime || m?.client_modified || '') || 0;
    const files = (await S.list('fotos')).filter((f) => !keep.has(fileBase(f.name)) && when(f.meta) < dayAgo);
    if (!files.length) { out.textContent = `Keine unbenutzten Fotos in der Cloud${local ? ` (${local} lokale entfernt)` : ''}.`; return; }
    const mb = files.reduce((a, f) => a + (f.meta?.size || 0), 0) / 1048576;
    if (!confirm(`${files.length} Fotodateien (${mb.toFixed(1)} MB) werden von keinem Teil, Wunsch, Outfit und keinem Eintrag im Papierkorb verwendet.\n\nEndgültig aus der Cloud löschen?`)) { out.textContent = ''; return; }
    let n = 0;
    for (const f of files) { await S.del(`fotos/${f.name}`); out.textContent = `Lösche … ${++n}/${files.length}`; }
    out.textContent = `${files.length} unbenutzte Fotodateien (${mb.toFixed(1)} MB) gelöscht.`;
  } catch (e) {
    out.textContent = 'Aufräumen fehlgeschlagen: ' + e.message;
  } finally { btn.disabled = false; }
}
/* ---------------- Eigene Einträge verwalten (Anlässe, Materialien, Marken, Lagerorte) ---------------- */
const VALUE_KINDS = [
  { key: 'anlass', label: 'Anlässe', one: 'Anlass', builtin: ANLASS_DEFAULTS, outfits: true },
  { key: 'materialien', label: 'Materialien', one: 'Material', builtin: MATERIALIEN },
  { key: 'marke', label: 'Marken', one: 'Marke', builtin: [] },
  { key: 'lagerort', label: 'Lagerorte', one: 'Lagerort', builtin: [] },
];
let valueKind = 'anlass';
function renderValues() {
  const kind = VALUE_KINDS.find((k) => k.key === valueKind);
  $('#valueKinds').innerHTML = VALUE_KINDS.map((k) => `<button type="button" class="chipbtn${k.key === valueKind ? ' active' : ''}" data-kind="${k.key}">${esc(k.label)}</button>`).join('');
  const count = new Map();
  const pools = [items, wishes, trashItems, ...(kind.outfits ? [outfits, trashOutfits] : [])];
  for (const pool of pools) for (const [v, n] of valuesFor(kind.key, pool)) count.set(v, (count.get(v) || 0) + n);
  const own = [...count.keys()].filter((v) => !kind.builtin.includes(v)).sort((a, b) => a.localeCompare(b, 'de'));
  $('#valueList').innerHTML = own.length ? own.map((v) => `<div class="orow vrow"><span><b>${esc(v)}</b><small>${count.get(v)} × verwendet</small></span>
      <button type="button" class="chipbtn" data-vrename="${esc(v)}">Umbenennen</button>
      <button type="button" class="x" data-vdelete="${esc(v)}" aria-label="${esc(v)} löschen">✕</button></div>`).join('')
    : `<p class="muted">Keine selbst angelegten ${esc(kind.label)}.</p>`;
}
/** Wert überall umbenennen (to = '' löscht ihn) – in Teilen, Wünschen, Papierkorb und (bei Anlässen) Outfits */
async function renameValueEverywhere(key, from, to) {
  const now = new Date().toISOString();
  let n = 0;
  for (const store of key === 'anlass' ? ['items', 'outfits'] : ['items']) {
    for (const rec of await DB.all(store)) {
      if (rec._deleted) continue;
      let upd = null;
      if (Array.isArray(rec[key])) upd = renamedMulti(rec, key, from, to);
      else if (rec[key] === from) upd = { [key]: to };
      if (!upd) continue;
      await DB.put(store, { ...rec, ...upd, updatedAt: now, _dirty: true });
      n++;
    }
  }
  // Gespeicherte Filter mitziehen
  for (const [fs, lsKey] of [[filters, 'ks_filters'], [wishFilters, 'ks_wfilters'], [outfitFilters, 'ks_ofilters']]) {
    if (fs[key] !== from) continue;
    if (to) fs[key] = to; else delete fs[key];
    localStorage.setItem(lsKey, JSON.stringify(fs));
  }
  await loadState();
  render();
  scheduleSync();
  return n;
}
function wireValues() {
  $('#valuesBtn').addEventListener('click', () => { renderValues(); $('#valuesDlg').showModal(); });
  $('#valuesDlg').addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) { valueKind = k.dataset.kind; return renderValues(); }
    const kind = VALUE_KINDS.find((x) => x.key === valueKind);
    const r = e.target.closest('[data-vrename]');
    if (r) {
      const from = r.dataset.vrename;
      const to = (prompt(`${kind.one} umbenennen:`, from) || '').trim();
      if (!to || to === from) return;
      const n = await renameValueEverywhere(kind.key, from, to);
      renderValues();
      return toast(`„${from}“ → „${to}“ bei ${n} ${n === 1 ? 'Eintrag' : 'Einträgen'} geändert`);
    }
    const d = e.target.closest('[data-vdelete]');
    if (d) {
      const from = d.dataset.vdelete;
      if (!confirm(`„${from}“ bei allen Teilen${kind.outfits ? ' und Outfits' : ''} entfernen?`)) return;
      const n = await renameValueEverywhere(kind.key, from, '');
      renderValues();
      return toast(`„${from}“ bei ${n} ${n === 1 ? 'Eintrag' : 'Einträgen'} entfernt`);
    }
  });
}
/** Einstellungen: von Hand nach einer neuen Version suchen */
async function checkForUpdate() {
  const out = $('#updateInfo');
  out.textContent = 'Suche …';
  try {
    const txt = await (await fetch(`sw.js?t=${Date.now()}`, { cache: 'no-store' })).text();
    const server = (txt.match(/VERSION = 'ks-([\d.]+)'/) || [])[1];
    if (!server) throw new Error('keine Versionsangabe');
    if (server === APP_VERSION) { out.textContent = `Du hast die neueste Version (${APP_VERSION}).`; return; }
    out.textContent = `Version ${server} gefunden – wird geladen …`;
    await swReg?.update();
    // Falls der Service Worker hängt: Cache der App-Dateien leeren und neu laden (Daten bleiben erhalten)
    setTimeout(async () => {
      for (const k of await caches.keys()) if (k.startsWith('ks-') && k !== 'ks-ml-1') await caches.delete(k);
      location.reload();
    }, 4000);
  } catch (e) {
    out.textContent = `Prüfen nicht möglich (${navigator.onLine ? e.message : 'offline'}).`;
  }
}

init().catch((e) => { console.error(e); toast('Fehler beim Start: ' + e.message); });
