/* Upkeep — Content Script auto-injecté sur https://endstep.cc/*
 * Détecte automatiquement les URLs /game/* côté client (rien à copier-coller).
 * - Ouvre automatiquement le panneau Log (bouton vertical "Log" sur le bord gauche d'Endstep)
 * - Améliore la lisibilité des compteurs PV / Deck / Main (LIFE + bibliothèque + main)
 * - Affiche en continu le cimetière adverse dans un rail droit dédié
 * - Laisse les cartes Magic 100% intactes telles qu'Endstep les affiche
 */
(() => {
  'use strict';

  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v1';

  const DEFAULT_CONFIG = {
    version: '1.0.0',
    enabled: true,
    autoOpenLogsLeft: true,
    alwaysShowOpponentGraveyard: true,
    highContrastHud: true,
    showExtendedCounters: true,
    enableHoverZoom: true,
    logsWidth: 264,
    graveyardWidth: 268,
    hoverZoomScale: 1.45,
    density: 'balanced',
    shortcuts: { toggleLogs: 'l', toggleGraveyard: 'g', toggleTheme: 'u' },
    selectors: {
      gameRoot: '[data-testid="game-board"], .game-board, main',
      logsPanel: '[data-testid="game-log"], [data-zone="log"], .game-log, .log-panel, aside[aria-label*="log" i]',
      logsToggleButton: 'button[aria-label*="log" i], button[title*="log" i], [data-testid="toggle-log"], .log-toggle',
      opponentGraveyardZone: '[data-player="opponent"] [data-zone="graveyard"], .opponent-zone .graveyard, [aria-label*="graveyard" i]',
      opponentGraveyardCards: '[data-player="opponent"] [data-zone="graveyard"] img, .opponent-zone .graveyard img',
      opponentLife: '[data-player="opponent"] [data-stat="life"], [data-testid="opponent-life"]',
      opponentLibrary: '[data-player="opponent"] [data-stat="library"], [data-testid="opponent-library"]',
      opponentHand: '[data-player="opponent"] [data-stat="hand"], [data-testid="opponent-hand"]',
      opponentExile: '[data-player="opponent"] [data-stat="exile"], [data-testid="opponent-exile"]',
      selfLife: '[data-player="self"] [data-stat="life"], [data-testid="self-life"]',
      selfLibrary: '[data-player="self"] [data-stat="library"], [data-testid="self-library"]',
      selfHand: '[data-player="self"] [data-stat="hand"], [data-testid="self-hand"]',
      selfExile: '[data-player="self"] [data-stat="exile"], [data-testid="self-exile"]',
    },
  };

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

  function isGameUrl(pathname = window.location.pathname) {
    return /^\/game\/[^/]+/i.test(pathname);
  }

  function extractGameId(pathname = window.location.pathname) {
    const m = pathname.match(/^\/game\/([^/?#]+)/i);
    return m ? m[1] : null;
  }

  function safeQuery(selector) {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function safeQueryAll(selector) {
    if (!selector) return [];
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function parseIntSafe(text) {
    const m = (text || '').trim().match(/-?\d+/);
    return m ? Number.parseInt(m[0], 10) : null;
  }

  /**
   * Endstep affiche "20 LIFE" en haut à gauche (adversaire) et en bas à gauche (vous),
   * suivi directement par les compteurs de bibliothèque et de main.
   * Cette détection heuristique fonctionne même sans attributs data-testid.
   */
  function discoverEndstepPlayerBlocks() {
    const blocks = [];
    const allElements = Array.from(document.querySelectorAll('div, section, aside'));
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.left > 320 || rect.width < 80 || rect.width > 340 || rect.height > 200) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/\b\d+\s*LIFE\b/i.test(text)) continue;
      if (el.querySelector('[data-upkeep-life-block="true"]')) continue;
      blocks.push({ el, top: rect.top, text });
    }
    blocks.sort((a, b) => a.top - b.top);
    // Garder les conteneurs les plus compacts (1 en haut = adversaire, 1 en bas = joueur)
    const compact = blocks.filter((b) => b.text.length < 120);
    return {
      opponent: compact[0] || null,
      self: compact.length > 1 ? compact[compact.length - 1] : null,
    };
  }

  function extractStatsFromBlock(block, explicitSelectors) {
    let life = parseIntSafe(safeQuery(explicitSelectors.life)?.textContent);
    let library = parseIntSafe(safeQuery(explicitSelectors.library)?.textContent);
    let hand = parseIntSafe(safeQuery(explicitSelectors.hand)?.textContent);
    let exile = parseIntSafe(safeQuery(explicitSelectors.exile)?.textContent);

    if (block) {
      const lifeMatch = block.text.match(/(-?\d+)\s*LIFE/i);
      if (life === null && lifeMatch) {
        life = Number.parseInt(lifeMatch[1], 10);
      }
      // Après "XX LIFE", Endstep affiche les nombres dans l'ordre : Deck, Main, Cimetière, Exil
      const afterLife = block.text.split(/LIFE/i)[1] || '';
      const nums = (afterLife.match(/\d+/g) || []).map((n) => Number.parseInt(n, 10));
      if (library === null && nums.length >= 1) library = nums[0];
      if (hand === null && nums.length >= 2) hand = nums[1];
      if (exile === null && nums.length >= 4) exile = nums[3];
    }

    return { life, library, hand, exile };
  }

  /* 1. Détection & clic automatique sur le bouton vertical "Log" sur le bord gauche d'Endstep */
  function findEndstepLogButton() {
    const direct = safeQuery(config.selectors.logsToggleButton);
    if (direct) return direct;

    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div'));
    return (
      candidates.find((el) => {
        const txt = (el.textContent || '').trim();
        if (!/^logs?$/i.test(txt)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.width < 90 && rect.left < 80;
      }) || null
    );
  }

  function findEndstepLogPanel() {
    const direct = safeQuery(config.selectors.logsPanel);
    if (direct) return direct;

    const candidates = Array.from(document.querySelectorAll('aside, section, div'));
    return (
      candidates.find((el) => {
        if (el.id?.startsWith('upkeep-')) return false;
        const label = (
          el.getAttribute('aria-label') ||
          el.getAttribute('data-testid') ||
          el.className?.toString() ||
          ''
        ).toLowerCase();
        return /(game[-_]?log|match[-_]?log|action[-_]?log|log[-_]?drawer|log[-_]?panel)/.test(
          label
        );
      }) || null
    );
  }

  function ensureLogsOpenedLeft() {
    if (!config.enabled || !state.isGameRoute) return;

    const panel = findEndstepLogPanel();
    const isVisible =
      panel && panel.getBoundingClientRect().width > 80 && getComputedStyle(panel).display !== 'none';

    if (
      config.autoOpenLogsLeft &&
      !isVisible &&
      state.currentGameId &&
      state.logsOpenedForGameId !== state.currentGameId
    ) {
      const logBtn = findEndstepLogButton();
      if (logBtn) {
        state.logsOpenedForGameId = state.currentGameId;
        logBtn.click();
        window.setTimeout(() => {
          const opened = findEndstepLogPanel();
          if (opened) opened.setAttribute('data-upkeep-dock', 'logs-left');
        }, 220);
      }
    }

    if (panel) {
      panel.setAttribute('data-upkeep-dock', 'logs-left');
    }
  }

  /* 2. Cimetière adverse en continu (lit les cartes natives d'Endstep sans modifier leur rendu) */
  function inferCategory(typeText = '') {
    const low = typeText.toLowerCase();
    if (/land|terrain/.test(low)) return 'land';
    if (/creature|créature/.test(low)) return 'creature';
    if (/instant|sorcery|éphémère|rituel/.test(low)) return 'spell';
    return 'artifact';
  }

  function readOpponentGraveyardCards() {
    const explicitNodes = safeQueryAll(config.selectors.opponentGraveyardCards);
    const zone = safeQuery(config.selectors.opponentGraveyardZone);

    let nodes = explicitNodes;
    if (nodes.length === 0 && zone) {
      nodes = Array.from(zone.querySelectorAll('img[alt], [data-card-name], .card'));
    }

    return nodes
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
          id: el.getAttribute('data-card-id') || `gy-${i}-${name}`,
          name,
          typeLine,
          category: inferCategory(typeLine),
          imgSrc: img?.getAttribute('src') || '',
        };
      })
      .filter((c) => c.name.length > 0 && !/^\d+$/.test(c.name));
  }

  function ensureCardZoom() {
    let el = document.getElementById('upkeep-card-zoom');
    if (!el) {
      el = document.createElement('div');
      el.id = 'upkeep-card-zoom';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function showNativeCardZoom(card, rect) {
    if (!config.enableHoverZoom || !card.imgSrc) return;
    const zoom = ensureCardZoom();
    zoom.innerHTML = '';
    const img = document.createElement('img');
    img.src = card.imgSrc;
    img.alt = card.name;
    img.referrerPolicy = 'no-referrer';
    zoom.appendChild(img);

    const w = Math.round(230 * (config.hoverZoomScale / 1.35));
    zoom.style.width = `${w}px`;
    zoom.style.left = `${Math.max(12, rect.left - w - 14)}px`;
    zoom.style.top = `${Math.min(window.innerHeight - 360, Math.max(12, rect.top - 40))}px`;
    zoom.dataset.visible = 'true';
  }

  function hideNativeCardZoom() {
    const zoom = document.getElementById('upkeep-card-zoom');
    if (zoom) zoom.dataset.visible = 'false';
  }

  function ensureGraveyardRail() {
    let rail = document.getElementById('upkeep-opp-graveyard');
    if (rail) return rail;

    rail = document.createElement('aside');
    rail.id = 'upkeep-opp-graveyard';
    rail.setAttribute('aria-label', 'Cimetière adverse (Upkeep)');
    rail.innerHTML = `
      <div class="upkeep-gy-header">
        <div class="upkeep-gy-title-row">
          <h2 class="upkeep-gy-title">Cimetière adverse</h2>
          <span class="upkeep-gy-count" id="upkeep-gy-count">0</span>
        </div>
        <div class="upkeep-gy-meta" id="upkeep-gy-meta">Cimetière vide</div>
      </div>
      <div class="upkeep-gy-filters" role="group" aria-label="Filtrer le cimetière">
        <button type="button" class="upkeep-gy-filter-btn" data-filter="all" aria-pressed="true">Tout</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="creature" aria-pressed="false">Créat.</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="spell" aria-pressed="false">Sorts</button>
        <button type="button" class="upkeep-gy-filter-btn" data-filter="land" aria-pressed="false">Terrains</button>
      </div>
      <div class="upkeep-gy-list" id="upkeep-gy-list"></div>
    `;

    rail.querySelectorAll('.upkeep-gy-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.gyFilter = btn.getAttribute('data-filter') || 'all';
        rail.querySelectorAll('.upkeep-gy-filter-btn').forEach((b) => {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        renderGraveyard();
      });
    });

    document.body.appendChild(rail);
    return rail;
  }

  function renderGraveyard() {
    if (!config.enabled || !state.isGameRoute || !config.alwaysShowOpponentGraveyard) return;
    ensureGraveyardRail();

    const cards = readOpponentGraveyardCards();
    const filtered = state.gyFilter === 'all' ? cards : cards.filter((c) => c.category === state.gyFilter);

    const countEl = document.getElementById('upkeep-gy-count');
    const metaEl = document.getElementById('upkeep-gy-meta');
    const listEl = document.getElementById('upkeep-gy-list');
    if (!countEl || !metaEl || !listEl) return;

    countEl.textContent = String(cards.length);
    const distinctTypes = new Set(cards.map((c) => c.category)).size;
    metaEl.textContent =
      cards.length > 0
        ? `${distinctTypes} types · ${cards.length} ${cards.length > 1 ? 'cartes' : 'carte'}`
        : 'Aucune carte au cimetière';

    listEl.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      empty.textContent =
        cards.length === 0
          ? 'Cimetière vide ou en attente de lecture.'
          : 'Aucune carte pour ce filtre.';

      if (cards.length === 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upkeep-gy-sync-btn';
        btn.textContent = 'Synchroniser le cimetière';
        btn.addEventListener('click', () => {
          const z = safeQuery(config.selectors.opponentGraveyardZone);
          if (z) z.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          scheduleSync();
        });
        empty.appendChild(document.createElement('br'));
        empty.appendChild(btn);
      }

      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((card) => {
      const row = document.createElement('div');
      row.className = 'upkeep-gy-item';

      const wrap = document.createElement('div');
      wrap.style.minWidth = '0';

      const nameEl = document.createElement('div');
      nameEl.className = 'upkeep-gy-card-name';
      nameEl.textContent = card.name;

      const typeEl = document.createElement('div');
      typeEl.className = 'upkeep-gy-card-type';
      typeEl.textContent = card.typeLine;

      wrap.appendChild(nameEl);
      wrap.appendChild(typeEl);
      row.appendChild(wrap);

      row.addEventListener('mouseenter', () => showNativeCardZoom(card, row.getBoundingClientRect()));
      row.addEventListener('mouseleave', hideNativeCardZoom);
      listEl.appendChild(row);
    });
  }

  /* 3. HUD Tactique PV / Deck / Main haute lisibilité */
  function ensureHudStrip(id, cls) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = `upkeep-hud-strip ${cls}`;
      document.body.appendChild(el);
    }
    return el;
  }

  function fillHudStrip(el, prefix, stats, delta) {
    el.innerHTML = '';

    const lifeCell = document.createElement('div');
    lifeCell.className = 'upkeep-hud-cell';
    const lbl = document.createElement('span');
    lbl.className = 'upkeep-hud-label';
    lbl.textContent = `${prefix} · PV`;
    const val = document.createElement('span');
    val.className =
      'upkeep-hud-val upkeep-hud-val--life' +
      (stats.life !== null && stats.life <= 5 ? ' upkeep-hud-val--critical' : '');
    val.textContent = stats.life !== null ? String(stats.life) : '—';
    lifeCell.appendChild(lbl);
    lifeCell.appendChild(val);

    if (delta) {
      const d = document.createElement('span');
      d.className = `upkeep-hud-delta ${delta > 0 ? 'upkeep-hud-delta--pos' : 'upkeep-hud-delta--neg'}`;
      d.textContent = `${delta > 0 ? '+' : ''}${delta}`;
      lifeCell.appendChild(d);
    }
    el.appendChild(lifeCell);

    const pairs = [
      { label: 'Deck', v: stats.library },
      { label: 'Main', v: stats.hand },
    ];
    if (config.showExtendedCounters) {
      pairs.push({ label: 'Exil', v: stats.exile });
    }

    pairs.forEach((p) => {
      const c = document.createElement('div');
      c.className = 'upkeep-hud-cell';
      const l = document.createElement('span');
      l.className = 'upkeep-hud-label';
      l.textContent = p.label;
      const n = document.createElement('span');
      n.className = 'upkeep-hud-val';
      n.textContent = p.v !== null ? String(p.v) : '—';
      c.appendChild(l);
      c.appendChild(n);
      el.appendChild(c);
    });
  }

  function updateHud() {
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
      fillHudStrip(
        ensureHudStrip('upkeep-hud-top', 'upkeep-hud-strip--top'),
        'Adversaire',
        opp,
        state.opponentLifeDelta
      );
    }

    if (self.life !== null || self.library !== null || self.hand !== null) {
      fillHudStrip(
        ensureHudStrip('upkeep-hud-bottom', 'upkeep-hud-strip--bottom'),
        'Vous',
        self,
        state.selfLifeDelta
      );
    }
  }

  function applyRootAttrs() {
    const active = Boolean(config.enabled && state.isGameRoute);
    document.documentElement.dataset.upkeepActive = active ? 'true' : 'false';
    document.documentElement.dataset.upkeepLogsOpen = active && state.logsVisible ? 'true' : 'false';
    document.documentElement.dataset.upkeepGyOpen =
      active && state.graveyardVisible && config.alwaysShowOpponentGraveyard ? 'true' : 'false';
    document.documentElement.style.setProperty('--upkeep-logs-width', `${config.logsWidth}px`);
    document.documentElement.style.setProperty('--upkeep-gy-width', `${config.graveyardWidth}px`);

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

      applyRootAttrs();
      if (state.isGameRoute && config.enabled) {
        ensureLogsOpenedLeft();
        renderGraveyard();
        updateHud();
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

      const k = e.key.toLowerCase();
      if (k === config.shortcuts.toggleLogs.toLowerCase()) {
        state.logsVisible = !state.logsVisible;
        applyRootAttrs();
      } else if (k === config.shortcuts.toggleGraveyard.toLowerCase()) {
        state.graveyardVisible = !state.graveyardVisible;
        applyRootAttrs();
      } else if (k === config.shortcuts.toggleTheme.toLowerCase()) {
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
      // keep defaults
    }

    extApi.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEY]?.newValue) {
        config = { ...DEFAULT_CONFIG, ...changes[STORAGE_KEY].newValue };
        scheduleSync();
      }
    });

    installSpaHooks();
    installKeyboardShortcuts();

    const observer = new MutationObserver(() => scheduleSync());
    observer.observe(document.body, { childList: true, subtree: true });

    scheduleSync();
  }

  init();
})();
