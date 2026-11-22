import type { ColorblindMode, UpkeepColors, UpkeepConfig } from './types';

export const COLOR_PRESETS: Record<ColorblindMode, UpkeepColors> = {
  none: {
    bfSelfMyTurn: '#182030',
    bfOppMyTurn: '#0d1119',
    bfSelfOppTurn: '#0d1119',
    bfOppOppTurn: '#182132',
    phaseCurrent: '#c9a45c',
    phaseStopMine: '#d6ab56',
    phaseStopOpp: '#6ea8f0',
    lifeNormal: '#f4f6fa',
    targetBar: '#f5d076',
  },
  deuteranopia: {
    bfSelfMyTurn: '#221d11',
    bfOppMyTurn: '#0b0e14',
    bfSelfOppTurn: '#0b0e14',
    bfOppOppTurn: '#102030',
    phaseCurrent: '#cc79a7',
    phaseStopMine: '#e69f00',
    phaseStopOpp: '#56b4e9',
    lifeNormal: '#ffffff',
    targetBar: '#f0e442',
  },
  tritanopia: {
    bfSelfMyTurn: '#241419',
    bfOppMyTurn: '#0b0e14',
    bfSelfOppTurn: '#0b0e14',
    bfOppOppTurn: '#0f2326',
    phaseCurrent: '#ff99c8',
    phaseStopMine: '#ff5c5c',
    phaseStopOpp: '#00c2b2',
    lifeNormal: '#ffffff',
    targetBar: '#ffd6e7',
  },
  'high-contrast': {
    bfSelfMyTurn: '#1e2636',
    bfOppMyTurn: '#080a0f',
    bfSelfOppTurn: '#080a0f',
    bfOppOppTurn: '#1a2538',
    phaseCurrent: '#ffd166',
    phaseStopMine: '#ffd166',
    phaseStopOpp: '#7ce8ff',
    lifeNormal: '#ffffff',
    targetBar: '#ffffff',
  },
};

export const COLORBLIND_OPTIONS: { id: ColorblindMode; title: string; desc: string }[] = [
  { id: 'none', title: 'Standard', desc: 'Palette Obsidienne & Or par défaut' },
  { id: 'deuteranopia', title: 'Deuteranopia / Protanopia', desc: 'Okabe-Ito anti-confusion Rouge/Vert' },
  { id: 'tritanopia', title: 'Tritanopia', desc: 'Palette anti-confusion Bleu/Jaune' },
  { id: 'high-contrast', title: 'High Contrast', desc: 'Luminance maximale & repères renforcés' },
];

export const COLOR_GROUPS: {
  title: string;
  fields: { key: keyof UpkeepColors; short: string; label: string; hint: string }[];
}[] = [
  {
    title: 'Battlefield (selon le tour actif)',
    fields: [
      {
        key: 'bfSelfMyTurn',
        short: 'You (Your T)',
        label: 'Votre plateau — Votre tour',
        hint: 'Teinte active côté joueur pendant votre tour',
      },
      {
        key: 'bfOppMyTurn',
        short: 'Opp (Your T)',
        label: 'Plateau adverse — Votre tour',
        hint: 'Teinte passive côté adversaire pendant votre tour',
      },
      {
        key: 'bfSelfOppTurn',
        short: 'You (Opp T)',
        label: 'Votre plateau — Tour adverse',
        hint: 'Teinte passive côté joueur pendant le tour adverse',
      },
      {
        key: 'bfOppOppTurn',
        short: 'Opp (Opp T)',
        label: 'Plateau adverse — Tour adverse',
        hint: 'Teinte active côté adversaire pendant son tour',
      },
    ],
  },
  {
    title: 'Barre de phases (ligne médiane)',
    fields: [
      {
        key: 'phaseCurrent',
        short: 'Active Step',
        label: 'Phase en cours',
        hint: 'Remplissage haute visibilité avec contraste texte auto',
      },
      {
        key: 'phaseStopMine',
        short: 'Your Stops',
        label: 'Vos stops (votre tour)',
        hint: 'Repère haut/gauche lorsqu’un stop est posé sur votre tour',
      },
      {
        key: 'phaseStopOpp',
        short: 'Opp Stops',
        label: 'Stops tour adverse',
        hint: 'Repère bas/droit lorsqu’un stop est posé sur le tour adverse',
      },
    ],
  },
  {
    title: 'Points de vie & barre de ciblage',
    fields: [
      {
        key: 'lifeNormal',
        short: 'Life (>5)',
        label: 'Points de vie (> 5 PV)',
        hint: 'Couleur des PV hors zone critique (≤ 5 reste en alerte)',
      },
      {
        key: 'targetBar',
        short: 'Target Bar',
        label: 'Barre de ciblage (0/1)',
        hint: 'Texte & jauge "NEED 1 MORE" dans le bloc Decision',
      },
    ],
  },
];

export function sanitizeHex(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

export function computeContrastInk(hex: string): '#0b0e14' | '#ffffff' {
  const clean = sanitizeHex(hex, '#c9a45c').slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (299 * r + 587 * g + 114 * b) / 1000;
  return lum > 155 ? '#0b0e14' : '#ffffff';
}

export const DEFAULT_UPKEEP_CONFIG: UpkeepConfig = {
  version: '1.0.0',
  enabled: true,
  showMidlineTimeline: true,
  autoOpenLogsLeft: true,
  alwaysShowOpponentGraveyard: true,
  hideActionToasts: true,
  anchorStackTopLeft: true,
  highContrastHud: true,
  enableHoverZoom: true,
  logsWidth: 278,
  graveyardWidth: 268,
  hoverZoomScale: 1.45,
  colorblindMode: 'none',
  colors: { ...COLOR_PRESETS.none },
  shortcuts: {
    toggleLogs: 'l',
    toggleGraveyard: 'g',
    toggleTheme: 'u',
  },
  selectors: {
    gameRoot: '[data-testid="game-root"], .wr-game-grid',
    logsPanel: '[data-gamelog-panel], [data-zone="gamelog-display"]',
    logsToggleButton:
      'button[aria-label*="open game log" i], button[aria-label*="game log" i]:not([aria-label*="close" i]), button[title*="game log" i]',
    opponentGraveyardZone: 'button[data-zone-anchor="opp-graveyard"]',
    selfGraveyardZone: 'button[data-zone-anchor="my-graveyard"]',
    opponentGraveyardCards:
      '[role="dialog"] [data-testid="card-img"], [data-zone*="graveyard" i] [data-testid="card-img"]',
    opponentLife: '[data-testid="opp-life"] .life-total',
    opponentLibrary: '[data-player-anchor="opp"] [title="Library (deck) size"] [data-zone-count]',
    opponentHand: '[data-zone-anchor="opp-hand"] [data-zone-count]',
    opponentExile: 'button[data-zone-anchor="opp-exile"] [data-zone-count]',
    selfLife: '[data-testid="me-life"] .life-total',
    selfLibrary: 'button[data-zone-anchor="my-library"] [data-zone-count]',
    selfHand: '[data-player-anchor="me"] [title="Hand size"] .font-mono',
    selfExile: 'button[data-zone-anchor="my-exile"] [data-zone-count]',
  },
};

export const SELECTOR_LABELS: Record<keyof UpkeepConfig['selectors'], { label: string; hint: string }> = {
  gameRoot: {
    label: 'Conteneur du plateau',
    hint: 'Racine de la partie sur /game/*',
  },
  logsPanel: {
    label: 'Panneau des logs',
    hint: 'Journal ancré à taille fixe dans le rail gauche',
  },
  logsToggleButton: {
    label: 'Bouton ouverture des logs',
    hint: 'Cliqué automatiquement au démarrage si le journal est fermé',
  },
  opponentGraveyardZone: {
    label: 'Zone cimetière adverse',
    hint: 'Compteur et ouverture modale du cimetière adverse',
  },
  selfGraveyardZone: {
    label: 'Zone de votre cimetière',
    hint: 'Compteur et ouverture modale de votre cimetière',
  },
  opponentGraveyardCards: {
    label: 'Cartes dans les modales cimetière',
    hint: 'Images extraites pour alimenter la grille 2 colonnes',
  },
  opponentLife: {
    label: 'Points de vie adversaire',
    hint: 'Compteur PV adverse (delta et état critique ≤ 5)',
  },
  opponentLibrary: {
    label: 'Deck adversaire',
    hint: 'Cartes restantes dans la bibliothèque adverse',
  },
  opponentHand: {
    label: 'Main adversaire',
    hint: 'Nombre de cartes en main de l’adversaire',
  },
  opponentExile: {
    label: 'Exil adversaire',
    hint: 'Compteur de zone d’exil adverse',
  },
  selfLife: {
    label: 'Vos points de vie',
    hint: 'Compteur PV joueur en bas du rail gauche',
  },
  selfLibrary: {
    label: 'Votre deck',
    hint: 'Cartes restantes dans votre bibliothèque',
  },
  selfHand: {
    label: 'Votre main',
    hint: 'Nombre de cartes dans votre main',
  },
  selfExile: {
    label: 'Votre exil',
    hint: 'Compteur de votre zone d’exil',
  },
};
