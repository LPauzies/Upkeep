import type { UpkeepConfig } from './types';

export const DEFAULT_UPKEEP_CONFIG: UpkeepConfig = {
  version: '1.0.0',
  enabled: true,
  autoOpenLogsLeft: true,
  alwaysShowOpponentGraveyard: true,
  highContrastHud: true,
  showExtendedCounters: true,
  enableHoverZoom: true,
  logsWidth: 278,
  graveyardWidth: 268,
  hoverZoomScale: 1.45,
  density: 'balanced',
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
