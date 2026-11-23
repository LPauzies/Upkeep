(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';

  const COLOR_PRESETS = {
    none: {
      bfSelfMyTurn: '#182030',
      bfOppMyTurn: '#0d1119',
      bfSelfOppTurn: '#0d1119',
      bfOppOppTurn: '#182132',
      phaseCurrent: '#e5484d',
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

  const DEFAULT_CONFIG = {
    enabled: true,
    showMidlineTimeline: true,
    autoOpenLogsLeft: true,
    alwaysShowOpponentGraveyard: true,
    hideActionToasts: true,
    anchorStackTopLeft: true,
    highContrastHud: true,
    enableHoverZoom: true,
    colorblindMode: 'none',
    colors: { ...COLOR_PRESETS.none },
    logsWidth: 278,
    graveyardWidth: 268,
    shortcuts: { toggleLogs: 'l', toggleGraveyard: 'g', toggleTheme: 'u' },
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

  const KNOWN_LANDS = new Set([
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
    'snow-covered mountain', 'snow-covered forest',
  ]);

  let config = structuredClone(DEFAULT_CONFIG);
  let activeGameKey = '';
  let gyDockMode = 'docked'; // 'docked' (inside aside.wr-rail-right) | 'floating'
  let gyVisible = true;
  let userUndockedLog = false;
  let userClosedLog = false;
  let logAutoOpenAttempts = 0;

  let prevOppLife = null;
  let prevSelfLife = null;

  // Dual 3-Layer Live Graveyard State ('opp' and 'self')
  function createGyBucket() {
    return {
      filter: 'all',
      collapsed: false,
      wsCards: [],
      peekCards: [],
      peekCountAtCapture: -1,
      lastAutoPeekCount: -1,
      lastAutoPeekTs: 0,
      statusNotice: '',
      statusNoticeTimer: null,
    };
  }

  const gyState = {
    opp: createGyBucket(),
    self: createGyBucket(),
  };

  let peekInFlight = false;
  let domObserver = null;
  let resizeObserver = null;
  let syncRaf = 0;
  let cachedAutoPassHeight = 32;
  let lastValidLogGeom = null;
  let tooltipAnchorEl = null;
  let tooltipShowTimer = null;
  let tooltipGlobalListenersBound = false;

  function isSpectateRoute() {
    return /^\/spectate\/[^/]+/.test(window.location.pathname);
  }

  function isGameRoute() {
    return /^\/(?:game|spectate)\/[^/]+/.test(window.location.pathname);
  }

  function toCardImageUrl(name) {
    return `/api/cards/image?name=${encodeURIComponent(name)}&_v=2`;
  }

  function querySafe(selector, root = document) {
    if (!selector) return null;
    try {
      return root.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function getRailPlates(leftRail) {
    const rail = leftRail || document.querySelector('aside.wr-rail-left');
    if (!rail) return { topPlate: null, bottomPlate: null };
    const plates = Array.from(rail.querySelectorAll('.wr-plate'));
    const topPlate =
      rail.querySelector('[data-player-anchor="opp"]') ||
      plates[0] ||
      null;
    const bottomPlate =
      rail.querySelector('[data-player-anchor="me"]') ||
      (plates.length > 1 ? plates[plates.length - 1] : null);
    return { topPlate, bottomPlate };
  }

  function getOpponentName() {
    const { topPlate } = getRailPlates();
    const el =
      document.querySelector('[data-player-anchor="opp"] .wr-player-nameplate') ||
      document.querySelector('[data-player-anchor="opp"] [title]') ||
      topPlate?.querySelector('.wr-player-nameplate') ||
      topPlate?.querySelector('[title]');
    return (el?.textContent || '').trim();
  }

  function getSelfName() {
    const { bottomPlate } = getRailPlates();
    const el =
      document.querySelector('[data-player-anchor="me"] .wr-player-nameplate') ||
      document.querySelector('[data-player-anchor="me"] [title]') ||
      bottomPlate?.querySelector('.wr-player-nameplate') ||
      bottomPlate?.querySelector('[title]');
    return (el?.textContent || '').trim();
  }

  function getGraveyardButton(owner) {
    if (owner === 'opp') {
      const direct = querySafe(config.selectors.opponentGraveyardZone || 'button[data-zone-anchor="opp-graveyard"]');
      if (direct) return direct;
      const { topPlate } = getRailPlates();
      return topPlate?.querySelector('button[data-zone-anchor*="graveyard" i], button[aria-label*="graveyard" i]') || null;
    }
    const direct = querySafe(config.selectors.selfGraveyardZone || 'button[data-zone-anchor="my-graveyard"]');
    if (direct) return direct;
    const { bottomPlate } = getRailPlates();
    return bottomPlate?.querySelector('button[data-zone-anchor*="graveyard" i], button[aria-label*="graveyard" i]') || null;
  }

  function getAuthoritativeGyCount(owner) {
    const btn = getGraveyardButton(owner);
    if (!btn) return 0;
    const countNode = btn.querySelector('[data-zone-count]');
    const raw = countNode ? countNode.textContent : btn.getAttribute('aria-label') || btn.textContent || '0';
    const m = String(raw).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function classifyCard(card) {
    const tl = String(card.typeLine || '').toLowerCase();
    const nm = String(card.name || '').toLowerCase();
    if (tl.includes('creature')) return 'creature';
    if (tl.includes('land') || KNOWN_LANDS.has(nm)) return 'land';
    if (
      tl.includes('instant') ||
      tl.includes('sorcery') ||
      tl.includes('artifact') ||
      tl.includes('enchantment') ||
      tl.includes('planeswalker')
    ) {
      return 'spell';
    }
    return 'other';
  }

  function setStatusNotice(owner, msg, durationMs = 2600) {
    const bucket = gyState[owner];
    if (!bucket) return;
    bucket.statusNotice = msg;
    if (bucket.statusNoticeTimer) clearTimeout(bucket.statusNoticeTimer);
    bucket.statusNoticeTimer = window.setTimeout(() => {
      bucket.statusNotice = '';
      renderGraveyardsDock();
    }, durationMs);
    renderGraveyardsDock();
  }

  // ==========================================================================
  // PERSISTENT STORAGE HELPER (local primary + sync mirror for Firefox/Chrome)
  // ==========================================================================
  function sanitizeHex(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      const [, a, b, c] = raw;
      return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
    }
    return fallback;
  }

  function computeContrastInk(hex) {
    const clean = sanitizeHex(hex, '#c9a45c').slice(1);
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 155 ? '#0b0e14' : '#ffffff';
  }

  function mergeConfig(saved) {
    if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_CONFIG);
    const cbMode = Object.prototype.hasOwnProperty.call(COLOR_PRESETS, saved.colorblindMode)
      ? saved.colorblindMode
      : 'none';
    const basePalette = COLOR_PRESETS[cbMode] || COLOR_PRESETS.none;
    const savedColors = saved.colors && typeof saved.colors === 'object' ? saved.colors : {};
    const mergedColors = {};
    Object.keys(COLOR_PRESETS.none).forEach((key) => {
      mergedColors[key] = sanitizeHex(savedColors[key], basePalette[key]);
    });
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      colorblindMode: cbMode,
      colors: mergedColors,
      shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...(saved.shortcuts || {}) },
      selectors: { ...DEFAULT_CONFIG.selectors, ...(saved.selectors || {}) },
    };
  }

  async function saveConfigToStorage(nextConfig) {
    try {
      await extApi?.storage?.local?.set?.({ [STORAGE_KEY]: nextConfig });
    } catch (_) {}
    try {
      await extApi?.storage?.sync?.set?.({ [STORAGE_KEY]: nextConfig });
    } catch (_) {}
  }

  // ==========================================================================
  // LAYER 1: Live WebSocket / Fetch Passive State Listener (from ws-spy.js)
  // ==========================================================================
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'upkeep-state' || data.kind !== 'graveyards') return;
    if (!Array.isArray(data.players) || data.players.length === 0) return;

    const oppName = getOpponentName().toLowerCase();
    const selfName = getSelfName().toLowerCase();

    let oppPlayer = data.players.find((p) => p.isOpponent);
    let selfPlayer = data.players.find((p) => p.isSelf);

    if (!oppPlayer && oppName) {
      oppPlayer = data.players.find((p) => String(p.name || '').toLowerCase() === oppName);
    }
    if (!selfPlayer && selfName) {
      selfPlayer = data.players.find((p) => String(p.name || '').toLowerCase() === selfName);
    }
    if (!oppPlayer && selfPlayer) {
      oppPlayer = data.players.find((p) => p !== selfPlayer);
    }
    if (!selfPlayer && oppPlayer) {
      selfPlayer = data.players.find((p) => p !== oppPlayer);
    }
    if (!oppPlayer && data.players.length === 1 && !data.players[0].isSelf) {
      oppPlayer = data.players[0];
    }

    let updated = false;
    if (oppPlayer && Array.isArray(oppPlayer.graveyard)) {
      gyState.opp.wsCards = oppPlayer.graveyard.map((c) => ({
        name: c.name,
        typeLine: c.typeLine || '',
        manaCost: c.manaCost || '',
        imageUrl: c.imageUrl || toCardImageUrl(c.name),
        source: 'ws',
      }));
      updated = true;
    }

    if (selfPlayer && Array.isArray(selfPlayer.graveyard)) {
      gyState.self.wsCards = selfPlayer.graveyard.map((c) => ({
        name: c.name,
        typeLine: c.typeLine || '',
        manaCost: c.manaCost || '',
        imageUrl: c.imageUrl || toCardImageUrl(c.name),
        source: 'ws',
      }));
      updated = true;
    }

    if (updated) scheduleSync();
  });

  // ==========================================================================
  // LAYER 2: Native Graveyard Dialog Scraper + Serialized Silent Auto-Peek
  // ==========================================================================
  function findOpenZoneDialogs() {
    const dialogs = Array.from(
      document.querySelectorAll(
        '[role="dialog"]:not([data-zone="decision-surface"]), [data-radix-popper-content-wrapper], [data-zone*="graveyard" i]'
      )
    );
    return dialogs.filter((el) => {
      if (el.id === 'upkeep-graveyards-dock') return false;
      if (el.closest('#upkeep-graveyards-dock')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
  }

  function extractCardsFromDialog(dialog) {
    const cards = [];
    const imgs = dialog.querySelectorAll('img[data-testid="card-img"], img[src*="/api/cards/image"], img[alt]');
    imgs.forEach((img) => {
      const alt = (img.getAttribute('alt') || '').trim();
      const src = img.getAttribute('src') || '';
      let name = alt;
      if (!name && src.includes('name=')) {
        try {
          const u = new URL(src, window.location.origin);
          name = u.searchParams.get('name') || '';
        } catch (_) {}
      }
      if (!name || name.startsWith('{')) return;
      const tile = img.closest('[data-card-id], [aria-label]');
      const label = (tile?.getAttribute('aria-label') || '').trim();
      cards.push({
        name: name || label,
        typeLine: '',
        manaCost: '',
        imageUrl: src || toCardImageUrl(name),
        source: 'dialog',
      });
    });

    if (cards.length === 0) {
      const tiles = dialog.querySelectorAll('[data-card-name], [data-card-id][aria-label]');
      tiles.forEach((tile) => {
        const name = (tile.getAttribute('data-card-name') || tile.getAttribute('aria-label') || '').trim();
        if (!name) return;
        cards.push({
          name,
          typeLine: '',
          manaCost: '',
          imageUrl: toCardImageUrl(name),
          source: 'dialog',
        });
      });
    }
    return cards;
  }

  function classifyGraveyardDialogOwner(dialog) {
    const text = (
      (dialog.getAttribute('aria-label') || '') +
      ' ' +
      (dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent || '')
    ).toLowerCase();
    if (!text.includes('graveyard')) return null;

    const oppName = getOpponentName().toLowerCase();
    const selfName = getSelfName().toLowerCase();

    if (oppName && text.includes(oppName)) return 'opp';
    if (text.includes('opponent') || /\bopp\b/.test(text)) return 'opp';
    if (selfName && text.includes(selfName)) return 'self';
    if (/\byour\b|\bmy\b/.test(text)) return 'self';
    return null;
  }

  function passiveScanOpenDialogs() {
    if (peekInFlight) return;
    const dialogs = findOpenZoneDialogs();
    for (const dlg of dialogs) {
      const owner = classifyGraveyardDialogOwner(dlg);
      if (!owner) continue;
      const found = extractCardsFromDialog(dlg);
      if (found.length > 0) {
        gyState[owner].peekCards = found;
        gyState[owner].peekCountAtCapture = getAuthoritativeGyCount(owner);
      }
    }
  }

  function isBlockingModalOpen() {
    return Boolean(
      document.querySelector(
        '[data-testid="sideboard-view"], [data-testid="sideboard-loading"], .es-sb, .es-dlg-scrim, [role="dialog"][aria-modal="true"]'
      )
    );
  }

  function closeDialogElement(dialog) {
    if (dialog) {
      const closeBtn = dialog.querySelector(
        'button[aria-label*="close" i], button[title*="close" i], [data-testid*="close" i]'
      );
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    } else if (isBlockingModalOpen()) {
      // Never dispatch synthetic Escape when a non-graveyard modal (e.g. Sideboarding) is open
      return;
    }
    const escDown = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement || document.body).dispatchEvent(escDown);
    document.dispatchEvent(escDown);
  }

  async function peekGraveyard(owner, { force = false } = {}) {
    if (peekInFlight) return false;
    const bucket = gyState[owner];
    if (!bucket) return false;

    const count = getAuthoritativeGyCount(owner);
    if (count === 0) {
      bucket.peekCards = [];
      bucket.peekCountAtCapture = 0;
      if (force) setStatusNotice(owner, 'Graveyard is empty');
      renderGraveyardsDock();
      return true;
    }

    const gyBtn = getGraveyardButton(owner);
    if (!gyBtn || gyBtn.disabled) {
      if (force) setStatusNotice(owner, 'Reading from game log');
      renderGraveyardsDock();
      return false;
    }

    const preExistingDialogs = new Set(findOpenZoneDialogs());
    const hasOpenModalDecision = Boolean(
      document.querySelector('[role="dialog"][data-zone="decision-surface"], [data-zone="decision-surface"][data-upkeep-complex-decision="true"]')
    );
    if (!force && (preExistingDialogs.size > 0 || hasOpenModalDecision || isBlockingModalOpen())) {
      return false;
    }

    peekInFlight = true;
    bucket.lastAutoPeekCount = count;
    bucket.lastAutoPeekTs = Date.now();
    document.documentElement.dataset.upkeepPeekingGy = 'true';

    let captured = [];
    let openedDialog = null;

    try {
      gyBtn.click();

      const deadline = Date.now() + 480;
      while (Date.now() < deadline) {
        await new Promise((r) => window.setTimeout(r, 45));
        const currentDialogs = findOpenZoneDialogs().filter((d) => !preExistingDialogs.has(d));
        for (const dlg of currentDialogs) {
          const cards = extractCardsFromDialog(dlg);
          if (cards.length > 0) {
            openedDialog = dlg;
            captured = cards;
            break;
          }
          if (!openedDialog) openedDialog = dlg;
        }
        if (captured.length >= count) break;
      }

      if (captured.length > 0) {
        bucket.peekCards = captured;
        bucket.peekCountAtCapture = count;
      }
    } finally {
      closeDialogElement(openedDialog);
      await new Promise((r) => window.setTimeout(r, 60));
      delete document.documentElement.dataset.upkeepPeekingGy;
      peekInFlight = false;
    }

    if (force) {
      const effective = getEffectiveGraveyard(owner).cards.length;
      setStatusNotice(
        owner,
        effective > 0 ? `Synced · ${effective} card${effective > 1 ? 's' : ''}` : 'Sync complete'
      );
    } else {
      renderGraveyardsDock();
    }
    return captured.length > 0;
  }

  // ==========================================================================
  // LAYER 3: Smart Game Log Parser (Zero-Click Instant Fallback for Opp & Self)
  // ==========================================================================
  function parseGraveyardFromLog(owner, authoritativeCount) {
    if (authoritativeCount === 0) return [];
    const logRoot = document.querySelector('[data-gamelog-panel] [role="log"]');
    if (!logRoot) return [];

    const targetActor = owner === 'opp' ? 'opp' : 'me';
    const oppLower = getOpponentName().toLowerCase();
    const selfLower = getSelfName().toLowerCase();

    const lastOwnerByCard = new Map();
    const graveyard = [];
    const castCandidates = [];
    let activeTurnOwner = 'unknown';

    const halfSelector = owner === 'opp' ? '[data-half="opp"] [data-testid="card-img"]' : '[data-half="me"] [data-testid="card-img"]';
    const boardCardNames = new Set(
      Array.from(document.querySelectorAll(halfSelector))
        .map((img) => (img.getAttribute('alt') || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const rows = Array.from(logRoot.children);
    for (const node of rows) {
      if (node.classList.contains('gl-turn')) {
        activeTurnOwner = node.classList.contains('gl-turn--opp')
          ? 'opp'
          : node.classList.contains('gl-turn--you')
          ? 'me'
          : activeTurnOwner;
        continue;
      }

      const aria = (
        node.getAttribute('aria-label') ||
        node.querySelector('[aria-label]')?.getAttribute('aria-label') ||
        ''
      ).trim();
      const text = (node.textContent || '').trim();
      const combined = aria || text;
      if (!combined) continue;

      const cardBtn = node.querySelector('.gl-card-name');
      const cardName = (cardBtn?.textContent || '').trim();

      let actor = 'unknown';
      if (/^opponent\b/i.test(aria) || (oppLower && combined.toLowerCase().includes(oppLower))) {
        actor = 'opp';
      } else if (/^you:/i.test(aria) || (selfLower && combined.toLowerCase().includes(selfLower))) {
        actor = 'me';
      }

      if (/look at .* hand/i.test(combined)) continue;

      if (cardName && actor !== 'unknown') {
        lastOwnerByCard.set(cardName.toLowerCase(), actor);
      }

      if (cardName && /graveyard\s*(?:->|→)/i.test(combined)) {
        const cardOwner = actor !== 'unknown' ? actor : lastOwnerByCard.get(cardName.toLowerCase()) || activeTurnOwner;
        if (cardOwner === targetActor) {
          const idx = graveyard.findIndex((c) => c.name.toLowerCase() === cardName.toLowerCase());
          if (idx !== -1) graveyard.splice(idx, 1);
        }
        continue;
      }

      if (
        cardName &&
        (/(?:->|→)\s*graveyard/i.test(combined) ||
          /\b(?:discarded|milled|cycled|sacrificed|put .* into .* graveyard|died|destroyed|countered)\b/i.test(
            combined
          ))
      ) {
        const cardOwner = actor !== 'unknown' ? actor : lastOwnerByCard.get(cardName.toLowerCase()) || activeTurnOwner;
        if (cardOwner === targetActor) {
          graveyard.push({
            name: cardName,
            typeLine: '',
            manaCost: '',
            imageUrl: toCardImageUrl(cardName),
            source: 'log',
          });
        }
        continue;
      }

      if (cardName && actor === targetActor && /\bcast\b/i.test(combined)) {
        castCandidates.push(cardName);
      }
    }

    if (graveyard.length < authoritativeCount) {
      const alreadyCounted = new Map();
      graveyard.forEach((c) => {
        const k = c.name.toLowerCase();
        alreadyCounted.set(k, (alreadyCounted.get(k) || 0) + 1);
      });

      for (let i = castCandidates.length - 1; i >= 0 && graveyard.length < authoritativeCount; i--) {
        const name = castCandidates[i];
        const key = name.toLowerCase();
        if (boardCardNames.has(key)) continue;
        if ((alreadyCounted.get(key) || 0) > 0) {
          alreadyCounted.set(key, alreadyCounted.get(key) - 1);
          continue;
        }
        graveyard.push({
          name,
          typeLine: '',
          manaCost: '',
          imageUrl: toCardImageUrl(name),
          source: 'log',
        });
      }
    }

    return graveyard;
  }

  function getEffectiveGraveyard(owner) {
    const bucket = gyState[owner];
    const authCount = getAuthoritativeGyCount(owner);
    if (authCount === 0) {
      return { count: 0, cards: [], source: 'empty' };
    }

    if (bucket.wsCards.length > 0 && bucket.wsCards.length === authCount) {
      return { count: authCount, cards: bucket.wsCards, source: 'ws' };
    }
    if (bucket.peekCards.length > 0 && bucket.peekCountAtCapture === authCount) {
      return { count: authCount, cards: bucket.peekCards, source: 'dialog' };
    }

    const logCards = parseGraveyardFromLog(owner, authCount);
    if (logCards.length >= authCount) {
      return { count: authCount, cards: logCards, source: 'log' };
    }
    if (bucket.wsCards.length > 0) {
      return { count: authCount, cards: bucket.wsCards, source: 'ws' };
    }
    if (bucket.peekCards.length > 0) {
      return { count: authCount, cards: bucket.peekCards, source: 'dialog' };
    }
    return { count: authCount, cards: logCards, source: logCards.length > 0 ? 'log' : 'pending' };
  }

  // ==========================================================================
  // UI: DUAL LIVE GRAVEYARDS DOCK (OPPONENT + YOURS IN aside.wr-rail-right)
  // ==========================================================================
  function ensureCardZoomOverlay() {
    let zoom = document.getElementById('upkeep-card-zoom');
    if (!zoom) {
      zoom = document.createElement('div');
      zoom.id = 'upkeep-card-zoom';
      zoom.setAttribute('aria-hidden', 'true');
      const img = document.createElement('img');
      img.alt = '';
      zoom.appendChild(img);
      document.body.appendChild(zoom);
    }
    return zoom;
  }

  function showCardZoom(imageUrl, name) {
    if (!config.enableHoverZoom) return;
    const zoom = ensureCardZoomOverlay();
    const img = zoom.querySelector('img');
    if (img) {
      img.src = imageUrl;
      img.alt = name;
    }
    zoom.dataset.visible = 'true';
  }

  function hideCardZoom() {
    const zoom = document.getElementById('upkeep-card-zoom');
    if (zoom) zoom.dataset.visible = 'false';
  }

  function buildGraveyardSection(owner, titleText, includeDockToggle) {
    const section = document.createElement('section');
    section.className = 'upkeep-gy-section';
    section.id = `upkeep-gy-section-${owner}`;
    section.dataset.owner = owner;
    section.dataset.collapsed = 'false';
    section.setAttribute('aria-label', `${titleText} (Upkeep)`);

    const header = document.createElement('div');
    header.className = 'upkeep-gy-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'upkeep-gy-title-row';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'upkeep-gy-collapse-btn';
    collapseBtn.setAttribute('aria-expanded', 'true');
    collapseBtn.title = `Collapse or expand ${titleText}`;

    const chevron = document.createElement('span');
    chevron.className = 'upkeep-gy-chevron';
    chevron.id = `upkeep-gy-chevron-${owner}`;
    chevron.textContent = '▾';

    const titleEl = document.createElement('h2');
    titleEl.className = 'upkeep-gy-title';
    titleEl.textContent = titleText;

    const countSpan = document.createElement('span');
    countSpan.className = 'upkeep-gy-count';
    countSpan.id = `upkeep-gy-count-${owner}`;
    countSpan.textContent = '0';

    collapseBtn.appendChild(chevron);
    collapseBtn.appendChild(titleEl);
    collapseBtn.appendChild(countSpan);

    collapseBtn.addEventListener('click', () => {
      gyState[owner].collapsed = !gyState[owner].collapsed;
      section.dataset.collapsed = gyState[owner].collapsed ? 'true' : 'false';
      collapseBtn.setAttribute('aria-expanded', gyState[owner].collapsed ? 'false' : 'true');
      chevron.textContent = gyState[owner].collapsed ? '▸' : '▾';
    });

    const actions = document.createElement('div');
    actions.className = 'upkeep-gy-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'upkeep-gy-icon-btn';
    refreshBtn.title = `Sync ${titleText}`;
    refreshBtn.setAttribute('aria-label', `Sync ${titleText}`);
    refreshBtn.textContent = '↻';
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      peekGraveyard(owner, { force: true });
    });
    actions.appendChild(refreshBtn);

    if (includeDockToggle) {
      const modeBtn = document.createElement('button');
      modeBtn.type = 'button';
      modeBtn.className = 'upkeep-gy-icon-btn';
      modeBtn.title = 'Toggle docked in right rail / floating overlay';
      modeBtn.setAttribute('aria-label', 'Toggle graveyards display mode');
      modeBtn.textContent = '◫';
      modeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gyDockMode = gyDockMode === 'docked' ? 'floating' : 'docked';
        mountGraveyardsDock();
        renderGraveyardsDock();
      });
      actions.appendChild(modeBtn);
    }

    titleRow.appendChild(collapseBtn);
    titleRow.appendChild(actions);

    const metaEl = document.createElement('div');
    metaEl.className = 'upkeep-gy-meta';
    metaEl.id = `upkeep-gy-meta-${owner}`;
    metaEl.textContent = 'No cards in graveyard';

    header.appendChild(titleRow);
    header.appendChild(metaEl);

    const body = document.createElement('div');
    body.className = 'upkeep-gy-body';

    const filtersEl = document.createElement('div');
    filtersEl.className = 'upkeep-gy-filters';
    filtersEl.setAttribute('role', 'group');
    filtersEl.setAttribute('aria-label', `Filter ${titleText}`);

    const filterDefs = [
      ['all', 'All'],
      ['creature', 'Creatures'],
      ['spell', 'Spells'],
      ['land', 'Lands'],
    ];
    for (const [key, label] of filterDefs) {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className = 'upkeep-gy-filter-btn';
      fBtn.dataset.filter = key;
      fBtn.setAttribute('aria-pressed', key === 'all' ? 'true' : 'false');
      fBtn.textContent = label;
      fBtn.addEventListener('click', () => {
        gyState[owner].filter = key;
        filtersEl.querySelectorAll('.upkeep-gy-filter-btn').forEach((b) => {
          b.setAttribute('aria-pressed', String(b === fBtn));
        });
        renderGraveyardsDock();
      });
      filtersEl.appendChild(fBtn);
    }

    const listEl = document.createElement('div');
    listEl.className = 'upkeep-gy-list';
    listEl.id = `upkeep-gy-list-${owner}`;

    body.appendChild(filtersEl);
    body.appendChild(listEl);

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  function ensureGraveyardsDock() {
    let dock = document.getElementById('upkeep-graveyards-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'upkeep-graveyards-dock';
      dock.setAttribute('aria-label', 'Graveyards (Upkeep)');
      dock.appendChild(buildGraveyardSection('opp', 'Opponent Graveyard', true));
      dock.appendChild(buildGraveyardSection('self', 'Your Graveyard', false));
    }
    mountGraveyardsDock(dock);
    return dock;
  }

  function mountGraveyardsDock(dockEl) {
    const dock = dockEl || document.getElementById('upkeep-graveyards-dock');
    if (!dock) return;

    const shouldShow = config.enabled && config.alwaysShowOpponentGraveyard && gyVisible;
    dock.dataset.hidden = shouldShow ? 'false' : 'true';
    dock.dataset.mode = gyDockMode;

    const rightRail = document.querySelector('aside.wr-rail-right');
    if (shouldShow && gyDockMode === 'docked' && rightRail) {
      document.documentElement.dataset.upkeepGyDocked = 'true';
      const phaseBar = rightRail.querySelector('.wr-phase-bar');
      if (phaseBar) {
        if (dock.parentElement !== rightRail || phaseBar.nextElementSibling !== dock) {
          rightRail.insertBefore(dock, phaseBar.nextSibling);
        }
      } else if (dock.parentElement !== rightRail) {
        rightRail.appendChild(dock);
      }
    } else {
      document.documentElement.dataset.upkeepGyDocked = 'false';
      if (dock.parentElement !== document.body) {
        document.body.appendChild(dock);
      }
    }
  }

  function groupCardsByName(cards) {
    const map = new Map();
    for (const card of cards) {
      const key = card.name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...card, qty: 1, category: classifyCard(card) });
      } else {
        map.get(key).qty += 1;
      }
    }
    return Array.from(map.values());
  }

  function renderGraveyardSection(dock, owner) {
    const bucket = gyState[owner];
    const section = dock.querySelector(`#upkeep-gy-section-${owner}`);
    const titleEl = section?.querySelector('.upkeep-gy-title');
    const countEl = dock.querySelector(`#upkeep-gy-count-${owner}`);
    const metaEl = dock.querySelector(`#upkeep-gy-meta-${owner}`);
    const listEl = dock.querySelector(`#upkeep-gy-list-${owner}`);
    const chevronEl = dock.querySelector(`#upkeep-gy-chevron-${owner}`);
    if (!section || !countEl || !metaEl || !listEl) return false;

    if (titleEl) {
      if (isSpectateRoute()) {
        const playerName = owner === 'opp' ? getOpponentName() : getSelfName();
        titleEl.textContent = playerName
          ? `${playerName} Graveyard`
          : owner === 'opp'
          ? 'Top Player Graveyard'
          : 'Bottom Player Graveyard';
      } else {
        titleEl.textContent = owner === 'opp' ? 'Opponent Graveyard' : 'Your Graveyard';
      }
    }

    section.dataset.collapsed = bucket.collapsed ? 'true' : 'false';
    if (chevronEl) chevronEl.textContent = bucket.collapsed ? '▸' : '▾';

    const { count, cards, source } = getEffectiveGraveyard(owner);
    countEl.textContent = String(count);

    const gyBtn = getGraveyardButton(owner);
    if (gyBtn) {
      gyBtn.dataset.upkeepHasCards = count > 0 ? 'true' : 'false';
    }

    if (bucket.statusNotice) {
      metaEl.textContent = bucket.statusNotice;
    } else if (count === 0) {
      metaEl.textContent = 'No cards in graveyard';
    } else if (cards.length > 0) {
      const srcLabel = source === 'ws' ? 'Live' : source === 'dialog' ? 'Live sync' : 'From log';
      metaEl.textContent = `${cards.length}/${count} card${count > 1 ? 's' : ''} · ${srcLabel}`;
    } else {
      metaEl.textContent = `${count} card${count > 1 ? 's' : ''} detected`;
    }

    const grouped = groupCardsByName(cards);
    const filtered = bucket.filter === 'all' ? grouped : grouped.filter((c) => c.category === bucket.filter);

    listEl.replaceChildren();

    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      empty.textContent =
        owner === 'opp'
          ? "Cards sent to your opponent's graveyard appear here live."
          : 'Cards sent to your graveyard appear here live.';
      listEl.appendChild(empty);
      return false;
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      if (grouped.length === 0) {
        empty.textContent = `${count} card${count > 1 ? 's' : ''} in graveyard.`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upkeep-gy-sync-btn';
        btn.textContent = 'Sync cards now';
        btn.addEventListener('click', () => peekGraveyard(owner, { force: true }));
        empty.appendChild(document.createElement('br'));
        empty.appendChild(btn);
      } else {
        empty.textContent = 'No cards match this filter.';
      }
      listEl.appendChild(empty);
    } else {
      for (const card of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'upkeep-gy-row';
        row.setAttribute('aria-label', card.qty > 1 ? `${card.name} (×${card.qty})` : card.name);

        const thumb = document.createElement('img');
        thumb.className = 'upkeep-gy-thumb';
        thumb.src = card.imageUrl || toCardImageUrl(card.name);
        thumb.alt = card.name;
        thumb.loading = 'lazy';
        thumb.addEventListener('error', () => {
          row.dataset.imgError = 'true';
        });

        const fallback = document.createElement('span');
        fallback.className = 'upkeep-gy-card-fallback';
        fallback.textContent = card.name;

        row.appendChild(thumb);
        row.appendChild(fallback);

        if (card.qty > 1) {
          const qtyEl = document.createElement('span');
          qtyEl.className = 'upkeep-gy-card-qty';
          qtyEl.textContent = `×${card.qty}`;
          row.appendChild(qtyEl);
        }

        row.addEventListener('mouseenter', () => showCardZoom(thumb.src, card.name));
        row.addEventListener('mouseleave', hideCardZoom);
        row.addEventListener('focus', () => showCardZoom(thumb.src, card.name));
        row.addEventListener('blur', hideCardZoom);
        row.addEventListener('click', () => {
          const btn = getGraveyardButton(owner);
          if (btn && !btn.disabled) btn.click();
        });

        listEl.appendChild(row);
      }
    }

    const needsAuthoritativeSync =
      count > 0 &&
      bucket.wsCards.length !== count &&
      bucket.peekCountAtCapture !== count &&
      !peekInFlight &&
      (bucket.lastAutoPeekCount !== count || Date.now() - bucket.lastAutoPeekTs > 6000);

    return needsAuthoritativeSync;
  }

  function renderGraveyardsDock() {
    if (!config.enabled || !isGameRoute()) return;
    const dock = ensureGraveyardsDock();
    const oppNeedsSync = renderGraveyardSection(dock, 'opp');
    const selfNeedsSync = renderGraveyardSection(dock, 'self');

    // Serialize silent ground-truth auto-sync (one graveyard at a time so dialogs never collide)
    const nextOwner = oppNeedsSync ? 'opp' : selfNeedsSync ? 'self' : null;
    if (nextOwner && !peekInFlight) {
      window.setTimeout(() => {
        if (!peekInFlight && isGameRoute() && config.enabled) {
          peekGraveyard(nextOwner, { force: false });
        }
      }, 280);
    }
  }

  // ==========================================================================
  // AUTO-OPEN & DOCK GAME LOG INSIDE aside.wr-rail-left
  // ==========================================================================
  function findNativeLogOpenButton() {
    const direct = querySafe(config.selectors.logsToggleButton);
    if (direct && !direct.closest('[data-testid="tablet-log-dock"]') && !direct.closest('[data-gamelog-panel]')) {
      return direct;
    }

    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.closest('[data-testid="tablet-log-dock"]')) continue;
      if (btn.closest('[data-gamelog-panel]')) continue;
      if (btn.closest('#upkeep-graveyards-dock')) continue;
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      if (
        text === 'log' ||
        text === 'logs' ||
        text === 'game log' ||
        (aria.includes('game log') && !aria.includes('close'))
      ) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return btn;
      }
    }
    return null;
  }

  function enhanceLogPanelControls(logPanel) {
    if (!logPanel || logPanel.dataset.upkeepBound === 'true') return;
    logPanel.dataset.upkeepBound = 'true';

    const closeBtn = logPanel.querySelector('button[aria-label*="close" i]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        userClosedLog = true;
      });
    }

    const titlebar = logPanel.querySelector('[data-gamelog-titlebar]');
    const actionsBox = titlebar?.lastElementChild;
    if (actionsBox && !titlebar.querySelector('.upkeep-log-dock-btn')) {
      const dockBtn = document.createElement('button');
      dockBtn.type = 'button';
      dockBtn.className = 'upkeep-log-dock-btn';
      dockBtn.title = 'Dock / Undock Game Log in left rail (Upkeep)';
      dockBtn.setAttribute('aria-label', 'Dock or undock Game Log');
      dockBtn.textContent = '◫';
      dockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userUndockedLog = !userUndockedLog;
        syncLogDockGeometry();
      });
      actionsBox.insertBefore(dockBtn, actionsBox.firstChild);
    }
  }

  // ==========================================================================
  // COMPACT 3-BUTTON AUTO-PASS BAR & FLOATING TOOLTIP (STRICT AUTO-DISMISS)
  // ==========================================================================
  function bindTooltipGlobalDismiss() {
    if (tooltipGlobalListenersBound) return;
    tooltipGlobalListenersBound = true;

    const dismiss = () => hideUpkeepTooltip();
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    window.addEventListener('blur', dismiss, { passive: true });
    window.addEventListener('scroll', dismiss, { passive: true, capture: true });
    document.addEventListener(
      'pointermove',
      (e) => {
        if (!tooltipAnchorEl) return;
        if (!tooltipAnchorEl.isConnected) {
          hideUpkeepTooltip();
          return;
        }
        const rect = tooltipAnchorEl.getBoundingClientRect();
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          e.clientX < rect.left - 2 ||
          e.clientX > rect.right + 2 ||
          e.clientY < rect.top - 2 ||
          e.clientY > rect.bottom + 2
        ) {
          hideUpkeepTooltip();
        }
      },
      { passive: true }
    );
  }

  function ensureUpkeepTooltip() {
    bindTooltipGlobalDismiss();
    let tip = document.getElementById('upkeep-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'upkeep-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.dataset.visible = 'false';
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showUpkeepTooltip(anchorEl, title, keyText, desc) {
    if (!anchorEl || !anchorEl.isConnected) {
      hideUpkeepTooltip();
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hideUpkeepTooltip();
      return;
    }

    tooltipAnchorEl = anchorEl;
    const tip = ensureUpkeepTooltip();
    tip.textContent = '';

    const head = document.createElement('div');
    head.className = 'upkeep-tooltip-head';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    head.appendChild(titleSpan);

    if (keyText) {
      const kbd = document.createElement('span');
      kbd.className = 'upkeep-tooltip-kbd';
      kbd.textContent = keyText;
      head.appendChild(kbd);
    }
    tip.appendChild(head);

    if (desc) {
      const descEl = document.createElement('div');
      descEl.className = 'upkeep-tooltip-desc';
      descEl.textContent = desc;
      tip.appendChild(descEl);
    }

    tip.dataset.visible = 'true';
    const tipRect = tip.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(window.innerWidth - tipRect.width - 8, Math.round(rect.left + rect.width / 2 - tipRect.width / 2))
    );
    const top = Math.max(8, Math.round(rect.top - tipRect.height - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideUpkeepTooltip() {
    if (tooltipShowTimer) {
      window.clearTimeout(tooltipShowTimer);
      tooltipShowTimer = null;
    }
    tooltipAnchorEl = null;
    const tip = document.getElementById('upkeep-tooltip');
    if (tip) tip.dataset.visible = 'false';
  }

  function verifyActiveTooltip() {
    if (!tooltipAnchorEl) return;
    if (!tooltipAnchorEl.isConnected) {
      hideUpkeepTooltip();
      return;
    }
    const rect = tooltipAnchorEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hideUpkeepTooltip();
      return;
    }
    let stillActive = false;
    try {
      stillActive = tooltipAnchorEl.matches(':hover') || tooltipAnchorEl.matches(':focus-visible');
    } catch (_) {
      stillActive = document.activeElement === tooltipAnchorEl;
    }
    if (!stillActive) hideUpkeepTooltip();
  }

  function classifyAutoPassButton(rawLabel, keyText) {
    const lower = String(rawLabel || '').toLowerCase();
    // Never misclassify cancel / Esc buttons when an Auto-Pass banner ("AUTO-PASSING TO ...") is active
    if (
      keyText === 'ESC' ||
      /\b(cancel|stop|clear|esc|auto-passing)\b/i.test(lower)
    ) {
      return null;
    }
    if (/end\s*of\s*turn/.test(lower) || keyText === 'E') {
      return {
        short: 'EOT',
        title: 'End of Turn',
        desc: 'Auto-pass priority until the end of this turn.',
      };
    }
    if (/before\s*my\s*turn/.test(lower) || keyText === 'B') {
      return {
        short: 'MY TURN',
        title: 'Before My Turn',
        desc: 'Auto-pass priority until your next turn begins.',
      };
    }
    if (/action|end\s*step/.test(lower) || keyText === 'R') {
      return {
        short: 'ACTION',
        title: 'Action / End Step',
        desc: 'Auto-pass until an opponent acts or end step.',
      };
    }
    return null;
  }

  function enhanceAutoPassBar() {
    verifyActiveTooltip();

    const autoPassEl = document.querySelector('aside.wr-rail-left [aria-label="Pass priority shortcuts"]');
    if (!autoPassEl) {
      hideUpkeepTooltip();
      return;
    }

    // If an active "AUTO-PASSING TO ..." banner is shown, dismiss any stale tooltip and leave its cancel button untouched
    if (/auto-?passing\s+to\b/i.test(autoPassEl.textContent || '')) {
      hideUpkeepTooltip();
    }

    const buttons = Array.from(autoPassEl.querySelectorAll('button'));
    if (buttons.length === 0) {
      hideUpkeepTooltip();
      return;
    }

    const triggerButtons = [];
    buttons.forEach((btn) => {
      const keyEl =
        btn.querySelector('[data-testid="kcap"], kbd') ||
        Array.from(btn.querySelectorAll('span')).find((s) => /^[A-Z0-9]$/.test((s.textContent || '').trim()));
      const keyText = (keyEl?.textContent || '').trim().toUpperCase();
      const rawText = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      const labelWithoutKey = keyText && rawText.endsWith(keyText) ? rawText.slice(0, -keyText.length).trim() : rawText;
      const meta = classifyAutoPassButton(labelWithoutKey, keyText);

      if (!meta) {
        delete btn.dataset.upkeepApShort;
        return;
      }

      if (keyEl) keyEl.dataset.upkeepApKey = 'true';
      triggerButtons.push(btn);

      if (btn.dataset.upkeepApShort !== meta.short) {
        btn.dataset.upkeepApShort = meta.short;
      }
      btn.dataset.upkeepApTitle = meta.title;
      btn.dataset.upkeepApKeyText = keyText;
      btn.dataset.upkeepApDesc = meta.desc;

      if (btn.dataset.upkeepApBound !== 'true') {
        btn.dataset.upkeepApBound = 'true';
        const scheduleShow = () => {
          if (tooltipShowTimer) window.clearTimeout(tooltipShowTimer);
          tooltipShowTimer = window.setTimeout(() => {
            tooltipShowTimer = null;
            if (!btn.isConnected) return;
            try {
              if (!btn.matches(':hover') && !btn.matches(':focus-visible')) return;
            } catch (_) {}
            showUpkeepTooltip(
              btn,
              btn.dataset.upkeepApTitle || 'Auto-Pass',
              btn.dataset.upkeepApKeyText || '',
              btn.dataset.upkeepApDesc || ''
            );
          }, 220);
        };
        const onFocus = () => {
          try {
            if (!btn.matches(':focus-visible')) return;
          } catch (_) {
            return;
          }
          showUpkeepTooltip(
            btn,
            btn.dataset.upkeepApTitle || 'Auto-Pass',
            btn.dataset.upkeepApKeyText || '',
            btn.dataset.upkeepApDesc || ''
          );
        };
        btn.addEventListener('mouseenter', scheduleShow);
        btn.addEventListener('focus', onFocus);
        btn.addEventListener('mouseleave', hideUpkeepTooltip);
        btn.addEventListener('blur', hideUpkeepTooltip);
        btn.addEventListener('pointerdown', hideUpkeepTooltip);
        btn.addEventListener('click', hideUpkeepTooltip);
      }
    });

    // Only apply the 3-column grid when the 3 trigger buttons are present (not when AUTO-PASSING banner replaces them)
    if (triggerButtons.length >= 2) {
      let gridEl = autoPassEl;
      if (triggerButtons[0].parentElement === triggerButtons[1].parentElement) {
        gridEl = triggerButtons[0].parentElement;
      } else if (
        triggerButtons[0].parentElement?.parentElement === triggerButtons[1].parentElement?.parentElement
      ) {
        gridEl = triggerButtons[0].parentElement.parentElement;
        triggerButtons.forEach((btn) => {
          if (btn.parentElement) btn.parentElement.dataset.upkeepAutopassCell = 'true';
        });
      }
      gridEl.dataset.upkeepAutopassGrid = 'true';
    } else {
      autoPassEl.querySelectorAll('[data-upkeep-autopass-grid]').forEach((el) => {
        delete el.dataset.upkeepAutopassGrid;
      });
      delete autoPassEl.dataset.upkeepAutopassGrid;
    }

    // Hide redundant "AUTO-PASS / skip ahead" header line (never hide active "AUTO-PASSING TO ..." banner!)
    const headerCandidates = [
      ...Array.from(autoPassEl.children).filter((child) => child.tagName !== 'BUTTON' && !child.querySelector('button')),
      autoPassEl.previousElementSibling,
    ];
    headerCandidates.forEach((el) => {
      if (!el || el.hasAttribute('data-zone')) return;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^auto-?pass(\s*skip\s*ahead)?$/i.test(txt) && txt.length <= 32) {
        el.dataset.upkeepAutopassHeader = 'true';
      }
    });
  }

  function enhanceWaitingCard() {
    const pendingGroup = document.querySelector('aside.wr-rail-left [aria-label="Pending actions"]');
    if (!pendingGroup) return;

    // Clean up stale waiting tags if Endstep reused the node for an active decision
    const activeDecision = pendingGroup.querySelector(
      '[data-zone="decision-surface"][role="dialog"], [data-zone="decision-surface"].wr-ds-active'
    );
    if (activeDecision) {
      delete activeDecision.dataset.upkeepWaiting;
      delete activeDecision.dataset.upkeepWaitingSelf;
      return;
    }

    let waitingCard = pendingGroup.querySelector('[data-zone="decision-surface"][role="status"]');
    if (!waitingCard) {
      const stack = pendingGroup.firstElementChild || pendingGroup;
      const candidates = Array.from(stack.children).filter(
        (el) =>
          el.getAttribute('aria-label') !== 'Pass priority shortcuts' &&
          !el.querySelector('[aria-label="Pass priority shortcuts"]') &&
          !el.querySelector('.wr-ds-body')
      );
      waitingCard = candidates.find((el) => /\bwaiting\b/i.test((el.textContent || '').trim())) || null;
    }
    if (!waitingCard) return;

    waitingCard.dataset.upkeepWaiting = 'true';
    const children = Array.from(waitingCard.children);
    const headEl =
      children.find((el) => /^waiting(\s+on\s+you)?$/i.test((el.textContent || '').replace(/\s+/g, ' ').trim())) ||
      children[0];
    const msgEl =
      children.find((el) => el !== headEl && /deciding|waiting|opponent|proposal/i.test(el.textContent || '')) ||
      children[1];

    const headText = (headEl?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (headText.includes('you')) {
      waitingCard.dataset.upkeepWaitingSelf = 'true';
    } else if (waitingCard.dataset.upkeepWaitingSelf) {
      delete waitingCard.dataset.upkeepWaitingSelf;
    }

    if (headEl) headEl.dataset.upkeepWaitingHead = 'true';
    if (msgEl) msgEl.dataset.upkeepWaitingMsg = 'true';
  }

  function syncLogDockGeometry() {
    const root = document.documentElement;
    if (!config.enabled || !isGameRoute()) {
      root.dataset.upkeepLogsDocked = 'false';
      lastValidLogGeom = null;
      return;
    }

    const leftRail = document.querySelector('aside.wr-rail-left');
    const { topPlate: oppPlate, bottomPlate: selfPlate } = getRailPlates(leftRail);
    const pendingGroup = leftRail?.querySelector('[aria-label="Pending actions"]');
    const autoPassEl = pendingGroup?.querySelector('[aria-label="Pass priority shortcuts"]');

    const logPanel = querySafe(config.selectors.logsPanel);
    if (!logPanel) {
      root.dataset.upkeepLogsDocked = 'false';
      if (config.autoOpenLogsLeft && !userClosedLog && logAutoOpenAttempts < 8) {
        const openBtn = findNativeLogOpenButton();
        if (openBtn) {
          logAutoOpenAttempts += 1;
          openBtn.click();
        }
      }
      return;
    }

    enhanceLogPanelControls(logPanel);

    if (!config.autoOpenLogsLeft || userUndockedLog) {
      root.dataset.upkeepLogsDocked = 'false';
      return;
    }

    // If leftRail/topPlate momentarily unmount during a React re-render, keep last valid docked geometry
    // so the Game Log NEVER teleports back and forth between left and right!
    if (!leftRail || !oppPlate) {
      if (lastValidLogGeom) {
        root.dataset.upkeepLogsDocked = 'true';
      } else {
        root.dataset.upkeepLogsDocked = 'false';
      }
      return;
    }

    const railRect = leftRail.getBoundingClientRect();
    const oppRect = oppPlate.getBoundingClientRect();
    const pendingRect = pendingGroup?.getBoundingClientRect();
    const selfRect = selfPlate?.getBoundingClientRect();
    const autoPassRect = autoPassEl?.getBoundingClientRect();

    // Ignore transient zero-rect frames during layout recalculations
    if (railRect.width === 0 || oppRect.height === 0) {
      if (lastValidLogGeom) {
        root.dataset.upkeepLogsDocked = 'true';
      }
      return;
    }

    // Only undock if left rail is genuinely collapsed to mobile/narrow width
    if (railRect.width < 120) {
      root.dataset.upkeepLogsDocked = 'false';
      return;
    }

    // Clamp auto-pass height tightly (28..64px) so a transient unstyled frame never collapses the log height
    if (autoPassRect && autoPassRect.height >= 24 && autoPassRect.height <= 90) {
      cachedAutoPassHeight = Math.min(64, Math.max(28, Math.round(autoPassRect.height)));
    }

    const topY = Math.round(oppRect.bottom + 6);
    const hasPendingControls = Boolean(pendingGroup && pendingRect && pendingRect.height > 20);
    const pendingBottomY = hasPendingControls
      ? Math.round(pendingRect.bottom)
      : Math.round(selfRect && selfRect.height > 0 ? selfRect.top - 6 : railRect.bottom - 8);

    const autoPassReserved = hasPendingControls && autoPassEl ? cachedAutoPassHeight : 0;
    const stackOverhead = hasPendingControls ? (autoPassEl ? 20 : 14) : 6;
    const usableForLogAndDecision = Math.max(120, pendingBottomY - topY - autoPassReserved - stackOverhead);

    let fixedDecisionHeight = 0;
    if (hasPendingControls) {
      // Guarantee at least 96px for the docked Game Log even on compact viewports (zero left/right flipping!)
      const maxDecisionForLog = Math.max(136, usableForLogAndDecision - 96);
      fixedDecisionHeight = Math.min(
        maxDecisionForLog,
        Math.max(180, Math.min(268, Math.round(usableForLogAndDecision * 0.42)))
      );
      root.style.setProperty('--upkeep-ds-height', `${fixedDecisionHeight}px`);
    }

    const availHeight = Math.max(88, usableForLogAndDecision - fixedDecisionHeight);
    const logLeft = Math.round(railRect.left + 6);
    const logWidth = Math.max(140, Math.round(railRect.width - 12));

    lastValidLogGeom = { left: logLeft, top: topY, width: logWidth, height: availHeight };
    root.dataset.upkeepLogsDocked = 'true';
    root.style.setProperty('--upkeep-log-left', `${logLeft}px`);
    root.style.setProperty('--upkeep-log-top', `${topY}px`);
    root.style.setProperty('--upkeep-log-width', `${logWidth}px`);
    root.style.setProperty('--upkeep-log-height', `${availHeight}px`);
  }

  // ==========================================================================
  // DETECT & POSITION "THE STACK" TOP-LEFT OF BATTLEFIELD
  // ==========================================================================
  function findStackPanel() {
    const explicit = document.querySelector(
      '[data-stack-panel], [data-zone*="stack" i], [role="region"][aria-label*="stack" i], [role="dialog"][aria-label*="stack" i]'
    );
    if (explicit && !explicit.closest('#upkeep-graveyards-dock') && !explicit.hasAttribute('data-gamelog-panel')) {
      return explicit;
    }

    const candidates = document.querySelectorAll('[data-testid="game-root"] > div, #root > div, body > div');
    for (const el of candidates) {
      if (el.id === 'upkeep-graveyards-dock' || el.id === 'upkeep-card-zoom') continue;
      if (el.hasAttribute('data-gamelog-panel')) continue;
      if (el.classList.contains('wr-main-col') || el.classList.contains('vfx-layer')) continue;
      const st = window.getComputedStyle(el);
      if (st.position !== 'fixed' && st.position !== 'absolute') continue;
      const header = el.firstElementChild;
      const headerText = (header?.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^⋮*⋮?\s*the stack\b/i.test(headerText) || /^the stack\s*\d*$/i.test(headerText)) {
        return el;
      }
    }
    return null;
  }

  function syncStackPanel() {
    const mainCol = document.querySelector('.wr-main-col');
    if (mainCol) {
      const rect = mainCol.getBoundingClientRect();
      document.documentElement.style.setProperty('--upkeep-stack-left', `${Math.round(rect.left + 10)}px`);
      document.documentElement.style.setProperty('--upkeep-stack-top', `${Math.round(rect.top + 8)}px`);
    }

    const stackEl = findStackPanel();
    if (!stackEl) return;

    if (stackEl.dataset.upkeepPanel !== 'stack') {
      stackEl.dataset.upkeepPanel = 'stack';
    }

    if (stackEl.dataset.upkeepDragBound !== 'true') {
      stackEl.dataset.upkeepDragBound = 'true';
      const titlebar = stackEl.firstElementChild || stackEl;
      titlebar.addEventListener(
        'pointerdown',
        () => {
          stackEl.dataset.upkeepUserMoved = 'true';
        },
        { passive: true }
      );
    }
  }

  // ==========================================================================
  // POSITION GAME NOTICES ON RIGHT EDGE OF BATTLEFIELD (LEFT OF RIGHT RAIL)
  // ==========================================================================
  function syncGameNoticesPosition() {
    const root = document.documentElement;
    const mainCol = document.querySelector('.wr-main-col');
    const rightRail = document.querySelector('aside.wr-rail-right');
    if (!mainCol && !rightRail) return;

    const vw = window.innerWidth;
    const mainRect = mainCol?.getBoundingClientRect();
    const railRect = rightRail?.getBoundingClientRect();

    let rightOffset = 16;
    if (mainRect && mainRect.width > 120) {
      rightOffset = Math.max(12, Math.round(vw - mainRect.right + 12));
    } else if (railRect && railRect.width > 0) {
      rightOffset = Math.round(railRect.width + 12);
    }

    // If user undocked graveyards onto the battlefield, keep notices clear of it too
    const gyDock = document.getElementById('upkeep-graveyards-dock');
    if (gyDock && gyDock.dataset.mode === 'floating' && gyDock.dataset.hidden !== 'true') {
      const gyRect = gyDock.getBoundingClientRect();
      if (gyRect.width > 0) {
        rightOffset = Math.max(rightOffset, Math.round(vw - gyRect.left + 12));
      }
    }

    const topOffset = mainRect ? Math.max(12, Math.round(mainRect.top + 12)) : 12;
    root.style.setProperty('--upkeep-notices-right', `${rightOffset}px`);
    root.style.setProperty('--upkeep-notices-top', `${topOffset}px`);
  }

  // ==========================================================================
  // HIDE REDUNDANT RIGHT-SIDE OPPONENT ACTION TOASTS (LOGS ALREADY OPEN)
  // ==========================================================================
  function hideRightRailNotifications() {
    const shouldHide = Boolean(config.enabled && isGameRoute() && config.hideActionToasts);
    document.documentElement.dataset.upkeepHideToasts = shouldHide ? 'true' : 'false';
    if (!shouldHide) return;

    const toastCandidates = document.querySelectorAll(
      '#root > div.fixed.pointer-events-none, [data-testid*="toast" i], [data-testid*="action-toast" i], [data-testid*="notification" i]'
    );
    toastCandidates.forEach((el) => {
      if (el.id?.startsWith('upkeep-')) return;
      if (el.classList.contains('vfx-layer')) return;
      if (el.matches('[data-testid="chip-column"], .es-al-stack, .es-notices')) return;
      const cls = String(el.className || '');
      if (cls.includes('z-[200]') || cls.includes('right-') || el.getAttribute('data-testid')?.toLowerCase().includes('toast')) {
        el.dataset.upkeepHiddenToast = 'true';
      }
    });
  }

  // ==========================================================================
  // REAL ENDSTEP PHASE TRACKER: MIDLINE COORDINATE SYNC (ZERO FEATURE DELTA)
  // ==========================================================================
  function syncPhaseTimeline() {
    const root = document.documentElement;
    const nativePhaseBar = document.querySelector('aside.wr-rail-right .wr-phase-bar--vertical');
    const nativeRail = nativePhaseBar?.querySelector('.wr-pb-rail');
    const midline = document.querySelector('.wr-main-col > [style*="--gradient-midline"]');

    if (!config.enabled || !config.showMidlineTimeline || !isGameRoute() || !nativePhaseBar || !nativeRail || !midline) {
      root.dataset.upkeepTimeline = 'false';
      return;
    }

    root.dataset.upkeepTimeline = 'true';

    // Lock the REAL Endstep .wr-pb-rail pixel-for-pixel onto the reserved 36px battlefield midline
    const rect = midline.getBoundingClientRect();
    if (rect.width > 120 && rect.height >= 20) {
      root.style.setProperty('--upkeep-tl-left', `${Math.round(rect.left)}px`);
      root.style.setProperty('--upkeep-tl-top', `${Math.round(rect.top)}px`);
      root.style.setProperty('--upkeep-tl-width', `${Math.round(rect.width)}px`);
    }
  }

  // ==========================================================================
  // ACTIVE TURN DETECTION (DRIVES 4-COLOR BATTLEFIELD THEME) & TARGET BAR FIX
  // ==========================================================================
  function syncActiveTurn() {
    const root = document.documentElement;
    const phaseBar = document.querySelector('aside.wr-rail-right .wr-phase-bar--vertical');
    const currentStep = document.querySelector('.wr-pb-rail .wr-pb--current');
    const turnChip = document.querySelector('aside.wr-rail-right .wr-turn-chip');
    const turnOwner = document.querySelector('aside.wr-rail-right .wr-turn-owner');

    let turn =
      currentStep?.getAttribute('data-turn') ||
      phaseBar?.getAttribute('data-turn') ||
      turnChip?.getAttribute('data-live') ||
      '';

    if (turn !== 'mine' && turn !== 'opp') {
      const txt = (turnOwner?.textContent || '').trim().toLowerCase();
      if (txt.includes('your') || txt.includes('mine')) turn = 'mine';
      else if (txt.includes('opp') || txt.includes('their')) turn = 'opp';
    }

    if (turn === 'mine' || turn === 'opp') {
      root.dataset.upkeepTurn = turn;
    } else if (!root.dataset.upkeepTurn) {
      root.dataset.upkeepTurn = 'mine';
    }
  }

  function enhanceDecisionTargetBar() {
    const surfaces = document.querySelectorAll('[data-zone="decision-surface"]');
    if (surfaces.length === 0) return;

    surfaces.forEach((surface) => {
      // Detect complex / modal spell decisions (e.g. Kozilek's Command "Choose two", Choose X, Entwine, Spree)
      // so the left-rail decision box can expand & scroll instead of ever clipping mode options
      const actionButtons = surface.querySelectorAll('button');
      const interactiveControls = surface.querySelectorAll('input, [role="checkbox"], [role="radio"], [role="option"]');
      const titleAndMsg = (
        (surface.querySelector('.wr-ds-title')?.textContent || '') +
        ' ' +
        (surface.querySelector('.wr-ds-message')?.textContent || '')
      ).trim();
      const isComplexModal =
        actionButtons.length >= 4 ||
        interactiveControls.length > 0 ||
        /\b(choose\s+(?:one|two|three|up\s+to|modes?|x|\d+)|select\s+modes?|kozilek|entwine|spree|escalate|command)\b/i.test(
          titleAndMsg
        );

      if (isComplexModal) {
        surface.dataset.upkeepComplexDecision = 'true';
      } else if (surface.dataset.upkeepComplexDecision) {
        delete surface.dataset.upkeepComplexDecision;
      }

      const candidates = surface.querySelectorAll('div, span, p');
      candidates.forEach((el) => {
        if (
          el.closest('button') ||
          el.closest('label') ||
          el.closest('[role="checkbox"]') ||
          el.closest('[role="option"]') ||
          el.closest('.wr-ds-banner')
        ) {
          return;
        }
        if (el.classList.contains('wr-ds-title') || el.classList.contains('wr-ds-message')) return;
        if (el.querySelector('button, input, [role="checkbox"], [role="option"]')) return;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 64) return;
        if (/\bneed\s+\d+\s+more\b/i.test(text) || /^\d+\s*\/\s*\d+/.test(text) || /\b\d+\s*\/\s*\d+\b/.test(text)) {
          el.dataset.upkeepTargetBar = 'true';
        }
      });
    });
  }

  // ==========================================================================
  // PLAYER TARGETING HIGHLIGHT (LOTLETH GIANT / SPELLS / TRIGGERS)
  // ==========================================================================
  function syncTargetablePlayers() {
    const plates = document.querySelectorAll('.wr-plate[data-player-anchor]');
    plates.forEach((plate) => {
      const cls = String(plate.className || '');
      const role = (plate.getAttribute('role') || '').toLowerCase();
      const aria = (plate.getAttribute('aria-label') || '').toLowerCase();
      const hasInteractiveChildTarget = Boolean(
        plate.querySelector('[data-targetable="true"], [data-valid-target="true"], [aria-label*="target" i]')
      );
      const isTargetable =
        role === 'button' ||
        plate.getAttribute('tabindex') === '0' ||
        plate.getAttribute('data-targetable') === 'true' ||
        plate.getAttribute('data-valid-target') === 'true' ||
        plate.getAttribute('data-selectable') === 'true' ||
        aria.includes('target') ||
        /\b(cursor-pointer|ring-|target|playable|selectable)\b/i.test(cls) ||
        hasInteractiveChildTarget;

      if (isTargetable) {
        plate.dataset.upkeepTargetable = 'true';
      } else if (plate.dataset.upkeepTargetable) {
        delete plate.dataset.upkeepTargetable;
      }
    });
  }

  // ==========================================================================
  // DIRECT NATIVE PLAYER PLATE ENHANCEMENT (PV DELTA & CRITICAL STATE)
  // ==========================================================================
  function updatePlateLifeFeedback(testId, isOpponent) {
    const container = document.querySelector(`[data-testid="${testId}"]`);
    if (!container) return;
    const totalEl = container.querySelector('.life-total');
    if (!totalEl) return;

    const val = parseInt((totalEl.textContent || '').trim(), 10);
    if (Number.isNaN(val)) return;

    container.dataset.upkeepCritical = val <= 5 ? 'true' : 'false';

    const prev = isOpponent ? prevOppLife : prevSelfLife;
    if (prev !== null && prev !== val) {
      const diff = val - prev;
      let deltaEl = container.querySelector('.upkeep-life-delta');
      if (!deltaEl) {
        deltaEl = document.createElement('span');
        deltaEl.className = 'upkeep-life-delta';
        container.appendChild(deltaEl);
      }
      deltaEl.textContent = diff > 0 ? `+${diff}` : String(diff);
      deltaEl.className = `upkeep-life-delta ${diff < 0 ? 'upkeep-life-delta--neg' : 'upkeep-life-delta--pos'}`;
    }

    if (isOpponent) prevOppLife = val;
    else prevSelfLife = val;
  }

  // ==========================================================================
  // LIFECYCLE, OBSERVERS & SHORTCUTS
  // ==========================================================================
  function applyThemeColors() {
    const root = document.documentElement;
    const cbMode = config.colorblindMode || 'none';
    const base = COLOR_PRESETS[cbMode] || COLOR_PRESETS.none;
    const c = config.colors || base;

    const bfSelfMyTurn = sanitizeHex(c.bfSelfMyTurn, base.bfSelfMyTurn);
    const bfOppMyTurn = sanitizeHex(c.bfOppMyTurn, base.bfOppMyTurn);
    const bfSelfOppTurn = sanitizeHex(c.bfSelfOppTurn, base.bfSelfOppTurn);
    const bfOppOppTurn = sanitizeHex(c.bfOppOppTurn, base.bfOppOppTurn);
    const phaseCurrent = sanitizeHex(c.phaseCurrent, base.phaseCurrent);
    const phaseStopMine = sanitizeHex(c.phaseStopMine, base.phaseStopMine);
    const phaseStopOpp = sanitizeHex(c.phaseStopOpp, base.phaseStopOpp);
    const lifeNormal = sanitizeHex(c.lifeNormal, base.lifeNormal);
    const targetBar = sanitizeHex(c.targetBar, base.targetBar);

    root.dataset.upkeepColorblind = cbMode;
    root.style.setProperty('--upkeep-bf-self-my-turn', bfSelfMyTurn);
    root.style.setProperty('--upkeep-bf-opp-my-turn', bfOppMyTurn);
    root.style.setProperty('--upkeep-bf-self-opp-turn', bfSelfOppTurn);
    root.style.setProperty('--upkeep-bf-opp-opp-turn', bfOppOppTurn);
    root.style.setProperty('--upkeep-phase-current', phaseCurrent);
    root.style.setProperty('--upkeep-phase-current-ink', computeContrastInk(phaseCurrent));
    root.style.setProperty('--upkeep-phase-stop-mine', phaseStopMine);
    root.style.setProperty('--upkeep-phase-stop-opp', phaseStopOpp);
    root.style.setProperty('--upkeep-life-normal', lifeNormal);
    root.style.setProperty('--upkeep-target-bar', targetBar);
  }

  function applyRootAttributes() {
    const root = document.documentElement;
    const active = config.enabled && isGameRoute();
    root.dataset.upkeepActive = active ? 'true' : 'false';
    root.dataset.upkeepSpectate = active && isSpectateRoute() ? 'true' : 'false';
    root.dataset.upkeepHud = active && config.highContrastHud ? 'true' : 'false';
    root.dataset.upkeepStackAnchor = active && config.anchorStackTopLeft ? 'true' : 'false';
    root.style.setProperty('--upkeep-gy-width', `${config.graveyardWidth || 268}px`);

    if (active) {
      applyThemeColors();
    } else {
      cleanupOverlays();
    }
  }

  function cleanupOverlays() {
    const root = document.documentElement;
    hideUpkeepTooltip();
    lastValidLogGeom = null;
    root.dataset.upkeepLogsDocked = 'false';
    root.dataset.upkeepGyDocked = 'false';
    root.dataset.upkeepHideToasts = 'false';
    root.dataset.upkeepTimeline = 'false';
    root.dataset.upkeepStackAnchor = 'false';
    delete root.dataset.upkeepSpectate;
    delete root.dataset.upkeepPeekingGy;
    delete root.dataset.upkeepTurn;
    delete root.dataset.upkeepColorblind;
    [
      '--upkeep-ds-height',
      '--upkeep-log-left',
      '--upkeep-log-top',
      '--upkeep-log-width',
      '--upkeep-log-height',
      '--upkeep-bf-self-my-turn',
      '--upkeep-bf-opp-my-turn',
      '--upkeep-bf-self-opp-turn',
      '--upkeep-bf-opp-opp-turn',
      '--upkeep-phase-current',
      '--upkeep-phase-current-ink',
      '--upkeep-phase-stop-mine',
      '--upkeep-phase-stop-opp',
      '--upkeep-life-normal',
      '--upkeep-target-bar',
      '--upkeep-notices-right',
      '--upkeep-notices-top',
    ].forEach((prop) => root.style.removeProperty(prop));
    document.getElementById('upkeep-graveyards-dock')?.remove();
    document.getElementById('upkeep-card-zoom')?.remove();
    document.getElementById('upkeep-tooltip')?.remove();
    document.querySelectorAll('.upkeep-life-delta').forEach((n) => n.remove());
    document.querySelectorAll('[data-upkeep-hidden-toast]').forEach((n) => {
      delete n.dataset.upkeepHiddenToast;
    });
    document.querySelectorAll('[data-upkeep-targetable]').forEach((n) => {
      delete n.dataset.upkeepTargetable;
    });
    document.querySelectorAll('[data-upkeep-target-bar]').forEach((n) => {
      delete n.dataset.upkeepTargetBar;
    });
    document.querySelectorAll('[data-upkeep-complex-decision]').forEach((n) => {
      delete n.dataset.upkeepComplexDecision;
    });
    document.querySelectorAll('[data-upkeep-panel]').forEach((n) => {
      delete n.dataset.upkeepPanel;
    });
    document.querySelectorAll('[data-upkeep-has-cards]').forEach((n) => {
      delete n.dataset.upkeepHasCards;
    });
    document.querySelectorAll('[data-upkeep-autopass-grid]').forEach((n) => {
      delete n.dataset.upkeepAutopassGrid;
    });
    document.querySelectorAll('[data-upkeep-autopass-header]').forEach((n) => {
      delete n.dataset.upkeepAutopassHeader;
    });
    document.querySelectorAll('[data-upkeep-autopass-cell]').forEach((n) => {
      delete n.dataset.upkeepAutopassCell;
    });
    document.querySelectorAll('[data-upkeep-ap-short]').forEach((n) => {
      delete n.dataset.upkeepApShort;
    });
    document.querySelectorAll('[data-upkeep-ap-key]').forEach((n) => {
      delete n.dataset.upkeepApKey;
    });
    document.querySelectorAll('[data-upkeep-waiting]').forEach((n) => {
      delete n.dataset.upkeepWaiting;
    });
    document.querySelectorAll('[data-upkeep-waiting-self]').forEach((n) => {
      delete n.dataset.upkeepWaitingSelf;
    });
    document.querySelectorAll('[data-upkeep-waiting-head]').forEach((n) => {
      delete n.dataset.upkeepWaitingHead;
    });
    document.querySelectorAll('[data-upkeep-waiting-msg]').forEach((n) => {
      delete n.dataset.upkeepWaitingMsg;
    });
  }

  function resetGameStateIfChanged() {
    const key = isGameRoute() ? window.location.pathname : '';
    if (key === activeGameKey) return;
    activeGameKey = key;
    userClosedLog = false;
    userUndockedLog = false;
    logAutoOpenAttempts = 0;
    lastValidLogGeom = null;
    hideUpkeepTooltip();
    prevOppLife = null;
    prevSelfLife = null;
    gyState.opp = createGyBucket();
    gyState.self = createGyBucket();
    attachResizeObserver();
  }

  function runSync() {
    syncRaf = 0;
    resetGameStateIfChanged();
    applyRootAttributes();
    if (!config.enabled || !isGameRoute()) return;

    syncActiveTurn();
    updatePlateLifeFeedback('opp-life', true);
    updatePlateLifeFeedback('me-life', false);
    syncTargetablePlayers();
    passiveScanOpenDialogs();
    enhanceAutoPassBar();
    enhanceWaitingCard();
    enhanceDecisionTargetBar();
    syncLogDockGeometry();
    syncStackPanel();
    hideRightRailNotifications();
    syncPhaseTimeline();
    renderGraveyardsDock();
    syncGameNoticesPosition();
  }

  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(runSync);
  }

  function attachResizeObserver() {
    if (resizeObserver) resizeObserver.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => scheduleSync());

    const leftRail = document.querySelector('aside.wr-rail-left');
    const { topPlate, bottomPlate } = getRailPlates(leftRail);
    const targets = [
      leftRail,
      topPlate,
      bottomPlate,
      document.querySelector('[aria-label="Pass priority shortcuts"]'),
      document.querySelector('.wr-main-col'),
      document.querySelector('.wr-main-col > .wr-resizable-panel'),
      document.querySelector('.wr-main-col > [style*="--gradient-midline"]'),
      document.querySelector('aside.wr-rail-right'),
    ];
    targets.forEach((el) => {
      if (el) resizeObserver.observe(el);
    });
  }

  function setupObservers() {
    if (domObserver) domObserver.disconnect();
    domObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.target instanceof Element &&
          m.target.closest('#upkeep-graveyards-dock, #upkeep-card-zoom, #upkeep-phase-timeline, #upkeep-tooltip')
        ) {
          continue;
        }
        scheduleSync();
        return;
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', scheduleSync, { passive: true });
    attachResizeObserver();
  }

  function setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (!isGameRoute()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

      const key = e.key.toLowerCase();
      if (key === (config.shortcuts?.toggleTheme || 'u').toLowerCase()) {
        config.enabled = !config.enabled;
        saveConfigToStorage(config);
        scheduleSync();
      } else if (isBlockingModalOpen()) {
        return;
      } else if (key === (config.shortcuts?.toggleGraveyard || 'g').toLowerCase()) {
        gyVisible = !gyVisible;
        mountGraveyardsDock();
        renderGraveyardsDock();
      } else if (key === (config.shortcuts?.toggleLogs || 'l').toLowerCase()) {
        const panel = querySafe(config.selectors.logsPanel);
        if (panel) {
          const closeBtn = panel.querySelector('button[aria-label*="close" i]');
          userClosedLog = true;
          closeBtn?.click();
        } else {
          userClosedLog = false;
          const openBtn = findNativeLogOpenButton();
          openBtn?.click();
        }
      }
    });
  }

  function setupNavigationHooks() {
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
    window.setInterval(() => {
      if (isGameRoute()) {
        attachResizeObserver();
        scheduleSync();
      }
    }, 1500);
  }

  async function loadConfig() {
    let saved = null;
    try {
      const localStored = await extApi?.storage?.local?.get?.(STORAGE_KEY);
      if (localStored && localStored[STORAGE_KEY]) saved = localStored[STORAGE_KEY];
    } catch (_) {}

    if (!saved) {
      try {
        const syncStored = await extApi?.storage?.sync?.get?.(STORAGE_KEY);
        if (syncStored && syncStored[STORAGE_KEY]) saved = syncStored[STORAGE_KEY];
      } catch (_) {}
    }

    if (saved) {
      config = mergeConfig(saved);
    }

    extApi?.storage?.onChanged?.addListener?.((changes, area) => {
      if ((area !== 'local' && area !== 'sync') || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      if (!next) return;
      config = mergeConfig(next);
      scheduleSync();
    });
  }

  async function init() {
    await loadConfig();
    setupObservers();
    setupShortcuts();
    setupNavigationHooks();
    scheduleSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
