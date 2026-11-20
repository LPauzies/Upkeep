import type { UpkeepConfig } from './types';

export const DEFAULT_UPKEEP_CONFIG: UpkeepConfig = {
  version: '1.0.0',
  enabled: true,
  autoOpenLogsLeft: true,
  alwaysShowOpponentGraveyard: true,
  highContrastHud: true,
  showExtendedCounters: true,
  enableHoverZoom: true,
  logsWidth: 264,
  graveyardWidth: 276,
  hoverZoomScale: 1.45,
  density: 'balanced',
  shortcuts: {
    toggleLogs: 'l',
    toggleGraveyard: 'g',
    toggleTheme: 'u',
  },
  selectors: {
    gameRoot: '[data-testid="game-board"], .game-board, main',
    logsPanel:
      '[data-testid="game-log"], [data-zone="log"], .game-log, .log-panel, aside[aria-label*="log" i]',
    logsToggleButton:
      'button[aria-label*="log" i], button[title*="log" i], [data-testid="toggle-log"], .log-toggle',
    opponentGraveyardZone:
      '[data-player="opponent"] [data-zone="graveyard"], .opponent-zone .graveyard, [aria-label*="opponent graveyard" i]',
    opponentGraveyardCards:
      '[data-player="opponent"] [data-zone="graveyard"] [data-card-name], .opponent-zone .graveyard .card',
    opponentLife:
      '[data-player="opponent"] [data-stat="life"], .opponent-zone .life-total, [data-testid="opponent-life"]',
    opponentLibrary:
      '[data-player="opponent"] [data-stat="library"], .opponent-zone .library-count, [data-testid="opponent-library"]',
    opponentHand:
      '[data-player="opponent"] [data-stat="hand"], .opponent-zone .hand-count, [data-testid="opponent-hand"]',
    opponentExile:
      '[data-player="opponent"] [data-stat="exile"], .opponent-zone .exile-count, [data-testid="opponent-exile"]',
    selfLife:
      '[data-player="self"] [data-stat="life"], .player-zone .life-total, [data-testid="self-life"]',
    selfLibrary:
      '[data-player="self"] [data-stat="library"], .player-zone .library-count, [data-testid="self-library"]',
    selfHand:
      '[data-player="self"] [data-stat="hand"], .player-zone .hand-count, [data-testid="self-hand"]',
    selfExile:
      '[data-player="self"] [data-stat="exile"], .player-zone .exile-count, [data-testid="self-exile"]',
  },
};

export const SELECTOR_LABELS: Record<keyof UpkeepConfig['selectors'], { label: string; hint: string }> = {
  gameRoot: {
    label: 'Conteneur du plateau',
    hint: 'Racine de la partie sur /game/*',
  },
  logsPanel: {
    label: 'Panneau des logs',
    hint: 'Journal des actions à ancrer sur le rail gauche',
  },
  logsToggleButton: {
    label: 'Bouton ouverture des logs',
    hint: 'Cliqué automatiquement au démarrage si le journal est fermé',
  },
  opponentGraveyardZone: {
    label: 'Zone cimetière adverse',
    hint: 'Zone observée en continu par le MutationObserver',
  },
  opponentGraveyardCards: {
    label: 'Cartes du cimetière adverse',
    hint: 'Éléments de cartes extraits dans le rail droit',
  },
  opponentLife: {
    label: 'Points de vie adversaire',
    hint: 'Compteur PV adverse remonté dans le HUD tactique',
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
    hint: 'Compteur PV joueur remonté en bas du plateau',
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
