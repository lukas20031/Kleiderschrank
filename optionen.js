'use strict';
/* Feste Auswahlwerte. Reihenfolge = Anzeigereihenfolge. */

// Farben (übernommen aus Whering) – Farbtöne aus den Screenshots ausgelesen
const FARBEN = [
  // nach dem Regenbogen: Rot, Orange, Gelb, Grün, Blau, Violett, Rosa – danach Neutrale und Besondere
  ['Rot', '#ea3323'], ['Korallenrot', '#ed6b6d'], ['Bordeaux', '#70142d'],
  ['Neonorange', '#ed6b2d'], ['Orange', '#f1a93b'],
  ['Senfgelb', '#d8af3b'], ['Gelb', '#ffff54'], ['Neongelb', '#ffff54'], ['Hellgelb', '#fff7b6'], ['Khaki', '#ede696'],
  ['Neongrün', '#76fb4c'], ['Hellgrün', '#bff9bc'], ['Grün', '#377e22'], ['Olivgrün', '#6b6f3a'], ['Smaragdgrün', '#367b5c'],
  ['Türkis', '#68d2c8'], ['Neonblau', '#75fbfe'],
  ['Himmelblau', '#b9e2f8'], ['Blau', '#0000f4'],
  ['Jeansblau', 'repeating-linear-gradient(45deg,#7f9cbf 0 2px,#6d8bb0 2px 4px)'], ['Dunkelblau', '#00007a'],
  ['Lavendel', '#e7e6f8'], ['Violett', '#922ce7'],
  ['Pink', '#eb33f7'], ['Knallrosa', '#ee73b2'], ['Rosa', '#e79dac'], ['Hellrosa', '#f6cdd3'],
  ['Weiß', '#ffffff'], ['Ecru', '#f6f3e4'], ['Beige', '#e6dbc7'], ['Hellbraun', '#b8865b'], ['Braun', '#8c4f19'], ['Grau', '#808080'], ['Schwarz', '#000000'],
  ['Schwarzes Denim', 'repeating-linear-gradient(45deg,#2b2b2b 0 2px,#121212 2px 4px)'],
  ['Gold', 'linear-gradient(120deg,#f2f197,#c9a23a 55%,#f0e08a)'],
  ['Silber', 'linear-gradient(120deg,#f2f2f2,#9a9a9a 55%,#e0e0e0)'],
  ['Kupferrot', 'linear-gradient(120deg,#c98a60,#8a4a28 55%,#c17752)'],
  ['Mehrfarbig', 'conic-gradient(#ee8da4,#f3d37a,#a6e3b0,#9cc9f0,#c9a6ea,#ee8da4)'],
  ['Transparent', 'linear-gradient(135deg,#f4f4f4 42%,#a9a9a9 47%,#a9a9a9 53%,#f4f4f4 58%)'],
];

// Materialien (übernommen aus Whering)
const MATERIALIEN = [
  'Alpaka', 'Aluminium', 'Bambus', 'Baumwolle', 'Bouclé', 'Bronze', 'Canvas', 'Chiffon', 'Cord', 'Crêpe',
  'Denim', 'Diamant', 'Edelstahl', 'Edelstein', 'Eisen', 'Elasthan', 'Fell', 'Glas', 'Gold', 'Gummi', 'Hanf', 'Holz',
  'Häkelstrick', 'Kaschmir', 'Keramik', 'Kobalt', 'Kunstfell', 'Kupfer', 'Lackleder', 'Leder', 'Leinen', 'Lycra',
  'Lyocell', 'Mesh', 'Messing', 'Metall', 'Modal', 'Neopren', 'Nylon', 'Pailletten', 'Perle', 'Plastik', 'Polyacryl (Acryl)', 'Polyamid',
  'Polyester', 'Polyurethan', 'Rayon', 'Samt', 'Satin', 'Schurwolle', 'Seide', 'Silber', 'Smaragd', 'Spandex', 'Spitze',
  'Strick', 'Stroh', 'Synthetik', 'Teddy', 'Tencel', 'Titan', 'Tweed', 'Tüll', 'Veganes Leder', 'Vergoldet', 'Versilbert', 'Viskose',
  'Wildleder', 'Wolle', 'Zink',
];

// Größen – je Gruppe von klein nach groß
const jeansGroessen = [];
for (let w = 26; w <= 40; w++) for (const l of [30, 32, 34, 36]) jeansGroessen.push(`W${w}/L${l}`);
const schuhGroessen = [];
for (let s = 35; s <= 48; s += 0.5) schuhGroessen.push(String(s).replace('.', ','));
const GROESSEN = [
  ['Allgemein', ['Einheitsgröße']],
  ['Buchstaben', ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']],
  ['Konfektionsgröße', Array.from({ length: 16 }, (_, i) => String(32 + i * 2))],
  ['Jeans (Weite/Länge)', jeansGroessen],
  ['Schuhe (EU)', schuhGroessen],
];

// Zustand – von bester zu schlechtester Qualität
const ZUSTAENDE = ['Neu mit Etikett', 'Neu', 'Wie neu', 'Sehr gut', 'Gut', 'Getragen', 'Stark getragen', 'Flecken/Löcher', 'Reparaturbedürftig'];

/* Waschhinweise (Pflegesymbole), gruppiert. Symbole als kleine SVGs (24×26, Strichstärke 1.6, currentColor). */
const PFLEGE = [
  ['Waschen & Schleudern', ['Nicht waschen', 'Handwäsche', 'Waschen bis 30 °C', 'Waschen bis 40 °C', 'Waschen bis 60 °C', 'Waschen bis 95 °C', 'Nicht schleudern', 'Schonend schleudern', 'Max. schleudern']],
  ['Trocknen', ['Nicht in den Trockner', 'Liegend trocknen', 'Schonend trocknen', 'Normal trocknen', 'Heiß trocknen']],
  ['Bügeln', ['Nicht bügeln', 'Nicht mit Dampf bügeln', 'Bügeln bei 110 °C', 'Bügeln bei 150 °C', 'Bügeln bei 200 °C']],
  ['Chemische Reinigung', ['Nicht chemisch reinigen', 'Reinigung mit Perchlorethylen (P)', 'Reinigung mit Kohlenwasserstoff (F)']],
  ['Bleichen', ['Nicht bleichen', 'Ohne Chlor bleichen', 'Bleichen erlaubt']],
];
const PFLEGE_ICON = (() => {
  const tub = 'M3 9 q1.5-2 3 0 t3 0 t3 0 t3 0 t3 0 t3 0 M3.4 9 L5.5 20 H18.5 L20.6 9';
  const x = (a, b, c, d) => `<path d="M${a} ${b} L${c} ${d} M${c} ${b} L${a} ${d}"/>`;
  const txt = (t, y = 17.5) => `<text x="12" y="${y}" text-anchor="middle" font-size="6.5" font-weight="700" stroke="none" fill="currentColor" font-family="system-ui,sans-serif">${t}</text>`;
  const dots = (n, y, gap = 3) => Array.from({ length: n }, (_, i) => `<circle cx="${12 + (i - (n - 1) / 2) * gap}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`).join('');
  const bars = (n) => Array.from({ length: n }, (_, i) => `<path d="M5 ${22.5 + i * 2.3} H19"/>`).join('');
  const sq = '<rect x="3.5" y="4" width="17" height="17" rx="1"/>';
  const iron = '<path d="M2.5 19 C3.5 14 7 12 12 12 H21 V19 Z M9 12 V9.5 Q9 8 10.5 8 H21 V12"/>';
  const tri = '<path d="M12 3.5 L21.5 21 H2.5 Z"/>';
  const circ = '<circle cx="12" cy="12.5" r="8.5"/>';
  const ic = {
    'Nicht waschen': `<path d="${tub}"/>${x(3, 5, 21, 23)}`,
    'Handwäsche': `<path d="${tub}"/><path d="M8.5 19 V14 M10.5 18.5 V12 M12.5 18.5 V12 M14.5 18.5 V13 M8.5 14 Q8.5 12.5 10 13.5 M14.5 15 L16.5 13.5"/>`,
    'Waschen bis 30 °C': `<path d="${tub}"/>${txt('30')}`,
    'Waschen bis 40 °C': `<path d="${tub}"/>${txt('40')}`,
    'Waschen bis 60 °C': `<path d="${tub}"/>${txt('60')}`,
    'Waschen bis 95 °C': `<path d="${tub}"/>${txt('95')}`,
    'Nicht schleudern': `<path d="${tub}"/>${bars(2)}`,
    'Schonend schleudern': `<path d="${tub}"/>${bars(1)}`,
    'Max. schleudern': `<path d="${tub}"/>`,
    'Nicht in den Trockner': `${sq}<circle cx="12" cy="12.5" r="6.5"/>${x(3.5, 4, 20.5, 21)}`,
    'Liegend trocknen': `${sq}<path d="M8 12.5 H16"/>`,
    'Schonend trocknen': `${sq}<circle cx="12" cy="12.5" r="6.5"/>${dots(1, 12.5)}`,
    'Normal trocknen': `${sq}<circle cx="12" cy="12.5" r="6.5"/>${dots(2, 12.5)}`,
    'Heiß trocknen': `${sq}<circle cx="12" cy="12.5" r="6.5"/>${dots(3, 12.5)}`,
    'Nicht bügeln': `${iron}${x(4, 5, 20, 22)}`,
    'Nicht mit Dampf bügeln': `${iron}<path d="M8 21 L12 25 M12 21 L8 25 M13 21 L17 25 M17 21 L13 25"/>`,
    'Bügeln bei 110 °C': `${iron}${dots(1, 16, 3)}`,
    'Bügeln bei 150 °C': `${iron}${dots(2, 16, 3)}`,
    'Bügeln bei 200 °C': `${iron}${dots(3, 16, 3)}`,
    'Nicht chemisch reinigen': `${circ}${x(4.5, 5, 19.5, 20)}`,
    'Reinigung mit Perchlorethylen (P)': `${circ}${txt('P', 15.5).replace('font-size="6.5"', 'font-size="9"')}`,
    'Reinigung mit Kohlenwasserstoff (F)': `${circ}${txt('F', 15.5).replace('font-size="6.5"', 'font-size="9"')}`,
    'Nicht bleichen': `${tri}${x(5, 6, 19, 22)}`,
    'Ohne Chlor bleichen': `${tri}<path d="M10 21 L15 11.5 M13.5 21 L17.2 14"/>`,
    'Bleichen erlaubt': tri,
  };
  return Object.fromEntries(Object.entries(ic).map(([k, v]) => [k,
    `<svg class="careicon" viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${v}</svg>`]));
})();

/* Alle Länder (ISO 3166-1) – deutsche Namen über Intl, sortiert */
const LAENDER = (() => {
  const codes = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'.split(' ');
  let dn = null;
  try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { /* alter Browser */ }
  return codes.map((c) => (dn ? dn.of(c) : c)).filter((n) => n && n.length > 2).sort((a, b) => a.localeCompare(b, 'de'));
})();
