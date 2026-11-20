(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';

  const DEFAULT_CONFIG = {
    enabled: true,
    autoOpenLogsLeft: true,
    alwaysShowOpponentGraveyard: true,
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
      opponentGraveyardCards: '[role="dialog"] [data-testid="card-img"], [data-zone*="graveyard" i] [data-testid="card-img"]',
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
  let gyFilter = 'all';
  let gyDockMode = 'docked'; // 'docked' (inside aside.wr-rail-right) | 'floating'
  let gyVisible = true;
  let userUndockedLog = false;
  let userClosedLog = false;
  let logAutoOpenAttempts = 0;

  let prevOppLife = null;
  let prevSelfLife = null;

  // 3-Layer Opponent Graveyard State
  let wsOppCards = [];
  let peekOppCards = [];
  let peekCountAtCapture = -1;
  let peekInFlight = false;
  let lastAutoPeekCount = -1;
  let lastAutoPeekTs = 0;
  let statusNotice = '';
  let statusNoticeTimer = null;

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

  function getAuthoritativeOppGyCount() {
    const btn = querySafe(config.selectors.opponentGraveyardZone);
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
    if (tl.includes('instant') || tl.includes('sorcery') || tl.includes('artifact') || tl.includes('enchantment') || tl.includes('planeswalker')) {
      return 'spell';
    }
    return 'other';
  }

  function setStatusNotice(msg, durationMs = 2600) {
    statusNotice = msg;
    if (statusNoticeTimer) clearTimeout(statusNoticeTimer);
    statusNoticeTimer = window.setTimeout(() => {
      statusNotice = '';
      renderGraveyardPanel();
    }, durationMs);
    renderGraveyardPanel();
  }

  // ==========================================================================
  // LAYER 1: WebSocket / Fetch Passive State Listener (from ws-spy.js)
  // ==========================================================================
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'upkeep-state' || data.kind !== 'graveyards') return;
    if (!Array.isArray(data.players) || data.players.length === 0) return;

    const oppName = getOpponentName().toLowerCase();
    const selfName = getSelfName().toLowerCase();

    let oppPlayer = data.players.find((p) => p.isOpponent);
    if (!oppPlayer && oppName) {
      oppPlayer = data.players.find((p) => String(p.name || '').toLowerCase() === oppName);
    }
    if (!oppPlayer && selfName) {
      oppPlayer = data.players.find((p) => !p.isSelf && String(p.name || '').toLowerCase() !== selfName);
    }
    if (!oppPlayer && data.players.length === 1 && !data.players[0].isSelf) {
      oppPlayer = data.players[0];
    }

    if (oppPlayer && Array.isArray(oppPlayer.graveyard)) {
      wsOppCards = oppPlayer.graveyard.map((c) => ({
        name: c.name,
        typeLine: c.typeLine || '',
        manaCost: c.manaCost || '',
        imageUrl: c.imageUrl || toCardImageUrl(c.name),
        source: 'ws',
      }));
      scheduleSync();
    }
  });

  // ==========================================================================
  // LAYER 2: Native Graveyard Dialog Scraper + Silent Peek
  // ==========================================================================
  function findOpenZoneDialogs() {
    const dialogs = Array.from(
      document.querySelectorAll(
        '[role="dialog"]:not([data-zone="decision-surface"]), [data-radix-popper-content-wrapper], [data-zone*="graveyard" i]'
      )
    );
    return dialogs.filter((el) => {
      if (el.id === 'upkeep-opp-graveyard') return false;
      if (el.closest('#upkeep-opp-graveyard')) return false;
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
      if (!name || name.startsWith('{')) return; // Ignore mana symbol SVGs
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

  function isOpponentGraveyardDialog(dialog) {
    const text = (
      (dialog.getAttribute('aria-label') || '') +
      ' ' +
      (dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent || '')
    ).toLowerCase();
    if (!text.includes('graveyard') && !text.includes('cimetière')) return false;
    const oppName = getOpponentName().toLowerCase();
    const selfName = getSelfName().toLowerCase();
    if (oppName && text.includes(oppName)) return true;
    if (text.includes('opponent') || text.includes('opp')) return true;
    if (selfName && text.includes(selfName)) return false;
    if (text.includes('your ')) return false;
    return true;
  }

  function passiveScanOpenDialogs() {
    if (peekInFlight) return;
    const dialogs = findOpenZoneDialogs();
    for (const dlg of dialogs) {
      if (!isOpponentGraveyardDialog(dlg)) continue;
      const found = extractCardsFromDialog(dlg);
      if (found.length > 0) {
        peekOppCards = found;
        peekCountAtCapture = getAuthoritativeOppGyCount();
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
    const escDown = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(escDown);
    document.dispatchEvent(escDown);
  }

  async function peekOpponentGraveyard({ force = false } = {}) {
    if (peekInFlight) return false;
    const count = getAuthoritativeOppGyCount();
    if (count === 0) {
      peekOppCards = [];
      peekCountAtCapture = 0;
      if (force) setStatusNotice('Cimetière adverse vide');
      renderGraveyardPanel();
      return true;
    }

    const oppGyBtn = querySafe(config.selectors.opponentGraveyardZone);
    if (!oppGyBtn || oppGyBtn.disabled) {
      if (force) setStatusNotice('Lecture via le journal de partie');
      renderGraveyardPanel();
      return false;
    }

    // Do not interrupt if the user currently has another modal open (unless explicitly forced)
    const preExistingDialogs = new Set(findOpenZoneDialogs());
    if (!force && preExistingDialogs.size > 0) {
      return false;
    }

    peekInFlight = true;
    lastAutoPeekCount = count;
    lastAutoPeekTs = Date.now();
    document.documentElement.dataset.upkeepPeekingGy = 'true';

    let captured = [];
    let openedDialog = null;

    try {
      oppGyBtn.click();

      // Wait up to 480ms for Endstep to render the graveyard cards inside its dialog
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
        peekOppCards = captured;
        peekCountAtCapture = count;
      }
    } finally {
      closeDialogElement(openedDialog);
      await new Promise((r) => window.setTimeout(r, 60));
      delete document.documentElement.dataset.upkeepPeekingGy;
      peekInFlight = false;
    }

    if (force) {
      const effective = getEffectiveOpponentGraveyard().cards.length;
      setStatusNotice(
        effective > 0 ? `Synchronisé · ${effective} carte${effective > 1 ? 's' : ''}` : 'Synchronisation effectuée'
      );
    } else {
      renderGraveyardPanel();
    }
    return captured.length > 0;
  }

  // ==========================================================================
  // LAYER 3: Smart Game Log Parser (Zero-Click Instant Fallback)
  // ==========================================================================
  function parseOpponentGraveyardFromLog(authoritativeCount) {
    if (authoritativeCount === 0) return [];
    const logRoot = document.querySelector('[data-gamelog-panel] [role="log"]');
    if (!logRoot) return [];

    const oppName = getOpponentName();
    const selfName = getSelfName();
    const oppLower = oppName.toLowerCase();
    const selfLower = selfName.toLowerCase();

    const lastOwnerByCard = new Map();
    const oppGraveyard = [];
    const oppCastCandidates = [];
    let activeTurnOwner = 'unknown';

    const oppBoardCardNames = new Set(
      Array.from(document.querySelectorAll('[data-half="opp"] [data-testid="card-img"]'))
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

      // Skip "Look at Forge AI's hand: ..." reveal lines (they list hand, not graveyard)
      if (/look at .* hand/i.test(combined)) continue;

      if (cardName && actor !== 'unknown') {
        lastOwnerByCard.set(cardName.toLowerCase(), actor);
      }

      // Leaving graveyard
      if (cardName && /graveyard\s*(?:->|→)/i.test(combined)) {
        const owner = actor !== 'unknown' ? actor : lastOwnerByCard.get(cardName.toLowerCase()) || activeTurnOwner;
        if (owner === 'opp') {
          const idx = oppGraveyard.findIndex((c) => c.name.toLowerCase() === cardName.toLowerCase());
          if (idx !== -1) oppGraveyard.splice(idx, 1);
        }
        continue;
      }

      // Entering graveyard explicitly
      if (
        cardName &&
        (/(?:->|→)\s*graveyard/i.test(combined) ||
          /\b(?:discarded|milled|put .* into .* graveyard|died|destroyed|countered)\b/i.test(combined))
      ) {
        const owner = actor !== 'unknown' ? actor : lastOwnerByCard.get(cardName.toLowerCase()) || activeTurnOwner;
        if (owner === 'opp') {
          oppGraveyard.push({
            name: cardName,
            typeLine: '',
            manaCost: '',
            imageUrl: toCardImageUrl(cardName),
            source: 'log',
          });
        }
        continue;
      }

      // Track opponent spell casts that aren't currently permanents on opponent's board
      if (cardName && actor === 'opp' && /\bcast\b/i.test(combined)) {
        oppCastCandidates.push(cardName);
      }
    }

    // Complete missing slots (e.g. opponent sorceries/instants like Land Grant that resolve into graveyard without a separate zone-move row)
    if (oppGraveyard.length < authoritativeCount) {
      const alreadyCounted = new Map();
      oppGraveyard.forEach((c) => {
        const k = c.name.toLowerCase();
        alreadyCounted.set(k, (alreadyCounted.get(k) || 0) + 1);
      });

      for (let i = oppCastCandidates.length - 1; i >= 0 && oppGraveyard.length < authoritativeCount; i--) {
        const name = oppCastCandidates[i];
        const key = name.toLowerCase();
        if (oppBoardCardNames.has(key)) continue;
        if ((alreadyCounted.get(key) || 0) > 0) {
          alreadyCounted.set(key, alreadyCounted.get(key) - 1);
          continue;
        }
        oppGraveyard.push({
          name,
          typeLine: '',
          manaCost: '',
          imageUrl: toCardImageUrl(name),
          source: 'log',
        });
      }
    }

    return oppGraveyard;
  }

  function getEffectiveOpponentGraveyard() {
    const authCount = getAuthoritativeOppGyCount();
    if (authCount === 0) {
      return { count: 0, cards: [], source: 'empty' };
    }

    if (wsOppCards.length > 0 && wsOppCards.length === authCount) {
      return { count: authCount, cards: wsOppCards, source: 'ws' };
    }
    if (peekOppCards.length > 0 && peekCountAtCapture === authCount) {
      return { count: authCount, cards: peekOppCards, source: 'dialog' };
    }

    const logCards = parseOpponentGraveyardFromLog(authCount);
    if (logCards.length >= authCount) {
      return { count: authCount, cards: logCards, source: 'log' };
    }
    if (wsOppCards.length > 0) {
      return { count: authCount, cards: wsOppCards, source: 'ws' };
    }
    if (peekOppCards.length > 0) {
      return { count: authCount, cards: peekOppCards, source: 'dialog' };
    }
    return { count: authCount, cards: logCards, source: logCards.length > 0 ? 'log' : 'pending' };
  }

  // ==========================================================================
  // UI: Opponent Graveyard Panel (Docked inside aside.wr-rail-right OR Floating)
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

  function ensureGraveyardPanel() {
    let panel = document.getElementById('upkeep-opp-graveyard');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'upkeep-opp-graveyard';
      panel.setAttribute('aria-label', 'Cimetière adverse (Upkeep)');

      const header = document.createElement('div');
      header.className = 'upkeep-gy-header';

      const titleRow = document.createElement('div');
      titleRow.className = 'upkeep-gy-title-row';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'upkeep-gy-title-group';

      const titleEl = document.createElement('h2');
      titleEl.className = 'upkeep-gy-title';
      titleEl.textContent = 'Cimetière adverse';

      const countSpan = document.createElement('span');
      countSpan.className = 'upkeep-gy-count';
      countSpan.id = 'upkeep-gy-count';
      countSpan.textContent = '0';

      titleGroup.appendChild(titleEl);
      titleGroup.appendChild(countSpan);

      const actions = document.createElement('div');
      actions.className = 'upkeep-gy-actions';

      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'upkeep-gy-icon-btn';
      refreshBtn.id = 'upkeep-gy-refresh';
      refreshBtn.title = 'Synchroniser le cimetière adverse';
      refreshBtn.setAttribute('aria-label', 'Synchroniser le cimetière adverse');
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => {
        peekOpponentGraveyard({ force: true });
      });

      const modeBtn = document.createElement('button');
      modeBtn.type = 'button';
      modeBtn.className = 'upkeep-gy-icon-btn';
      modeBtn.id = 'upkeep-gy-mode';
      modeBtn.title = 'Basculer ancré dans le rail droit / flottant par-dessus';
      modeBtn.setAttribute('aria-label', "Changer le mode d'affichage du cimetière");
      modeBtn.textContent = '◫';
      modeBtn.addEventListener('click', () => {
        gyDockMode = gyDockMode === 'docked' ? 'floating' : 'docked';
        mountGraveyardPanel();
        renderGraveyardPanel();
      });

      actions.appendChild(refreshBtn);
      actions.appendChild(modeBtn);
      titleRow.appendChild(titleGroup);
      titleRow.appendChild(actions);

      const metaEl = document.createElement('div');
      metaEl.className = 'upkeep-gy-meta';
      metaEl.id = 'upkeep-gy-meta';
      metaEl.textContent = 'Aucune carte au cimetière';

      header.appendChild(titleRow);
      header.appendChild(metaEl);

      const filtersEl = document.createElement('div');
      filtersEl.className = 'upkeep-gy-filters';
      filtersEl.setAttribute('role', 'group');
      filtersEl.setAttribute('aria-label', 'Filtrer le cimetière adverse');

      const filterDefs = [
        ['all', 'Tout'],
        ['creature', 'Créat.'],
        ['spell', 'Sorts'],
        ['land', 'Terrains'],
      ];
      for (const [key, label] of filterDefs) {
        const fBtn = document.createElement('button');
        fBtn.type = 'button';
        fBtn.className = 'upkeep-gy-filter-btn';
        fBtn.dataset.filter = key;
        fBtn.setAttribute('aria-pressed', key === 'all' ? 'true' : 'false');
        fBtn.textContent = label;
        fBtn.addEventListener('click', () => {
          gyFilter = key;
          filtersEl.querySelectorAll('.upkeep-gy-filter-btn').forEach((b) => {
            b.setAttribute('aria-pressed', String(b === fBtn));
          });
          renderGraveyardPanel();
        });
        filtersEl.appendChild(fBtn);
      }

      const listEl = document.createElement('div');
      listEl.className = 'upkeep-gy-list';
      listEl.id = 'upkeep-gy-list';

      panel.appendChild(header);
      panel.appendChild(filtersEl);
      panel.appendChild(listEl);
    }

    mountGraveyardPanel(panel);
    return panel;
  }

  function mountGraveyardPanel(panelEl) {
    const panel = panelEl || document.getElementById('upkeep-opp-graveyard');
    if (!panel) return;

    const shouldShow = config.enabled && config.alwaysShowOpponentGraveyard && gyVisible;
    panel.dataset.hidden = shouldShow ? 'false' : 'true';
    panel.dataset.mode = gyDockMode;

    const rightRail = document.querySelector('aside.wr-rail-right');
    if (shouldShow && gyDockMode === 'docked' && rightRail) {
      document.documentElement.dataset.upkeepGyDocked = 'true';
      const phaseBar = rightRail.querySelector('.wr-phase-bar');
      if (panel.parentElement !== rightRail) {
        if (phaseBar) {
          rightRail.insertBefore(panel, phaseBar);
        } else {
          rightRail.appendChild(panel);
        }
      }
    } else {
      document.documentElement.dataset.upkeepGyDocked = 'false';
      if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
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

  function renderGraveyardPanel() {
    if (!config.enabled || !isGameRoute()) return;
    const panel = ensureGraveyardPanel();
    const countEl = panel.querySelector('#upkeep-gy-count');
    const metaEl = panel.querySelector('#upkeep-gy-meta');
    const listEl = panel.querySelector('#upkeep-gy-list');
    if (!countEl || !metaEl || !listEl) return;

    const { count, cards, source } = getEffectiveOpponentGraveyard();
    countEl.textContent = String(count);

    // Highlight opponent graveyard button in left rail when count > 0
    const oppGyBtn = querySafe(config.selectors.opponentGraveyardZone);
    if (oppGyBtn) {
      oppGyBtn.dataset.upkeepHasCards = count > 0 ? 'true' : 'false';
    }

    if (statusNotice) {
      metaEl.textContent = statusNotice;
    } else if (count === 0) {
      metaEl.textContent = 'Aucune carte au cimetière';
    } else if (cards.length > 0) {
      const srcLabel = source === 'ws' ? 'Temps réel' : source === 'dialog' ? 'Synchronisé' : 'Via journal';
      metaEl.textContent = `${cards.length}/${count} carte${count > 1 ? 's' : ''} · ${srcLabel}`;
    } else {
      metaEl.textContent = `${count} carte${count > 1 ? 's' : ''} détectée${count > 1 ? 's' : ''}`;
    }

    const grouped = groupCardsByName(cards);
    const filtered = gyFilter === 'all' ? grouped : grouped.filter((c) => c.category === gyFilter);

    listEl.replaceChildren();

    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      empty.textContent = 'Les cartes envoyées au cimetière adverse apparaîtront ici automatiquement.';
      listEl.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'upkeep-gy-empty';
      if (grouped.length === 0) {
        empty.textContent = `${count} carte${count > 1 ? 's' : ''} présente${count > 1 ? 's' : ''} dans le cimetière adverse.`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upkeep-gy-sync-btn';
        btn.textContent = 'Lire les cartes maintenant';
        btn.addEventListener('click', () => peekOpponentGraveyard({ force: true }));
        empty.appendChild(document.createElement('br'));
        empty.appendChild(btn);
      } else {
        empty.textContent = 'Aucune carte dans cette catégorie.';
      }
      listEl.appendChild(empty);
      return;
    }

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
        const btn = querySafe(config.selectors.opponentGraveyardZone);
        if (btn && !btn.disabled) btn.click();
      });

      listEl.appendChild(row);
    }

    // Trigger silent auto-peek if authoritative count changed and we don't have full cards yet
    if (
      count > 0 &&
      cards.length < count &&
      !peekInFlight &&
      (lastAutoPeekCount !== count || Date.now() - lastAutoPeekTs > 6000)
    ) {
      window.setTimeout(() => {
        if (!peekInFlight && isGameRoute() && config.enabled) {
          peekOpponentGraveyard({ force: false });
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
      if (btn.closest('#upkeep-opp-graveyard')) continue;
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

    // Respect manual close by the user
    const closeBtn = logPanel.querySelector('button[aria-label*="close" i]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        userClosedLog = true;
      });
    }

    // Inject subtle dock/undock toggle in titlebar
    const titlebar = logPanel.querySelector('[data-gamelog-titlebar]');
    const actionsBox = titlebar?.lastElementChild;
    if (actionsBox && !titlebar.querySelector('.upkeep-log-dock-btn')) {
      const dockBtn = document.createElement('button');
      dockBtn.type = 'button';
      dockBtn.className = 'upkeep-log-dock-btn';
      dockBtn.title = 'Ancrer / Détacher le journal dans le rail gauche (Upkeep)';
      dockBtn.setAttribute('aria-label', 'Ancrer ou détacher le journal');
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
    root.style.setProperty('--upkeep-gy-width', `${config.graveyardWidth || 268}px`);

    if (!active) {
      cleanupOverlays();
    }
  }

  function cleanupOverlays() {
    document.documentElement.dataset.upkeepLogsDocked = 'false';
    document.documentElement.dataset.upkeepGyDocked = 'false';
    delete document.documentElement.dataset.upkeepPeekingGy;
    document.getElementById('upkeep-opp-graveyard')?.remove();
    document.getElementById('upkeep-card-zoom')?.remove();
    document.querySelectorAll('.upkeep-life-delta').forEach((n) => n.remove());
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
    wsOppCards = [];
    peekOppCards = [];
    peekCountAtCapture = -1;
    lastAutoPeekCount = -1;
    statusNotice = '';
    attachResizeObserver();
  }

  function runSync() {
    syncRaf = 0;
    resetGameStateIfChanged();
    applyRootAttributes();
    if (!config.enabled || !isGameRoute()) return;

    updatePlateLifeFeedback('opp-life', true);
    updatePlateLifeFeedback('me-life', false);
    passiveScanOpenDialogs();
    syncLogDockGeometry();
    renderGraveyardPanel();
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
        if (m.target instanceof Element && m.target.closest('#upkeep-opp-graveyard, #upkeep-card-zoom')) {
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
        extApi?.storage?.sync?.set?.({ [STORAGE_KEY]: config }).catch?.(() => {});
        scheduleSync();
      } else if (key === (config.shortcuts?.toggleGraveyard || 'g').toLowerCase()) {
        gyVisible = !gyVisible;
        mountGraveyardPanel();
        renderGraveyardPanel();
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
    try {
      const stored = await extApi?.storage?.sync?.get?.(STORAGE_KEY);
      if (stored && stored[STORAGE_KEY]) {
        const saved = stored[STORAGE_KEY];
        config = {
          ...DEFAULT_CONFIG,
          ...saved,
          shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...(saved.shortcuts || {}) },
          selectors: { ...DEFAULT_CONFIG.selectors, ...(saved.selectors || {}) },
        };
      }
    } catch (_) {}

    extApi?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      if (!next) return;
      config = {
        ...DEFAULT_CONFIG,
        ...next,
        shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...(next.shortcuts || {}) },
        selectors: { ...DEFAULT_CONFIG.selectors, ...(next.selectors || {}) },
      };
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
