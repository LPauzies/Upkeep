(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v1';
  let current = { selectors: {} };

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) current = stored[STORAGE_KEY];

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
      await extApi.storage.sync.set({ [STORAGE_KEY]: current });
      document.getElementById('status').textContent = 'Sélecteurs enregistrés.';
    });
  }

  init();
})();
