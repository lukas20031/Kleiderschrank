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
  'Daunen', 'Denim', 'Diamant', 'Edelstahl', 'Edelstein', 'Eisen', 'Elasthan', 'Federn', 'Fell', 'Glas', 'Gold', 'Gummi', 'Hanf', 'Holz',
  'Häkelstrick', 'Kaschmir', 'Keramik', 'Kobalt', 'Kunstfell', 'Kupfer', 'Lackleder', 'Leder', 'Leinen', 'Lycra',
  'Lyocell', 'Mesh', 'Messing', 'Metall', 'Modal', 'Neopren', 'Nylon', 'Pailletten', 'Perle', 'Plastik', 'Polyacryl (Acryl)', 'Polyamid',
  'Polyester', 'Polyurethan', 'Rayon', 'Samt', 'Satin', 'Schurwolle', 'Seide', 'Silber', 'Smaragd', 'Spandex', 'Spitze',
  'Strick', 'Stroh', 'Synthetik', 'Teddy', 'Tencel', 'Titan', 'Tweed', 'Tüll', 'Veganes Leder', 'Vergoldet', 'Versilbert', 'Viskose',
  'Wildleder', 'Wolle', 'Zink',
];

// Größen – je Gruppe von klein nach groß. Der Teil vor „ – “ ist die Größenart (siehe GROESSEN_JE_KATEGORIE).
const schuhGroessen = [];
for (let s = 35; s <= 48; s += 0.5) schuhGroessen.push(String(s).replace('.', ','));
const hosenGroessen = []; // je Weite eine Gruppe mit den Längen
for (let w = 26; w <= 40; w++) hosenGroessen.push([`Hose – Weite ${w}`, [28, 30, 32, 34, 36].map((l) => `W${w}/L${l}`)]);
const bhGroessen = []; // EU: Unterbrustweite (cm) + Cup, je Unterbrustweite eine Gruppe
for (let u = 60; u <= 110; u += 5) bhGroessen.push([`BH – Unterbrust ${u}`, ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => `${u}${c}`)]);
// Ringgröße (DE) = Innenumfang in mm; „Ring 54“, damit sie sich nicht mit Konfektionsgrößen vermischt
const ringGroessen = Array.from({ length: 29 }, (_, i) => `Ring ${44 + i}`);
const GROESSEN = [
  ['Allgemein', ['Einheitsgröße']],
  ['Buchstaben', ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']],
  ['Konfektionsgröße', Array.from({ length: 16 }, (_, i) => String(32 + i * 2))],
  ...hosenGroessen,
  ['Gürtellänge', Array.from({ length: 13 }, (_, i) => `${70 + i * 5} cm`)],
  ...bhGroessen,
  ['Ringgröße', ringGroessen],
  ['Schuhe (EU)', schuhGroessen],
];
// Welche Größenarten bei welcher Kategorie zur Auswahl stehen. Genauere Angaben gehen vor:
// „Kategorie › Unterkategorie › Art“ vor „Kategorie › Unterkategorie“ vor „Kategorie“.
// Ohne Kategorie oder ohne Eintrag hier: alle.
const GROESSEN_JE_KATEGORIE = {
  'Oberteile': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
  'Unterteile': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'Hose'],
  'Unterteile › Röcke': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
  'Outdoorbekleidung': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
  'Ganzkörper': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
  'Ganzkörper › Arbeitskleidung': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'Hose'],
  'Unterwäsche & Nachtwäsche': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
  'Taschen': ['Allgemein'],
  'Accessoires': ['Allgemein', 'Buchstaben'],
  'Accessoires › Gürtel': ['Allgemein', 'Gürtellänge', 'Buchstaben'],
  'Accessoires › Socken und Strumpfhosen': ['Allgemein', 'Buchstaben', 'Schuhe (EU)'],
  'Unterwäsche & Nachtwäsche › Unterwäsche › BH': ['Allgemein', 'Buchstaben', 'BH'],
  'Unterwäsche & Nachtwäsche › Unterwäsche › Dessous': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Unterwäsche & Nachtwäsche › Unterwäsche › Korsett': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Oberteile › Sportbekleidung › Sport-BH': ['Allgemein', 'Buchstaben', 'BH'],
  'Oberteile › Top › Bustier': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Bademode › Badebekleidung › Bikinioberteil': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Bademode › Badebekleidung › Bikini': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Bademode › Badebekleidung › Badeanzug': ['Allgemein', 'Buchstaben', 'Konfektionsgröße', 'BH'],
  'Schmuck': ['Allgemein'],
  'Schmuck › Ringe': ['Allgemein', 'Ringgröße'],
  'Schuhe': ['Allgemein', 'Schuhe (EU)'],
  'Bademode': ['Allgemein', 'Buchstaben', 'Konfektionsgröße'],
};

// Zustand – von bester zu schlechtester Qualität
// Schnitte je Oberkategorie (nur dort erscheint das Feld „Schnitt“). Eigene Schnitte lassen sich im Editor ergänzen.
const SCHNITTE = {
  Oberteile: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversize', 'Boxy', 'Muscle Fit', 'Tailliert', 'Cropped', 'Longline'],
  Unterteile: ['Skinny', 'Slim Fit', 'Regular Fit', 'Straight', 'Tapered', 'Relaxed Fit', 'Loose / Baggy', 'Bootcut', 'Flared', 'Wide Leg', 'Carrot'],
};

// Kleine Diagramme der Schnitte (Silhouetten), getrennt nach Oberteilen und Hosen.
// Hosen: je Bein Mitte (c) und halbe Breite (w) an Oberschenkel (T), Knie (K) und Saum (H); crotch = Schritthöhe
const SCHNITT_HOSE = {
  'Skinny': { wT: 3.5, cK: 3, wK: 2.1, cH: 2.8, wH: 1.5 },
  'Slim Fit': { wT: 3.6, cK: 3.1, wK: 2.6, cH: 3, wH: 2.2 },
  'Regular Fit': { wT: 3.8, cK: 3.3, wK: 3, cH: 3.3, wH: 2.8 },
  'Straight': { wT: 3.6, cK: 3.4, wK: 3, cH: 3.5, wH: 3 },
  'Tapered': { wT: 4.3, cK: 3.3, wK: 2.8, cH: 3, wH: 1.8 },
  'Relaxed Fit': { wT: 4.3, cK: 3.7, wK: 3.5, cH: 3.8, wH: 3.4 },
  'Loose / Baggy': { wT: 5, cT: 3.8, cK: 4.4, wK: 4.3, cH: 4.6, wH: 4.4, crotch: 14 },
  'Bootcut': { wT: 3.6, cK: 3.2, wK: 2.5, cH: 3.6, wH: 3.4 },
  'Flared': { wT: 3.6, cK: 3.1, wK: 2.3, cH: 4.6, wH: 4.5 },
  'Wide Leg': { wT: 4.7, cK: 4.4, wK: 4.3, cH: 5, wH: 4.9 },
  'Carrot': { wT: 5.2, cT: 3.8, cK: 3.4, wK: 3, cH: 3, wH: 1.7 },
};
// Oberteile: halbe Breite an Schulter (s), Brust (c), Taille (w), Saum (h); Länge (L); drop = tiefer gesetzte Schulter;
// sl = Ärmellänge
const SCHNITT_OBEN = {
  'Slim Fit': { s: 5.6, c: 5.8, w: 5.2, h: 5.4, L: 26 },
  'Regular Fit': { s: 6, c: 6.5, w: 6.5, h: 6.5, L: 26 },
  'Relaxed Fit': { s: 6.8, c: 7.3, w: 7.3, h: 7.3, L: 26.5, drop: 0.8 },
  'Oversize': { s: 8.6, c: 8.6, w: 8.6, h: 8.6, L: 28.5, drop: 2.2, sl: 6 },
  'Boxy': { s: 7.6, c: 8.2, w: 8.2, h: 8.2, L: 21.5, drop: 1 },
  'Muscle Fit': { s: 7, c: 6.6, w: 4.9, h: 5.1, L: 25.5, sl: 3.6 },
  'Tailliert': { s: 6, c: 6.4, w: 4.7, h: 6.4, L: 26 },
  'Cropped': { s: 6, c: 6.5, w: 6.5, h: 6.5, L: 17 },
  'Longline': { s: 6, c: 6.3, w: 6.3, h: 6.7, L: 31 },
};
const f1 = (n) => Math.round(n * 10) / 10;
function schnittSvg(name, kat) {
  const hose = SCHNITT_HOSE[name], oben = SCHNITT_OBEN[name];
  const useHose = hose && (kat === 'Unterteile' || !oben);
  const svg = (vb, d) => `<svg class="schnitticon" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
  if (useHose) {
    const { cT = 3.5, wT, cK, wK, cH, wH, crotch = 12 } = hose;
    const P = (x, y) => `${f1(x)} ${y}`;
    const d = `M5 4 L${P(12 - cT - wT, 11)} L${P(12 - cK - wK, 20)} L${P(12 - cH - wH, 30)} L${P(12 - cH + wH, 30)} L${P(12 - cK + wK, 20)} L12 ${crotch}`
      + ` L${P(12 + cK - wK, 20)} L${P(12 + cH - wH, 30)} L${P(12 + cH + wH, 30)} L${P(12 + cK + wK, 20)} L${P(12 + cT + wT, 11)} L19 4 Z`;
    return svg('0 0 24 32', `<path d="M5 4 V2 H19 V4"/><path d="${d}"/>`);
  }
  if (!oben) return '';
  const { s: sh, c, w, h, L, drop = 0, sl = 4.5 } = oben;
  const X = (dx) => f1(16 + dx);
  // Ärmel: schräg nach außen (ca. 35°), Bündchen quer dazu
  const ox = sh + sl * 1.07, oy = 4 + drop + sl * 0.74; // Ärmelende außen
  const ix = ox - 1.9, iy = oy + 2.8;                    // Ärmelende innen
  const half = (sg) => [`L${X(sg * sh)} ${f1(4 + drop)}`, `L${X(sg * ox)} ${f1(oy)}`, `L${X(sg * ix)} ${f1(iy)}`,
    `L${X(sg * c)} ${f1(10 + drop)}`, `L${X(sg * w)} 18`, `L${X(sg * h)} ${L}`];
  const r = half(1), l = half(-1).reverse();
  const d = `M13 3 Q16 6 19 3 ${r.join(' ')} ${l.join(' ')} Z`;
  return svg('0 0 32 32', `<path d="${d}"/>`);
}

// Erklärungen zu den Schnitten (das „?“ in der Auswahl und in der Detailansicht)
const SCHNITT_INFO = {
  'Slim Fit': 'Körpernah, aber nicht hauteng geschnitten – bei Oberteilen schmal an Brust, Taille und Ärmeln, bei Hosen schmal an Oberschenkel und Bein.',
  'Regular Fit': 'Klassischer, gerader Schnitt mit etwas Bewegungsfreiheit – weder eng noch weit.',
  'Relaxed Fit': 'Locker und bequem geschnitten, mit spürbar mehr Weite als Regular Fit, aber nicht übergroß.',
  'Oversize': 'Bewusst deutlich größer geschnitten: Schultern sitzen tiefer, Körper und Ärmel sind weit.',
  'Boxy': 'Kastenförmig: gerade, breite Silhouette ohne Taillierung, oft etwas kürzer.',
  'Muscle Fit': 'Sehr körpernah an Brust, Schultern und Oberarmen, zur Taille schmaler – betont die Muskulatur.',
  'Tailliert': 'An der Taille enger geschnitten, betont die Körperform.',
  'Cropped': 'Verkürzt: endet über der Hüfte bzw. auf Taillenhöhe.',
  'Longline': 'Verlängert: reicht deutlich über die Hüfte, oft mit abgerundetem Saum.',
  'Skinny': 'Hauteng vom Bund bis zum Knöchel, meist mit Stretch-Anteil.',
  'Straight': 'Gerades Bein: von der Hüfte bis zum Saum gleich weit.',
  'Tapered': 'Oben bequem, zum Knöchel hin schmaler zulaufend.',
  'Loose / Baggy': 'Sehr weit und locker, oft mit tiefem Schritt; das Bein fällt über den Schuh.',
  'Bootcut': 'Bis zum Knie schmal, darunter leicht ausgestellt – Platz für Stiefel.',
  'Flared': 'Ab dem Knie deutlich weiter werdend (Schlaghose).',
  'Wide Leg': 'Durchgehend weites Bein von der Hüfte bis zum Saum.',
  'Carrot': 'An Hüfte und Oberschenkel weit, zum Knöchel stark verjüngt – wie eine Karotte.',
};

const ZUSTAENDE = ['Neu mit Etikett', 'Neu', 'Wie neu', 'Sehr gut', 'Gut', 'Getragen', 'Stark getragen', 'Flecken/Löcher', 'Reparaturbedürftig'];

/* Waschhinweise (Pflegesymbole), gruppiert. Symbole als kleine SVGs (24×26, Strichstärke 1.6, currentColor). */
const PFLEGE = [
  ['Waschen', ['Nicht waschen', 'Handwäsche', 'Von links waschen', 'Mit ähnlichen Farben waschen', 'Separat waschen']],
  ['Waschtemperatur', ['Waschen bis 30 °C', 'Waschen bis 40 °C', 'Waschen bis 60 °C', 'Waschen bis 95 °C',
    'Niedrige Waschtemperatur', 'Normale Waschtemperatur', 'Hohe Waschtemperatur']],
  ['Schleudern', ['Nicht schleudern', 'Schonend schleudern', 'Max. schleudern']],
  ['Trocknen', ['Nicht in den Trockner', 'Trockner geeignet', 'Schonender Trockengang', 'Sehr schonender Trockengang', 'Schonend trocknen', 'Normal trocknen', 'Heiß trocknen',
    'Trocknen ohne Hitze', 'Nicht wringen', 'Nass in Form ziehen', 'Liegend trocknen', 'Hängend trocknen', 'Im Schatten trocknen', 'Tropfnass trocknen']],
  ['Bügeln', ['Bügeln', 'Nicht bügeln', 'Nicht mit Dampf bügeln', 'Von links bügeln', 'Druck nicht bügeln', 'Stickerei nicht bügeln', 'Knöpfe nicht bügeln', 'Bügeln bei 110 °C', 'Bügeln bei 150 °C', 'Bügeln bei 200 °C']],
  ['Chemische Reinigung (trocken) und Nassreinigung', ['Nicht chemisch (trocken) reinigen', 'Professionelle Reinigung',
    'Reinigung mit Perchlorethylen (P)', 'Schonende Reinigung mit Perchlorethylen (P)', 'Reinigung mit Kohlenwasserstoff (F)', 'Schonende Reinigung mit Kohlenwasserstoff (F)',
    'Alle Lösemittel möglich (A)', 'Nicht nassreinigen', 'Nassreinigung (W)', 'Milde Nassreinigung (W)', 'Sehr milde Nassreinigung (W)']],
  ['Bleichen', ['Nicht bleichen', 'Ohne Chlor bleichen', 'Bleichen erlaubt']],
];
/* Ausführlichere Erklärungen (hinter dem „?“) */
const PFLEGE_INFO = {
  'Nicht waschen': 'Das Teil darf weder in der Maschine noch von Hand gewaschen werden – meist ist nur chemische Reinigung (trocken) möglich.',
  'Separat waschen': 'Getrennt von anderer Wäsche waschen – das Teil färbt (vor allem in den ersten Wäschen) stark ab oder ist besonders empfindlich.',
  'Handwäsche': 'Nur von Hand waschen, höchstens ca. 40 °C. Nicht reiben oder wringen, sondern sanft drücken; manche Maschinen haben ein Handwäsche-Programm.',
  'Von links waschen': 'Vor dem Waschen auf links (Innenseite nach außen) drehen. Schützt Drucke, Farben und die Oberfläche vor Abrieb und Pilling.',
  'Mit ähnlichen Farben waschen': 'Nur mit Wäsche in ähnlichen Farben waschen – das Teil kann abfärben oder selbst Farbe annehmen.',
  'Von links bügeln': 'Auf links gedreht bügeln, damit die Außenseite nicht glänzt und Drucke oder empfindliche Oberflächen geschützt sind.',
  'Druck nicht bügeln': 'Aufdrucke nicht direkt bügeln – sie können schmelzen oder am Bügeleisen kleben. Von links oder mit Tuch dazwischen bügeln.',
  'Stickerei nicht bügeln': 'Stickereien nicht direkt bügeln, sonst werden sie platt gedrückt. Von links auf einem Handtuch bügeln.',
  'Knöpfe nicht bügeln': 'Nicht über Knöpfe bügeln – sie können zerkratzen, brechen oder schmelzen. Um die Knöpfe herum bügeln.',
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
  'Nass in Form ziehen': 'Nach dem Waschen im nassen Zustand vorsichtig in die ursprüngliche Form und Größe ziehen, dann trocknen lassen – verhindert Verziehen und Einlaufen.',
  'Liegend trocknen': 'Flach ausgebreitet trocknen, z. B. auf einem Handtuch – typisch für Strick und Wolle, damit nichts ausleiert.',
  'Hängend trocknen': 'Auf der Leine oder einem Bügel hängend trocknen. Auf Etiketten als Quadrat mit Bogen oben oder (nach ISO) als Quadrat mit senkrechtem Strich.',
  'Im Schatten trocknen': 'Nicht in der direkten Sonne trocknen, damit die Farben nicht ausbleichen.',
  'Tropfnass trocknen': 'Ohne Schleudern und Auswringen tropfnass aufhängen; glättet sich dabei von selbst.',
  'Bügeln': 'Darf gebügelt werden; zur Temperatur gibt es keine Einschränkung.',
  'Nicht bügeln': 'Nicht bügeln und nicht dämpfen.',
  'Nicht mit Dampf bügeln': 'Bügeln ist erlaubt, aber ohne Dampf – Dampf kann Flecken oder Glanzstellen erzeugen.',
  'Bügeln bei 110 °C': 'Ein Punkt: niedrige Bügeltemperatur (max. 110 °C), z. B. für Synthetik, Acryl oder Seide.',
  'Bügeln bei 150 °C': 'Zwei Punkte: mittlere Bügeltemperatur (max. 150 °C), z. B. für Wolle, Polyester oder Viskose.',
  'Bügeln bei 200 °C': 'Drei Punkte: hohe Bügeltemperatur (max. 200 °C), z. B. für Baumwolle und Leinen.',
  'Nicht chemisch (trocken) reinigen': 'Durchgestrichener Kreis: darf nicht in die chemische Reinigung (trocken). Ob eine Nassreinigung möglich ist, zeigt ggf. ein eigenes „W“-Symbol.',
  'Professionelle Reinigung': 'Leerer Kreis: Das Teil darf professionell gereinigt werden (chemisch (trocken) oder nass) – die Reinigung wählt das passende Verfahren.',
  'Alle Lösemittel möglich (A)': 'Kreis mit „A“ (veraltet): chemische Reinigung (trocken) mit allen üblichen Lösemitteln möglich. Steht nur noch auf älteren Etiketten.',
  'Reinigung mit Perchlorethylen (P)': 'Kreis mit „P“: professionelle chemische Reinigung (trocken) mit Perchlorethylen und den üblichen Lösemitteln möglich.',
  'Schonende Reinigung mit Perchlorethylen (P)': '„P“ mit Strich darunter: schonende chemische Reinigung (trocken) mit Perchlorethylen – mit weniger Feuchtigkeit, Temperatur und Mechanik.',
  'Reinigung mit Kohlenwasserstoff (F)': 'Kreis mit „F“: professionelle chemische Reinigung (trocken) nur mit Kohlenwasserstoff-Lösemitteln.',
  'Schonende Reinigung mit Kohlenwasserstoff (F)': '„F“ mit Strich darunter: schonende chemische Reinigung (trocken) mit Kohlenwasserstoff – mit weniger Feuchtigkeit, Temperatur und Mechanik.',
  'Nicht nassreinigen': 'Durchgestrichenes „W“: darf nicht in die professionelle Nassreinigung.',
  'Nassreinigung (W)': 'Kreis mit „W“: professionelle Nassreinigung möglich – die Reinigung wäscht mit Wasser und speziellen Mitteln statt mit Lösemitteln.',
  'Milde Nassreinigung (W)': '„W“ mit einem Strich darunter: professionelle Nassreinigung im milden Verfahren.',
  'Sehr milde Nassreinigung (W)': '„W“ mit zwei Strichen darunter: professionelle Nassreinigung im sehr milden Verfahren.',
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
  const ironS = `<g transform="translate(0 7) scale(.74)">${'<path d="M2.5 19 C3.5 14 7 12 12 12 H21 V19 Z M9 12 V9.5 Q9 8 10.5 8 H21 V12"/>'}</g>`;
  const tri = '<path d="M12 3.5 L21.5 21 H2.5 Z"/>';
  const circ = '<circle cx="12" cy="12.5" r="8.5"/>';
  // Hand, die von rechts oben ins Wasser greift
  const hand = '<g transform="translate(15 2.5) rotate(38)"><path d="M-3.6 -3 V6.8 Q-3.6 10.6 0 10.6 Q3.6 10.6 3.6 6.8 V3.2 L5.8 1 Q6.6 0 5.8 -0.7 Q5 -1.2 4.3 -0.4 L3.6 0.4 V-3 M-1.2 10.4 V6.6 M1.2 10.4 V6.6"/></g>';
  const ic = {
    'Nicht waschen': `<path d="${tub}"/>${x(3, 5, 21, 23)}`,
    'Handwäsche': `<path d="M3 9 q1.5-2 3 0 t3 0 M3.4 9 L5.5 20 H18.5 L20.6 9"/>${hand}`,
    'Mit ähnlichen Farben waschen': '<path d="M5 6 L2 7.6 L3 10.2 L4.3 9.8 V17 H10.7 V9.8 L12 10.2 L13 7.6 L10 6 Q7.5 7.6 5 6 Z" fill="currentColor" fill-opacity=".2"/><path d="M14 9 L11 10.6 L12 13.2 L13.3 12.8 V20 H19.7 V12.8 L21 13.2 L22 10.6 L19 9 Q16.5 10.6 14 9 Z" fill="currentColor" fill-opacity=".45"/>',
    'Von links bügeln': `${ironS}<g stroke-width="1.15"><path d="M15 6.5 A4 4 0 1 1 19 10.5"/><path d="M13.3 4.6 L15 6.8 L17.3 5.5"/></g>`,
    'Druck nicht bügeln': `${ironS}<g stroke-width="1.15"><rect x="13" y="1.5" width="9.5" height="8.5" rx="1"/><path d="M15.6 4.2 H19.9 M17.75 4.2 V7.6"/>${x(12, 0.8, 23.5, 10.8)}</g>`,
    'Stickerei nicht bügeln': `${ironS}<g stroke-width="1.15"><path d="M17.75 1 L19 4.2 L22.4 4.4 L19.8 6.6 L20.6 9.9 L17.75 8.1 L14.9 9.9 L15.7 6.6 L13.1 4.4 L16.5 4.2 Z"/>${x(12.3, 0.8, 23.2, 10.8)}</g>`,
    'Knöpfe nicht bügeln': `${ironS}<g stroke-width="1.15"><circle cx="17.75" cy="5.8" r="4.3"/><circle cx="16.4" cy="5.8" r=".75" fill="currentColor" stroke="none"/><circle cx="19.1" cy="5.8" r=".75" fill="currentColor" stroke="none"/>${x(12.3, 0.6, 23.2, 11)}</g>`,
    'Von links waschen': '<path d="M8 4 L3.5 6.5 L5 10.5 L7 9.8 V21 H17 V9.8 L19 10.5 L20.5 6.5 L16 4 Q12 6.5 8 4 Z"/><path d="M9.2 14.5 A3.2 3.2 0 1 0 12 11.3"/><path d="M10.4 9.8 L12.2 11.3 L10.6 13"/>',
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
    'Nass in Form ziehen': '<path d="M9 5 L6 6.6 L7 9.2 L8.3 8.8 V19 H15.7 V8.8 L17 9.2 L18 6.6 L15 5 Q12 6.6 9 5 Z"/><path d="M5.5 14 H1.5 M3 12.5 L1.5 14 L3 15.5 M18.5 14 H22.5 M21 12.5 L22.5 14 L21 15.5"/><path d="M10.5 21.8 q.75-1 1.5 0 t1.5 0" stroke-width="1.1"/>',
    'Liegend trocknen': `${sq}<path d="M8 12.5 H16"/>`,
    'Hängend trocknen': `${sq}<path d="M6 4.3 Q12 11 18 4.3"/>`, // dazu unten ein zweites Zeichen (Quadrat mit Strich)
    'Separat waschen': `<path d="${tub}"/><path d="M12 9.5 V19.5" stroke-dasharray="1.6 1.6"/><path d="M7.5 13.5 h2.5 M14 13.5 h2.5"/>`,
    'Im Schatten trocknen': `${sq}<path d="M3.8 9.5 L9 4.3 M3.8 13.5 L13 4.3"/>`,
    'Tropfnass trocknen': `${sq}<path d="M9 8 V17 M12 8 V17 M15 8 V17"/>`,
    'Bügeln': iron,
    'Nicht bügeln': `${iron}${x(4, 5, 20, 22)}`,
    'Nicht mit Dampf bügeln': `${iron}<path d="M8 21 L12 25 M12 21 L8 25 M13 21 L17 25 M17 21 L13 25"/>`,
    'Bügeln bei 110 °C': `${iron}${dots(1, 16, 3, 13)}`,
    'Bügeln bei 150 °C': `${iron}${dots(2, 16, 3, 13)}`,
    'Bügeln bei 200 °C': `${iron}${dots(3, 16, 3, 13)}`,
    'Nicht chemisch (trocken) reinigen': `${circ}${x(4.5, 5, 19.5, 20)}`,
    'Professionelle Reinigung': circ,
    'Alle Lösemittel möglich (A)': `${circ}${txt('A', 15.7, 9)}`,
    'Reinigung mit Perchlorethylen (P)': `${circ}${txt('P', 15.7, 9)}`,
    'Reinigung mit Kohlenwasserstoff (F)': `${circ}${txt('F', 15.7, 9)}`,
    'Schonende Reinigung mit Perchlorethylen (P)': `<circle cx="12" cy="11" r="7.8"/>${txt('P', 14.2, 8.5)}${bars(1, 22.3, 6, 18)}`,
    'Schonende Reinigung mit Kohlenwasserstoff (F)': `<circle cx="12" cy="11" r="7.8"/>${txt('F', 14.2, 8.5)}${bars(1, 22.3, 6, 18)}`,
    'Nicht nassreinigen': `${circ}${txt('W', 15.7, 9)}${x(4.5, 5, 19.5, 20)}`,
    'Nassreinigung (W)': `${circ}${txt('W', 15.7, 9)}`,
    'Milde Nassreinigung (W)': `<circle cx="12" cy="11" r="7.8"/>${txt('W', 14.2, 8.5)}${bars(1, 22.3, 6, 18)}`,
    'Sehr milde Nassreinigung (W)': `<circle cx="12" cy="10.3" r="7.3"/>${txt('W', 13.4, 8)}${bars(2, 21.2, 6, 18)}`,
    'Nicht bleichen': `${tri}${x(5, 6, 19, 22)}`,
    'Ohne Chlor bleichen': `${tri}<path d="M10 21 L15 11.5 M13.5 21 L17.2 14"/>`,
    'Bleichen erlaubt': tri,
  };
  const svg = (v) => `<svg class="careicon" viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${v}</svg>`;
  const out = Object.fromEntries(Object.entries(ic).map(([k, v]) => [k, svg(v)]));
  // Hängend trocknen: zusätzlich das ISO-Zeichen (Quadrat mit senkrechtem Strich)
  out['Hängend trocknen'] += svg(`${sq}<path d="M12 7.5 V17.5"/>`);
  return out;
})();

/* Alle Länder (ISO 3166-1) – deutsche Namen über Intl, sortiert */
const LAENDER = (() => {
  const codes = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'.split(' ');
  let dn = null;
  try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { /* alter Browser */ }
  return codes.map((c) => (dn ? dn.of(c) : c)).filter((n) => n && n.length > 2).sort((a, b) => a.localeCompare(b, 'de'));
})();
