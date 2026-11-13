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
  ['Waschtemperatur', ['Nicht waschen', 'Handwäsche', 'Auf links drehen', 'Waschen bis 30 °C', 'Waschen bis 40 °C', 'Waschen bis 60 °C', 'Waschen bis 95 °C',
    'Niedrige Waschtemperatur', 'Normale Waschtemperatur', 'Hohe Waschtemperatur']],
  ['Schleudern', ['Nicht schleudern', 'Schonend schleudern', 'Max. schleudern']],
  ['Trocknen', ['Nicht in den Trockner', 'Trockner geeignet', 'Schonender Trockengang', 'Sehr schonender Trockengang', 'Schonend trocknen', 'Normal trocknen', 'Heiß trocknen',
    'Trocknen ohne Hitze', 'Nicht wringen', 'Liegend trocknen', 'Hängend trocknen', 'Im Schatten trocknen', 'Tropfnass trocknen']],
  ['Bügeln', ['Bügeln', 'Nicht bügeln', 'Nicht mit Dampf bügeln', 'Bügeln bei 110 °C', 'Bügeln bei 150 °C', 'Bügeln bei 200 °C']],
  ['Chemische Reinigung', ['Nicht chemisch reinigen', 'Reinigung mit Perchlorethylen (P)', 'Reinigung mit Kohlenwasserstoff (F)']],
  ['Bleichen', ['Nicht bleichen', 'Ohne Chlor bleichen', 'Bleichen erlaubt']],
];
/* Ausführlichere Erklärungen (hinter dem „?“) */
const PFLEGE_INFO = {
  'Nicht waschen': 'Das Teil darf weder in der Maschine noch von Hand gewaschen werden – meist ist nur chemische Reinigung möglich.',
  'Handwäsche': 'Nur von Hand waschen, höchstens ca. 40 °C. Nicht reiben oder wringen, sondern sanft drücken; manche Maschinen haben ein Handwäsche-Programm.',
  'Auf links drehen': 'Vor dem Waschen auf die Innenseite drehen. Schützt Drucke, Farben und die Oberfläche vor Abrieb und Pilling.',
  'Waschen bis 30 °C': 'Maschinenwäsche bei höchstens 30 °C.',
  'Waschen bis 40 °C': 'Maschinenwäsche bei höchstens 40 °C – die häufigste Angabe für Alltagskleidung.',
  'Waschen bis 60 °C': 'Maschinenwäsche bei höchstens 60 °C, z. B. für Bettwäsche, Handtücher oder Unterwäsche.',
  'Waschen bis 95 °C': 'Kochwäsche bis 95 °C, nur für sehr robuste Baumwolle oder Leinen.',
  'Niedrige Waschtemperatur': 'Symbol mit einem Punkt: niedrige Temperatur, entspricht etwa 30 °C.',
  'Normale Waschtemperatur': 'Symbol mit zwei Punkten: mittlere Temperatur, etwa 40 °C.',
  'Hohe Waschtemperatur': 'Symbol mit drei (oder mehr) Punkten: hohe Temperatur, ab etwa 50–60 °C.',
  'Nicht schleudern': 'Zwei Balken unter dem Bottich: sehr schonend waschen, möglichst nicht oder nur ganz kurz schleudern (Wollprogramm).',
  'Schonend schleudern': 'Ein Balken unter dem Bottich: Schonwaschgang mit reduzierter Trommelbewegung und niedriger Schleuderdrehzahl (Pflegeleicht-Programm).',
  'Max. schleudern': 'Bottich ohne Balken: normaler Waschgang, Schleudern mit voller Drehzahl ist möglich.',
  'Nicht in den Trockner': 'Darf nicht in den Wäschetrockner – an der Luft trocknen.',
  'Trockner geeignet': 'Darf in den Wäschetrockner; zur Temperatur gibt es keine Einschränkung.',
  'Schonender Trockengang': 'Ein Balken unter dem Kreis: im Trockner mit Schonprogramm trocknen.',
  'Sehr schonender Trockengang': 'Zwei Balken unter dem Kreis: im Trockner nur mit sehr schonendem Programm trocknen.',
  'Schonend trocknen': 'Ein Punkt im Kreis: Trockner mit niedriger Temperatur (Schonprogramm, ca. 60 °C).',
  'Normal trocknen': 'Zwei Punkte im Kreis: Trockner mit normaler Temperatur (ca. 80 °C).',
  'Heiß trocknen': 'Drei Punkte im Kreis: Trockner mit hoher Temperatur.',
  'Trocknen ohne Hitze': 'Ausgefüllter Kreis: im Trockner nur ohne Wärme (Kaltluft/Lüften).',
  'Nicht wringen': 'Nicht auswringen oder verdrehen, sonst verzieht sich das Teil – Wasser lieber vorsichtig ausdrücken.',
  'Liegend trocknen': 'Flach ausgebreitet trocknen, z. B. auf einem Handtuch – typisch für Strick und Wolle, damit nichts ausleiert.',
  'Hängend trocknen': 'Auf der Leine oder einem Bügel hängend trocknen.',
  'Im Schatten trocknen': 'Nicht in der direkten Sonne trocknen, damit die Farben nicht ausbleichen.',
  'Tropfnass trocknen': 'Ohne Schleudern und Auswringen tropfnass aufhängen; glättet sich dabei von selbst.',
  'Bügeln': 'Darf gebügelt werden; zur Temperatur gibt es keine Einschränkung.',
  'Nicht bügeln': 'Nicht bügeln und nicht dämpfen.',
  'Nicht mit Dampf bügeln': 'Bügeln ist erlaubt, aber ohne Dampf – Dampf kann Flecken oder Glanzstellen erzeugen.',
  'Bügeln bei 110 °C': 'Ein Punkt: niedrige Bügeltemperatur (max. 110 °C), z. B. für Synthetik, Acryl oder Seide.',
  'Bügeln bei 150 °C': 'Zwei Punkte: mittlere Bügeltemperatur (max. 150 °C), z. B. für Wolle, Polyester oder Viskose.',
  'Bügeln bei 200 °C': 'Drei Punkte: hohe Bügeltemperatur (max. 200 °C), z. B. für Baumwolle und Leinen.',
  'Nicht chemisch reinigen': 'Darf nicht in die chemische Reinigung.',
  'Reinigung mit Perchlorethylen (P)': 'Professionelle chemische Reinigung mit Perchlorethylen und den üblichen Lösemitteln möglich.',
  'Reinigung mit Kohlenwasserstoff (F)': 'Professionelle Reinigung nur mit schonenden Kohlenwasserstoff-Lösemitteln.',
  'Nicht bleichen': 'Kein Bleichmittel verwenden – auch keine Waschmittel mit Bleiche (z. B. viele Vollwaschmittel bei bunter Wäsche).',
  'Ohne Chlor bleichen': 'Nur sauerstoffbasierte Bleichmittel, kein Chlor.',
  'Bleichen erlaubt': 'Jedes Bleichmittel ist erlaubt, auch Chlorbleiche.',
};
const PFLEGE_ICON = (() => {
  const tub = 'M3 9 q1.5-2 3 0 t3 0 t3 0 t3 0 t3 0 t3 0 M3.4 9 L5.5 20 H18.5 L20.6 9';
  const x = (a, b, c, d) => `<path d="M${a} ${b} L${c} ${d} M${c} ${b} L${a} ${d}"/>`;
  const txt = (t, y = 17.5, size = 6.5) => `<text x="12" y="${y}" text-anchor="middle" font-size="${size}" font-weight="700" stroke="none" fill="currentColor" font-family="system-ui,sans-serif">${t}</text>`;
  const dots = (n, y, gap = 3, cx = 12) => Array.from({ length: n }, (_, i) => `<circle cx="${cx + (i - (n - 1) / 2) * gap}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`).join('');
  const bars = (n, y0 = 22.5, x1 = 5, x2 = 19) => Array.from({ length: n }, (_, i) => `<path d="M${x1} ${y0 + i * 2.3} H${x2}"/>`).join('');
  const sq = '<rect x="3.5" y="4" width="17" height="17" rx="1"/>';
  const ring = '<circle cx="12" cy="12.5" r="6.5"/>';
  const iron = '<path d="M2.5 19 C3.5 14 7 12 12 12 H21 V19 Z M9 12 V9.5 Q9 8 10.5 8 H21 V12"/>';
  const tri = '<path d="M12 3.5 L21.5 21 H2.5 Z"/>';
  const circ = '<circle cx="12" cy="12.5" r="8.5"/>';
  // Hand, die von rechts oben ins Wasser greift
  const hand = '<g transform="translate(15 2.5) rotate(38)"><path d="M-3.6 -3 V6.8 Q-3.6 10.6 0 10.6 Q3.6 10.6 3.6 6.8 V3.2 L5.8 1 Q6.6 0 5.8 -0.7 Q5 -1.2 4.3 -0.4 L3.6 0.4 V-3 M-1.2 10.4 V6.6 M1.2 10.4 V6.6"/></g>';
  const ic = {
    'Nicht waschen': `<path d="${tub}"/>${x(3, 5, 21, 23)}`,
    'Handwäsche': `<path d="M3 9 q1.5-2 3 0 t3 0 M3.4 9 L5.5 20 H18.5 L20.6 9"/>${hand}`,
    'Auf links drehen': '<path d="M8 4 L3.5 6.5 L5 10.5 L7 9.8 V21 H17 V9.8 L19 10.5 L20.5 6.5 L16 4 Q12 6.5 8 4 Z"/><path d="M9.2 14.5 A3.2 3.2 0 1 0 12 11.3"/><path d="M10.4 9.8 L12.2 11.3 L10.6 13"/>',
    'Waschen bis 30 °C': `<path d="${tub}"/>${txt('30')}`,
    'Waschen bis 40 °C': `<path d="${tub}"/>${txt('40')}`,
    'Waschen bis 60 °C': `<path d="${tub}"/>${txt('60')}`,
    'Waschen bis 95 °C': `<path d="${tub}"/>${txt('95')}`,
    'Niedrige Waschtemperatur': `<path d="${tub}"/>${dots(1, 15.5)}`,
    'Normale Waschtemperatur': `<path d="${tub}"/>${dots(2, 15.5)}`,
    'Hohe Waschtemperatur': `<path d="${tub}"/>${dots(3, 15.5)}`,
    'Nicht schleudern': `<path d="${tub}"/>${bars(2)}`,
    'Schonend schleudern': `<path d="${tub}"/>${bars(1)}`,
    'Max. schleudern': `<path d="${tub}"/>`,
    'Nicht in den Trockner': `${sq}${ring}${x(3.5, 4, 20.5, 21)}`,
    'Trockner geeignet': `${sq}${ring}`,
    'Schonender Trockengang': `${sq}${ring}${bars(1, 23.5, 4, 20)}`,
    'Sehr schonender Trockengang': `${sq}${ring}${bars(2, 23.5, 4, 20)}`,
    'Schonend trocknen': `${sq}${ring}${dots(1, 12.5)}`,
    'Normal trocknen': `${sq}${ring}${dots(2, 12.5)}`,
    'Heiß trocknen': `${sq}${ring}${dots(3, 12.5)}`,
    'Trocknen ohne Hitze': `${sq}<circle cx="12" cy="12.5" r="6.5" fill="currentColor"/>`,
    'Nicht wringen': '<path d="M2.5 10.5 Q7 7.5 12 12.5 Q17 17.5 21.5 14.5 M2.5 14.5 Q7 17.5 12 12.5 Q17 7.5 21.5 10.5 M2.5 10.5 V14.5 M21.5 10.5 V14.5"/><path d="M7 5 L17 20 M17 5 L7 20"/>',
    'Liegend trocknen': `${sq}<path d="M8 12.5 H16"/>`,
    'Hängend trocknen': `${sq}<path d="M6 4.3 Q12 11 18 4.3"/>`,
    'Im Schatten trocknen': `${sq}<path d="M3.8 9.5 L9 4.3 M3.8 13.5 L13 4.3"/>`,
    'Tropfnass trocknen': `${sq}<path d="M9 8 V17 M12 8 V17 M15 8 V17"/>`,
    'Bügeln': iron,
    'Nicht bügeln': `${iron}${x(4, 5, 20, 22)}`,
    'Nicht mit Dampf bügeln': `${iron}<path d="M8 21 L12 25 M12 21 L8 25 M13 21 L17 25 M17 21 L13 25"/>`,
    'Bügeln bei 110 °C': `${iron}${dots(1, 16, 3, 13)}`,
    'Bügeln bei 150 °C': `${iron}${dots(2, 16, 3, 13)}`,
    'Bügeln bei 200 °C': `${iron}${dots(3, 16, 3, 13)}`,
    'Nicht chemisch reinigen': `${circ}${x(4.5, 5, 19.5, 20)}`,
    'Reinigung mit Perchlorethylen (P)': `${circ}${txt('P', 15.7, 9)}`,
    'Reinigung mit Kohlenwasserstoff (F)': `${circ}${txt('F', 15.7, 9)}`,
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
