import type { UpkeepConfig } from './types';

export interface GeneratedRepoFile {
  path: string;
  content: string;
  language: 'json' | 'js' | 'css' | 'html' | 'yaml' | 'md';
  category: 'chrome' | 'firefox' | 'extension' | 'ci' | 'repo';
  description: string;
}

export function generateChromeManifest(config: UpkeepConfig): string {
  const manifest = {
    manifest_version: 3,
    name: 'Upkeep',
    short_name: 'Upkeep',
    version: config.version,
    description:
      "Refonte ergonomique de endstep.cc en partie : cimetière adverse en continu, compteurs PV/Deck/Main haute lisibilité et journal ouvert à gauche.",
    homepage_url: 'https://github.com/LPauzies/Upkeep',
    permissions: ['storage'],
    host_permissions: ['https://endstep.cc/*'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_title: 'Upkeep — Options Endstep',
      default_popup: 'src/popup/popup.html',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
    options_ui: {
      page: 'src/options/options.html',
      open_in_tab: true,
    },
    content_scripts: [
      {
        matches: ['https://endstep.cc/*'],
        css: ['src/content/upkeep.css'],
        js: ['src/content/upkeep.js'],
        run_at: 'document_idle',
      },
    ],
  };
  return JSON.stringify(manifest, null, 2) + '\n';
}

export function generateFirefoxManifest(config: UpkeepConfig): string {
  const base = JSON.parse(generateChromeManifest(config));
  const firefoxManifest = {
    ...base,
    browser_specific_settings: {
      gecko: {
        id: 'upkeep@lpauzies.dev',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  };
  return JSON.stringify(firefoxManifest, null, 2) + '\n';
}

export function generateContentCss(config: UpkeepConfig): string {
  const rowPadding =
    config.density === 'compact' ? '6px 10px' : config.density === 'spacious' ? '10px 12px' : '8px 11px';

  return `/* Upkeep — Surcharge CSS côté client sur https://endstep.cc/game/*
 * Charte : Tapis de tournoi ardoise obsidienne & or mat
 * RÈGLE STRICTE : les cartes Magic (art, cadre, proportions) ne sont JAMAIS modifiées.
 * Repository: https://github.com/LPauzies/Upkeep
 */

:root {
  --upkeep-bg-canvas: #0E1116;
  --upkeep-bg-surface: #151922;
  --upkeep-bg-elevated: #1C222E;
  --upkeep-bg-hover: #232A38;
  --upkeep-text-primary: #F2EEE6;
  --upkeep-text-secondary: #9CA3B2;
  --upkeep-text-muted: #6C7486;
  --upkeep-accent-gold: #C9A45C;
  --upkeep-crimson: #D9534F;
  --upkeep-emerald: #3FA372;
  --upkeep-border: rgba(242, 238, 230, 0.1);
  --upkeep-border-strong: rgba(242, 238, 230, 0.18);
  --upkeep-logs-width: ${config.logsWidth}px;
  --upkeep-gy-width: ${config.graveyardWidth}px;
  --upkeep-row-padding: ${rowPadding};
  --upkeep-font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --upkeep-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Toile de fond tapis de tournoi (ne touche jamais les cartes Magic natives) */
html[data-upkeep-active="true"] body {
  background-color: var(--upkeep-bg-canvas) !important;
  color: var(--upkeep-text-primary) !important;
  font-family: var(--upkeep-font-sans) !important;
  letter-spacing: 0.008em;
}

html[data-upkeep-active="true"][data-upkeep-logs-open="true"] body {
  padding-left: var(--upkeep-logs-width) !important;
  box-sizing: border-box !important;
}

html[data-upkeep-active="true"][data-upkeep-gy-open="true"] body {
  padding-right: var(--upkeep-gy-width) !important;
  box-sizing: border-box !important;
}

/* Panneau de logs Endstep ouvert automatiquement et ancré à gauche */
html[data-upkeep-active="true"][data-upkeep-logs-open="true"] [data-upkeep-dock="logs-left"] {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  bottom: 0 !important;
  width: var(--upkeep-logs-width) !important;
  max-width: var(--upkeep-logs-width) !important;
  height: 100vh !important;
  z-index: 9000 !important;
  background: var(--upkeep-bg-surface) !important;
  border-right: 1px solid var(--upkeep-border) !important;
  box-shadow: none !important;
  display: flex !important;
  flex-direction: column !important;
  overflow-y: auto !important;
  padding: 12px !important;
  font-size: 13px !important;
  line-height: 1.5 !important;
  color: var(--upkeep-text-primary) !important;
}

/* Bandeaux tactiques PV / Deck / Main haute lisibilité */
.upkeep-hud-bar {
  position: fixed;
  left: calc(var(--upkeep-logs-width) + 12px);
  z-index: 9100;
  display: flex;
  align-items: center;
  background: rgba(21, 25, 34, 0.96);
  border: 1px solid var(--upkeep-border-strong);
  border-radius: 9px;
  padding: 6px 14px;
  color: var(--upkeep-text-primary);
  font-family: var(--upkeep-font-sans);
  backdrop-filter: blur(8px);
}

html[data-upkeep-logs-open="false"] .upkeep-hud-bar {
  left: 14px;
}

.upkeep-hud-bar--top { top: 10px; }
.upkeep-hud-bar--bottom { bottom: 10px; }

.upkeep-hud-metric {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 2px 14px;
  border-right: 1px solid var(--upkeep-border);
  white-space: nowrap;
}

.upkeep-hud-metric:last-child { border-right: none; }

.upkeep-hud-label {
  font-size: 12px;
  color: var(--upkeep-text-secondary);
  font-weight: 500;
}

.upkeep-hud-value {
  font-family: var(--upkeep-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 700;
  color: var(--upkeep-text-primary);
  line-height: 1;
}

.upkeep-hud-value--life { font-size: 28px; }
.upkeep-hud-value--critical { color: var(--upkeep-crimson); }

.upkeep-hud-delta {
  font-family: var(--upkeep-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
}

.upkeep-hud-delta--neg { color: var(--upkeep-crimson); }
.upkeep-hud-delta--pos { color: var(--upkeep-emerald); }

/* Panneau Cimetière Adverse continu (rail droit) */
#upkeep-opp-graveyard {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--upkeep-gy-width);
  z-index: 9050;
  background: var(--upkeep-bg-surface);
  border-left: 1px solid var(--upkeep-border);
  display: flex;
  flex-direction: column;
  color: var(--upkeep-text-primary);
  font-family: var(--upkeep-font-sans);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

html[data-upkeep-gy-open="false"] #upkeep-opp-graveyard {
  transform: translateX(100%);
}

.upkeep-gy-header {
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--upkeep-border);
}

.upkeep-gy-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.upkeep-gy-title { font-size: 14px; font-weight: 600; margin: 0; }

.upkeep-gy-count {
  font-family: var(--upkeep-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 700;
  color: var(--upkeep-accent-gold);
}

.upkeep-gy-meta { margin-top: 4px; font-size: 12px; color: var(--upkeep-text-secondary); }

.upkeep-gy-filters {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--upkeep-border);
  background: var(--upkeep-bg-canvas);
}

.upkeep-gy-filter-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--upkeep-text-secondary);
  font-size: 11px;
  font-weight: 500;
  padding: 5px 4px;
  border-radius: 5px;
  cursor: pointer;
}

.upkeep-gy-filter-btn[aria-pressed="true"] {
  background: var(--upkeep-bg-elevated);
  color: var(--upkeep-accent-gold);
}

.upkeep-gy-list { flex: 1; overflow-y: auto; padding: 6px; }

.upkeep-gy-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: var(--upkeep-row-padding);
  border-bottom: 1px solid rgba(242, 238, 230, 0.05);
  border-radius: 6px;
  cursor: pointer;
}

.upkeep-gy-item:hover { background: var(--upkeep-bg-hover); }

.upkeep-gy-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--upkeep-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upkeep-gy-card-type { font-size: 11px; color: var(--upkeep-text-muted); margin-top: 2px; }

.upkeep-gy-empty {
  padding: 24px 14px;
  text-align: center;
  color: var(--upkeep-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.upkeep-gy-sync-btn {
  margin-top: 10px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #0E1116;
  background: var(--upkeep-accent-gold);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Agrandissement de la carte native d'Endstep au survol du cimetière */
#upkeep-card-zoom {
  position: fixed;
  z-index: 9500;
  pointer-events: none;
  width: 256px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.72);
  opacity: 0;
  transform: translateY(4px) scale(0.97);
  transition: opacity 140ms ease, transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
}

#upkeep-card-zoom[data-visible="true"] {
  opacity: 1;
  transform: translateY(0) scale(1);
}

#upkeep-card-zoom img { display: block; width: 100%; height: auto; }
`;
}

export function generateContentJs(config: UpkeepConfig): string {
  const defaultConfigJson = JSON.stringify(config, null, 2);

  return `/* Upkeep — Content Script auto-injecté sur https://endstep.cc/*
 * Détecte automatiquement /game/* côté client (rien à copier-coller).
 * Les cartes Magic natives d'Endstep restent 100% intactes.
 * Repository: https://github.com/LPauzies/Upkeep
 */
(() => {
  'use strict';

  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v1';
  const DEFAULT_CONFIG = ${defaultConfigJson};

  let config = structuredClone(DEFAULT_CONFIG);
  let state = {
    isGameRoute: false,
    currentGameId: null,
    logsOpenedForGameId: null,
    logsVisible: true,
    graveyardVisible: true,
    gyFilter: 'all',
    lastOpponentLife: null,
    lastSelfLife: null,
    opponentLifeDelta: null,
    selfLifeDelta: null,
  };

  let syncRaf = null;

  function isGameUrl(url = window.location.pathname) {
    return /^\\/game\\/[^/]+/i.test(url);
  }

  function extractGameId(url = window.location.pathname) {
    const match = url.match(/^\\/game\\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  function safeQuery(selector) {
    if (!selector || typeof selector !== 'string') return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function safeQueryAll(selector) {
    if (!selector || typeof selector !== 'string') return [];
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function parseIntSafe(text) {
    const m = (text || '').trim().match(/-?\\d+/);
    return m ? Number.parseInt(m[0], 10) : null;
  }

  /* Détection heuristique des blocs joueur Endstep ("20 LIFE" + Deck + Main en colonne gauche) */
  function discoverEndstepPlayerBlocks() {
    const blocks = [];
    for (const el of Array.from(document.querySelectorAll('div, section, aside'))) {
      const rect = el.getBoundingClientRect();
      if (rect.left > 320 || rect.width < 80 || rect.width > 340 || rect.height > 200) continue;
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!/\\b\\d+\\s*LIFE\\b/i.test(text) || text.length > 120) continue;
      blocks.push({ el, top: rect.top, text });
    }
    blocks.sort((a, b) => a.top - b.top);
    return {
      opponent: blocks[0] || null,
      self: blocks.length > 1 ? blocks[blocks.length - 1] : null,
    };
  }

  function extractStatsFromBlock(block, explicit) {
    let life = parseIntSafe(safeQuery(explicit.life)?.textContent);
    let library = parseIntSafe(safeQuery(explicit.library)?.textContent);
    let hand = parseIntSafe(safeQuery(explicit.hand)?.textContent);
    let exile = parseIntSafe(safeQuery(explicit.exile)?.textContent);

    if (block) {
      const lifeMatch = block.text.match(/(-?\\d+)\\s*LIFE/i);
      if (life === null && lifeMatch) life = Number.parseInt(lifeMatch[1], 10);
      const afterLife = block.text.split(/LIFE/i)[1] || '';
      const nums = (afterLife.match(/\\d+/g) || []).map((n) => Number.parseInt(n, 10));
      if (library === null && nums.length >= 1) library = nums[0];
      if (hand === null && nums.length >= 2) hand = nums[1];
      if (exile === null && nums.length >= 4) exile = nums[3];
    }

    return { life, library, hand, exile };
  }

  /* Ouverture automatique du bouton vertical "Log" sur le bord gauche d'Endstep */
  function findLogsToggleButton() {
    const direct = safeQuery(config.selectors.logsToggleButton);
    if (direct) return direct;
    return (
      Array.from(document.querySelectorAll('button, [role="button"], div')).find((el) => {
        const txt = (el.textContent || '').trim();
        if (!/^logs?$/i.test(txt)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.width < 90 && rect.left < 80;
      }) || null
    );
  }

  function findLogsPanel() {
    const direct = safeQuery(config.selectors.logsPanel);
    if (direct) return direct;
    return (
      Array.from(document.querySelectorAll('aside, section, div')).find((el) => {
        if (el.id?.startsWith('upkeep-')) return false;
        const label = (
          el.getAttribute('aria-label') ||
          el.getAttribute('data-testid') ||
          el.className?.toString() ||
          ''
        ).toLowerCase();
        return /(game[-_]?log|action[-_]?log|match[-_]?log|log[-_]?panel|log[-_]?drawer)/.test(label);
      }) || null
    );
  }

  function ensureLogsDockedLeft() {
    if (!config.enabled || !state.isGameRoute) return;
    const panel = findLogsPanel();
    const visible =
      panel && panel.getBoundingClientRect().width > 80 && getComputedStyle(panel).display !== 'none';

    if (
      config.autoOpenLogsLeft &&
      !visible &&
      state.currentGameId &&
      state.logsOpenedForGameId !== state.currentGameId
    ) {
      const btn = findLogsToggleButton();
      if (btn) {
        state.logsOpenedForGameId = state.currentGameId;
        btn.click();
        window.setTimeout(() => {
          const opened = findLogsPanel();
          if (opened) opened.setAttribute('data-upkeep-dock', 'logs-left');
        }, 220);
      }
    }

    if (panel) panel.setAttribute('data-upkeep-dock', 'logs-left');
  }

  function inferCardCategory(typeText = '') {
    const low = typeText.toLowerCase();
    if (/land|terrain/.test(low)) return 'land';
    if (/creature|créature/.test(low)) return 'creature';
    if (/instant|sorcery|éphémère|rituel/.test(low)) return 'spell';
    return 'artifact';
  }

  function extractOpponentGraveyardCards() {
    const nodes = safeQueryAll(config.selectors.opponentGraveyardCards);
    const zone = safeQuery(config.selectors.opponentGraveyardZone);
    const items =
      nodes.length > 0
        ? nodes
        : zone
        ? Array.from(zone.querySelectorAll('img[alt], [data-card-name], .card'))
        : [];

    return items
      .map((el, i) => {
        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
        const name = (
          el.getAttribute('data-card-name') ||
          img?.getAttribute('alt') ||
          el.getAttribute('title') ||
          el.textContent ||
          ''
        ).trim();
        const typeLine = (el.getAttribute('data-card-type') || 'Carte Magic').trim();
        return {
          id: el.getAttribute('data-card-id') || 'gy-' + i + '-' + name,
          name,
          typeLine,
          category: inferCardCategory(typeLine),
          imgSrc: img?.getAttribute('src') || '',
        };
      })
      .filter((c) => c.name.length > 0 && !/^\\d+$/.test(c.name));
  }

  function showCardZoom(card, rect) {
    if (!config.enableHoverZoom || !card.imgSrc) return;
    let zoom = document.getElementById('upkeep-card-zoom');
    if (!zoom) {
      zoom = document.createElement('div');
      zoom.id = 'upkeep-card-zoom';
      document.body.appendChild(zoom);
    }
    zoom.innerHTML = '';
    const img = document.createElement('img');
    img.src = card.imgSrc;
    img.alt = card.name;
    img.referrerPolicy = 'no-referrer';
    zoom.appendChild(img);
    const w = Math.round(230 * (config.hoverZoomScale / 1.35));
    zoom.style.width = w + 'px';
    zoom.style.left = Math.max(12, rect.left - w - 14) + 'px';
    zoom.style.top = Math.min(window.innerHeight - 360, Math.max(12, rect.top - 40)) + 'px';
    zoom.dataset.visible = 'true';
  }

  function hideCardZoom() {
    const zoom = document.getElementById('upkeep-card-zoom');
    if (zoom) zoom.dataset.visible = 'false';
  }

  function ensureGraveyardRail() {
    let rail = document.getElementById('upkeep-opp-graveyard');
    if (rail) return rail;

    rail = document.createElement('aside');
    rail.id = 'upkeep-opp-graveyard';
    rail.setAttribute('aria-label', 'Cimetière adverse (Upkeep)');
    rail.innerHTML = \`
      <div class="upkeep-gy-header">
        <div class="upkeep-gy-title-row">
          <h2 class="upkeep-gy-title">Cimetière adverse</h2>
          <span class="upkeep-gy-count" id="upkeep-gy-count">0</span>
        </div>
        <div class="upkeep-gy-meta" id="upkeep-gy-meta">Cimetière vide</div>
      </div>
      <div class="upkeep-gy-filters" role="group">
        <button type="button" class="upkeep-gy-filter-btn" data-filter="all" aria-pressed="true">Tout</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="creature" aria-pressed="false">Créat.</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="spell" aria-pressed="false">Sorts</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="land" aria-pressed="false">Terrains</button>
      </div>
      <div class="upkeep-gy-list" id="upkeep-gy-list"></div>
    \`;

    rail.querySelectorAll('.upkeep-gy-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.gyFilter = btn.getAttribute('data-filter') || 'all';
        rail.querySelectorAll('.upkeep-gy-filter-btn').forEach((b) => {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        renderGraveyardList();
      });
    });

    document.body.appendChild(rail);
    return rail;
  }

  function renderGraveyardList() {
    if (!config.enabled || !state.isGameRoute || !config.alwaysShowOpponentGraveyard) return;
    ensureGraveyardRail();
    const cards = extractOpponentGraveyardCards();
    const filtered = state.gyFilter === 'all' ? cards : cards.filter((c) => c.category === state.gyFilter);
    const countEl = document.getElementById('upkeep-gy-count');
    const metaEl = document.getElementById('upkeep-gy-meta');
    const listEl = document.getElementById('upkeep-gy-list');
    if (!countEl || !metaEl || !listEl) return;

    countEl.textContent = String(cards.length);
    const types = new Set(cards.map((c) => c.category)).size;
    metaEl.textContent =
      cards.length > 0
        ? types + ' types · ' + cards.length + (cards.length > 1 ? ' cartes' : ' carte')
        : 'Aucune carte au cimetière';

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      empty.textContent = cards.length === 0 ? 'Cimetière adverse vide.' : 'Aucune carte pour ce filtre.';
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((card) => {
      const row = document.createElement('div');
      row.className = 'upkeep-gy-item';
      const info = document.createElement('div');
      info.style.minWidth = '0';
      const n = document.createElement('div');
      n.className = 'upkeep-gy-card-name';
      n.textContent = card.name;
      const t = document.createElement('div');
      t.className = 'upkeep-gy-card-type';
      t.textContent = card.typeLine;
      info.appendChild(n);
      info.appendChild(t);
      row.appendChild(info);
      row.addEventListener('mouseenter', () => showCardZoom(card, row.getBoundingClientRect()));
      row.addEventListener('mouseleave', hideCardZoom);
      listEl.appendChild(row);
    });
  }

  function ensureHudBar(id, cls) {
    let bar = document.getElementById(id);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = id;
      bar.className = 'upkeep-hud-bar ' + cls;
      document.body.appendChild(bar);
    }
    return bar;
  }

  function renderHudBar(bar, prefix, metrics) {
    bar.innerHTML = '';
    const lifeMetric = document.createElement('div');
    lifeMetric.className = 'upkeep-hud-metric';
    const lifeLabel = document.createElement('span');
    lifeLabel.className = 'upkeep-hud-label';
    lifeLabel.textContent = prefix + ' · PV';
    const lifeVal = document.createElement('span');
    lifeVal.className =
      'upkeep-hud-value upkeep-hud-value--life' +
      (metrics.life !== null && metrics.life <= 5 ? ' upkeep-hud-value--critical' : '');
    lifeVal.textContent = metrics.life !== null ? String(metrics.life) : '—';
    lifeMetric.appendChild(lifeLabel);
    lifeMetric.appendChild(lifeVal);
    if (metrics.delta) {
      const d = document.createElement('span');
      d.className = 'upkeep-hud-delta ' + (metrics.delta > 0 ? 'upkeep-hud-delta--pos' : 'upkeep-hud-delta--neg');
      d.textContent = (metrics.delta > 0 ? '+' : '') + metrics.delta;
      lifeMetric.appendChild(d);
    }
    bar.appendChild(lifeMetric);

    [
      { label: 'Deck', value: metrics.library },
      { label: 'Main', value: metrics.hand },
      ...(config.showExtendedCounters ? [{ label: 'Exil', value: metrics.exile }] : []),
    ].forEach((item) => {
      const c = document.createElement('div');
      c.className = 'upkeep-hud-metric';
      const l = document.createElement('span');
      l.className = 'upkeep-hud-label';
      l.textContent = item.label;
      const v = document.createElement('span');
      v.className = 'upkeep-hud-value';
      v.textContent = item.value !== null ? String(item.value) : '—';
      c.appendChild(l);
      c.appendChild(v);
      bar.appendChild(c);
    });
  }

  function updateTacticalHud() {
    if (!config.enabled || !state.isGameRoute || !config.highContrastHud) return;
    const discovered = discoverEndstepPlayerBlocks();
    const opp = extractStatsFromBlock(discovered.opponent, {
      life: config.selectors.opponentLife,
      library: config.selectors.opponentLibrary,
      hand: config.selectors.opponentHand,
      exile: config.selectors.opponentExile,
    });
    const self = extractStatsFromBlock(discovered.self, {
      life: config.selectors.selfLife,
      library: config.selectors.selfLibrary,
      hand: config.selectors.selfHand,
      exile: config.selectors.selfExile,
    });

    if (opp.life !== null && state.lastOpponentLife !== null && opp.life !== state.lastOpponentLife) {
      state.opponentLifeDelta = opp.life - state.lastOpponentLife;
    }
    if (opp.life !== null) state.lastOpponentLife = opp.life;

    if (self.life !== null && state.lastSelfLife !== null && self.life !== state.lastSelfLife) {
      state.selfLifeDelta = self.life - state.lastSelfLife;
    }
    if (self.life !== null) state.lastSelfLife = self.life;

    if (opp.life !== null || opp.library !== null || opp.hand !== null) {
      renderHudBar(ensureHudBar('upkeep-hud-top', 'upkeep-hud-bar--top'), 'Adversaire', {
        ...opp,
        delta: state.opponentLifeDelta,
      });
    }
    if (self.life !== null || self.library !== null || self.hand !== null) {
      renderHudBar(ensureHudBar('upkeep-hud-bottom', 'upkeep-hud-bar--bottom'), 'Vous', {
        ...self,
        delta: state.selfLifeDelta,
      });
    }
  }

  function applyRootAttributes() {
    const active = Boolean(config.enabled && state.isGameRoute);
    document.documentElement.dataset.upkeepActive = active ? 'true' : 'false';
    document.documentElement.dataset.upkeepLogsOpen = active && state.logsVisible ? 'true' : 'false';
    document.documentElement.dataset.upkeepGyOpen =
      active && state.graveyardVisible && config.alwaysShowOpponentGraveyard ? 'true' : 'false';
    document.documentElement.style.setProperty('--upkeep-logs-width', config.logsWidth + 'px');
    document.documentElement.style.setProperty('--upkeep-gy-width', config.graveyardWidth + 'px');

    const topHud = document.getElementById('upkeep-hud-top');
    const bottomHud = document.getElementById('upkeep-hud-bottom');
    const gy = document.getElementById('upkeep-opp-graveyard');
    const disp = active ? '' : 'none';
    if (topHud) topHud.style.display = config.highContrastHud ? disp : 'none';
    if (bottomHud) bottomHud.style.display = config.highContrastHud ? disp : 'none';
    if (gy) gy.style.display = config.alwaysShowOpponentGraveyard ? disp : 'none';
  }

  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(() => {
      syncRaf = null;
      const nowGame = isGameUrl();
      const nextId = extractGameId();
      if (nowGame !== state.isGameRoute || nextId !== state.currentGameId) {
        state.isGameRoute = nowGame;
        state.currentGameId = nextId;
        state.lastOpponentLife = null;
        state.lastSelfLife = null;
        state.opponentLifeDelta = null;
        state.selfLifeDelta = null;
        if (nowGame && config.autoOpenLogsLeft) state.logsVisible = true;
      }
      applyRootAttributes();
      if (state.isGameRoute && config.enabled) {
        ensureLogsDockedLeft();
        renderGraveyardList();
        updateTacticalHud();
      }
    });
  }

  function installSpaHooks() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      scheduleSync();
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      scheduleSync();
    };
    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('hashchange', scheduleSync);
  }

  function installKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !state.isGameRoute) return;
      const key = e.key.toLowerCase();
      if (key === config.shortcuts.toggleLogs.toLowerCase()) {
        state.logsVisible = !state.logsVisible;
        applyRootAttributes();
      } else if (key === config.shortcuts.toggleGraveyard.toLowerCase()) {
        state.graveyardVisible = !state.graveyardVisible;
        applyRootAttributes();
      } else if (key === config.shortcuts.toggleTheme.toLowerCase()) {
        config.enabled = !config.enabled;
        extApi.storage.sync.set({ [STORAGE_KEY]: config });
        scheduleSync();
      }
    });
  }

  async function init() {
    try {
      const stored = await extApi.storage.sync.get(STORAGE_KEY);
      if (stored && stored[STORAGE_KEY]) {
        config = {
          ...DEFAULT_CONFIG,
          ...stored[STORAGE_KEY],
          shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...(stored[STORAGE_KEY].shortcuts || {}) },
          selectors: { ...DEFAULT_CONFIG.selectors, ...(stored[STORAGE_KEY].selectors || {}) },
        };
      }
    } catch {
      // defaults
    }

    extApi.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEY]?.newValue) {
        config = { ...DEFAULT_CONFIG, ...changes[STORAGE_KEY].newValue };
        scheduleSync();
      }
    });

    installSpaHooks();
    installKeyboardShortcuts();
    new MutationObserver(() => scheduleSync()).observe(document.body, {
      childList: true,
      subtree: true,
    });
    scheduleSync();
  }

  init();
})();
`;
}

export function generatePopupHtml(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Upkeep</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header class="header">
      <div class="brand">Upkeep</div>
      <label class="switch">
        <input type="checkbox" id="toggle-enabled" />
        <span class="slider"></span>
      </label>
    </header>

    <main class="content">
      <section class="group">
        <label class="row">
          <span>Logs ouverts à gauche au démarrage</span>
          <input type="checkbox" id="toggle-logs" />
        </label>
        <label class="row">
          <span>Cimetière adverse en continu</span>
          <input type="checkbox" id="toggle-gy" />
        </label>
        <label class="row">
          <span>HUD PV / Deck / Main agrandi</span>
          <input type="checkbox" id="toggle-hud" />
        </label>
        <label class="row">
          <span>Zoom carte au survol</span>
          <input type="checkbox" id="toggle-zoom" />
        </label>
      </section>

      <section class="group">
        <div class="slider-row">
          <div class="slider-meta">
            <span>Largeur logs (gauche)</span>
            <span class="mono" id="val-logs-width">264px</span>
          </div>
          <input type="range" id="range-logs" min="210" max="340" step="4" />
        </div>
        <div class="slider-row">
          <div class="slider-meta">
            <span>Largeur cimetière (droite)</span>
            <span class="mono" id="val-gy-width">276px</span>
          </div>
          <input type="range" id="range-gy" min="220" max="350" step="4" />
        </div>
      </section>

      <div class="shortcuts">
        <span>Raccourcis sur Endstep :</span>
        <span class="mono">L Logs · G Cimetière · U Thème</span>
      </div>
    </main>

    <footer class="footer">
      <button type="button" id="btn-pick-gy" class="btn-secondary">Cibler cimetière</button>
      <button type="button" id="btn-options" class="btn-primary">Sélecteurs DOM</button>
    </footer>

    <script src="popup.js"></script>
  </body>
</html>
`;
}

export function generatePopupCss(): string {
  return `body {
  width: 312px;
  margin: 0;
  background: #0E1116;
  color: #F2EEE6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.09);
  background: #151922;
}

.brand {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.content {
  padding: 12px 16px;
}

.group {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.08);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  color: #E2DDD3;
  cursor: pointer;
}

.slider-row {
  padding: 6px 0;
}

.slider-meta {
  display: flex;
  justify-content: space-between;
  color: #9CA3B2;
  font-size: 12px;
  margin-bottom: 4px;
}

input[type="range"] {
  width: 100%;
  accent-color: #C9A45C;
}

input[type="checkbox"] {
  accent-color: #C9A45C;
  width: 15px;
  height: 15px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  color: #C9A45C;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #9CA3B2;
}

.footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(242, 238, 230, 0.09);
  background: #151922;
}

button {
  flex: 1;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: #C9A45C;
  color: #0E1116;
}

.btn-secondary {
  background: #1C222E;
  color: #F2EEE6;
  border-color: rgba(242, 238, 230, 0.14);
}
`;
}

export function generatePopupJs(config: UpkeepConfig): string {
  return `(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v1';
  const DEFAULTS = ${JSON.stringify(config, null, 2)};

  let current = structuredClone(DEFAULTS);

  async function save() {
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
  }

  function bindUI() {
    const elEnabled = document.getElementById('toggle-enabled');
    const elLogs = document.getElementById('toggle-logs');
    const elGy = document.getElementById('toggle-gy');
    const elHud = document.getElementById('toggle-hud');
    const elZoom = document.getElementById('toggle-zoom');
    const rangeLogs = document.getElementById('range-logs');
    const rangeGy = document.getElementById('range-gy');
    const valLogs = document.getElementById('val-logs-width');
    const valGy = document.getElementById('val-gy-width');

    elEnabled.checked = current.enabled;
    elLogs.checked = current.autoOpenLogsLeft;
    elGy.checked = current.alwaysShowOpponentGraveyard;
    elHud.checked = current.highContrastHud;
    elZoom.checked = current.enableHoverZoom;
    rangeLogs.value = String(current.logsWidth);
    rangeGy.value = String(current.graveyardWidth);
    valLogs.textContent = current.logsWidth + 'px';
    valGy.textContent = current.graveyardWidth + 'px';

    elEnabled.addEventListener('change', () => { current.enabled = elEnabled.checked; save(); });
    elLogs.addEventListener('change', () => { current.autoOpenLogsLeft = elLogs.checked; save(); });
    elGy.addEventListener('change', () => { current.alwaysShowOpponentGraveyard = elGy.checked; save(); });
    elHud.addEventListener('change', () => { current.highContrastHud = elHud.checked; save(); });
    elZoom.addEventListener('change', () => { current.enableHoverZoom = elZoom.checked; save(); });

    rangeLogs.addEventListener('input', () => {
      current.logsWidth = Number(rangeLogs.value);
      valLogs.textContent = current.logsWidth + 'px';
      save();
    });

    rangeGy.addEventListener('input', () => {
      current.graveyardWidth = Number(rangeGy.value);
      valGy.textContent = current.graveyardWidth + 'px';
      save();
    });

    document.getElementById('btn-options').addEventListener('click', () => {
      extApi.runtime.openOptionsPage();
    });

    document.getElementById('btn-pick-gy').addEventListener('click', async () => {
      const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        extApi.tabs.sendMessage(tab.id, { type: 'UPKEEP_PICK_SELECTOR', key: 'opponentGraveyardZone' });
        window.close();
      }
    });
  }

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      current = { ...DEFAULTS, ...stored[STORAGE_KEY] };
    }
    bindUI();
  }

  init();
})();
`;
}

export function generateOptionsHtml(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Upkeep — Sélecteurs DOM &amp; Préférences</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <h1>Upkeep — Adaptateur DOM Endstep</h1>
          <p>Ajustez les sélecteurs CSS si endstep.cc met à jour sa structure HTML.</p>
        </div>
        <div class="actions">
          <button type="button" id="btn-reset" class="btn-secondary">Réinitialiser</button>
          <button type="button" id="btn-save" class="btn-primary">Enregistrer</button>
        </div>
      </header>
      <div id="status" class="status" aria-live="polite"></div>
      <div id="selectors-grid" class="grid"></div>
    </div>
    <script src="options.js"></script>
  </body>
</html>
`;
}

export function generateOptionsCss(): string {
  return `body {
  margin: 0;
  background: #0E1116;
  color: #F2EEE6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.shell {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.1);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

p {
  margin: 0;
  color: #9CA3B2;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 10px;
}

button {
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: #C9A45C;
  color: #0E1116;
}

.btn-secondary {
  background: #151922;
  color: #F2EEE6;
  border-color: rgba(242, 238, 230, 0.16);
}

.status {
  min-height: 22px;
  margin: 14px 0;
  font-size: 13px;
  color: #3FA372;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.field {
  background: #151922;
  border: 1px solid rgba(242, 238, 230, 0.09);
  border-radius: 10px;
  padding: 14px 16px;
}

.field label {
  display: block;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  box-sizing: border-box;
  background: #0E1116;
  color: #F2EEE6;
  border: 1px solid rgba(242, 238, 230, 0.14);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
`;
}

export function generateOptionsJs(config: UpkeepConfig): string {
  return `(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v1';
  const DEFAULTS = ${JSON.stringify(config, null, 2)};

  let current = structuredClone(DEFAULTS);

  function render() {
    const grid = document.getElementById('selectors-grid');
    grid.innerHTML = '';
    Object.entries(current.selectors).forEach(([key, value]) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const label = document.createElement('label');
      label.setAttribute('for', 'sel-' + key);
      label.textContent = key;
      const input = document.createElement('input');
      input.id = 'sel-' + key;
      input.value = value;
      input.addEventListener('input', () => {
        current.selectors[key] = input.value;
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
  }

  document.getElementById('btn-save').addEventListener('click', async () => {
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
    document.getElementById('status').textContent = 'Sélecteurs enregistrés et synchronisés.';
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    current = structuredClone(DEFAULTS);
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
    render();
    document.getElementById('status').textContent = 'Valeurs par défaut restaurées.';
  });

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      current = {
        ...DEFAULTS,
        ...stored[STORAGE_KEY],
        selectors: { ...DEFAULTS.selectors, ...(stored[STORAGE_KEY].selectors || {}) },
      };
    }
    render();
  }

  init();
})();
`;
}

export function generateBuildScript(): string {
  return `#!/usr/bin/env node
/**
 * Upkeep — Dual-Target Extension Build & Packager (Chrome MV3 + Firefox MV3)
 * Usage:
 *   node scripts/build-extension.mjs --target=all
 *   node scripts/build-extension.mjs --target=chrome
 *   node scripts/build-extension.mjs --target=firefox
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const argTarget = process.argv.find((a) => a.startsWith('--target='));
const requested = argTarget ? argTarget.split('=')[1] : 'all';
const targets = requested === 'all' ? ['chrome', 'firefox'] : [requested];

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function validateManifest(manifest, target) {
  if (manifest.manifest_version !== 3) {
    throw new Error(\`[\${target}] manifest_version must be 3\`);
  }
  if (target === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id) {
      throw new Error('[firefox] Missing browser_specific_settings.gecko.id');
    }
    if (!gecko?.data_collection_permissions?.required) {
      throw new Error('[firefox] Missing required data_collection_permissions for AMO');
    }
  }
  if (target === 'chrome' && manifest.browser_specific_settings) {
    throw new Error('[chrome] Remove browser_specific_settings to keep Chrome Web Store manifest clean');
  }
}

fs.mkdirSync(path.join(rootDir, 'artifacts'), { recursive: true });

for (const target of targets) {
  const outDir = path.join(rootDir, 'dist', target);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const manifestFile = path.join(rootDir, \`manifest.\${target}.json\`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = version;
  validateManifest(manifest, target);

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\\n');
  copyRecursive(path.join(rootDir, 'src'), path.join(outDir, 'src'));
  copyRecursive(path.join(rootDir, 'icons'), path.join(outDir, 'icons'));

  const zipName = \`upkeep-\${target}-v\${version}.zip\`;
  const zipPath = path.join(rootDir, 'artifacts', zipName);
  fs.rmSync(zipPath, { force: true });

  execSync(\`cd "\${outDir}" && zip -rq "\${zipPath}" .\`);
  console.log(\`✔ Built \${target} MV3 -> artifacts/\${zipName}\`);
}
`;
}

export function generateRepoPackageJson(config: UpkeepConfig): string {
  return (
    JSON.stringify(
      {
        name: 'upkeep',
        version: config.version,
        private: true,
        type: 'module',
        description:
          "Extension Chrome & Firefox (MV3) pour refondre l'interface en partie de endstep.cc",
        repository: {
          type: 'git',
          url: 'https://github.com/LPauzies/Upkeep.git',
        },
        scripts: {
          'build:chrome': 'node scripts/build-extension.mjs --target=chrome',
          'build:firefox': 'node scripts/build-extension.mjs --target=firefox',
          'build:all': 'node scripts/build-extension.mjs --target=all',
          'lint:firefox': 'npx --yes web-ext lint --source-dir dist/firefox',
          verify: 'npm run build:all && npm run lint:firefox',
        },
        devDependencies: {
          'web-ext': '^8.3.0',
        },
      },
      null,
      2
    ) + '\n'
  );
}

export function generateCiWorkflowYaml(): string {
  return `name: CI — Build & Validate Upkeep

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-and-build:
    name: Build Chrome & Firefox MV3 + web-ext lint
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build & validate Chrome and Firefox manifests
        run: npm run build:all

      - name: Lint Firefox MV3 package with Mozilla web-ext
        run: npx --yes web-ext lint --source-dir dist/firefox --warnings-as-errors

      - name: Upload preview extension artifacts
        uses: actions/upload-artifact@v4
        with:
          name: upkeep-preview-bundles
          path: artifacts/*.zip
          retention-days: 14
`;
}

export function generateReleaseWorkflowYaml(): string {
  return `name: Release & Publish (Chrome Web Store + Firefox AMO)

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      publish_stores:
        description: 'Publier sur Chrome Web Store et Firefox AMO si les secrets sont configurés'
        type: boolean
        default: true

permissions:
  contents: write

jobs:
  build-release:
    name: Build & Create GitHub Release
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build Chrome & Firefox MV3 ZIP archives
        run: npm run build:all

      - name: Validate Firefox bundle with web-ext lint
        run: npx --yes web-ext lint --source-dir dist/firefox

      - name: Upload build artifacts for deploy jobs
        uses: actions/upload-artifact@v4
        with:
          name: upkeep-release-zips
          path: |
            artifacts/upkeep-chrome-*.zip
            artifacts/upkeep-firefox-*.zip
            dist/firefox/**

      - name: Publish GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            artifacts/upkeep-chrome-*.zip
            artifacts/upkeep-firefox-*.zip

  publish-chrome-web-store:
    name: Publish to Chrome Web Store
    needs: build-release
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || inputs.publish_stores == true }}
    steps:
      - name: Download Chrome ZIP artifact
        uses: actions/download-artifact@v4
        with:
          name: upkeep-release-zips
          path: release-bundle

      - name: Check Chrome Web Store secrets
        id: check_chrome
        env:
          CHROME_EXTENSION_ID: \${{ secrets.CHROME_EXTENSION_ID }}
          CHROME_CLIENT_ID: \${{ secrets.CHROME_CLIENT_ID }}
          CHROME_CLIENT_SECRET: \${{ secrets.CHROME_CLIENT_SECRET }}
          CHROME_REFRESH_TOKEN: \${{ secrets.CHROME_REFRESH_TOKEN }}
        run: |
          if [ -n "$CHROME_EXTENSION_ID" ] && [ -n "$CHROME_CLIENT_ID" ] && [ -n "$CHROME_CLIENT_SECRET" ] && [ -n "$CHROME_REFRESH_TOKEN" ]; then
            echo "ready=true" >> "$GITHUB_OUTPUT"
          else
            echo "ready=false" >> "$GITHUB_OUTPUT"
            echo "Chrome Web Store secrets non configurés — étape ignorée."
          fi

      - name: Upload & publish to Chrome Web Store
        if: steps.check_chrome.outputs.ready == 'true'
        uses: mnao305/chrome-extension-upload@v5.0.0
        with:
          file-path: release-bundle/artifacts/upkeep-chrome-*.zip
          extension-id: \${{ secrets.CHROME_EXTENSION_ID }}
          client-id: \${{ secrets.CHROME_CLIENT_ID }}
          client-secret: \${{ secrets.CHROME_CLIENT_SECRET }}
          refresh-token: \${{ secrets.CHROME_REFRESH_TOKEN }}
          publish: true

  publish-firefox-amo:
    name: Publish to Firefox Add-ons (AMO)
    needs: build-release
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || inputs.publish_stores == true }}
    steps:
      - name: Download Firefox bundle
        uses: actions/download-artifact@v4
        with:
          name: upkeep-release-zips
          path: release-bundle

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Check AMO secrets
        id: check_amo
        env:
          AMO_JWT_ISSUER: \${{ secrets.AMO_JWT_ISSUER }}
          AMO_JWT_SECRET: \${{ secrets.AMO_JWT_SECRET }}
        run: |
          if [ -n "$AMO_JWT_ISSUER" ] && [ -n "$AMO_JWT_SECRET" ]; then
            echo "ready=true" >> "$GITHUB_OUTPUT"
          else
            echo "ready=false" >> "$GITHUB_OUTPUT"
            echo "Secrets Firefox AMO non configurés — étape ignorée."
          fi

      - name: Sign & submit to Mozilla AMO (listed)
        if: steps.check_amo.outputs.ready == 'true'
        env:
          WEB_EXT_API_KEY: \${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: \${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx --yes web-ext sign \\
            --source-dir release-bundle/dist/firefox \\
            --artifacts-dir release-bundle/amo-signed \\
            --channel=listed
`;
}

export function generateRepoReadme(config: UpkeepConfig): string {
  return `# Upkeep — Refonte UI Endstep (Chrome & Firefox)

Extension navigateur **Manifest V3** pour [endstep.cc](https://endstep.cc/) conçue pour les parties Magic: The Gathering :

- **Cimetière adverse en continu** ancré sur la colonne droite (\`${config.graveyardWidth}px\`) avec filtres par type de carte, décompte des types distincts et zoom haute lisibilité au survol.
- **Compteurs vitaux haute lisibilité** : Points de vie en grand corps tabulaire (avec delta récent et état critique), cartes restantes dans le Deck et cartes en Main.
- **Journal de partie ouvert à gauche** (\`${config.logsWidth}px\`) automatiquement dès l'ouverture d'une URL \`/game/*\`.
- **Charte tapis de tournoi** : ardoise obsidienne mate (\`#0E1116\`), surfaces structurées (\`#151922\`) et accents or mat (\`#C9A45C\`).
- **Résilience DOM** : sélecteur visuel interactif et page d'options permettant de réassocier n'importe quelle zone en cas de mise à jour d'Endstep.

---

## 1. Build & Packaging local

\`\`\`bash
# Générer les archives Chrome MV3 et Firefox MV3 dans ./dist/ et ./artifacts/
npm run build:all

# Valider le package Firefox avec Mozilla web-ext
npm run lint:firefox
\`\`\`

---

## 2. Installation locale pour tester sur \`endstep.cc\`

### Chrome / Brave / Edge
1. Lancez \`npm run build:chrome\` (ou décompressez \`upkeep-chrome-v${config.version}.zip\`).
2. Ouvrez \`chrome://extensions\` et activez **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez \`dist/chrome/\`.
4. Ouvrez une partie sur \`https://endstep.cc/game/...\`.

### Firefox (Desktop ≥ 140)
1. Lancez \`npm run build:firefox\` (ou décompressez \`upkeep-firefox-v${config.version}.zip\`).
2. Ouvrez \`about:debugging#/runtime/this-firefox\`.
3. Cliquez sur **Charger un module complémentaire temporaire...** et sélectionnez \`dist/firefox/manifest.json\`.
4. Ouvrez une partie sur \`https://endstep.cc/game/...\`.

---

## 3. Déploiement sur le Chrome Web Store

1. Connectez-vous au [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Importez \`artifacts/upkeep-chrome-v${config.version}.zip\`.
3. Permissions déclarées : \`storage\` uniquement + hôte \`https://endstep.cc/*\` (aucune collecte de données).
4. Une fois validée, récupérez \`CHROME_EXTENSION_ID\` pour automatiser les mises à jour via GitHub Actions.

---

## 4. Déploiement sur Firefox Add-ons (Mozilla AMO)

Le manifeste \`manifest.firefox.json\` inclut déjà les champs obligatoires AMO :
- \`browser_specific_settings.gecko.id\`: \`upkeep@lpauzies.dev\`
- \`strict_min_version\`: \`140.0\`
- \`data_collection_permissions.required\`: \`["none"]\`

1. Rendez-vous sur [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. Soumettez \`artifacts/upkeep-firefox-v${config.version}.zip\` (distribution publique *listed* ou auto-signée *unlisted*).
3. Pour la publication automatique CI, générez une clé API sur \`addons.mozilla.org/developers/addon/api/key/\`.

---

## 5. GitHub Actions CI & Release automatique

- \`.github/workflows/ci.yml\` : validation des manifestes, build Chrome/Firefox et \`web-ext lint --warnings-as-errors\` sur chaque push/PR.
- \`.github/workflows/release.yml\` : sur tag \`v*\` (ex: \`git tag v${config.version} && git push origin v${config.version}\`), crée la GitHub Release avec les \`.zip\` et publie automatiquement sur les stores si les secrets sont définis :

| Store | Secrets GitHub Actions requis |
| --- | --- |
| **Chrome Web Store** | \`CHROME_EXTENSION_ID\`, \`CHROME_CLIENT_ID\`, \`CHROME_CLIENT_SECRET\`, \`CHROME_REFRESH_TOKEN\` |
| **Firefox Add-ons (AMO)** | \`AMO_JWT_ISSUER\`, \`AMO_JWT_SECRET\` |
`;
}

export function getAllGeneratedFiles(config: UpkeepConfig): GeneratedRepoFile[] {
  return [
    {
      path: 'manifest.chrome.json',
      content: generateChromeManifest(config),
      language: 'json',
      category: 'chrome',
      description: 'Manifeste MV3 propre pour le Chrome Web Store (sans clé Gecko).',
    },
    {
      path: 'manifest.firefox.json',
      content: generateFirefoxManifest(config),
      language: 'json',
      category: 'firefox',
      description: 'Manifeste MV3 Mozilla AMO avec gecko.id et data_collection_permissions.',
    },
    {
      path: 'src/content/upkeep.js',
      content: generateContentJs(config),
      language: 'js',
      category: 'extension',
      description: 'Contrôleur DOM : ouverture auto des logs, cimetière continu, HUD & raccourcis.',
    },
    {
      path: 'src/content/upkeep.css',
      content: generateContentCss(config),
      language: 'css',
      category: 'extension',
      description: 'Feuille de style Ardoise & Or mat injectée sur endstep.cc/game/*.',
    },
    {
      path: 'src/popup/popup.html',
      content: generatePopupHtml(),
      language: 'html',
      category: 'extension',
      description: 'Interface popup de la barre d’outils Chrome/Firefox.',
    },
    {
      path: 'src/popup/popup.css',
      content: generatePopupCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles du popup Upkeep.',
    },
    {
      path: 'src/popup/popup.js',
      content: generatePopupJs(config),
      language: 'js',
      category: 'extension',
      description: 'Synchronisation storage.sync et lancement du sélecteur visuel.',
    },
    {
      path: 'src/options/options.html',
      content: generateOptionsHtml(),
      language: 'html',
      category: 'extension',
      description: 'Page d’options pour adapter les sélecteurs DOM Endstep.',
    },
    {
      path: 'src/options/options.css',
      content: generateOptionsCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles de la page d’options.',
    },
    {
      path: 'src/options/options.js',
      content: generateOptionsJs(config),
      language: 'js',
      category: 'extension',
      description: 'Édition et sauvegarde des sélecteurs CSS personnalisés.',
    },
    {
      path: '.github/workflows/ci.yml',
      content: generateCiWorkflowYaml(),
      language: 'yaml',
      category: 'ci',
      description: 'CI GitHub Actions : build Chrome/Firefox + web-ext lint sur push/PR.',
    },
    {
      path: '.github/workflows/release.yml',
      content: generateReleaseWorkflowYaml(),
      language: 'yaml',
      category: 'ci',
      description: 'CD GitHub Actions : Release GitHub + publication Chrome Web Store & Firefox AMO.',
    },
    {
      path: 'scripts/build-extension.mjs',
      content: generateBuildScript(),
      language: 'js',
      category: 'repo',
      description: 'Script Node.js de compilation et de validation des archives MV3.',
    },
    {
      path: 'package.json',
      content: generateRepoPackageJson(config),
      language: 'json',
      category: 'repo',
      description: 'Manifeste NPM du dépôt LPauzies/Upkeep.',
    },
    {
      path: 'README.md',
      content: generateRepoReadme(config),
      language: 'md',
      category: 'repo',
      description: 'Documentation d’installation, build et secrets GitHub Actions.',
    },
  ];
}
