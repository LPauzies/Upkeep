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
      undoButton: '#e5484d',
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
      undoButton: '#d55e00',
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
      undoButton: '#ff4d6d',
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
      undoButton: '#ff5a5f',
    },
  };

  const QUICK_COLOR_FIELDS = [
    { key: 'bfSelfMyTurn', label: 'You (Your Turn)', title: 'Your battlefield on your turn', group: 'bf' },
    { key: 'bfOppMyTurn', label: 'Opp (Your Turn)', title: 'Opponent battlefield on your turn', group: 'bf' },
    { key: 'bfSelfOppTurn', label: 'You (Opp Turn)', title: 'Your battlefield on opponent turn', group: 'bf' },
    { key: 'bfOppOppTurn', label: 'Opp (Opp Turn)', title: 'Opponent battlefield on opponent turn', group: 'bf' },
    { key: 'phaseCurrent', label: 'Active Step', title: 'Top & bottom pointer arrows on current step', group: 'accent' },
    { key: 'phaseStopMine', label: 'Your Stops', title: 'Bottom bar on phase steps for your turn stops (your side)', group: 'accent' },
    { key: 'phaseStopOpp', label: 'Opp Stops', title: 'Top bar on phase steps for opponent turn stops (opponent side)', group: 'accent' },
    { key: 'lifeNormal', label: 'Life (>5 PV)', title: 'Life total outside red zone (> 5 PV)', group: 'accent' },
    { key: 'targetBar', label: 'Target Bar', title: 'Target counter & prompt highlight', group: 'accent' },
    { key: 'undoButton', label: 'Undo Button', title: 'Undo button color in Decision box (default red)', group: 'accent' },
  ];

  const SWATCH_PALETTES = {
    bf: [
      '#080a0f',
      '#0d1119',
      '#182030',
      '#1c2940',
      '#102030',
      '#122620',
      '#221d11',
      '#2a1d14',
      '#241419',
      '#1d1530',
    ],
    accent: [
      '#e5484d',
      '#d6ab56',
      '#f5d076',
      '#6ea8f0',
      '#4cb782',
      '#f4f6fa',
      '#cc79a7',
      '#ff99c8',
      '#00c2b2',
      '#ffd166',
    ],
  };

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
    battlefieldStyle: 'solid',
    battlefieldTexture: true,
    colors: { ...COLOR_PRESETS.none },
  };

  let current = { ...DEFAULTS, colors: { ...COLOR_PRESETS.none } };
  const swatchRefs = new Map();
  let activeColorKey = null;
  let editorHsv = { h: 0, s: 0.5, v: 0.5 };

  function sanitizeHex(val, fallback) {
    if (typeof val !== 'string') return fallback;
    let trimmed = val.trim();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) trimmed = `#${trimmed}`;
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    return fallback;
  }

  function hexToHsv(hex) {
    const clean = sanitizeHex(hex, '#182030').slice(1);
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  function hsvToHex(h, s, v) {
    const hh = ((h % 360) + 360) % 360;
    const ss = Math.max(0, Math.min(1, s));
    const vv = Math.max(0, Math.min(1, v));
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hh < 60) [r, g, b] = [c, x, 0];
    else if (hh < 120) [r, g, b] = [x, c, 0];
    else if (hh < 180) [r, g, b] = [0, c, x];
    else if (hh < 240) [r, g, b] = [0, x, c];
    else if (hh < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function getActivePresetPalette() {
    const presetKey = COLOR_PRESETS[current.colorblindMode] ? current.colorblindMode : 'none';
    return COLOR_PRESETS[presetKey];
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

  function syncEditorVisuals(updateHexInput) {
    if (!activeColorKey) return;
    const svPad = document.getElementById('color-sv-pad');
    const svThumb = document.getElementById('color-sv-thumb');
    const hueThumb = document.getElementById('color-hue-thumb');
    const preview = document.getElementById('color-editor-preview');
    const hexInput = document.getElementById('color-editor-hex');

    const hex = hsvToHex(editorHsv.h, editorHsv.s, editorHsv.v);
    if (svPad) svPad.style.backgroundColor = hsvToHex(editorHsv.h, 1, 1);
    if (svThumb) {
      svThumb.style.left = `${(editorHsv.s * 100).toFixed(2)}%`;
      svThumb.style.top = `${((1 - editorHsv.v) * 100).toFixed(2)}%`;
    }
    if (hueThumb) {
      hueThumb.style.left = `${((editorHsv.h / 360) * 100).toFixed(2)}%`;
    }
    if (preview) preview.style.backgroundColor = hex;
    if (updateHexInput && hexInput && document.activeElement !== hexInput) {
      hexInput.value = hex.toUpperCase();
    }
  }

  function applyColorValue(key, hex, syncHexField) {
    const fallbackPalette = getActivePresetPalette();
    const clean = sanitizeHex(hex, fallbackPalette[key] || COLOR_PRESETS.none[key]);
    current.colors = { ...current.colors, [key]: clean };
    const ref = swatchRefs.get(key);
    if (ref) {
      ref.swatch.style.backgroundColor = clean;
      ref.hexLabel.textContent = clean.toUpperCase();
    }
    if (activeColorKey === key) {
      syncEditorVisuals(syncHexField !== false);
    }
    save();
  }

  function closeColorEditor() {
    activeColorKey = null;
    const editor = document.getElementById('popup-color-editor');
    if (editor) editor.hidden = true;
    swatchRefs.forEach(({ button }) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function openColorEditor(key) {
    if (activeColorKey === key) {
      closeColorEditor();
      return;
    }

    const field = QUICK_COLOR_FIELDS.find((f) => f.key === key);
    const editor = document.getElementById('popup-color-editor');
    const titleEl = document.getElementById('color-editor-title');
    const swatchesEl = document.getElementById('color-editor-swatches');
    const hexInput = document.getElementById('color-editor-hex');
    if (!field || !editor) return;

    activeColorKey = key;
    const fallbackPalette = getActivePresetPalette();
    const hex = sanitizeHex(current.colors?.[key], fallbackPalette[key]);
    editorHsv = hexToHsv(hex);

    if (titleEl) titleEl.textContent = field.title;

    if (swatchesEl) {
      while (swatchesEl.firstChild) swatchesEl.removeChild(swatchesEl.firstChild);
      const list = SWATCH_PALETTES[field.group] || SWATCH_PALETTES.accent;
      list.forEach((swHex) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'color-quick-swatch';
        btn.style.backgroundColor = swHex;
        btn.title = swHex.toUpperCase();
        btn.setAttribute('aria-label', `Select ${swHex.toUpperCase()}`);
        btn.addEventListener('click', () => {
          editorHsv = hexToHsv(swHex);
          applyColorValue(key, swHex, true);
          if (hexInput) hexInput.value = swHex.toUpperCase();
        });
        swatchesEl.appendChild(btn);
      });
    }

    swatchRefs.forEach(({ button }, k) => {
      const isSelected = k === key;
      button.classList.toggle('is-active', isSelected);
      button.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
    });

    editor.hidden = false;
    if (hexInput) hexInput.value = hex.toUpperCase();
    syncEditorVisuals(true);
    editor.scrollIntoView({ block: 'nearest' });
  }

  function syncColorGridUi() {
    const fallbackPalette = getActivePresetPalette();
    QUICK_COLOR_FIELDS.forEach(({ key }) => {
      const ref = swatchRefs.get(key);
      if (!ref) return;
      const hex = sanitizeHex(current.colors?.[key], fallbackPalette[key]);
      ref.swatch.style.backgroundColor = hex;
      ref.hexLabel.textContent = hex.toUpperCase();
    });
    if (activeColorKey) {
      const hex = sanitizeHex(current.colors?.[activeColorKey], fallbackPalette[activeColorKey]);
      editorHsv = hexToHsv(hex);
      const hexInput = document.getElementById('color-editor-hex');
      if (hexInput) hexInput.value = hex.toUpperCase();
      syncEditorVisuals(true);
    }
  }

  function renderColorGrid() {
    const grid = document.getElementById('popup-colors-grid');
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    swatchRefs.clear();

    QUICK_COLOR_FIELDS.forEach(({ key, label, title }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'color-chip';
      chip.title = title;
      chip.setAttribute('aria-expanded', 'false');

      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      const meta = document.createElement('span');
      meta.className = 'color-chip-meta';

      const nameEl = document.createElement('span');
      nameEl.className = 'color-chip-name';
      nameEl.textContent = label;

      const hexEl = document.createElement('span');
      hexEl.className = 'color-chip-hex';

      chip.addEventListener('click', () => openColorEditor(key));

      meta.appendChild(nameEl);
      meta.appendChild(hexEl);
      chip.appendChild(swatch);
      chip.appendChild(meta);
      grid.appendChild(chip);

      swatchRefs.set(key, { button: chip, swatch, hexLabel: hexEl });
    });

    syncColorGridUi();
  }

  function setupColorEditorEvents() {
    const svPad = document.getElementById('color-sv-pad');
    const hueBar = document.getElementById('color-hue-bar');
    const hexInput = document.getElementById('color-editor-hex');
    const resetBtn = document.getElementById('color-editor-reset');
    const closeBtn = document.getElementById('color-editor-close');

    if (svPad) {
      const updateFromPointer = (e) => {
        if (!activeColorKey) return;
        const rect = svPad.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        editorHsv = { h: editorHsv.h, s, v };
        const nextHex = hsvToHex(editorHsv.h, s, v);
        if (hexInput) hexInput.value = nextHex.toUpperCase();
        applyColorValue(activeColorKey, nextHex, true);
      };

      svPad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        svPad.setPointerCapture?.(e.pointerId);
        updateFromPointer(e);
      });
      svPad.addEventListener('pointermove', (e) => {
        if (e.buttons === 1 || svPad.hasPointerCapture?.(e.pointerId)) {
          updateFromPointer(e);
        }
      });
    }

    if (hueBar) {
      const updateHueFromPointer = (e) => {
        if (!activeColorKey) return;
        const rect = hueBar.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const h = ratio >= 1 ? 359.5 : ratio * 360;
        editorHsv = { h, s: editorHsv.s, v: editorHsv.v };
        const nextHex = hsvToHex(editorHsv.h, editorHsv.s, editorHsv.v);
        if (hexInput) hexInput.value = nextHex.toUpperCase();
        applyColorValue(activeColorKey, nextHex, true);
      };

      hueBar.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        hueBar.setPointerCapture?.(e.pointerId);
        updateHueFromPointer(e);
      });
      hueBar.addEventListener('pointermove', (e) => {
        if (e.buttons === 1 || hueBar.hasPointerCapture?.(e.pointerId)) {
          updateHueFromPointer(e);
        }
      });
    }

    if (hexInput) {
      hexInput.addEventListener('input', () => {
        if (!activeColorKey) return;
        const raw = hexInput.value.trim();
        const normalized = raw.startsWith('#') ? raw : `#${raw}`;
        if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
          editorHsv = hexToHsv(normalized);
          applyColorValue(activeColorKey, normalized, false);
        }
      });
      hexInput.addEventListener('blur', () => {
        if (!activeColorKey) return;
        const fallbackPalette = getActivePresetPalette();
        const safe = sanitizeHex(current.colors?.[activeColorKey], fallbackPalette[activeColorKey]);
        hexInput.value = safe.toUpperCase();
      });
    }

    resetBtn?.addEventListener('click', () => {
      if (!activeColorKey) return;
      const fallbackPalette = getActivePresetPalette();
      const defHex = fallbackPalette[activeColorKey];
      editorHsv = hexToHsv(defHex);
      if (hexInput) hexInput.value = defHex.toUpperCase();
      applyColorValue(activeColorKey, defHex, true);
    });

    closeBtn?.addEventListener('click', closeColorEditor);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeColorKey) {
        e.preventDefault();
        e.stopPropagation();
        closeColorEditor();
      }
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
        ...DEFAULTS,
        ...saved,
        colorblindMode: mode,
        battlefieldStyle: saved.battlefieldStyle === 'gradient' ? 'gradient' : 'solid',
        battlefieldTexture: saved.battlefieldTexture !== false,
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
    bindCheck('toggle-bf-texture', 'battlefieldTexture');

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

    const bfStyleSelect = document.getElementById('select-bf-style');
    if (bfStyleSelect) {
      bfStyleSelect.value = current.battlefieldStyle === 'gradient' ? 'gradient' : 'solid';
      bfStyleSelect.addEventListener('change', () => {
        current.battlefieldStyle = bfStyleSelect.value === 'gradient' ? 'gradient' : 'solid';
        save();
      });
    }

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      current.colorblindMode = 'none';
      current.battlefieldStyle = 'solid';
      current.battlefieldTexture = true;
      current.colors = { ...COLOR_PRESETS.none };
      if (colorblindSelect) colorblindSelect.value = 'none';
      if (bfStyleSelect) bfStyleSelect.value = 'solid';
      const bfTextureInput = document.getElementById('toggle-bf-texture');
      if (bfTextureInput) bfTextureInput.checked = true;
      syncColorGridUi();
      save();
    });

    setupColorEditorEvents();
    renderColorGrid();
    updateEnabledUi();

    document.getElementById('btn-options')?.addEventListener('click', () => {
      extApi?.runtime?.openOptionsPage?.();
    });
  }

  init();
})();
