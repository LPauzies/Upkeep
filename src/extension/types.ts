export type CardCategory = 'creature' | 'spell' | 'land' | 'artifact';

export interface DomSelectorConfig {
  gameRoot: string;
  logsPanel: string;
  logsToggleButton: string;
  opponentGraveyardZone: string;
  selfGraveyardZone: string;
  opponentGraveyardCards: string;
  opponentLife: string;
  opponentLibrary: string;
  opponentHand: string;
  opponentExile: string;
  selfLife: string;
  selfLibrary: string;
  selfHand: string;
  selfExile: string;
}

export interface UpkeepShortcuts {
  toggleLogs: string;
  toggleGraveyard: string;
  toggleTheme: string;
}

export type ColorblindMode = 'none' | 'deuteranopia' | 'tritanopia' | 'high-contrast';
export type BattlefieldStyle = 'solid' | 'gradient';

export interface UpkeepColors {
  bfSelfMyTurn: string;
  bfOppMyTurn: string;
  bfSelfOppTurn: string;
  bfOppOppTurn: string;
  phaseCurrent: string;
  phaseStopMine: string;
  phaseStopOpp: string;
  lifeNormal: string;
  targetBar: string;
  undoButton: string;
}

export interface UpkeepConfig {
  version: string;
  enabled: boolean;
  showMidlineTimeline: boolean;
  autoOpenLogsLeft: boolean;
  alwaysShowOpponentGraveyard: boolean;
  hideActionToasts: boolean;
  anchorStackTopLeft: boolean;
  highContrastHud: boolean;
  enableHoverZoom: boolean;
  logsWidth: number;
  graveyardWidth: number;
  hoverZoomScale: number;
  colorblindMode: ColorblindMode;
  battlefieldStyle: BattlefieldStyle;
  colors: UpkeepColors;
  shortcuts: UpkeepShortcuts;
  selectors: DomSelectorConfig;
}

export interface MtgCard {
  id: string;
  name: string;
  manaCost: string[];
  typeLine: string;
  category: CardCategory;
  rulesText: string;
  stats?: string;
  artUrl: string;
  tapped?: boolean;
  turnAdded?: number;
}

export interface PlayerState {
  name: string;
  archetype: string;
  life: number;
  lastDelta: number | null;
  libraryCount: number;
  handCount: number;
  exileCount: number;
  poisonCount: number;
  graveyard: MtgCard[];
  battlefieldLands: MtgCard[];
  battlefieldCreatures: MtgCard[];
}

export interface GameLogEntry {
  id: string;
  turn: number;
  activePlayer: 'self' | 'opponent';
  time: string;
  actor: 'self' | 'opponent' | 'system';
  message: string;
  cardRef?: string;
  lifeChange?: number;
}

export interface MatchState {
  gameId: string;
  format: string;
  turn: number;
  phase: string;
  priority: 'self' | 'opponent';
  opponent: PlayerState;
  self: PlayerState;
  selfHand: MtgCard[];
  logs: GameLogEntry[];
}
