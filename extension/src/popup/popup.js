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

  const QUICK_COLOR_FIELDS = [
    { key: 'bfSelfMyTurn', label: 'You (Your T)', title: 'Your battlefield on your turn' },
    { key: 'bfOppMyTurn', label: 'Opp (Your T)', title: 'Opponent battlefield on your turn' },
    { key: 'bfSelfOppTurn', label: 'You (Opp T)', title: 'Your battlefield on opponent turn' },
    { key: 'bfOppOppTurn', label: 'Opp (Opp T)', title: 'Opponent battlefield on opponent turn' },
    { key: 'phaseCurrent', label: 'Active Step', title: 'Top & bottom pointer arrows on current step' },
    { key: 'phaseStopMine', label: 'Your Stops', title: 'Your turn phase stop marker' },
    { key: 'phaseStopOpp', label: 'Opp Stops', title: 'Opponent turn phase stop marker' },
    { key: 'lifeNormal', label: 'Life (>5)', title: 'Life total outside red zone (> 5 PV)' },
    { key: 'targetBar', label: 'Target Bar', title: 'Target counter & prompt highlight' },
  ];

  const DEFAULTS = {
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
    colorblindMode: 'none',
    colors: { ...COLOR_PRESETS.none },
  };

  let current = { ...DEFAULTS, colors: { ...COLOR_PRESETS.none } };
  const swatchRefs = new Map();

  function sanitizeHex(val, fallback) {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    return fallback;
  }

  async function loadStored() {
    try {
      const localRes = await extApi?.storage?.local?.get?.(STORAGE_KEY);
      if (localRes && localRes[STORAGE_KEY]) {
        return localRes[STORAGE_KEY];
      }
    } catch (_) {}

    try {
      const syncRes = await extApi?.storage?.sync?.get?.(STORAGE_KEY);
      if (syncRes && syncRes[STORAGE_KEY]) {
        return syncRes[STORAGE_KEY];
      }
    } catch (_) {}

    return null;
  }

  async function save() {
    try {
      await extApi?.storage?.local?.set?.({ [STORAGE_KEY]: current });
    } catch (_) {}
    try {
      await extApi?.storage?.sync?.set?.({ [STORAGE_KEY]: current });
    } catch (_) {}
  }

  function updateEnabledUi() {
    const isEnabled = Boolean(current.enabled);
    document.body.dataset.enabled = isEnabled ? 'true' : 'false';
    const statusText = document.getElementById('status-text');
    const banner = document.getElementById('disabled-banner');
    if (statusText) {
      statusText.textContent = isEnabled ? 'Active on endstep.cc' : 'Disabled';
    }
    if (banner) {
      banner.hidden = isEnabled;
    }
  }

  function syncColorGridUi() {
    const presetKey = COLOR_PRESETS[current.colorblindMode] ? current.colorblindMode : 'none';
    const fallbackPalette = COLOR_PRESETS[presetKey];
    QUICK_COLOR_FIELDS.forEach(({ key }) => {
      const ref = swatchRefs.get(key);
      if (!ref) return;
      const hex = sanitizeHex(current.colors?.[key], fallbackPalette[key]);
      ref.input.value = hex;
      ref.hexLabel.textContent = hex.toUpperCase();
    });
  }

  function renderColorGrid() {
    const grid = document.getElementById('popup-colors-grid');
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    swatchRefs.clear();

    QUICK_COLOR_FIELDS.forEach(({ key, label, title }) => {
      const chip = document.createElement('label');
      chip.className = 'color-chip';
      chip.title = title;

      const input = document.createElement('input');
      input.type = 'color';
      input.setAttribute('aria-label', title);

      const meta = document.createElement('span');
      meta.className = 'color-chip-meta';

      const nameEl = document.createElement('span');
      nameEl.className = 'color-chip-name';
      nameEl.textContent = label;

      const hexEl = document.createElement('span');
      hexEl.className = 'color-chip-hex';

      input.addEventListener('input', () => {
        const nextHex = sanitizeHex(input.value, COLOR_PRESETS.none[key]);
        current.colors = { ...current.colors, [key]: nextHex };
        hexEl.textContent = nextHex.toUpperCase();
        save();
      });

      meta.appendChild(nameEl);
      meta.appendChild(hexEl);
      chip.appendChild(input);
      chip.appendChild(meta);
      grid.appendChild(chip);

      swatchRefs.set(key, { input, hexLabel: hexEl });
    });

    syncColorGridUi();
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
        ...DEFAULTS,
        ...saved,
        colorblindMode: mode,
        colors: mergedColors,
      };
    }

    const bindCheck = (id, key, onAfterChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = Boolean(current[key]);
      el.addEventListener('change', () => {
        current[key] = el.checked;
        if (onAfterChange) onAfterChange();
        save();
      });
    };

    bindCheck('toggle-enabled', 'enabled', updateEnabledUi);
    bindCheck('toggle-timeline', 'showMidlineTimeline');
    bindCheck('toggle-gy', 'alwaysShowOpponentGraveyard');
    bindCheck('toggle-logs', 'autoOpenLogsLeft');
    bindCheck('toggle-toasts', 'hideActionToasts');
    bindCheck('toggle-stack', 'anchorStackTopLeft');
    bindCheck('toggle-hud', 'highContrastHud');
    bindCheck('toggle-zoom', 'enableHoverZoom');

    const colorblindSelect = document.getElementById('select-colorblind');
    if (colorblindSelect) {
      colorblindSelect.value = current.colorblindMode;
      colorblindSelect.addEventListener('change', () => {
        const nextMode = COLOR_PRESETS[colorblindSelect.value] ? colorblindSelect.value : 'none';
        current.colorblindMode = nextMode;
        current.colors = { ...COLOR_PRESETS[nextMode] };
        syncColorGridUi();
        save();
      });
    }

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      current.colorblindMode = 'none';
      current.colors = { ...COLOR_PRESETS.none };
      if (colorblindSelect) colorblindSelect.value = 'none';
      syncColorGridUi();
      save();
    });

    renderColorGrid();
    updateEnabledUi();

    document.getElementById('btn-options')?.addEventListener('click', () => {
      extApi?.runtime?.openOptionsPage?.();
    });
  }

  init();
})();
