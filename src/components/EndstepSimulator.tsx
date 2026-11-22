import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Flame,
  Hand,
  Layers,
  Package,
  RefreshCw,
  RotateCcw,
  Skull,
  X,
} from 'lucide-react';
import {
  ART_BOLT,
  ART_DRAGON,
  ART_KNIGHT,
  ART_SANCTUM,
  OPPONENT_SPELL_POOL,
} from '../data/mockMatch';
import { computeContrastInk } from '../extension/defaults';
import { downloadExtensionPackage, type PackageTarget } from '../extension/packager';
import type { CardCategory, MtgCard, UpkeepConfig } from '../extension/types';
import { CardZoomPreview } from './CardZoomPreview';
import { ManaCost } from './ManaCost';

interface EndstepSimulatorProps {
  config: UpkeepConfig;
}

type GraveyardFilter = 'all' | CardCategory;
type DecisionMode = 'waiting' | 'priority' | 'target' | 'attackers';
type ActiveTurn = 'mine' | 'opp';
type AutoPassKey = 'E' | 'B' | 'R';

const NATIVE_HAND_CARDS: MtgCard[] = [
  {
    id: 'hand-lead',
    name: 'Lead the Stampede',
    manaCost: ['2', 'G'],
    typeLine: 'Sorcery',
    category: 'spell',
    rulesText:
      'Look at the top five cards of your library. You may reveal any number of creature cards from among them and put the revealed cards into your hand.',
    artUrl: ART_SANCTUM,
  },
  {
    id: 'hand-spy',
    name: 'Balustrade Spy',
    manaCost: ['3', 'B'],
    typeLine: 'Creature — Vampire Rogue',
    category: 'creature',
    stats: '2/3',
    rulesText:
      'Flying. When Balustrade Spy enters, target player reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard.',
    artUrl: ART_KNIGHT,
  },
  {
    id: 'hand-fiend',
    name: 'Mesmeric Fiend',
    manaCost: ['1', 'B'],
    typeLine: 'Creature — Nightmare Horror',
    category: 'creature',
    stats: '1/1',
    rulesText:
      'When Mesmeric Fiend enters, target opponent reveals their hand and you choose a nonland card from it. Exile that card.',
    artUrl: ART_BOLT,
  },
  {
    id: 'hand-wall',
    name: 'Overgrown Battlement',
    manaCost: ['1', 'G'],
    typeLine: 'Creature — Wall',
    category: 'creature',
    stats: '0/4',
    rulesText: 'Defender. {T}: Add {G} for each creature with defender you control.',
    artUrl: ART_SANCTUM,
  },
  {
    id: 'hand-vandal',
    name: 'Masked Vandal',
    manaCost: ['1', 'G'],
    typeLine: 'Creature — Shapeshifter',
    category: 'creature',
    stats: '1/3',
    rulesText:
      'Changeling. When Masked Vandal enters, you may exile a creature card from your graveyard to exile target artifact or enchantment.',
    artUrl: ART_DRAGON,
  },
];

const INITIAL_OPP_GRAVEYARD: MtgCard[] = [
  {
    id: 'gy-1',
    name: 'Priest of Titania',
    manaCost: ['1', 'G'],
    typeLine: 'Creature — Elf Druid',
    category: 'creature',
    stats: '1/1',
    rulesText: '{T}: Add {G} for each Elf on the battlefield.',
    artUrl: ART_SANCTUM,
    turnAdded: 2,
  },
  {
    id: 'gy-2',
    name: 'Lead the Stampede',
    manaCost: ['2', 'G'],
    typeLine: 'Sorcery',
    category: 'spell',
    rulesText: 'Look at the top five cards of your library. Reveal any number of creature cards and put them into your hand.',
    artUrl: ART_BOLT,
    turnAdded: 2,
  },
  {
    id: 'gy-3',
    name: 'Lightning Bolt',
    manaCost: ['R'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Lightning Bolt deals 3 damage to any target.',
    artUrl: ART_BOLT,
    turnAdded: 1,
  },
  {
    id: 'gy-4',
    name: 'Lightning Bolt',
    manaCost: ['R'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Lightning Bolt deals 3 damage to any target.',
    artUrl: ART_BOLT,
    turnAdded: 1,
  },
  {
    id: 'gy-5',
    name: "Dragon's Rage Channeler",
    manaCost: ['R'],
    typeLine: 'Creature — Human Shaman',
    category: 'creature',
    stats: '3/3',
    rulesText: 'Whenever you cast a noncreature spell, surveil 1. Delirium — Gets +2/+2 and has flying.',
    artUrl: ART_DRAGON,
    turnAdded: 1,
  },
];

const INITIAL_SELF_GRAVEYARD: MtgCard[] = [
  {
    id: 'sgy-1',
    name: 'Thraben Charm',
    manaCost: ['1', 'W'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Choose one — Deal damage equal to twice the number of creatures you control; destroy target enchantment; or exile target player’s graveyard.',
    artUrl: ART_KNIGHT,
    turnAdded: 3,
  },
  {
    id: 'sgy-2',
    name: 'Prismatic Strands',
    manaCost: ['2', 'W'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Prevent all damage that sources of the color of your choice would deal this turn. Flashback—Tap an untapped white creature you control.',
    artUrl: ART_SANCTUM,
    turnAdded: 2,
  },
];

const SELF_SPELL_POOL: MtgCard[] = [
  {
    id: 'spool-1',
    name: 'Prismatic Strands',
    manaCost: ['2', 'W'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Prevent all damage that sources of the color of your choice would deal this turn. Flashback.',
    artUrl: ART_SANCTUM,
  },
  {
    id: 'spool-2',
    name: 'Lunarch Veteran',
    manaCost: ['W'],
    typeLine: 'Creature — Human Cleric',
    category: 'creature',
    stats: '1/1',
    rulesText: 'Whenever another creature you control enters, you gain 1 life. Disturb {1}{W}.',
    artUrl: ART_KNIGHT,
  },
  {
    id: 'spool-3',
    name: 'Plains',
    manaCost: [],
    typeLine: 'Basic Land — Plains',
    category: 'land',
    rulesText: '{T}: Add {W}.',
    artUrl: ART_SANCTUM,
  },
];

const INITIAL_LOGS = [
  { id: 'l1', turn: 3, actor: 'opp', card: 'Quirion Ranger', text: 'CACB cast Quirion Ranger' },
  { id: 'l2', turn: 3, actor: 'opp', card: 'Lead the Stampede', text: 'CACB cast Lead the Stampede' },
  { id: 'l3', turn: 4, actor: 'self', card: 'Lunarch Veteran', text: 'Jacques Chibrac cast Lunarch Veteran' },
  { id: 'l4', turn: 4, actor: 'self', card: 'Thraben Charm', text: 'Jacques Chibrac cast Thraben Charm → Priest of Titania' },
  { id: 'l5', turn: 4, actor: 'self', card: 'Prismatic Strands', text: 'Jacques Chibrac cast Prismatic Strands (White)' },
];

const PHASES = [
  { id: 'UNTAP', label: 'UNTAP', defaultStop: false },
  { id: 'UPKEEP', label: 'UPKEEP', defaultStop: false },
  { id: 'DRAW', label: 'DRAW', defaultStop: false },
  { id: 'MAIN 1', label: 'MAIN 1', defaultStop: true, active: true },
  { id: 'BEG.', label: 'BEG.', defaultStop: false },
  { id: 'ATK', label: 'ATK', defaultStop: true },
  { id: 'BLK', label: 'BLK', defaultStop: true },
  { id: '1ST', label: '1ST', defaultStop: false },
  { id: 'DMG', label: 'DMG', defaultStop: false },
  { id: 'END C.', label: 'END C.', defaultStop: false },
  { id: 'MAIN 2', label: 'MAIN 2', defaultStop: true },
  { id: 'END', label: 'END', defaultStop: true },
  { id: 'CLEAN', label: 'CLEAN', defaultStop: false },
];

const AUTOPASS_BUTTONS: {
  key: AutoPassKey;
  short: string;
  full: string;
  desc: string;
}[] = [
  {
    key: 'E',
    short: 'EOT',
    full: 'End of Turn',
    desc: 'Auto-pass priority until the end of this turn.',
  },
  {
    key: 'B',
    short: 'MY TURN',
    full: 'Before My Turn',
    desc: 'Auto-pass priority until your next turn begins.',
  },
  {
    key: 'R',
    short: 'ACTION',
    full: 'Action / End Step',
    desc: 'Auto-pass until an opponent acts or end step.',
  },
];

function groupCards(cards: MtgCard[]) {
  const map = new Map<string, { card: MtgCard; qty: number }>();
  for (const card of cards) {
    const key = card.name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      map.set(key, { card, qty: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Rendu d'une carte Magic classique 63:88 — STRICTEMENT INCHANGÉ entre Endstep original et Upkeep.
 */
function NativeMagicCard({
  card,
  onHover,
  compact = false,
}: {
  card: MtgCard;
  onHover: (card: MtgCard | null) => void;
  compact?: boolean;
}) {
  const frameTone = card.manaCost.includes('B')
    ? { outer: '#2B2830', inner: '#D5D2D9', bar: '#B9B5BE' }
    : card.manaCost.includes('G')
    ? { outer: '#264331', inner: '#DCE6DC', bar: '#B8CCB9' }
    : card.manaCost.includes('R')
    ? { outer: '#4A2520', inner: '#E5D5CF', bar: '#CAAEA4' }
    : card.manaCost.includes('W')
    ? { outer: '#4A463A', inner: '#EFECE3', bar: '#D7D1C2' }
    : { outer: '#3D372E', inner: '#E5E0D5', bar: '#C9C1B2' };

  return (
    <div
      onMouseEnter={() => onHover(card)}
      onMouseLeave={() => onHover(null)}
      className={
        compact
          ? 'w-full h-full rounded-[6px] bg-[#0B0B0D] p-[3px] select-none'
          : 'w-[138px] h-[192px] shrink-0 rounded-[8px] bg-[#0B0B0D] p-[5px] shadow-md select-none transition-transform duration-150 hover:-translate-y-2'
      }
    >
      <div
        className="w-full h-full rounded-[4px] p-[3px] flex flex-col justify-between"
        style={{ backgroundColor: frameTone.outer }}
      >
        <div
          className="flex items-center justify-between gap-1 px-1 py-[1px] rounded-[2px] text-[#111]"
          style={{ backgroundColor: frameTone.bar }}
        >
          <span className={`${compact ? 'text-[8px]' : 'text-[9.5px]'} font-bold truncate leading-tight`}>
            {card.name}
          </span>
          {!compact && <ManaCost cost={card.manaCost} compact />}
        </div>

        <div
          className={`${
            compact ? 'flex-1 my-[2px]' : 'h-[70px] my-[3px]'
          } w-full border border-[#111] bg-[#141418] overflow-hidden`}
        >
          <img
            src={card.artUrl}
            alt={card.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        <div
          className={`px-1 py-[1px] rounded-[2px] ${
            compact ? 'text-[7px]' : 'text-[8.5px]'
          } font-semibold text-[#151515] truncate`}
          style={{ backgroundColor: frameTone.bar }}
        >
          {card.typeLine}
        </div>

        {!compact && (
          <div
            className="flex-1 mt-[3px] p-1.5 rounded-[2px] text-[8px] leading-[1.2] text-[#171717] overflow-hidden relative"
            style={{ backgroundColor: frameTone.inner }}
          >
            <p className="line-clamp-4">{card.rulesText}</p>
            {card.stats && (
              <span className="absolute bottom-0.5 right-1 px-1 py-0.5 rounded bg-[#18181B] text-[#F5F2EB] font-mono-tabular text-[8.5px] font-bold leading-none">
                {card.stats}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EndstepSimulator({ config }: EndstepSimulatorProps) {
  const [extensionActive, setExtensionActive] = useState<boolean>(config.enabled);
  const [activeTurn, setActiveTurn] = useState<ActiveTurn>('mine');
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('target');
  const [activeAutoPass, setActiveAutoPass] = useState<AutoPassKey | null>(null);
  const [hoveredAutoPass, setHoveredAutoPass] = useState<AutoPassKey | null>(null);
  const [showStack, setShowStack] = useState<boolean>(false);
  const [holdPriority, setHoldPriority] = useState<boolean>(false);
  const [phaseStops, setPhaseStops] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PHASES.map((p) => [p.id, p.defaultStop]))
  );
  const [oppPhaseStops, setOppPhaseStops] = useState<Record<string, boolean>>(() => ({
    UPKEEP: true,
    ATK: true,
    END: true,
  }));

  const [nativeLogDrawerOpen, setNativeLogDrawerOpen] = useState<boolean>(false);
  const [nativeGyPopupOpen, setNativeGyPopupOpen] = useState<boolean>(false);

  const [oppLife, setOppLife] = useState<number>(14);
  const [oppDelta, setOppDelta] = useState<number | null>(-1);
  const [selfLife, setSelfLife] = useState<number>(21);
  const [selfDelta, setSelfDelta] = useState<number | null>(+1);
  const [oppLib, setOppLib] = useState<number>(45);
  const [oppHand, setOppHand] = useState<number>(6);
  const [selfLib, setSelfLib] = useState<number>(50);

  const [oppGy, setOppGy] = useState<MtgCard[]>(INITIAL_OPP_GRAVEYARD);
  const [selfGy, setSelfGy] = useState<MtgCard[]>(INITIAL_SELF_GRAVEYARD);
  const [oppGyFilter, setOppGyFilter] = useState<GraveyardFilter>('all');
  const [selfGyFilter, setSelfGyFilter] = useState<GraveyardFilter>('all');
  const [oppGyCollapsed, setOppGyCollapsed] = useState<boolean>(false);
  const [selfGyCollapsed, setSelfGyCollapsed] = useState<boolean>(false);

  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [hoveredCard, setHoveredCard] = useState<MtgCard | null>(null);
  const [oppSpellIdx, setOppSpellIdx] = useState<number>(0);
  const [selfSpellIdx, setSelfSpellIdx] = useState<number>(0);
  const [downloading, setDownloading] = useState<PackageTarget | null>(null);

  useEffect(() => {
    setExtensionActive(config.enabled);
  }, [config.enabled]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const k = e.key.toLowerCase();
      if (k === config.shortcuts.toggleTheme.toLowerCase()) {
        setExtensionActive((v) => !v);
      } else if (k === 'e') {
        setActiveAutoPass((cur) => (cur === 'E' ? null : 'E'));
      } else if (k === 'b') {
        setActiveAutoPass((cur) => (cur === 'B' ? null : 'B'));
      } else if (k === 'r') {
        setActiveAutoPass((cur) => (cur === 'R' ? null : 'R'));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config.shortcuts.toggleTheme]);

  const oppGrouped = useMemo(() => {
    const grouped = groupCards(oppGy);
    return oppGyFilter === 'all'
      ? grouped
      : grouped.filter((item) => item.card.category === oppGyFilter);
  }, [oppGy, oppGyFilter]);

  const selfGrouped = useMemo(() => {
    const grouped = groupCards(selfGy);
    return selfGyFilter === 'all'
      ? grouped
      : grouped.filter((item) => item.card.category === selfGyFilter);
  }, [selfGy, selfGyFilter]);

  function triggerOpponentSpell() {
    const tpl = OPPONENT_SPELL_POOL[oppSpellIdx % OPPONENT_SPELL_POOL.length];
    setOppSpellIdx((i) => i + 1);
    const card: MtgCard = { ...tpl, id: `gy-sim-${Date.now()}`, turnAdded: 4 };
    setOppGy((prev) => [card, ...prev]);
    setOppHand((h) => Math.max(0, h - 1));
    if (tpl.name === 'Lightning Bolt') {
      setSelfLife((l) => Math.max(0, l - 3));
      setSelfDelta(-3);
    }
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        turn: 4,
        actor: 'opp',
        card: tpl.name,
        text: `CACB resolved ${tpl.name}`,
      },
    ]);
  }

  function triggerSelfSpell() {
    const tpl = SELF_SPELL_POOL[selfSpellIdx % SELF_SPELL_POOL.length];
    setSelfSpellIdx((i) => i + 1);
    const card: MtgCard = { ...tpl, id: `sgy-sim-${Date.now()}`, turnAdded: 4 };
    setSelfGy((prev) => [card, ...prev]);
    setSelfLib((l) => Math.max(0, l - 1));
    setLogs((prev) => [
      ...prev,
      {
        id: `slog-${Date.now()}`,
        turn: 4,
        actor: 'self',
        card: tpl.name,
        text: `Jacques Chibrac put ${tpl.name} into graveyard`,
      },
    ]);
  }

  function triggerLifeLoss() {
    setOppLife((l) => Math.max(0, l - 3));
    setOppDelta(-3);
    setLogs((prev) => [
      ...prev,
      {
        id: `dmg-${Date.now()}`,
        turn: 4,
        actor: 'self',
        card: 'Damage',
        text: `Damage: CACB -3 (${Math.max(0, oppLife - 3)} life)`,
      },
    ]);
  }

  function resetDemo() {
    setOppLife(14);
    setOppDelta(-1);
    setSelfLife(21);
    setSelfDelta(+1);
    setOppLib(45);
    setOppHand(6);
    setSelfLib(50);
    setOppGy(INITIAL_OPP_GRAVEYARD);
    setSelfGy(INITIAL_SELF_GRAVEYARD);
    setLogs(INITIAL_LOGS);
    setDecisionMode('target');
    setActiveTurn('mine');
    setActiveAutoPass(null);
    setShowStack(false);
    setNativeLogDrawerOpen(false);
    setNativeGyPopupOpen(false);
  }

  async function quickDownload(target: PackageTarget) {
    setDownloading(target);
    try {
      await downloadExtensionPackage(target, config);
    } finally {
      setDownloading(null);
    }
  }

  const hoveredTooltipMeta = hoveredAutoPass
    ? AUTOPASS_BUTTONS.find((b) => b.key === hoveredAutoPass) ?? null
    : null;

  const palette = config.colors;
  const phaseCurrentInk = computeContrastInk(palette.phaseCurrent);
  const bfOppHex = activeTurn === 'mine' ? palette.bfOppMyTurn : palette.bfOppOppTurn;
  const bfSelfHex = activeTurn === 'mine' ? palette.bfSelfMyTurn : palette.bfSelfOppTurn;
  const isColorblindEnhanced = config.colorblindMode !== 'none';
  const criticalLifeHex =
    config.colorblindMode === 'deuteranopia'
      ? '#d55e00'
      : config.colorblindMode === 'tritanopia'
      ? '#ff4d6d'
      : config.colorblindMode === 'high-contrast'
      ? '#ff5a5f'
      : '#e05a5a';
  const gainLifeHex =
    config.colorblindMode === 'deuteranopia'
      ? '#009e73'
      : config.colorblindMode === 'tritanopia'
      ? '#00c2b2'
      : config.colorblindMode === 'high-contrast'
      ? '#3ef0a8'
      : '#4cb782';

  return (
    <section className="space-y-5">
      {/* Header + 1-Click Chrome / Firefox MV3 Builds */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[rgba(242,238,230,0.09)]">
        <div className="max-w-3xl">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#F2EEE6] text-balance">
            Simulateur fidèle d’Upkeep sur endstep.cc (/game/* &amp; /spectate/*)
          </h1>
          <p className="mt-1 text-sm text-[#9CA3B2]">
            Testez en direct les couleurs hexadécimales &amp; presets daltoniens, les battlefields
            selon le tour actif, la barre de ciblage lisible, la barre de phases médiane, le Game
            Log verrouillé à gauche et le double cimetière visuel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => quickDownload('chrome')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-[#C9A45C] hover:bg-[#DFBD78] text-[#0E1116] border border-[#DFBD78]/60 text-[11px] font-bold uppercase tracking-[0.07em] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading === 'chrome' ? 'Build...' : 'ZIP Chrome (MV3)'}</span>
          </button>
          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => quickDownload('firefox')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-[#181D27] hover:bg-[#232A38] text-[#F2EEE6] border border-[#C9A45C]/50 hover:border-[#C9A45C] text-[11px] font-bold uppercase tracking-[0.07em] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Package className="w-3.5 h-3.5 text-[#C9A45C]" />
            <span>{downloading === 'firefox' ? 'Build...' : 'ZIP Firefox (AMO)'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Controls: Upkeep ON/OFF + Decision State Tester + Live Events */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Before / After toggle */}
          <div
            className="inline-flex items-center p-0.5 rounded-none bg-[#151922] border border-[rgba(242,238,230,0.14)]"
            role="group"
            aria-label="Basculer l'injection CSS/JS Upkeep"
          >
            <button
              type="button"
              onClick={() => setExtensionActive(true)}
              className={`px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] rounded-none transition-colors whitespace-nowrap cursor-pointer ${
                extensionActive
                  ? 'bg-[#C9A45C] text-[#0E1116]'
                  : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
              }`}
            >
              Upkeep injecté
            </button>
            <button
              type="button"
              onClick={() => setExtensionActive(false)}
              className={`px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] rounded-none transition-colors whitespace-nowrap cursor-pointer ${
                !extensionActive
                  ? 'bg-[#26211B] text-[#F2EEE6]'
                  : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
              }`}
            >
              Endstep original
            </button>
          </div>

          {/* Active turn switcher (tests all 4 battlefield hex colors) */}
          <div
            className="inline-flex items-center p-0.5 rounded-none bg-[#151922] border border-[rgba(242,238,230,0.14)]"
            role="group"
            aria-label="Basculer le tour actif"
          >
            {(
              [
                ['mine', 'Mon tour'],
                ['opp', 'Tour adverse'],
              ] as [ActiveTurn, string][]
            ).map(([turn, label]) => (
              <button
                key={turn}
                type="button"
                onClick={() => setActiveTurn(turn)}
                className={`px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] rounded-none transition-colors whitespace-nowrap cursor-pointer ${
                  activeTurn === turn
                    ? 'bg-[#222B3B] text-[#F3C969]'
                    : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Decision state switcher (proves ZERO Game Log jump + bright Target Bar) */}
          <div
            className="inline-flex items-center p-0.5 rounded-none bg-[#151922] border border-[rgba(242,238,230,0.14)]"
            role="group"
            aria-label="Tester la hauteur fixe Decision / Waiting / Target"
          >
            {(
              [
                ['waiting', 'Waiting'],
                ['priority', 'Pass Priority'],
                ['target', 'Target (0/1)'],
                ['attackers', 'Attackers'],
              ] as [DecisionMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDecisionMode(mode)}
                className={`px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] rounded-none transition-colors whitespace-nowrap cursor-pointer ${
                  decisionMode === mode
                    ? 'bg-[#222B3B] text-[#F3C969]'
                    : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Live gameplay triggers */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={triggerOpponentSpell}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] rounded-none bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60 whitespace-nowrap cursor-pointer transition-colors"
          >
            + Cimetière adv.
          </button>
          <button
            type="button"
            onClick={triggerSelfSpell}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] rounded-none bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60 whitespace-nowrap cursor-pointer transition-colors"
          >
            + Mon cimetière
          </button>
          <button
            type="button"
            onClick={() => setShowStack((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] rounded-none border whitespace-nowrap cursor-pointer transition-colors ${
              showStack
                ? 'bg-[#C9A45C]/15 border-[#C9A45C] text-[#C9A45C]'
                : 'bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>The Stack</span>
          </button>
          <button
            type="button"
            onClick={triggerLifeLoss}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] rounded-none bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60 whitespace-nowrap cursor-pointer transition-colors"
          >
            -3 PV adv.
          </button>
          <button
            type="button"
            onClick={resetDemo}
            aria-label="Réinitialiser l'aperçu"
            className="p-1.5 rounded-none bg-[#151922] hover:bg-[#1E2432] text-[#9CA3B2] hover:text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[rgba(242,238,230,0.32)] cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Simulated Browser Viewport */}
      <div className="rounded-none border border-[rgba(242,238,230,0.16)] overflow-hidden shadow-2xl">
        {/* Browser Chrome Bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-[#11141B] border-b border-[rgba(242,238,230,0.08)] text-xs">
          <span className="font-mono-tabular text-[#D8D3C9] truncate">
            https://endstep.cc/game/70c0f6cc-024a-452a-9f87-bf0b822d0423
          </span>
          <button
            type="button"
            onClick={() => setExtensionActive((v) => !v)}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-none border text-[11px] font-semibold tracking-wide whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              extensionActive
                ? 'bg-[#C9A45C]/15 border-[#C9A45C]/60 text-[#C9A45C]'
                : 'bg-[#181C24] border-[rgba(242,238,230,0.16)] text-[#9CA3B2]'
            }`}
          >
            <span className="font-display font-bold">U</span>
            <span>{extensionActive ? 'Upkeep actif (touche U)' : 'Extension en pause'}</span>
          </button>
        </div>

        {/* ==================================================================== */}
        {/* REAL 3-COLUMN ENDSTEP LAYOUT WITH / WITHOUT UPKEEP INJECTION         */}
        {/* ==================================================================== */}
        <div
          className={`flex h-[760px] relative transition-colors duration-200 ${
            extensionActive ? 'bg-[#0B0E14] text-[#F4F6FA]' : 'bg-[#0D0A07] text-[#D7C9AD]'
          }`}
        >
          {/* ================================================================ */}
          {/* LEFT RAIL: Opp Plate + Fixed Log + Fixed Decision + 3-btn AP + Me */}
          {/* ================================================================ */}
          <aside
            style={{ width: extensionActive ? `${config.logsWidth}px` : '218px' }}
            className={`shrink-0 flex flex-col justify-between relative transition-all duration-200 ${
              extensionActive
                ? 'bg-[#0F131B] border-r border-[rgba(242,238,230,0.09)] p-1.5 gap-1.5'
                : 'bg-[#14100B] border-r border-[#33291E]'
            }`}
          >
            {/* 1. OPPONENT PLATE */}
            <div
              className={
                extensionActive
                  ? 'rounded-none bg-[#151A24] border border-[rgba(242,238,230,0.1)] p-2.5 shrink-0'
                  : 'p-3 border-b border-[#292118] shrink-0'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    extensionActive
                      ? 'font-display text-xs font-bold text-[#F4F6FA]'
                      : 'font-serif text-xs text-[#C4A874]'
                  }
                >
                  CACB
                </span>
                <span className="font-mono-tabular text-[11px] text-[#8E98AC]">23:31</span>
              </div>

              {extensionActive && config.highContrastHud ? (
                <div className="mt-1.5 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-mono-tabular text-3xl font-bold leading-none"
                      style={{ color: oppLife <= 5 ? criticalLifeHex : palette.lifeNormal }}
                    >
                      {oppLife}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wider text-[#8E98AC]">
                      LIFE
                    </span>
                    {oppDelta !== null && (
                      <span
                        className="font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded-none"
                        style={{
                          backgroundColor: `${oppDelta < 0 ? criticalLifeHex : gainLifeHex}24`,
                          color: oppDelta < 0 ? criticalLifeHex : gainLifeHex,
                        }}
                      >
                        {oppDelta > 0 ? `+${oppDelta}` : oppDelta}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">
                        {oppLib}
                      </span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        DECK
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">
                        {oppHand}
                      </span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        HAND
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#C9A45C]/12 border border-[#C9A45C]/35">
                      <span className="font-mono-tabular text-xs font-bold text-[#C9A45C]">
                        {oppGy.length}
                      </span>
                      <span className="text-[8.5px] font-semibold tracking-wide text-[#C9A45C]">
                        GRAVEYARD
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">0</span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        EXILE
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-xl font-bold text-[#E6D3A7] leading-none">
                      {oppLife}
                    </span>
                    <span className="text-[10px] tracking-wider text-[#9E8B67]">LIFE</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#B8A684]">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3 opacity-70" />
                      {oppLib}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Hand className="w-3 h-3 opacity-70" />
                      {oppHand}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNativeGyPopupOpen(true)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1C160F] border border-[#34291C] text-[10px] hover:text-[#E6D3A7] cursor-pointer"
                    >
                      <Skull className="w-3 h-3" />
                      {oppGy.length}
                    </button>
                    <span className="inline-flex items-center gap-1 opacity-70">
                      <Flame className="w-3 h-3" />0
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. DOCKED GAME LOG (STRICTLY FIXED HEIGHT IN UPKEEP, COLLAPSED TAB IN NATIVE) */}
            {extensionActive && config.autoOpenLogsLeft ? (
              <div className="flex-1 min-h-0 rounded-none bg-[#151A24] border border-[#C9A45C]/35 flex flex-col overflow-hidden">
                <div className="px-2.5 py-1.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] flex items-center justify-between shrink-0">
                  <span className="text-xs font-bold text-[#F4F6FA]">Game Log</span>
                  <span className="font-mono-tabular text-[10px] text-[#8E98AC]">
                    Taille fixe · {logs.length}
                  </span>
                </div>
                <div className="px-2.5 py-1 bg-[#C9A45C]/10 border-b border-[rgba(242,238,230,0.06)] flex items-center justify-between text-[10px] font-semibold text-[#C9A45C] shrink-0">
                  <span>T4 · YOUR TURN</span>
                  <span className="text-[#8E98AC]">MAIN 1</span>
                </div>
                <div className="flex-1 overflow-y-auto upkeep-scroll px-2.5 py-2 space-y-1.5">
                  {logs.map((entry) => (
                    <div key={entry.id} className="text-[11px] leading-snug text-[#D4DCE9]">
                      <span className="text-[#C9A45C] mr-1.5">✦</span>
                      <span>{entry.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 relative flex items-center">
                <button
                  type="button"
                  onClick={() => setNativeLogDrawerOpen((v) => !v)}
                  className="bg-[#1D1710] hover:bg-[#292117] border border-l-0 border-[#3A2E20] px-1 py-3 rounded-r text-[10px] text-[#A89674] [writing-mode:vertical-rl] cursor-pointer"
                >
                  Log
                </button>
                {nativeLogDrawerOpen && (
                  <div className="absolute left-6 top-2 bottom-2 w-56 z-30 bg-[#17120C] border border-[#3E3223] p-2.5 overflow-y-auto text-[11px] space-y-1.5 shadow-xl">
                    <div className="flex justify-between text-[#D9C498] font-semibold pb-1 border-b border-[#2D2419]">
                      <span>Game Log</span>
                      <button
                        type="button"
                        onClick={() => setNativeLogDrawerOpen(false)}
                        className="cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {logs.map((entry) => (
                      <div key={entry.id} className="text-[#B4A383]">
                        {entry.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. FIXED-HEIGHT DECISION / WAITING SLOT (184px fixed in Upkeep vs jumping in Original) */}
            {extensionActive ? (
              <div
                className={`h-[184px] shrink-0 rounded-none flex flex-col overflow-hidden ${
                  decisionMode === 'waiting'
                    ? 'bg-[#151A24] border border-[rgba(242,238,230,0.14)]'
                    : 'bg-[#151A24] border border-[#C9A45C]/45 shadow-md'
                }`}
                style={
                  decisionMode === 'waiting'
                    ? {
                        backgroundImage:
                          'radial-gradient(ellipse at 50% 48%, rgba(201, 164, 92, 0.065) 0%, transparent 72%)',
                      }
                    : undefined
                }
              >
                {decisionMode === 'waiting' ? (
                  <>
                    <div className="h-[28px] shrink-0 px-2.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-[0.14em] text-[#BCC5D4]">
                        WAITING
                      </span>
                      <span
                        aria-hidden="true"
                        className="w-[5px] h-[5px] bg-[#C9A45C] shadow-[0_0_6px_rgba(201,164,92,0.55)] animate-pulse"
                      />
                    </div>
                    <div className="flex-1 min-h-0 px-4 py-5 flex flex-col items-center justify-center text-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="w-7 h-7 rounded-full border-2 border-[#C9A45C]/15 border-t-[#C9A45C] border-r-[#C9A45C]/55 animate-spin"
                      />
                      <div className="text-[13.5px] font-semibold text-[#F4F6FA] leading-snug">
                        CACB is deciding.
                      </div>
                      <div className="text-[11px] font-medium text-[#8490A3] tracking-[0.02em] leading-tight">
                        Opponent has priority
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Sleek 28px header bar (no 70px SVG bloat) */}
                    <div className="h-[28px] shrink-0 px-2.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-[0.12em] text-[#C9A45C]">
                        DECISION
                      </span>
                      <span className="font-mono-tabular text-[9.5px] text-[#7E889C]">
                        Hauteur fixe
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto upkeep-scroll p-2.5 flex flex-col">
                      {decisionMode === 'priority' ? (
                        <>
                          <div className="text-[12.5px] font-bold text-white leading-tight">
                            Opponent&apos;s upkeep
                          </div>
                          <div className="text-[11px] text-[#D4DCE9] mt-0.5">
                            Abilities may trigger. Respond or pass.
                          </div>
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() => setDecisionMode('waiting')}
                              className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-none bg-[#232D40] hover:bg-[#2C3850] border border-[#C9A45C]/55 hover:border-[#C9A45C] text-[11px] font-bold tracking-[0.06em] text-white cursor-pointer transition-colors"
                            >
                              <span>PASS PRIORITY</span>
                              <span className="px-1.5 py-0.5 rounded-none bg-[#111620] border border-white/20 text-[9.5px] font-mono-tabular text-[#C9A45C]">
                                SPACE
                              </span>
                            </button>
                          </div>
                        </>
                      ) : decisionMode === 'target' ? (
                        <>
                          <div className="text-[12.5px] font-bold text-white leading-tight">
                            Choose target creature
                          </div>
                          <div className="text-[11px] text-[#D4DCE9] mt-0.5">
                            Cast Lightning Bolt — select 1 target.
                          </div>
                          {/* Fixed bright Target Bar (Issue #1 screenshot 2) */}
                          <div className="mt-2.5 px-2 py-1.5 bg-[#0E131D] border border-white/15 flex items-center gap-2">
                            <span
                              className="w-2 h-2 shrink-0"
                              style={{ backgroundColor: palette.targetBar }}
                            />
                            <span
                              className="font-mono-tabular text-[11px] font-bold shrink-0"
                              style={{ color: palette.targetBar }}
                            >
                              0/1
                            </span>
                            <span className="flex-1 h-1.5 bg-white/15 overflow-hidden">
                              <span
                                className="block h-full w-1/3"
                                style={{ backgroundColor: palette.targetBar }}
                              />
                            </span>
                            <span
                              className="text-[10px] font-bold tracking-wider uppercase whitespace-nowrap"
                              style={{ color: palette.targetBar }}
                            >
                              NEED 1 MORE
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDecisionMode('priority')}
                              className="px-2 py-1.5 rounded-none bg-[#1B2230] hover:bg-[#242D40] border border-white/20 text-[10px] font-bold tracking-[0.06em] text-[#E4E8F0] cursor-pointer"
                            >
                              CANCEL [ESC]
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecisionMode('waiting')}
                              className="px-2 py-1.5 rounded-none bg-[#232D40] hover:bg-[#2C3850] border border-[#C9A45C]/65 text-[10px] font-bold tracking-[0.06em] text-white cursor-pointer"
                            >
                              CONFIRM [SPACE]
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[12.5px] font-bold text-white leading-tight">
                            Declare Attackers
                          </div>
                          <div className="text-[10px] font-bold tracking-wider text-[#F3C969] mt-0.5">
                            • CLICK TO SELECT
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                            {[
                              'ALPHA STRIKE',
                              'SKIP COMBAT',
                              'DONE SELECTING ATTACKERS',
                            ].map((label) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => setDecisionMode('priority')}
                                className="w-full px-2 py-1.5 rounded-none bg-[#232D40] hover:bg-[#2C3850] border border-[#C9A45C]/55 hover:border-[#C9A45C] text-[10.5px] font-bold tracking-[0.06em] text-white truncate cursor-pointer transition-colors"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Original Endstep: dynamically jumping Waiting / Decision box */
              <div className="px-2.5 pb-1.5">
                {decisionMode === 'waiting' ? (
                  <div className="rounded border border-[#30261B] bg-[#19130D] p-2 text-[11px]">
                    <div className="text-[10px] tracking-widest text-[#C4A874]">WAITING</div>
                    <div className="text-[#9E8B67]">CACB is deciding.</div>
                  </div>
                ) : decisionMode === 'target' ? (
                  <div className="rounded border border-[#6E5937] bg-[#18120C] p-2.5 space-y-2 text-[11px]">
                    <div className="font-semibold text-[#F0DFB8]">Choose target creature</div>
                    {/* Original low-contrast dark target bar bug */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-[#3C3328] font-mono-tabular">0/1</span>
                      <span className="flex-1 h-1 bg-[#262018]" />
                      <span className="text-[#6E2626] font-semibold">NEED 1 MORE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDecisionMode('priority')}
                        className="py-1.5 rounded bg-[#231B12] border border-[#4A3B28] text-[10px] text-[#C4A874] cursor-pointer"
                      >
                        CANCEL [ESC]
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecisionMode('waiting')}
                        className="py-1.5 rounded bg-[#2A2016] border border-[#4A3B28] text-[10px] text-[#9E8B67] cursor-pointer"
                      >
                        CONFIRM [SPACE]
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-[#6E5937] bg-[#261D13] p-2.5 space-y-2 text-[11px]">
                    <div className="py-3 text-center font-serif tracking-widest text-[#D9BE8B] border-b border-[#3E3122]">
                      DECISION
                    </div>
                    <div className="font-semibold text-[#F0DFB8]">
                      {decisionMode === 'priority' ? "Opponent's upkeep" : 'Declare Attackers'}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDecisionMode(decisionMode === 'priority' ? 'waiting' : 'priority')
                      }
                      className="w-full py-1.5 rounded bg-[#35291B] border border-[#6E5937] text-[10px] font-semibold text-[#F0DFB8] cursor-pointer"
                    >
                      {decisionMode === 'priority' ? 'PASS PRIORITY' : 'DONE SELECTING ATTACKERS'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 4. AUTO-PASS: COMPACT 1-ROW 3 BUTTONS + TOOLTIP (Upkeep) vs BULKY 3-ROW STACK (Original) */}
            {extensionActive ? (
              <div className="relative shrink-0">
                {/* Floating Tooltip above hovered Auto-Pass button */}
                {hoveredTooltipMeta && (
                  <div
                    role="tooltip"
                    className="absolute bottom-[36px] left-0 right-0 z-40 px-2.5 py-2 rounded-none bg-[#0F141D] border border-[#C9A45C]/50 shadow-xl pointer-events-none"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold tracking-wide uppercase text-[#C9A45C]">
                      <span>{hoveredTooltipMeta.full}</span>
                      <span className="px-1.5 py-0.5 rounded-none bg-[#111620] border border-white/20 font-mono-tabular text-[9.5px] text-white">
                        {hoveredTooltipMeta.key}
                      </span>
                    </div>
                    <div className="mt-1 text-[10.5px] text-[#D4DCE9] leading-snug">
                      {hoveredTooltipMeta.desc}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5">
                  {AUTOPASS_BUTTONS.map((btn) => {
                    const isPressed = activeAutoPass === btn.key;
                    return (
                      <button
                        key={btn.key}
                        type="button"
                        aria-pressed={isPressed}
                        onClick={() => {
                          setHoveredAutoPass(null);
                          setActiveAutoPass((cur) => (cur === btn.key ? null : btn.key));
                        }}
                        onMouseEnter={() => setHoveredAutoPass(btn.key)}
                        onMouseLeave={() => setHoveredAutoPass(null)}
                        onFocus={() => setHoveredAutoPass(btn.key)}
                        onBlur={() => setHoveredAutoPass(null)}
                        className={`h-[30px] px-1 rounded-none border flex items-center justify-center gap-1 text-[9.5px] font-bold tracking-[0.04em] whitespace-nowrap cursor-pointer transition-colors ${
                          isPressed
                            ? 'bg-[#C9A45C]/18 border-[#C9A45C] text-[#C9A45C]'
                            : 'bg-[#151A24] hover:bg-[#1E2636] border-[rgba(242,238,230,0.12)] hover:border-[#C9A45C]/50 text-[#B4BECE] hover:text-[#F4F6FA]'
                        }`}
                      >
                        <span>{btn.short}</span>
                        <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-none bg-[#111620] border border-white/15 font-mono-tabular text-[9px] font-bold text-[#C9A45C]">
                          {btn.key}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-2.5 pb-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#9E8B67]">
                  <span className="font-semibold tracking-wider">AUTO-PASS</span>
                  <span>skip ahead</span>
                </div>
                {AUTOPASS_BUTTONS.map((btn) => (
                  <div
                    key={btn.key}
                    className="flex items-center justify-between px-2 py-1.5 rounded bg-[#211A12] border border-[#30261B] text-[10px] text-[#B8A684]"
                  >
                    <span>{btn.full.toUpperCase()}</span>
                    <span className="font-mono-tabular opacity-75">{btn.key}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 5. SELF PLATE */}
            <div
              className={
                extensionActive
                  ? 'rounded-none bg-[#151A24] border border-[rgba(242,238,230,0.1)] p-2.5 shrink-0'
                  : 'p-3 border-t border-[#292118] shrink-0'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    extensionActive
                      ? 'font-display text-xs font-bold text-[#F4F6FA]'
                      : 'font-serif text-xs text-[#C4A874]'
                  }
                >
                  Jacques Chibrac
                </span>
                <span className="font-mono-tabular text-[11px] text-[#C9A45C]">22:19</span>
              </div>

              {extensionActive && config.highContrastHud ? (
                <div className="mt-1.5 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-mono-tabular text-3xl font-bold leading-none"
                      style={{ color: selfLife <= 5 ? criticalLifeHex : palette.lifeNormal }}
                    >
                      {selfLife}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wider text-[#8E98AC]">
                      LIFE
                    </span>
                    {selfDelta !== null && (
                      <span
                        className="font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded-none"
                        style={{
                          backgroundColor: `${selfDelta < 0 ? criticalLifeHex : gainLifeHex}24`,
                          color: selfDelta < 0 ? criticalLifeHex : gainLifeHex,
                        }}
                      >
                        {selfDelta > 0 ? `+${selfDelta}` : selfDelta}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">
                        {selfLib}
                      </span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        DECK
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">
                        {NATIVE_HAND_CARDS.length}
                      </span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        HAND
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#7CAEE6]/12 border border-[#7CAEE6]/35">
                      <span className="font-mono-tabular text-xs font-bold text-[#8CBEF5]">
                        {selfGy.length}
                      </span>
                      <span className="text-[8.5px] font-semibold tracking-wide text-[#8CBEF5]">
                        GRAVEYARD
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded-none bg-[#10141D] border border-[rgba(242,238,230,0.08)]">
                      <span className="font-mono-tabular text-xs font-bold text-[#F4F6FA]">0</span>
                      <span className="text-[9px] font-semibold tracking-wide text-[#7E889C]">
                        EXILE
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="font-serif text-lg font-bold text-[#E6D3A7]">
                    {selfLife} <span className="text-[10px] font-normal text-[#9E8B67]">LIFE</span>
                  </span>
                  <span className="text-[11px] text-[#B8A684]">
                    {selfLib} Deck · {NATIVE_HAND_CARDS.length} Hand
                  </span>
                </div>
              )}
            </div>
          </aside>

          {/* ================================================================ */}
          {/* CENTER BATTLEFIELD + HORIZONTAL MIDLINE PHASE BAR + UNTOUCHED HAND */}
          {/* ================================================================ */}
          <div className="flex-1 min-w-0 flex flex-col justify-between relative overflow-hidden">
            {/* Optional Floating "The Stack" anchored Top-Left of Battlefield */}
            {showStack && (
              <div
                className={`absolute z-30 w-[228px] border shadow-2xl overflow-hidden ${
                  extensionActive
                    ? 'rounded-none bg-[#151A24] border-[#C9A45C]/45'
                    : 'rounded-lg bg-[#1D160F] border-[#6E5937]'
                } ${
                  extensionActive && config.anchorStackTopLeft
                    ? 'top-2.5 left-2.5'
                    : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                }`}
              >
                <div className="px-3 py-1.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] flex items-center justify-between text-xs font-bold">
                  <span>The Stack · 2</span>
                  <button
                    type="button"
                    onClick={() => setShowStack(false)}
                    className="text-[#8E98AC] hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2 space-y-1.5 text-[11px]">
                  <div className="px-2 py-1.5 rounded-none bg-[#0F131B] border border-[#C9A45C]/30 flex items-center justify-between">
                    <span className="font-semibold text-[#F4F6FA]">Prismatic Strands</span>
                    <span className="text-[10px] text-[#C9A45C]">Top</span>
                  </div>
                  <div className="px-2 py-1.5 rounded-none bg-[#0F131B] border border-[rgba(242,238,230,0.08)] flex items-center justify-between">
                    <span className="text-[#C8D1DF]">Lightning Bolt</span>
                    <span className="text-[10px] text-[#7E889C]">→ Jacques</span>
                  </div>
                </div>
              </div>
            )}

            {/* Opponent Battlefield (Turn-Aware Hex Color) */}
            <div
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
                extensionActive
                  ? ''
                  : 'border-b border-[#3D3122] bg-gradient-to-b from-[#334F77]/55 via-[#182231]/45 to-transparent'
              }`}
              style={
                extensionActive
                  ? {
                      background: `linear-gradient(180deg, ${bfOppHex} 0%, ${bfOppHex}cc 75%, #0b0e14 100%)`,
                    }
                  : undefined
              }
            >
              <span
                className={`text-xs italic ${
                  extensionActive ? 'text-[#8C98AD]' : 'text-[#847862]'
                }`}
              >
                Opponent battlefield — {activeTurn === 'opp' ? 'Tour adverse (actif)' : 'Votre tour (passif)'}
              </span>
              {extensionActive && (
                <span className="font-mono-tabular text-[10px] text-[#6E7B91] uppercase">
                  {bfOppHex}
                </span>
              )}
            </div>

            {/* HORIZONTAL NATIVE MIDLINE PHASE BAR (when Upkeep + showMidlineTimeline ON) */}
            {extensionActive && config.showMidlineTimeline && (
              <div
                className="h-[46px] shrink-0 px-2.5 flex items-center gap-1 bg-[#121722] border-y border-[#C9A45C]/30 overflow-visible"
                aria-label="Barre de phases native sur la ligne médiane"
              >
                {PHASES.map((phase) => {
                  const hasMineStop = Boolean(phaseStops[phase.id]);
                  const hasOppStop = Boolean(oppPhaseStops[phase.id]);
                  const isCurrent = Boolean(phase.active);
                  return (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() =>
                        activeTurn === 'mine'
                          ? setPhaseStops((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))
                          : setOppPhaseStops((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))
                      }
                      title="Cliquer pour activer/retirer un stop de phase (selon le tour actif)"
                      className={`relative min-w-0 h-[30px] px-1 rounded-none font-mono-tabular transition-colors cursor-pointer border flex items-center justify-center ${
                        isCurrent
                          ? 'flex-[1.4] overflow-visible z-10 text-[10.5px] font-extrabold tracking-[0.05em]'
                          : 'flex-1 overflow-hidden text-[10px] font-semibold tracking-[0.03em]'
                      }`}
                      style={
                        isCurrent
                          ? {
                              backgroundColor: '#1B2232',
                              borderColor: `${palette.phaseCurrent}d9`,
                              borderWidth: '1.5px',
                              color: '#FFFFFF',
                              boxShadow: `inset 0 0 12px ${palette.phaseCurrent}29, 0 0 10px ${palette.phaseCurrent}3d`,
                            }
                          : {
                              backgroundColor:
                                hasMineStop || hasOppStop ? '#1A2130' : 'rgba(255,255,255,0.03)',
                              borderColor:
                                hasMineStop || hasOppStop
                                  ? 'rgba(244,246,250,0.16)'
                                  : 'rgba(244,246,250,0.08)',
                              color: hasMineStop || hasOppStop ? '#E5E9F0' : '#8A95A9',
                            }
                      }
                    >
                      {/* Top downward red pointer arrow (▼) on current step */}
                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-[8px] z-20"
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: `7px solid ${palette.phaseCurrent}`,
                            filter: `drop-shadow(0 0 3px ${palette.phaseCurrent}b3)`,
                          }}
                        />
                      )}
                      {/* Top Stop Bar: Your Turn Stop */}
                      {hasMineStop && (
                        <span
                          aria-hidden="true"
                          className="absolute top-0 left-0 w-1/2"
                          style={{
                            height: isColorblindEnhanced ? '4px' : '3px',
                            backgroundColor: palette.phaseStopMine,
                            borderBottom: isColorblindEnhanced ? '1px solid #0b0e14' : undefined,
                          }}
                        />
                      )}
                      <span className="truncate uppercase leading-none">{phase.label}</span>
                      {/* Bottom Stop Bar: Opponent Turn Stop */}
                      {hasOppStop && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 right-0 w-1/2"
                          style={{
                            height: isColorblindEnhanced ? '4px' : '3px',
                            backgroundColor: palette.phaseStopOpp,
                            borderTop: isColorblindEnhanced ? '1px solid #0b0e14' : undefined,
                          }}
                        />
                      )}
                      {/* Bottom upward red pointer arrow (▲) on current step */}
                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-[8px] z-20"
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderBottom: `7px solid ${palette.phaseCurrent}`,
                            filter: `drop-shadow(0 0 3px ${palette.phaseCurrent}b3)`,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Player Battlefield (Turn-Aware Hex Color) */}
            <div
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200"
              style={
                extensionActive
                  ? {
                      background: `linear-gradient(0deg, ${bfSelfHex} 0%, ${bfSelfHex}cc 75%, #0b0e14 100%)`,
                    }
                  : undefined
              }
            >
              <span
                className={`text-xs italic ${
                  extensionActive ? 'text-[#8C98AD]' : 'text-[#847862]'
                }`}
              >
                Your battlefield — {activeTurn === 'mine' ? 'Votre tour (actif)' : 'Tour adverse (passif)'}
              </span>
              {extensionActive && (
                <span className="font-mono-tabular text-[10px] text-[#6E7B91] uppercase">
                  {bfSelfHex}
                </span>
              )}
            </div>

            {/* Bottom Hand — 100% UNTOUCHED MAGIC CARDS */}
            <div className="px-3 pb-2.5 pt-1.5 overflow-x-auto upkeep-scroll shrink-0">
              <div className="flex items-end gap-2">
                {NATIVE_HAND_CARDS.map((card) => (
                  <NativeMagicCard key={card.id} card={card} onHover={setHoveredCard} />
                ))}
              </div>
            </div>

            {/* Native Graveyard Modal (Only when extension is OFF) */}
            {!extensionActive && nativeGyPopupOpen && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4">
                <div className="w-full max-w-sm rounded-lg bg-[#18130D] border border-[#3E3223] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#E6D3A7]">
                    <span>CACB — Graveyard ({oppGy.length})</span>
                    <button
                      type="button"
                      onClick={() => setNativeGyPopupOpen(false)}
                      className="cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs text-[#C5B699]">
                    {oppGy.map((c) => (
                      <div key={c.id} className="py-1 border-b border-[#2C241A]">
                        {c.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================ */}
          {/* RIGHT RAIL: Compact Turn Header + Dual 2-Column Visual Graveyards */}
          {/* ================================================================ */}
          {extensionActive ? (
            <aside
              style={{ width: `${config.graveyardWidth}px` }}
              className="shrink-0 bg-[#0F131B] border-l border-[rgba(242,238,230,0.09)] p-1.5 flex flex-col gap-1.5 overflow-hidden"
            >
              {/* Compact Turn / Priority Card */}
              <div className="rounded-none bg-[#151A24] border border-[rgba(242,238,230,0.1)] px-2.5 py-2 flex items-center justify-between gap-2 shrink-0">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-[#C9A45C]">
                    {activeTurn === 'mine' ? 'YOUR TURN · T4' : 'OPPONENT TURN · T4'}
                  </div>
                  <div className="text-[10px] text-[#8E98AC]">MAIN 1 · PRIORITY</div>
                </div>
                <button
                  type="button"
                  onClick={() => setHoldPriority((v) => !v)}
                  className={`px-2 py-1 rounded-none border text-[10px] font-bold uppercase tracking-[0.04em] whitespace-nowrap cursor-pointer transition-colors ${
                    holdPriority
                      ? 'bg-[#C9A45C]/18 border-[#C9A45C] text-[#C9A45C]'
                      : 'bg-[#10141D] border-[rgba(242,238,230,0.14)] text-[#9CA3B2] hover:text-white hover:border-[#C9A45C]/50'
                  }`}
                >
                  {holdPriority ? 'Hold ON' : 'Hold Priority'}
                </button>
              </div>

              {/* Dual Collapsible Live Graveyards (2 cards per row visual grid) */}
              {config.alwaysShowOpponentGraveyard ? (
                <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                  {/* OPPONENT GRAVEYARD (Matte Gold) */}
                  <div
                    className={`rounded-none bg-[#151A24] border border-[#C9A45C]/40 flex flex-col overflow-hidden ${
                      oppGyCollapsed ? 'shrink-0' : 'flex-1 min-h-0'
                    }`}
                  >
                    <div className="px-2.5 py-1.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setOppGyCollapsed((v) => !v)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          {oppGyCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-[#8E98AC] shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#8E98AC] shrink-0" />
                          )}
                          <span className="text-[11.5px] font-bold text-[#F4F6FA] truncate">
                            Opponent Graveyard
                          </span>
                          <span className="font-mono-tabular text-[11.5px] font-bold text-[#C9A45C]">
                            {oppGy.length}
                          </span>
                        </button>
                        <RefreshCw className="w-3 h-3 text-[#7E889C] shrink-0" />
                      </div>
                      <div className="pl-5 text-[10px] text-[#7E889C]">
                        {oppGy.length}/{oppGy.length} cards · Live
                      </div>
                    </div>

                    {!oppGyCollapsed && (
                      <>
                        <div className="grid grid-cols-4 gap-1 px-1.5 py-1 bg-[#0E121A] border-b border-[rgba(242,238,230,0.07)] shrink-0">
                          {(
                            [
                              ['all', 'All'],
                              ['creature', 'Creatures'],
                              ['spell', 'Spells'],
                              ['land', 'Lands'],
                            ] as const
                          ).map(([k, lbl]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setOppGyFilter(k)}
                              className={`py-0.5 text-[9.5px] font-semibold rounded-none border cursor-pointer transition-colors ${
                                oppGyFilter === k
                                  ? 'bg-[#C9A45C]/15 border-[#C9A45C]/50 text-[#C9A45C]'
                                  : 'border-transparent text-[#8E98AC] hover:text-white'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto upkeep-scroll p-1.5 grid grid-cols-2 content-start gap-1.5">
                          {oppGrouped.length === 0 ? (
                            <div className="col-span-2 py-6 text-center text-[11px] text-[#7E889C]">
                              No cards match this filter.
                            </div>
                          ) : (
                            oppGrouped.map(({ card, qty }) => (
                              <button
                                key={card.id}
                                type="button"
                                aria-label={qty > 1 ? `${card.name} (×${qty})` : card.name}
                                onMouseEnter={() =>
                                  config.enableHoverZoom && setHoveredCard(card)
                                }
                                onMouseLeave={() => setHoveredCard(null)}
                                className="relative w-full aspect-[63/88] rounded-none overflow-hidden border border-white/15 hover:border-[#C9A45C] hover:-translate-y-0.5 transition-all cursor-pointer p-0 text-left"
                              >
                                <NativeMagicCard
                                  card={card}
                                  onHover={(c) => config.enableHoverZoom && setHoveredCard(c)}
                                  compact
                                />
                                {qty > 1 && (
                                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-none bg-[#0B0E14]/90 border border-[#C9A45C]/50 font-mono-tabular text-[10px] font-bold leading-none text-[#C9A45C]">
                                    ×{qty}
                                  </span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* YOUR GRAVEYARD (Cool Steel Blue) */}
                  <div
                    className={`rounded-none bg-[#151A24] border border-[#7CAEE6]/35 flex flex-col overflow-hidden ${
                      selfGyCollapsed ? 'shrink-0' : 'flex-1 min-h-0'
                    }`}
                  >
                    <div className="px-2.5 py-1.5 bg-[#1B2230] border-b border-[rgba(242,238,230,0.08)] shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelfGyCollapsed((v) => !v)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          {selfGyCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-[#8E98AC] shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#8E98AC] shrink-0" />
                          )}
                          <span className="text-[11.5px] font-bold text-[#F4F6FA] truncate">
                            Your Graveyard
                          </span>
                          <span className="font-mono-tabular text-[11.5px] font-bold text-[#8CBEF5]">
                            {selfGy.length}
                          </span>
                        </button>
                        <RefreshCw className="w-3 h-3 text-[#7E889C] shrink-0" />
                      </div>
                      <div className="pl-5 text-[10px] text-[#7E889C]">
                        {selfGy.length}/{selfGy.length} cards · Live
                      </div>
                    </div>

                    {!selfGyCollapsed && (
                      <>
                        <div className="grid grid-cols-4 gap-1 px-1.5 py-1 bg-[#0E121A] border-b border-[rgba(242,238,230,0.07)] shrink-0">
                          {(
                            [
                              ['all', 'All'],
                              ['creature', 'Creatures'],
                              ['spell', 'Spells'],
                              ['land', 'Lands'],
                            ] as const
                          ).map(([k, lbl]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setSelfGyFilter(k)}
                              className={`py-0.5 text-[9.5px] font-semibold rounded-none border cursor-pointer transition-colors ${
                                selfGyFilter === k
                                  ? 'bg-[#7CAEE6]/18 border-[#7CAEE6]/50 text-[#8CBEF5]'
                                  : 'border-transparent text-[#8E98AC] hover:text-white'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto upkeep-scroll p-1.5 grid grid-cols-2 content-start gap-1.5">
                          {selfGrouped.length === 0 ? (
                            <div className="col-span-2 py-6 text-center text-[11px] text-[#7E889C]">
                              No cards match this filter.
                            </div>
                          ) : (
                            selfGrouped.map(({ card, qty }) => (
                              <button
                                key={card.id}
                                type="button"
                                aria-label={qty > 1 ? `${card.name} (×${qty})` : card.name}
                                onMouseEnter={() =>
                                  config.enableHoverZoom && setHoveredCard(card)
                                }
                                onMouseLeave={() => setHoveredCard(null)}
                                className="relative w-full aspect-[63/88] rounded-none overflow-hidden border border-white/15 hover:border-[#8CBEF5] hover:-translate-y-0.5 transition-all cursor-pointer p-0 text-left"
                              >
                                <NativeMagicCard
                                  card={card}
                                  onHover={(c) => config.enableHoverZoom && setHoveredCard(c)}
                                  compact
                                />
                                {qty > 1 && (
                                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-none bg-[#0B0E14]/90 border border-[#7CAEE6]/50 font-mono-tabular text-[10px] font-bold leading-none text-[#8CBEF5]">
                                    ×{qty}
                                  </span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-[#6C7486] text-center px-4">
                  Cimetières masqués (réactivez dans Sélecteurs DOM ou touche G)
                </div>
              )}
            </aside>
          ) : (
            /* ORIGINAL ENDSTEP VERTICAL PHASE RAIL */
            <aside className="w-[148px] shrink-0 flex flex-col justify-between p-2 bg-[#110E0A] border-l border-[#33291E]">
              <div className="text-center pb-2 border-b border-[#292118]">
                <div className="text-[10px] font-semibold tracking-wider text-[#5B8DB8]">
                  YOUR TURN · T4
                </div>
                <div className="text-[9px] text-[#9E8B67] mt-0.5">PRIORITY</div>
              </div>

              <div className="flex-1 flex flex-col justify-center gap-1 py-2">
                {PHASES.map((phase) => (
                  <div
                    key={phase.id}
                    className={`text-center font-mono-tabular font-semibold tracking-wide rounded py-1.5 text-[10px] border ${
                      phase.defaultStop
                        ? 'bg-gradient-to-r from-[#C8B282] via-[#8F8C84] to-[#5878A8] border-[#665640] text-[#111]'
                        : 'bg-[#1A1510] border-[#2E251B] text-[#A29172]'
                    }`}
                  >
                    {phase.label}
                  </div>
                ))}
              </div>

              <div className="text-center text-[10px] text-[#8E7D60] pt-1.5 border-t border-[#292118]">
                HOLD PRIORITY
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Hover Card Zoom Overlay */}
      {extensionActive && config.enableHoverZoom && hoveredCard && (
        <CardZoomPreview key={hoveredCard.id} card={hoveredCard} scale={config.hoverZoomScale} />
      )}
    </section>
  );
}
