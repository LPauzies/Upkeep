(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';

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
  };

  let current = { ...DEFAULTS };

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

  async function init() {
    const saved = await loadStored();
    if (saved && typeof saved === 'object') {
      current = { ...DEFAULTS, ...saved };
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

    updateEnabledUi();

    document.getElementById('btn-options')?.addEventListener('click', () => {
      extApi?.runtime?.openOptionsPage?.();
    });
  }

  init();
})();
