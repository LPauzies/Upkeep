(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';

  const DEFAULT_CONFIG = {
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

  function isGameRoute() {
    return /^\/game\/[^/]+/.test(window.location.pathname);
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

  function getOpponentName() {
    const el =
      document.querySelector('[data-player-anchor="opp"] .wr-player-nameplate') ||
      document.querySelector('[data-player-anchor="opp"] [title]');
    return (el?.textContent || '').trim();
  }

  function getSelfName() {
    const el =
      document.querySelector('[data-player-anchor="me"] .wr-player-nameplate') ||
      document.querySelector('[data-player-anchor="me"] [title]');
    return (el?.textContent || '').trim();
  }

  function getGraveyardButton(owner) {
    if (owner === 'opp') {
      return querySafe(config.selectors.opponentGraveyardZone || 'button[data-zone-anchor="opp-graveyard"]');
    }
    return querySafe(config.selectors.selfGraveyardZone || 'button[data-zone-anchor="my-graveyard"]');
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
  function mergeConfig(saved) {
    if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_CONFIG);
    return {
      ...DEFAULT_CONFIG,
      ...saved,
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

  function closeDialogElement(dialog) {
    if (dialog) {
      const closeBtn = dialog.querySelector(
        'button[aria-label*="close" i], button[title*="close" i], [data-testid*="close" i]'
      );
      if (closeBtn) {
        closeBtn.click();
        return;
      }
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
    if (!force && preExistingDialogs.size > 0) {
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
      if (dock.parentElement !== rightRail) {
        if (phaseBar) {
          rightRail.insertBefore(dock, phaseBar);
        } else {
          rightRail.appendChild(dock);
        }
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
    const countEl = dock.querySelector(`#upkeep-gy-count-${owner}`);
    const metaEl = dock.querySelector(`#upkeep-gy-meta-${owner}`);
    const listEl = dock.querySelector(`#upkeep-gy-list-${owner}`);
    const chevronEl = dock.querySelector(`#upkeep-gy-chevron-${owner}`);
    if (!section || !countEl || !metaEl || !listEl) return false;

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

        const thumb = document.createElement('img');
        thumb.className = 'upkeep-gy-thumb';
        thumb.src = card.imageUrl || toCardImageUrl(card.name);
        thumb.alt = card.name;
        thumb.loading = 'lazy';

        const info = document.createElement('div');
        info.className = 'upkeep-gy-card-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'upkeep-gy-card-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'upkeep-gy-card-name';
        nameEl.textContent = card.name;
        nameRow.appendChild(nameEl);

        if (card.qty > 1) {
          const qtyEl = document.createElement('span');
          qtyEl.className = 'upkeep-gy-card-qty';
          qtyEl.textContent = `×${card.qty}`;
          nameRow.appendChild(qtyEl);
        }

        info.appendChild(nameRow);

        if (card.typeLine || card.manaCost) {
          const sub = document.createElement('span');
          sub.className = 'upkeep-gy-card-sub';
          sub.textContent = [card.manaCost, card.typeLine].filter(Boolean).join(' · ');
          info.appendChild(sub);
        }

        row.appendChild(thumb);
        row.appendChild(info);

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

  function syncLogDockGeometry() {
    const root = document.documentElement;
    if (!config.enabled || !isGameRoute()) {
      root.dataset.upkeepLogsDocked = 'false';
      return;
    }

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

    const leftRail = document.querySelector('aside.wr-rail-left');
    const oppPlate = leftRail?.querySelector('[data-player-anchor="opp"]');
    const pendingGroup = leftRail?.querySelector('[aria-label="Pending actions"]');
    const bottomStack = pendingGroup?.firstElementChild;
    const selfPlate = leftRail?.querySelector('[data-player-anchor="me"]');

    if (!leftRail || !oppPlate) {
      root.dataset.upkeepLogsDocked = 'false';
      return;
    }

    const railRect = leftRail.getBoundingClientRect();
    const oppRect = oppPlate.getBoundingClientRect();
    const bottomAnchorRect =
      bottomStack && bottomStack.getBoundingClientRect().height > 0
        ? bottomStack.getBoundingClientRect()
        : selfPlate?.getBoundingClientRect();

    const topY = Math.round(oppRect.bottom + 6);
    const bottomY = Math.round((bottomAnchorRect ? bottomAnchorRect.top : railRect.bottom) - 8);
    const availHeight = bottomY - topY;

    if (availHeight < 120 || railRect.width < 180) {
      root.dataset.upkeepLogsDocked = 'false';
      return;
    }

    root.dataset.upkeepLogsDocked = 'true';
    root.style.setProperty('--upkeep-log-left', `${Math.round(railRect.left + 6)}px`);
    root.style.setProperty('--upkeep-log-top', `${topY}px`);
    root.style.setProperty('--upkeep-log-width', `${Math.round(railRect.width - 12)}px`);
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
      const cls = String(el.className || '');
      if (cls.includes('z-[200]') || cls.includes('right-') || el.getAttribute('data-testid')?.toLowerCase().includes('toast')) {
        el.dataset.upkeepHiddenToast = 'true';
      }
    });
  }

  // ==========================================================================
  // HORIZONTAL CHRONOLOGICAL PHASE TIMELINE ON BATTLEFIELD MIDLINE
  // ==========================================================================
  function ensurePhaseTimeline() {
    let bar = document.getElementById('upkeep-phase-timeline');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'upkeep-phase-timeline';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Phase timeline (Upkeep)');
      document.body.appendChild(bar);
    }
    return bar;
  }

  function syncPhaseTimeline() {
    const root = document.documentElement;
    const nativePhaseBar = document.querySelector('aside.wr-rail-right .wr-phase-bar--vertical');
    const midline = document.querySelector('.wr-main-col > [style*="--gradient-midline"]');

    if (!config.enabled || !config.showMidlineTimeline || !isGameRoute() || !nativePhaseBar || !midline) {
      root.dataset.upkeepTimeline = 'false';
      const existing = document.getElementById('upkeep-phase-timeline');
      if (existing) existing.dataset.hidden = 'true';
      return;
    }

    root.dataset.upkeepTimeline = 'true';
    const bar = ensurePhaseTimeline();
    bar.dataset.hidden = 'false';

    const rect = midline.getBoundingClientRect();
    if (rect.width > 120 && rect.height >= 20) {
      root.style.setProperty('--upkeep-tl-left', `${Math.round(rect.left)}px`);
      root.style.setProperty('--upkeep-tl-top', `${Math.round(rect.top)}px`);
      root.style.setProperty('--upkeep-tl-width', `${Math.round(rect.width)}px`);
    }

    const turnChip = nativePhaseBar.querySelector('.wr-turn-chip');
    const turnOwner = turnChip?.getAttribute('data-live') === 'opp' ? 'opp' : 'mine';
    const turnNum = (turnChip?.querySelector('.wr-turn-num')?.textContent || '').trim();
    const stormNum = (turnChip?.querySelector('.wr-turn-storm-num')?.textContent || '').trim();
    const priorityBadge = nativePhaseBar.querySelector('.wr-priority-badge');
    const hasMyPriority = Boolean(priorityBadge && priorityBadge.classList.contains('wr-priority-badge-mine'));

    const rail = nativePhaseBar.querySelector('.wr-pb-rail');
    if (!rail) return;

    const meta = document.createElement('div');
    meta.className = 'upkeep-tl-meta';

    const turnEl = document.createElement('span');
    turnEl.className = `upkeep-tl-turn ${turnOwner === 'mine' ? 'upkeep-tl-turn--mine' : 'upkeep-tl-turn--opp'}`;
    turnEl.textContent = `${turnOwner === 'mine' ? 'Your Turn' : 'Opp Turn'}${turnNum ? ` · ${turnNum}` : ''}`;
    meta.appendChild(turnEl);

    if (stormNum && stormNum !== '0') {
      const stormEl = document.createElement('span');
      stormEl.className = 'upkeep-tl-storm';
      stormEl.textContent = `Storm ${stormNum}`;
      meta.appendChild(stormEl);
    }

    if (hasMyPriority) {
      const prioEl = document.createElement('span');
      prioEl.className = 'upkeep-tl-priority';
      prioEl.textContent = 'Priority';
      meta.appendChild(prioEl);
    }

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'upkeep-tl-steps';

    const children = Array.from(rail.children);
    for (const child of children) {
      if (child.classList.contains('wr-pb-section')) {
        const sep = document.createElement('span');
        sep.className = 'upkeep-tl-sep';
        sep.setAttribute('aria-hidden', 'true');
        stepsWrap.appendChild(sep);
        continue;
      }

      if (!child.classList.contains('wr-pb')) continue;

      const isPast = child.classList.contains('wr-pb--past');
      const isCurrent = child.classList.contains('wr-pb--current');
      const stepTurn = child.getAttribute('data-turn') === 'opp' ? 'opp' : 'mine';
      const labelNode = child.querySelector('.wr-pb-now-name, .wr-pb-label');
      const label = (labelNode?.textContent || '').trim();
      const fullName = labelNode?.getAttribute('title') || label;

      const mineBlade = child.querySelector('.wr-pb-blade--mine');
      const oppBlade = child.querySelector('.wr-pb-blade--opp');
      const stopMine = Boolean(
        mineBlade && (mineBlade.getAttribute('aria-pressed') === 'true' || mineBlade.classList.contains('is-set'))
      );
      const stopOpp = Boolean(
        oppBlade && (oppBlade.getAttribute('aria-pressed') === 'true' || oppBlade.classList.contains('is-set'))
      );
      const canToggle = Boolean(mineBlade || oppBlade);

      const stepBtn = document.createElement('button');
      stepBtn.type = 'button';
      stepBtn.className =
        'upkeep-tl-step' +
        (isPast ? ' upkeep-tl-step--past' : '') +
        (isCurrent ? ` upkeep-tl-step--current upkeep-tl-step--${stepTurn}` : '') +
        (!canToggle ? ' upkeep-tl-step--readonly' : '');
      stepBtn.textContent = label;
      stepBtn.dataset.stopMine = stopMine ? 'true' : 'false';
      stepBtn.dataset.stopOpp = stopOpp ? 'true' : 'false';

      if (canToggle) {
        stepBtn.title = `${fullName} — Left-click: toggle Your stop · Right-click: toggle Opp stop`;
        stepBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (e.shiftKey && oppBlade) {
            oppBlade.click();
          } else if (mineBlade) {
            mineBlade.click();
          }
        });
        stepBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (oppBlade) oppBlade.click();
        });
      } else {
        stepBtn.title = fullName;
      }

      stepsWrap.appendChild(stepBtn);
    }

    const legend = document.createElement('div');
    legend.className = 'upkeep-tl-legend';
    legend.setAttribute('aria-hidden', 'true');

    const legMine = document.createElement('span');
    legMine.className = 'upkeep-tl-legend-item';
    const swMine = document.createElement('span');
    swMine.className = 'upkeep-tl-swatch upkeep-tl-swatch--mine';
    const txtMine = document.createElement('span');
    txtMine.textContent = 'You';
    legMine.appendChild(swMine);
    legMine.appendChild(txtMine);

    const legOpp = document.createElement('span');
    legOpp.className = 'upkeep-tl-legend-item';
    const swOpp = document.createElement('span');
    swOpp.className = 'upkeep-tl-swatch upkeep-tl-swatch--opp';
    const txtOpp = document.createElement('span');
    txtOpp.textContent = 'Opp';
    legOpp.appendChild(swOpp);
    legOpp.appendChild(txtOpp);

    legend.appendChild(legMine);
    legend.appendChild(legOpp);

    bar.replaceChildren(meta, stepsWrap, legend);
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
  function applyRootAttributes() {
    const root = document.documentElement;
    const active = config.enabled && isGameRoute();
    root.dataset.upkeepActive = active ? 'true' : 'false';
    root.dataset.upkeepHud = active && config.highContrastHud ? 'true' : 'false';
    root.dataset.upkeepStackAnchor = active && config.anchorStackTopLeft ? 'true' : 'false';
    root.style.setProperty('--upkeep-gy-width', `${config.graveyardWidth || 268}px`);

    if (!active) {
      cleanupOverlays();
    }
  }

  function cleanupOverlays() {
    document.documentElement.dataset.upkeepLogsDocked = 'false';
    document.documentElement.dataset.upkeepGyDocked = 'false';
    document.documentElement.dataset.upkeepHideToasts = 'false';
    document.documentElement.dataset.upkeepTimeline = 'false';
    document.documentElement.dataset.upkeepStackAnchor = 'false';
    delete document.documentElement.dataset.upkeepPeekingGy;
    document.getElementById('upkeep-graveyards-dock')?.remove();
    document.getElementById('upkeep-card-zoom')?.remove();
    document.getElementById('upkeep-phase-timeline')?.remove();
    document.querySelectorAll('.upkeep-life-delta').forEach((n) => n.remove());
    document.querySelectorAll('[data-upkeep-hidden-toast]').forEach((n) => {
      delete n.dataset.upkeepHiddenToast;
    });
    document.querySelectorAll('[data-upkeep-targetable]').forEach((n) => {
      delete n.dataset.upkeepTargetable;
    });
    document.querySelectorAll('[data-upkeep-panel]').forEach((n) => {
      delete n.dataset.upkeepPanel;
    });
    document.querySelectorAll('[data-upkeep-has-cards]').forEach((n) => {
      delete n.dataset.upkeepHasCards;
    });
  }

  function resetGameStateIfChanged() {
    const key = isGameRoute() ? window.location.pathname : '';
    if (key === activeGameKey) return;
    activeGameKey = key;
    userClosedLog = false;
    userUndockedLog = false;
    logAutoOpenAttempts = 0;
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

    updatePlateLifeFeedback('opp-life', true);
    updatePlateLifeFeedback('me-life', false);
    syncTargetablePlayers();
    passiveScanOpenDialogs();
    syncLogDockGeometry();
    syncStackPanel();
    hideRightRailNotifications();
    syncPhaseTimeline();
    renderGraveyardsDock();
  }

  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(runSync);
  }

  function attachResizeObserver() {
    if (resizeObserver) resizeObserver.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => scheduleSync());

    const targets = [
      document.querySelector('aside.wr-rail-left'),
      document.querySelector('[data-player-anchor="opp"]'),
      document.querySelector('[aria-label="Pending actions"] > div'),
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
          m.target.closest('#upkeep-graveyards-dock, #upkeep-card-zoom, #upkeep-phase-timeline')
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
