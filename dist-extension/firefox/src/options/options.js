(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';
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
  let current = { selectors: { ...DEFAULT_SELECTORS } };

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

  async function init() {
    const saved = await loadStored();
    if (saved) {
      current = {
        ...saved,
        selectors: { ...DEFAULT_SELECTORS, ...(saved.selectors || {}) },
      };
    }

    const grid = document.getElementById('selectors-grid');
    Object.entries(current.selectors || {}).forEach(([k, v]) => {
      const box = document.createElement('div');
      box.className = 'field';
      const label = document.createElement('label');
      label.textContent = k;
      const input = document.createElement('input');
      input.value = String(v);
      input.addEventListener('input', () => {
        current.selectors[k] = input.value;
      });
      box.appendChild(label);
      box.appendChild(input);
      grid.appendChild(box);
    });

    document.getElementById('btn-save').addEventListener('click', async () => {
      try {
        await extApi?.storage?.local?.set?.({ [STORAGE_KEY]: current });
      } catch (_) {}
      try {
        await extApi?.storage?.sync?.set?.({ [STORAGE_KEY]: current });
      } catch (_) {}
      document.getElementById('status').textContent = 'Selectors saved.';
    });
  }

  init();
})();
