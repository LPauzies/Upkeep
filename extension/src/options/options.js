(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';

  const COLOR_PRESETS = {
    none: {
      bfSelfMyTurn: '#182030',
      bfOppMyTurn: '#0d1119',
      bfSelfOppTurn: '#0d1119',
      bfOppOppTurn: '#182132',
      phaseCurrent: '#c9a45c',
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

  const PRESET_OPTIONS = [
    { id: 'none', title: 'Standard', desc: 'Obsidian & Gold default palette' },
    { id: 'deuteranopia', title: 'Deuteranopia / Protanopia', desc: 'Red-Green safe Okabe-Ito palette' },
    { id: 'tritanopia', title: 'Tritanopia', desc: 'Blue-Yellow safe crimson & teal' },
    { id: 'high-contrast', title: 'High Contrast', desc: 'Maximum luminance & sharp cues' },
  ];

  const COLOR_GROUPS = [
    {
      title: 'Battlefield (Turn-Aware)',
      fields: [
        { key: 'bfSelfMyTurn', label: 'Your Battlefield — Your Turn', hint: 'Active background on your side during your turn' },
        { key: 'bfOppMyTurn', label: 'Opponent Battlefield — Your Turn', hint: 'Passive background on opponent side during your turn' },
        { key: 'bfSelfOppTurn', label: 'Your Battlefield — Opponent Turn', hint: 'Passive background on your side during opponent turn' },
        { key: 'bfOppOppTurn', label: 'Opponent Battlefield — Opponent Turn', hint: 'Active background on opponent side during their turn' },
      ],
    },
    {
      title: 'Phase Timeline',
      fields: [
        { key: 'phaseCurrent', label: 'Active Phase Step', hint: 'High-contrast fill for the current step (auto ink contrast)' },
        { key: 'phaseStopMine', label: 'Your Turn Stop Marker', hint: 'Top/left blade marker when you set a stop on your turn' },
        { key: 'phaseStopOpp', label: 'Opponent Turn Stop Marker', hint: 'Bottom/right blade marker when you set a stop on their turn' },
      ],
    },
    {
      title: 'Life & Target Bar',
      fields: [
        { key: 'lifeNormal', label: 'Life Total (> 5 PV)', hint: 'Player & opponent life color outside the critical red zone' },
        { key: 'targetBar', label: 'Target Selection Bar', hint: 'Counter & prompt color (e.g. 0/1 — NEED 1 MORE)' },
      ],
    },
  ];

  const DEFAULT_SELECTORS = {
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
  };

  let current = {
    colorblindMode: 'none',
    colors: { ...COLOR_PRESETS.none },
    selectors: { ...DEFAULT_SELECTORS },
  };

  const colorControlRefs = new Map();
  const selectorInputRefs = new Map();
  const presetButtonRefs = new Map();
  let statusTimer = null;

  function sanitizeHex(val, fallback) {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    return fallback;
  }

  function showStatus(msg) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    statusEl.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 2800);
  }

  async function loadStored() {
    try {
      const localRes = await extApi?.storage?.local?.get?.(STORAGE_KEY);
      if (localRes && localRes[STORAGE_KEY]) return localRes[STORAGE_KEY];
    } catch (_) {}
    try {
      const syncRes = await extApi?.storage?.sync?.get?.(STORAGE_KEY);
      if (syncRes && syncRes[STORAGE_KEY]) return syncRes[STORAGE_KEY];
    } catch (_) {}
    return null;
  }

  async function persist(message) {
    try {
      await extApi?.storage?.local?.set?.({ [STORAGE_KEY]: current });
    } catch (_) {}
    try {
      await extApi?.storage?.sync?.set?.({ [STORAGE_KEY]: current });
    } catch (_) {}
    if (message) showStatus(message);
  }

  function syncPresetButtons() {
    presetButtonRefs.forEach((btn, id) => {
      const active = current.colorblindMode === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function syncColorControls() {
    const base = COLOR_PRESETS[current.colorblindMode] || COLOR_PRESETS.none;
    colorControlRefs.forEach((ref, key) => {
      const hex = sanitizeHex(current.colors?.[key], base[key]);
      ref.swatch.value = hex;
      ref.hexInput.value = hex.toUpperCase();
      ref.hexInput.classList.remove('is-invalid');
    });
  }

  function renderPresets() {
    const bar = document.getElementById('preset-bar');
    if (!bar) return;
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    presetButtonRefs.clear();

    PRESET_OPTIONS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.setAttribute('role', 'radio');

      const title = document.createElement('span');
      title.className = 'preset-title';
      title.textContent = preset.title;

      const desc = document.createElement('span');
      desc.className = 'preset-desc';
      desc.textContent = preset.desc;

      btn.appendChild(title);
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        current.colorblindMode = preset.id;
        current.colors = { ...COLOR_PRESETS[preset.id] };
        syncPresetButtons();
        syncColorControls();
        persist(`Applied "${preset.title}" palette.`);
      });

      bar.appendChild(btn);
      presetButtonRefs.set(preset.id, btn);
    });

    syncPresetButtons();
  }

  function renderColorGroups() {
    const container = document.getElementById('colors-groups');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    colorControlRefs.clear();

    COLOR_GROUPS.forEach((group) => {
      const groupWrap = document.createElement('div');
      const heading = document.createElement('h3');
      heading.className = 'color-group-title';
      heading.textContent = group.title;
      groupWrap.appendChild(heading);

      const cards = document.createElement('div');
      cards.className = 'color-cards';

      group.fields.forEach((field) => {
        const card = document.createElement('div');
        card.className = 'color-card';

        const info = document.createElement('div');
        info.className = 'color-card-info';

        const label = document.createElement('label');
        label.className = 'color-card-label';
        label.textContent = field.label;
        label.setAttribute('for', `hex-${field.key}`);

        const hint = document.createElement('span');
        hint.className = 'color-card-hint';
        hint.textContent = field.hint;

        info.appendChild(label);
        info.appendChild(hint);

        const controls = document.createElement('div');
        controls.className = 'color-card-controls';

        const swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'color-swatch';
        swatch.setAttribute('aria-label', `${field.label} color picker`);

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.id = `hex-${field.key}`;
        hexInput.className = 'hex-input';
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.autocomplete = 'off';

        swatch.addEventListener('input', () => {
          const next = sanitizeHex(swatch.value, COLOR_PRESETS.none[field.key]);
          current.colors[field.key] = next;
          hexInput.value = next.toUpperCase();
          hexInput.classList.remove('is-invalid');
          persist('Theme colors updated.');
        });

        hexInput.addEventListener('input', () => {
          let raw = hexInput.value.trim();
          if (raw && !raw.startsWith('#')) raw = `#${raw}`;
          if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
            const normalized = raw.toLowerCase();
            current.colors[field.key] = normalized;
            swatch.value = normalized;
            hexInput.classList.remove('is-invalid');
            persist('Theme colors updated.');
          } else {
            hexInput.classList.add('is-invalid');
          }
        });

        hexInput.addEventListener('blur', () => {
          const fallback = COLOR_PRESETS[current.colorblindMode]?.[field.key] || COLOR_PRESETS.none[field.key];
          const clean = sanitizeHex(current.colors[field.key], fallback);
          hexInput.value = clean.toUpperCase();
          swatch.value = clean;
          hexInput.classList.remove('is-invalid');
        });

        controls.appendChild(swatch);
        controls.appendChild(hexInput);
        card.appendChild(info);
        card.appendChild(controls);
        cards.appendChild(card);

        colorControlRefs.set(field.key, { swatch, hexInput });
      });

      groupWrap.appendChild(cards);
      container.appendChild(groupWrap);
    });

    syncColorControls();
  }

  function renderSelectors() {
    const grid = document.getElementById('selectors-grid');
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    selectorInputRefs.clear();

    Object.entries(current.selectors || {}).forEach(([k, v]) => {
      const box = document.createElement('div');
      box.className = 'field';
      const label = document.createElement('label');
      label.textContent = k;
      label.setAttribute('for', `sel-${k}`);
      const input = document.createElement('input');
      input.id = `sel-${k}`;
      input.value = String(v);
      input.addEventListener('input', () => {
        current.selectors[k] = input.value;
      });
      box.appendChild(label);
      box.appendChild(input);
      grid.appendChild(box);
      selectorInputRefs.set(k, input);
    });
  }

  async function init() {
    const saved = await loadStored();
    if (saved && typeof saved === 'object') {
      const mode = COLOR_PRESETS[saved.colorblindMode] ? saved.colorblindMode : 'none';
      const baseColors = COLOR_PRESETS[mode];
      const mergedColors = { ...baseColors };
      if (saved.colors && typeof saved.colors === 'object') {
        Object.keys(baseColors).forEach((k) => {
          mergedColors[k] = sanitizeHex(saved.colors[k], baseColors[k]);
        });
      }
      current = {
        ...saved,
        colorblindMode: mode,
        colors: mergedColors,
        selectors: { ...DEFAULT_SELECTORS, ...(saved.selectors || {}) },
      };
    }

    renderPresets();
    renderColorGroups();
    renderSelectors();

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      current.colorblindMode = 'none';
      current.colors = { ...COLOR_PRESETS.none };
      syncPresetButtons();
      syncColorControls();
      persist('Theme colors reset to Standard defaults.');
    });

    document.getElementById('btn-reset-selectors')?.addEventListener('click', () => {
      current.selectors = { ...DEFAULT_SELECTORS };
      selectorInputRefs.forEach((input, key) => {
        input.value = DEFAULT_SELECTORS[key] || '';
      });
      persist('DOM selectors reset to defaults.');
    });

    document.getElementById('btn-save')?.addEventListener('click', () => {
      persist('All settings saved.');
    });
  }

  init();
})();
