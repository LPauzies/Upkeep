(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';
  let current = {
    enabled: true,
    autoOpenLogsLeft: true,
    alwaysShowOpponentGraveyard: true,
    highContrastHud: true,
    enableHoverZoom: true,
    logsWidth: 278,
    graveyardWidth: 268,
  };

  async function save() {
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
  }

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      current = { ...current, ...stored[STORAGE_KEY] };
    }

    const bindCheck = (id, key) => {
      const el = document.getElementById(id);
      el.checked = Boolean(current[key]);
      el.addEventListener('change', () => {
        current[key] = el.checked;
        save();
      });
    };

    bindCheck('toggle-enabled', 'enabled');
    bindCheck('toggle-logs', 'autoOpenLogsLeft');
    bindCheck('toggle-gy', 'alwaysShowOpponentGraveyard');
    bindCheck('toggle-hud', 'highContrastHud');
    bindCheck('toggle-zoom', 'enableHoverZoom');

    const rLogs = document.getElementById('range-logs');
    const vLogs = document.getElementById('val-logs-width');
    rLogs.value = String(current.logsWidth);
    vLogs.textContent = `${current.logsWidth}px`;
    rLogs.addEventListener('input', () => {
      current.logsWidth = Number(rLogs.value);
      vLogs.textContent = `${current.logsWidth}px`;
      save();
    });

    const rGy = document.getElementById('range-gy');
    const vGy = document.getElementById('val-gy-width');
    rGy.value = String(current.graveyardWidth);
    vGy.textContent = `${current.graveyardWidth}px`;
    rGy.addEventListener('input', () => {
      current.graveyardWidth = Number(rGy.value);
      vGy.textContent = `${current.graveyardWidth}px`;
      save();
    });

    document.getElementById('btn-options').addEventListener('click', () => {
      extApi.runtime.openOptionsPage();
    });
  }

  init();
})();
