/* Sternenfront – Spieldaten: Fraktionen, Schiffe, Basen, Admiräle, Sektorkarten. */

export const SYS_W = 2000, SYS_H = 1250;

export const FACTIONS = [
  { name: 'Du', color: '#5ee7ff', dim: '#1d6f80' },
  { name: 'Gegner', color: '#ff5f57', dim: '#7a2622' },
];

/* Schiffe. weapon.cost = Supply-Verbrauch pro Schuss */
export const SHIPS = {
  builder: {
    name: 'Konstrukteur', sprite: 'satellite_A', hp: 80, speed: 85, size: 22, cost: 80, time: 8, from: 'hq',
    desc: 'Baut Basen auf Planeten und Sprungtore an Wurmlöchern.',
  },
  supply: {
    name: 'Versorgungsschiff', sprite: 'satellite_D', hp: 110, speed: 92, size: 24, cost: 100, time: 10, from: 'hq',
    cargo: 240, transfer: 14, range: 170,
    desc: 'Versorgt Schiffe in der Nähe mit Supplies. Füllt sich an operativen Basen wieder auf.',
  },
  fighter: {
    name: 'Jäger', sprite: 'ship_J', hp: 45, speed: 165, size: 16, cost: 55, time: 6, from: 'yard', cls: 'fighter',
    weapon: { range: 170, dmg: 4.2, rof: 0.45, speed: 760, cost: 1 }, supplyMax: 30,
    special: { key: 'boost', name: 'Nachbrenner', desc: '+70 % Tempo für 5 s', cost: 6, cd: 15 },
    desc: 'Schnell und billig, aber verwundbar.',
  },
  corvette: {
    name: 'Korvette', sprite: 'ship_I', hp: 120, speed: 115, size: 20, cost: 115, time: 11, from: 'yard', cls: 'corvette',
    weapon: { range: 230, dmg: 10, rof: 0.9, speed: 680, cost: 2 }, supplyMax: 44,
    special: { key: 'torpedo', name: 'Torpedo', desc: 'Schwerer Treffer (45 Schaden)', cost: 10, cd: 14 },
    desc: 'Vielseitiges Kampfschiff.',
  },
  battleship: {
    name: 'Schlachtschiff', sprite: 'ship_sidesB', hp: 360, speed: 66, size: 34, cost: 270, time: 20, from: 'yard', cls: 'battleship',
    weapon: { range: 300, dmg: 26, rof: 1.7, speed: 560, cost: 4, beam: true }, supplyMax: 70,
    special: { key: 'broadside', name: 'Breitseite', desc: 'Trifft alle Gegner in Reichweite (30 Schaden)', cost: 18, cd: 22 },
    desc: 'Langsam, schwer gepanzert, große Reichweite. Verbraucht viele Supplies.',
  },
  admiral: {
    name: 'Admiral', sprite: 'ship_sidesC', hp: 260, speed: 90, size: 32, cost: 300, time: 22, from: 'yard', cls: 'admiral',
    weapon: { range: 220, dmg: 7, rof: 1.0, speed: 640, cost: 1 }, supplyMax: 50,
    desc: 'Führt eine Flotte und gibt ihr Boni, solange die Schiffe im Befehlsradius sind.',
  },
};

export const ADMIRALS = {
  attack: { name: 'Admiralin Vega', title: 'Angriff', desc: '+20 % Schaden', dmg: 1.2, color: '#ff9f43' },
  logistics: { name: 'Admiral Kord', title: 'Logistik', desc: '+25 % Supply-Kapazität, −20 % Verbrauch', supplyMax: 1.25, use: 0.8, color: '#7bed9f' },
  navigation: { name: 'Admiralin Lyra', title: 'Navigation', desc: '+15 % Tempo, +10 % Reichweite', speed: 1.15, range: 1.1, color: '#70a1ff' },
  fighters: { name: 'Admiral Ruk', title: 'Jägerführung', desc: 'Jäger: +25 % Schaden, +15 % Tempo', fighterDmg: 1.25, fighterSpeed: 1.15, color: '#eccc68' },
};
export const COMMAND_RADIUS = 650;

/* Basen */
export const BASES = {
  hq: {
    name: 'Hauptquartier', sprite: 'station_C', hp: 1600, cost: 500, time: 40, size: 46, income: 2.2, supplyRange: 260, supplyRate: 7,
    produces: ['builder', 'supply'], planet: true, unique: true,
    desc: 'Zentrum des Versorgungsnetzes: Basen in diesem System sind sofort operativ. Baut Konstrukteure und Versorgungsschiffe.',
  },
  mine: {
    name: 'Förderstation', sprite: 'satellite_B', hp: 600, cost: 150, time: 18, size: 30, income: 3.2, planet: true,
    desc: 'Fördert Rohstoffe vom Planeten (je nach Ergiebigkeit).',
  },
  yard: {
    name: 'Werft', sprite: 'station_A', hp: 1000, cost: 260, time: 30, size: 40, supplyRange: 200, supplyRate: 5,
    produces: ['fighter', 'corvette', 'battleship', 'admiral'], planet: true,
    desc: 'Baut Kampfschiffe und Admiräle.',
  },
  depot: {
    name: 'Versorgungsdepot', sprite: 'station_B', hp: 700, cost: 160, time: 18, size: 36, supplyRange: 340, supplyRate: 16, planet: true,
    desc: 'Versorgt Schiffe in großem Umkreis schnell mit Supplies.',
  },
  turret: {
    name: 'Geschützturm', sprite: 'enemy_D', hp: 520, cost: 130, time: 14, size: 28, planet: false,
    weapon: { range: 300, dmg: 11, rof: 1.1, speed: 680 },
    desc: 'Verteidigungsplattform, frei im Raum platzierbar.',
  },
  gate: {
    name: 'Sprungtor', hp: 900, cost: 200, time: 24, size: 62, wormhole: true,
    desc: 'Sichert ein Wurmloch: verbindet das Nachbarsystem mit deinem Versorgungsnetz und erlaubt Sofortsprünge.',
  },
};
export const BUILD_ORDER = ['hq', 'mine', 'yard', 'depot', 'turret', 'gate'];
export const UNIT_CAP = 50;
export const START_RES = 600;

/* Sektorkarten: Position auf der Übersichtskarte (0..1) und Verbindungen */
export const MAPS = {
  small: {
    name: 'Klein (5 Systeme)',
    systems: [
      ['Aurora', 0.1, 0.5], ['Kepler', 0.38, 0.2], ['Nyx', 0.48, 0.66], ['Helios', 0.72, 0.28], ['Orion', 0.9, 0.55],
    ],
    links: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]],
    homes: [0, 4],
  },
  medium: {
    name: 'Mittel (7 Systeme)',
    systems: [
      ['Aurora', 0.07, 0.5], ['Kepler', 0.3, 0.18], ['Vesta', 0.3, 0.82], ['Nyx', 0.5, 0.5],
      ['Helios', 0.7, 0.18], ['Talos', 0.7, 0.82], ['Orion', 0.93, 0.5],
    ],
    links: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [3, 4], [3, 5], [2, 5], [4, 6], [5, 6]],
    homes: [0, 6],
  },
};

export const DIFFICULTY = {
  easy: { name: 'Leicht', income: 0.8, attackAt: 1600, firstAttack: 540, think: 2.2, turrets: 0 },
  normal: { name: 'Mittel', income: 1.0, attackAt: 1300, firstAttack: 390, think: 1.4, turrets: 1 },
  hard: { name: 'Schwer', income: 1.25, attackAt: 1050, firstAttack: 270, think: 0.9, turrets: 2 },
};
