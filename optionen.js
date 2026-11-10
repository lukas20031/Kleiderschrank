'use strict';
/* Feste Auswahlwerte. Reihenfolge = Anzeigereihenfolge. */

// Farben (übernommen aus Whering) – Farbtöne aus den Screenshots ausgelesen
const FARBEN = [
  ['Gelb', '#ffff54'], ['Blau', '#0000f4'], ['Dunkelblau', '#00007a'],
  ['Beige', '#e6dbc7'], ['Weiß', '#ffffff'], ['Bordeaux', '#70142d'],
  ['Khaki', '#ede696'], ['Korallenrot', '#ed6b6d'], ['Ecru', '#f6f3e4'],
  ['Grau', '#808080'], ['Lavendel', '#e7e6f8'], ['Pink', '#eb33f7'],
  ['Braun', '#8c4f19'], ['Violett', '#922ce7'], ['Senfgelb', '#d8af3b'],
  ['Orange', '#f1a93b'], ['Schwarz', '#000000'], ['Rot', '#ea3323'],
  ['Rosa', '#e79dac'], ['Türkis', '#68d2c8'], ['Grün', '#377e22'],
  ['Smaragdgrün', '#367b5c'], ['Himmelblau', '#b9e2f8'],
  ['Knallrosa', '#ee73b2'], ['Hellgrün', '#bff9bc'],
  ['Hellrosa', '#f6cdd3'], ['Hellgelb', '#fff7b6'],
  ['Neongrün', '#76fb4c'], ['Neonorange', '#ed6b2d'],
  ['Neongelb', '#ffff54'], ['Kupferrot', 'linear-gradient(120deg,#c98a60,#8a4a28 55%,#c17752)'],
  ['Jeansblau', 'repeating-linear-gradient(45deg,#7f9cbf 0 2px,#6d8bb0 2px 4px)'],
  ['Gold', 'linear-gradient(120deg,#f2f197,#c9a23a 55%,#f0e08a)'],
  ['Silber', 'linear-gradient(120deg,#f2f2f2,#9a9a9a 55%,#e0e0e0)'],
  ['Schwarzes Denim', 'repeating-linear-gradient(45deg,#2b2b2b 0 2px,#121212 2px 4px)'],
  ['Mehrfarbig', 'conic-gradient(#ee8da4,#f3d37a,#a6e3b0,#9cc9f0,#c9a6ea,#ee8da4)'],
  ['Neonblau', '#75fbfe'],
  ['Transparent', 'linear-gradient(135deg,#f4f4f4 42%,#a9a9a9 47%,#a9a9a9 53%,#f4f4f4 58%)'],
];

// Materialien (übernommen aus Whering)
const MATERIALIEN = [
  'Acryl', 'Alpaka', 'Bambus', 'Baumwolle', 'Bouclé', 'Bronze', 'Canvas', 'Chiffon', 'Cord', 'Crêpe',
  'Denim', 'Diamant', 'Edelstein', 'Elastan', 'Fell', 'Glas', 'Gold', 'Gummi', 'Hanf', 'Holz',
  'Häkelstrick', 'Kaschmir', 'Keramik', 'Kobalt', 'Kunstfell', 'Kupfer', 'Lackleder', 'Leder', 'Leinen', 'Lycra',
  'Lyocell', 'Mesh', 'Metall', 'Modal', 'Neopren', 'Nylon', 'Pailletten', 'Perle', 'Plastik', 'Polyamid',
  'Polyester', 'Polyurethan', 'Rayon', 'Samt', 'Satin', 'Seide', 'Silber', 'Smaragd', 'Spandex', 'Spitze',
  'Strick', 'Stroh', 'Synthetik', 'Teddy', 'Tencel', 'Titan', 'Tweed', 'Tüll', 'Veganes Leder', 'Viskose',
  'Wildleder', 'Wolle',
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
const ZUSTAENDE = ['Neu mit Etikett', 'Neu', 'Wie neu', 'Sehr gut', 'Gut', 'Getragen', 'Stark getragen', 'Reparaturbedürftig'];
