import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Flame,
  Hand,
  Package,
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
import { downloadExtensionPackage, type PackageTarget } from '../extension/packager';
import type { CardCategory, MtgCard, UpkeepConfig } from '../extension/types';
import { CardZoomPreview } from './CardZoomPreview';
import { ManaCost } from './ManaCost';

interface EndstepSimulatorProps {
  config: UpkeepConfig;
}

type GraveyardFilter = 'all' | CardCategory;

/**
 * Cartes Magic fidèles à la capture Endstep de l'utilisateur —
 * STRICTEMENT IDENTIQUES avec ou sans l'extension Upkeep.
 */
const NATIVE_HAND_CARDS: MtgCard[] = [
  {
    id: 'hand-lead',
    name: 'Lead the Stampede',
    manaCost: ['2', 'G'],
    typeLine: 'Sorcery',
    category: 'spell',
    rulesText:
      'Look at the top five cards of your library. You may reveal any number of creature cards from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in any order.',
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
      'Flying. When Balustrade Spy enters the battlefield, target player reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard.',
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
      'When Mesmeric Fiend comes into play, target opponent reveals his or her hand and you choose a nonland card from it. Remove that card from the game.',
    artUrl: ART_BOLT,
  },
  {
    id: 'hand-wall',
    name: 'Overgrown Battlement',
    manaCost: ['1', 'G'],
    typeLine: 'Creature — Wall',
    category: 'creature',
    stats: '0/4',
    rulesText:
      'Defender. {T}: Add {G} for each creature with defender you control.',
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
      'Changeling. When Masked Vandal enters the battlefield, you may exile a creature card from your graveyard. If you do, exile target artifact or enchantment an opponent controls.',
    artUrl: ART_DRAGON,
  },
  {
    id: 'hand-ent-1',
    name: 'Generous Ent',
    manaCost: ['5', 'G'],
    typeLine: 'Creature — Treefolk',
    category: 'creature',
    stats: '5/7',
    rulesText:
      'Reach. When Generous Ent enters the battlefield, create a Food token. Forestcycling {1}.',
    artUrl: ART_SANCTUM,
  },
];

const INITIAL_OPP_GRAVEYARD: MtgCard[] = [
  {
    id: 'gy-1',
    name: 'Lightning Bolt',
    manaCost: ['R'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Lightning Bolt deals 3 damage to any target.',
    artUrl: ART_BOLT,
    turnAdded: 2,
  },
  {
    id: 'gy-2',
    name: 'Consider',
    manaCost: ['U'],
    typeLine: 'Instant',
    category: 'spell',
    rulesText: 'Look at the top card of your library. You may put that card into your graveyard. Draw a card.',
    artUrl: ART_BOLT,
    turnAdded: 2,
  },
  {
    id: 'gy-3',
    name: 'Scalding Tarn',
    manaCost: [],
    typeLine: 'Land',
    category: 'land',
    rulesText: '{T}, Pay 1 life, Sacrifice Scalding Tarn: Search your library for an Island or Mountain card.',
    artUrl: ART_SANCTUM,
    turnAdded: 1,
  },
  {
    id: 'gy-4',
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

const INITIAL_LOGS = [
  { id: 'l1', turn: 1, time: '00:08', text: 'Forge AI keeps 7-card opening hand.' },
  { id: 'l2', turn: 1, time: '00:14', text: 'Jacques Chibrac keeps 7-card opening hand.' },
  { id: 'l3', turn: 1, time: '00:22', text: 'Forge AI sacrifices Scalding Tarn (-1 life) → Steam Vents.' },
  { id: 'l4', turn: 2, time: '00:49', text: 'Forge AI casts Consider (Surveil 1 → Dragon’s Rage Channeler to graveyard).' },
  { id: 'l5', turn: 2, time: '01:05', text: 'Forge AI casts Lightning Bolt targeting Jacques Chibrac (-3 life).' },
];

const PHASES = [
  { id: 'UNTAP', label: 'UNTAP', split: false },
  { id: 'UPKEEP', label: 'UPKEEP', split: false },
  { id: 'DRAW', label: 'DRAW', split: false },
  { id: 'MAIN 1', label: 'MAIN 1', split: true, active: true },
  { id: 'BEG.', label: 'BEG.', split: false },
  { id: 'ATK', label: 'ATK', split: true },
  { id: 'BLK', label: 'BLK', split: true },
  { id: '1ST', label: '1ST', split: false },
  { id: 'DMG', label: 'DMG', split: false },
  { id: 'END C.', label: 'END C.', split: false },
  { id: 'MAIN 2', label: 'MAIN 2', split: true },
  { id: 'END', label: 'END', split: true },
  { id: 'CLEAN', label: 'CLEAN', split: false },
];

/**
 * Rendu d'une carte Magic classique 63:88 — STRICTEMENT INCHANGÉ entre le mode Endstep original et Upkeep.
 */
function NativeMagicCard({
  card,
  onHover,
}: {
  card: MtgCard;
  onHover: (card: MtgCard | null) => void;
}) {
  const frameTone = card.manaCost.includes('B')
    ? { outer: '#2B2830', inner: '#D5D2D9', bar: '#B9B5BE' }
    : card.manaCost.includes('G')
    ? { outer: '#264331', inner: '#DCE6DC', bar: '#B8CCB9' }
    : { outer: '#3D372E', inner: '#E5E0D5', bar: '#C9C1B2' };

  return (
    <div
      onMouseEnter={() => onHover(card)}
      onMouseLeave={() => onHover(null)}
      className="w-[146px] h-[204px] shrink-0 rounded-[8px] bg-[#0B0B0D] p-[5px] shadow-md select-none transition-transform duration-150 hover:-translate-y-2"
    >
      <div
        className="w-full h-full rounded-[5px] p-[4px] flex flex-col justify-between"
        style={{ backgroundColor: frameTone.outer }}
      >
        {/* Card Name + Mana Cost */}
        <div
          className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-[3px] text-[#111]"
          style={{ backgroundColor: frameTone.bar }}
        >
          <span className="text-[10px] font-bold truncate leading-tight">{card.name}</span>
          <ManaCost cost={card.manaCost} compact />
        </div>

        {/* Art Box */}
        <div className="h-[74px] w-full my-[3px] border border-[#111] bg-[#141418] overflow-hidden">
          <img
            src={card.artUrl}
            alt={card.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Type Line */}
        <div
          className="px-1.5 py-[2px] rounded-[2px] text-[9px] font-semibold text-[#151515] truncate"
          style={{ backgroundColor: frameTone.bar }}
        >
          {card.typeLine}
        </div>

        {/* Rules Box */}
        <div
          className="flex-1 mt-[3px] p-1.5 rounded-[2px] text-[8.5px] leading-[1.22] text-[#171717] overflow-hidden relative"
          style={{ backgroundColor: frameTone.inner }}
        >
          <p className="line-clamp-4">{card.rulesText}</p>
          {card.stats && (
            <span className="absolute bottom-0.5 right-1 px-1 py-0.5 rounded bg-[#18181B] text-[#F5F2EB] font-mono-tabular text-[9px] font-bold leading-none">
              {card.stats}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function EndstepSimulator({ config }: EndstepSimulatorProps) {
  const [extensionActive, setExtensionActive] = useState<boolean>(true);
  const [nativeLogDrawerOpen, setNativeLogDrawerOpen] = useState<boolean>(false);
  const [nativeGyPopupOpen, setNativeGyPopupOpen] = useState<boolean>(false);
  const [oppLife, setOppLife] = useState<number>(19);
  const [oppDelta, setOppDelta] = useState<number | null>(-1);
  const [selfLife, setSelfLife] = useState<number>(17);
  const [selfDelta, setSelfDelta] = useState<number | null>(-3);
  const [oppLib, setOppLib] = useState<number>(50);
  const [oppHand, setOppHand] = useState<number>(5);
  const [selfLib, setSelfLib] = useState<number>(53);
  const [oppGy, setOppGy] = useState<MtgCard[]>(INITIAL_OPP_GRAVEYARD);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [gyFilter, setGyFilter] = useState<GraveyardFilter>('all');
  const [hoveredCard, setHoveredCard] = useState<MtgCard | null>(null);
  const [spellIndex, setSpellIndex] = useState<number>(0);
  const [downloading, setDownloading] = useState<PackageTarget | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key.toLowerCase() === config.shortcuts.toggleTheme.toLowerCase()) {
        setExtensionActive((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config.shortcuts.toggleTheme]);

  const filteredGy = useMemo(
    () => (gyFilter === 'all' ? oppGy : oppGy.filter((c) => c.category === gyFilter)),
    [oppGy, gyFilter]
  );

  const distinctGyTypes = useMemo(() => new Set(oppGy.map((c) => c.category)).size, [oppGy]);

  function triggerOpponentSpell() {
    const tpl = OPPONENT_SPELL_POOL[spellIndex % OPPONENT_SPELL_POOL.length];
    setSpellIndex((i) => i + 1);
    const card: MtgCard = { ...tpl, id: `gy-sim-${Date.now()}`, turnAdded: 3 };
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
        turn: 3,
        time: `01:${String(18 + prev.length * 4).padStart(2, '0')}`,
        text: `Forge AI resolves ${tpl.name} → opponent graveyard.`,
      },
    ]);
  }

  function triggerLifeLoss(side: 'opp' | 'self') {
    if (side === 'opp') {
      setOppLife((l) => Math.max(0, l - 3));
      setOppDelta(-3);
      setLogs((prev) => [
        ...prev,
        { id: `l-${Date.now()}`, turn: 3, time: '01:32', text: 'Forge AI loses 3 life.' },
      ]);
    } else {
      setSelfLife((l) => Math.max(0, l - 3));
      setSelfDelta(-3);
      setLogs((prev) => [
        ...prev,
        { id: `l-${Date.now()}`, turn: 3, time: '01:34', text: 'Jacques Chibrac loses 3 life.' },
      ]);
    }
  }

  function resetDemo() {
    setOppLife(19);
    setOppDelta(-1);
    setSelfLife(17);
    setSelfDelta(-3);
    setOppLib(50);
    setOppHand(5);
    setSelfLib(53);
    setOppGy(INITIAL_OPP_GRAVEYARD);
    setLogs(INITIAL_LOGS);
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

  return (
    <section className="space-y-6">
      {/* Direct Extension Explanation + 1-Click Chrome/Firefox Downloads */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[rgba(242,238,230,0.09)]">
        <div className="max-w-2xl">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#F2EEE6]">
            Extension Chrome &amp; Firefox auto-injectée sur endstep.cc/game/*
          </h1>
          <p className="mt-1 text-sm text-[#9CA3B2]">
            Aucune URL à copier-coller : une fois chargée dans votre navigateur, Upkeep détecte
            automatiquement l’onglet Endstep, laisse les cartes Magic strictement intactes et
            surcharge uniquement l’interface autour (logs ouverts à gauche, cimetière adverse en
            continu, PV / Deck / Main lisibles).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => quickDownload('chrome')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A45C] hover:bg-[#DFBD78] text-[#0E1116] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading === 'chrome' ? 'Build...' : 'ZIP Chrome (MV3)'}</span>
          </button>
          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => quickDownload('firefox')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#181D27] hover:bg-[#232A38] text-[#F2EEE6] border border-[#C9A45C]/40 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Package className="w-3.5 h-3.5 text-[#C9A45C]" />
            <span>{downloading === 'firefox' ? 'Build...' : 'ZIP Firefox (AMO)'}</span>
          </button>
        </div>
      </div>

      {/* Live Before/After Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="inline-flex items-center p-1 rounded-lg bg-[#151922] border border-[rgba(242,238,230,0.1)]"
            role="group"
            aria-label="Basculer l'injection CSS/JS Upkeep"
          >
            <button
              type="button"
              onClick={() => setExtensionActive(true)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                extensionActive
                  ? 'bg-[#C9A45C] text-[#0E1116]'
                  : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
              }`}
            >
              Extension Upkeep injectée
            </button>
            <button
              type="button"
              onClick={() => setExtensionActive(false)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                !extensionActive
                  ? 'bg-[#26211B] text-[#F2EEE6]'
                  : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
              }`}
            >
              Endstep original (sans extension)
            </button>
          </div>

          <span className="text-xs text-[#9CA3B2] hidden md:inline">
            Les cartes Magic restent 100 % identiques dans les deux vues.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={triggerOpponentSpell}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] cursor-pointer"
          >
            + Sort au cimetière adverse
          </button>
          <button
            type="button"
            onClick={() => triggerLifeLoss('opp')}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] cursor-pointer"
          >
            -3 PV Forge AI
          </button>
          <button
            type="button"
            onClick={() => triggerLifeLoss('self')}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#151922] hover:bg-[#1E2432] text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] cursor-pointer"
          >
            -3 PV Joueur
          </button>
          <button
            type="button"
            onClick={resetDemo}
            aria-label="Réinitialiser l'aperçu"
            className="p-1.5 rounded-md bg-[#151922] hover:bg-[#1E2432] text-[#9CA3B2] hover:text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Simulated Browser Tab showing REAL Endstep layout with/without CSS+JS Override */}
      <div className="rounded-xl border border-[rgba(242,238,230,0.14)] overflow-hidden shadow-2xl">
        {/* Minimal Browser Toolbar showing automatic extension detection */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-[#11141B] border-b border-[rgba(242,238,230,0.08)] text-xs">
          <div className="flex items-center gap-2 min-w-0 text-[#9CA3B2]">
            <span className="font-mono-tabular text-[#D8D3C9] truncate">
              endstep.cc/game/70c0f6cc-024a-452a-9f87-bf0b822d0423
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExtensionActive((v) => !v)}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              extensionActive
                ? 'bg-[#C9A45C]/15 border-[#C9A45C]/50 text-[#C9A45C]'
                : 'bg-[#181C24] border-[rgba(242,238,230,0.12)] text-[#9CA3B2]'
            }`}
          >
            <span className="font-display font-bold">U</span>
            <span>
              {extensionActive
                ? 'Détection auto active (touche U)'
                : 'Extension en pause (cliquer pour injecter)'}
            </span>
          </button>
        </div>

        {/* ==================================================================== */}
        {/* SAME ENDSTEP APP LAYOUT — ONLY CSS & DOM REORGANIZATION CHANGES      */}
        {/* ==================================================================== */}
        <div
          className={`flex min-h-[650px] relative transition-colors duration-200 ${
            extensionActive ? 'bg-[#0E1116] text-[#F2EEE6]' : 'bg-[#0D0A07] text-[#D7C9AD]'
          }`}
        >
          {/* LEFT SIDEBAR (Matches user's screenshot: Opponent Stats + Logs + Decision/Auto-Pass + Self Stats) */}
          <aside
            style={{ width: extensionActive ? `${config.logsWidth}px` : '198px' }}
            className={`shrink-0 flex flex-col justify-between relative transition-all duration-200 ${
              extensionActive
                ? 'bg-[#151922] border-r border-[rgba(242,238,230,0.09)]'
                : 'bg-[#14100B] border-r border-[#33291E]'
            }`}
          >
            {/* TOP: Opponent Block (Forge AI) */}
            <div
              className={`p-3 ${
                extensionActive
                  ? 'border-b border-[rgba(242,238,230,0.08)]'
                  : 'border-b border-[#292118]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    extensionActive
                      ? 'font-display text-sm font-semibold text-[#F2EEE6]'
                      : 'font-serif text-xs text-[#C4A874]'
                  }
                >
                  Forge AI
                </span>
                {extensionActive && oppDelta !== null && (
                  <span className="font-mono-tabular text-xs font-semibold text-[#D9534F]">
                    {oppDelta}
                  </span>
                )}
              </div>

              {extensionActive ? (
                /* UPKEEP: High-legibility Life / Deck / Hand */
                <div className="mt-2 space-y-2.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-mono-tabular text-3xl font-bold leading-none ${
                        oppLife <= 5 ? 'text-[#D9534F]' : 'text-[#F2EEE6]'
                      }`}
                    >
                      {oppLife}
                    </span>
                    <span className="text-xs font-medium text-[#9CA3B2]">PV</span>
                    {oppLife <= 5 && (
                      <span className="text-[11px] font-semibold text-[#D9534F]">Critique</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[rgba(242,238,230,0.07)]">
                    <div className="flex items-baseline justify-between bg-[#0E1116] px-2.5 py-1.5 rounded-md">
                      <span className="text-[11px] text-[#9CA3B2]">Deck</span>
                      <span className="font-mono-tabular text-base font-bold text-[#F2EEE6]">
                        {oppLib}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between bg-[#0E1116] px-2.5 py-1.5 rounded-md">
                      <span className="text-[11px] text-[#9CA3B2]">Main</span>
                      <span className="font-mono-tabular text-base font-bold text-[#F2EEE6]">
                        {oppHand}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* NATIVE ENDSTEP: Tiny counters matching screenshot */
                <div className="mt-1 space-y-2">
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
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setNativeGyPopupOpen(true)}
                      className="flex items-center justify-center gap-1 py-1 rounded bg-[#1C160F] border border-[#34291C] text-[10px] text-[#9B8968] hover:text-[#E6D3A7] cursor-pointer"
                      title="Cliquer pour voir le cimetière (comportement natif)"
                    >
                      <Skull className="w-3 h-3" />
                      <span>{oppGy.length}</span>
                    </button>
                    <div className="flex items-center justify-center gap-1 py-1 rounded bg-[#1C160F] border border-[#34291C] text-[10px] text-[#9B8968]">
                      <Flame className="w-3 h-3" />
                      <span>0</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* MIDDLE LEFT: Auto-opened Logs (Upkeep) vs Tiny collapsed vertical "Log" tab (Native) */}
            {extensionActive ? (
              <div className="flex-1 min-h-0 flex flex-col border-b border-[rgba(242,238,230,0.08)]">
                <div className="px-3 py-2 flex items-center justify-between border-b border-[rgba(242,238,230,0.06)] bg-[#12161E]">
                  <span className="font-display text-xs font-semibold text-[#F2EEE6]">
                    Journal (ouvert auto)
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[#C9A45C]">
                    {logs.length} actions
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto upkeep-scroll px-3 py-2 space-y-2">
                  {logs.map((entry) => (
                    <div key={entry.id} className="text-[11.5px] leading-relaxed text-[#C9C4B9]">
                      <span className="font-mono-tabular text-[10px] text-[#6C7486] mr-1.5">
                        {entry.time}
                      </span>
                      <span>{entry.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 relative flex items-center">
                {/* Tiny vertical "Log" tab matching the exact user screenshot */}
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
                        [{entry.time}] {entry.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* BOTTOM: Decision + Auto-Pass + Self Block (Jacques Chibrac) */}
            <div className="p-3 space-y-2.5">
              {/* Auto-Pass compact */}
              <div
                className={`rounded-md p-2 space-y-1 ${
                  extensionActive
                    ? 'bg-[#0E1116] border border-[rgba(242,238,230,0.08)]'
                    : 'bg-[#19130D] border border-[#30261B]'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-[#9CA3B2] pb-0.5">
                  <span className="font-semibold tracking-wide">AUTO-PASS</span>
                  <span>skip ahead</span>
                </div>
                {(
                  [
                    ['END OF TURN', 'E'],
                    ['BEFORE MY TURN', 'B'],
                    ['ACTION / END STEP', 'R'],
                  ] as const
                ).map(([lbl, key]) => (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${
                      extensionActive
                        ? 'bg-[#181D27] text-[#D8D3C9]'
                        : 'bg-[#211A12] text-[#B8A684]'
                    }`}
                  >
                    <span>{lbl}</span>
                    <span className="font-mono-tabular opacity-75">{key}</span>
                  </div>
                ))}
              </div>

              {/* Self Stats */}
              <div
                className={`pt-2 ${
                  extensionActive
                    ? 'border-t border-[rgba(242,238,230,0.08)]'
                    : 'border-t border-[#292118]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      extensionActive
                        ? 'font-display text-sm font-semibold text-[#F2EEE6]'
                        : 'font-serif text-xs text-[#C4A874]'
                    }
                  >
                    Jacques Chibrac
                  </span>
                  {extensionActive && selfDelta !== null && (
                    <span className="font-mono-tabular text-xs font-semibold text-[#D9534F]">
                      {selfDelta}
                    </span>
                  )}
                </div>

                {extensionActive ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`font-mono-tabular text-3xl font-bold leading-none ${
                          selfLife <= 5 ? 'text-[#D9534F]' : 'text-[#F2EEE6]'
                        }`}
                      >
                        {selfLife}
                      </span>
                      <span className="text-xs font-medium text-[#9CA3B2]">PV</span>
                      {selfLife <= 5 && (
                        <span className="text-[11px] font-semibold text-[#D9534F]">Critique</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-baseline justify-between bg-[#0E1116] px-2.5 py-1.5 rounded-md">
                        <span className="text-[11px] text-[#9CA3B2]">Deck</span>
                        <span className="font-mono-tabular text-base font-bold text-[#F2EEE6]">
                          {selfLib}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between bg-[#0E1116] px-2.5 py-1.5 rounded-md">
                        <span className="text-[11px] text-[#9CA3B2]">Main</span>
                        <span className="font-mono-tabular text-base font-bold text-[#F2EEE6]">
                          {NATIVE_HAND_CARDS.length}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-serif text-xl font-bold text-[#E6D3A7] leading-none">
                        {selfLife}
                      </span>
                      <span className="text-[10px] tracking-wider text-[#9E8B67]">LIFE</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#B8A684]">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3 h-3 opacity-70" />
                        {selfLib}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Hand className="w-3 h-3 opacity-70" />
                        {NATIVE_HAND_CARDS.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* CENTER BATTLEFIELD + UNTOUCHED MAGIC CARDS */}
          <div className="flex-1 min-w-0 flex flex-col justify-between relative">
            {/* Opponent Battlefield */}
            <div
              className={`flex-1 flex items-center justify-center border-b ${
                extensionActive
                  ? 'border-[rgba(242,238,230,0.08)] bg-gradient-to-b from-[#161E2C]/50 to-transparent'
                  : 'border-[#3D3122] bg-gradient-to-b from-[#334F77]/65 via-[#182231]/55 to-transparent'
              }`}
            >
              <span
                className={`text-xs italic ${
                  extensionActive ? 'text-[#6C7486]' : 'text-[#847862]'
                }`}
              >
                The battlefield is empty.
              </span>
            </div>

            {/* Player Battlefield */}
            <div className="flex-1 flex items-center justify-center">
              <span
                className={`text-xs italic ${
                  extensionActive ? 'text-[#6C7486]' : 'text-[#847862]'
                }`}
              >
                The battlefield is empty.
              </span>
            </div>

            {/* Bottom Hand — 100% UNTOUCHED MAGIC CARDS */}
            <div className="px-4 pb-3 pt-2 overflow-x-auto upkeep-scroll">
              <div className="flex items-end gap-2.5">
                {NATIVE_HAND_CARDS.map((card) => (
                  <NativeMagicCard key={card.id} card={card} onHover={setHoveredCard} />
                ))}
              </div>
            </div>

            {/* Native Graveyard Modal (Only needed when extension is OFF) */}
            {!extensionActive && nativeGyPopupOpen && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4">
                <div className="w-full max-w-sm rounded-lg bg-[#18130D] border border-[#3E3223] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#E6D3A7]">
                    <span>Forge AI — Graveyard ({oppGy.length})</span>
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

          {/* UPKEEP EXTRA DOCKED RAIL: ALWAYS-VISIBLE OPPONENT GRAVEYARD */}
          {extensionActive && config.alwaysShowOpponentGraveyard && (
            <aside
              style={{ width: `${config.graveyardWidth}px` }}
              className="shrink-0 bg-[#151922] border-l border-[rgba(242,238,230,0.09)] flex flex-col"
              aria-label="Cimetière adverse en continu"
            >
              <div className="px-3.5 pt-3.5 pb-2.5 border-b border-[rgba(242,238,230,0.08)]">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-[#F2EEE6]">
                    Cimetière adverse
                  </h2>
                  <span className="font-mono-tabular text-sm font-bold text-[#C9A45C]">
                    {oppGy.length}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#9CA3B2]">
                  {distinctGyTypes} types · {distinctGyTypes >= 4 ? 'Délire actif' : 'Délire inactif'}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#11151D] border-b border-[rgba(242,238,230,0.08)]">
                {(
                  [
                    ['all', 'Tout'],
                    ['creature', 'Créat.'],
                    ['spell', 'Sorts'],
                    ['land', 'Terrains'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setGyFilter(k)}
                    className={`py-1 text-[11px] font-medium rounded cursor-pointer ${
                      gyFilter === k
                        ? 'bg-[#222836] text-[#C9A45C]'
                        : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto upkeep-scroll p-1.5 divide-y divide-[rgba(242,238,230,0.05)]">
                {filteredGy.map((card) => (
                  <div
                    key={card.id}
                    onMouseEnter={() => config.enableHoverZoom && setHoveredCard(card)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-[#1E2432] transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[#F2EEE6] truncate">
                        {card.name}
                      </div>
                      <div className="text-[11px] text-[#7E8799] truncate">{card.typeLine}</div>
                    </div>
                    <ManaCost cost={card.manaCost} compact />
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* RIGHT PHASE TRACK (Compact sleek rail in Upkeep vs bulky native stops) */}
          <aside
            className={`shrink-0 flex flex-col justify-between p-2 transition-all duration-200 ${
              extensionActive
                ? 'w-[112px] bg-[#12161E] border-l border-[rgba(242,238,230,0.09)]'
                : 'w-[152px] bg-[#110E0A] border-l border-[#33291E]'
            }`}
          >
            <div className="text-center pb-2 border-b border-[rgba(242,238,230,0.08)]">
              <div
                className={`text-[10px] font-semibold tracking-wider ${
                  extensionActive ? 'text-[#C9A45C]' : 'text-[#5B8DB8]'
                }`}
              >
                OPP TURN · T2
              </div>
              <div className="text-[9px] text-[#9CA3B2] mt-0.5">PRIORITY</div>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-1 py-2">
              {PHASES.map((phase) => (
                <div
                  key={phase.id}
                  className={`text-center font-mono-tabular font-semibold tracking-wide rounded transition-colors ${
                    extensionActive
                      ? `py-1 text-[10px] border ${
                          phase.active
                            ? 'bg-[#C9A45C]/20 border-[#C9A45C] text-[#F2EEE6]'
                            : phase.split
                            ? 'bg-[#1C222E] border-[rgba(242,238,230,0.14)] text-[#D8D3C9]'
                            : 'bg-transparent border-transparent text-[#6C7486]'
                        }`
                      : `py-2 text-[10px] border ${
                          phase.split
                            ? 'bg-gradient-to-r from-[#C8B282] via-[#8F8C84] to-[#5878A8] border-[#665640] text-[#111]'
                            : 'bg-[#1A1510] border-[#2E251B] text-[#A29172]'
                        }`
                  }`}
                >
                  {phase.label}
                </div>
              ))}
            </div>

            <div className="text-center text-[10px] text-[#7E8799] pt-1.5 border-t border-[rgba(242,238,230,0.08)]">
              HOLD PRIORITY
            </div>
          </aside>
        </div>
      </div>

      {/* Hover Card Zoom Overlay */}
      {extensionActive && config.enableHoverZoom && hoveredCard && (
        <CardZoomPreview key={hoveredCard.id} card={hoveredCard} scale={config.hoverZoomScale} />
      )}
    </section>
  );
}
