import { useEffect, useState } from 'react';
import { AlertTriangle, Check, RotateCcw } from 'lucide-react';
import {
  COLOR_GROUPS,
  COLOR_PRESETS,
  COLORBLIND_OPTIONS,
  DEFAULT_UPKEEP_CONFIG,
  SELECTOR_LABELS,
  sanitizeHex,
} from '../extension/defaults';
import type { ColorblindMode, DomSelectorConfig, UpkeepColors, UpkeepConfig } from '../extension/types';

interface ConfigViewProps {
  config: UpkeepConfig;
  onChange: (next: UpkeepConfig) => void;
}

function isValidCssSelector(selector: string): boolean {
  if (!selector.trim()) return false;
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

const ALL_COLOR_FIELDS = COLOR_GROUPS.flatMap((g) => g.fields);

export function ConfigView({ config, onChange }: ConfigViewProps) {
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [hexDrafts, setHexDrafts] = useState<Record<keyof UpkeepColors, string>>(() => ({
    ...config.colors,
  }));

  useEffect(() => {
    setHexDrafts({ ...config.colors });
  }, [config.colors]);

  function flashNotice(message: string) {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(null), 2600);
  }

  function updateField<K extends keyof UpkeepConfig>(key: K, value: UpkeepConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  function applyColorblindPreset(mode: ColorblindMode) {
    onChange({
      ...config,
      colorblindMode: mode,
      colors: { ...COLOR_PRESETS[mode] },
    });
    const presetMeta = COLORBLIND_OPTIONS.find((p) => p.id === mode);
    flashNotice(`Palette « ${presetMeta?.title ?? mode} » appliquée.`);
  }

  function updateColor(key: keyof UpkeepColors, hex: string) {
    const clean = sanitizeHex(hex, COLOR_PRESETS[config.colorblindMode][key]);
    onChange({
      ...config,
      colors: {
        ...config.colors,
        [key]: clean,
      },
    });
  }

  function handleHexInputChange(key: keyof UpkeepColors, rawValue: string) {
    setHexDrafts((prev) => ({ ...prev, [key]: rawValue }));
    let candidate = rawValue.trim();
    if (candidate && !candidate.startsWith('#')) candidate = `#${candidate}`;
    if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
      updateColor(key, candidate);
    }
  }

  function handleHexBlur(key: keyof UpkeepColors) {
    setHexDrafts((prev) => ({ ...prev, [key]: config.colors[key].toUpperCase() }));
  }

  function resetColorsOnly() {
    onChange({
      ...config,
      colorblindMode: 'none',
      colors: { ...COLOR_PRESETS.none },
    });
    flashNotice('Couleurs réinitialisées (Standard).');
  }

  function updateSelector(key: keyof DomSelectorConfig, value: string) {
    onChange({
      ...config,
      selectors: {
        ...config.selectors,
        [key]: value,
      },
    });
  }

  function handleReset() {
    onChange(structuredClone(DEFAULT_UPKEEP_CONFIG));
    flashNotice('Configuration par défaut restaurée.');
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    flashNotice('JSON de configuration copié dans le presse-papiers.');
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(242,238,230,0.09)] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2EEE6]">
            Couleurs, daltonisme &amp; adaptateur DOM Endstep
          </h1>
          <p className="mt-1.5 text-sm text-[#9CA3B2] max-w-2xl">
            Personnalisez chaque couleur en hexadécimal (battlefields par tour, phase active, stops,
            PV, barre de ciblage) ou activez un preset daltonien. Tout est synchronisé en direct avec
            le simulateur.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3FA372]">
              <Check className="w-3.5 h-3.5" />
              {savedNotice}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopyJson}
            className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] rounded-none bg-[#151922] hover:bg-[#1C222E] text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60 transition-colors whitespace-nowrap cursor-pointer"
          >
            Copier JSON
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] rounded-none bg-[#151922] hover:bg-[#1C222E] text-[#9CA3B2] hover:text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[rgba(242,238,230,0.3)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Faithful Toolbar Popup Preview + Dimensions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Interactive Miniature Chrome/Firefox Toolbar Popup (mirrors extension/src/popup/popup.html) */}
          <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
                Popup de la barre d’outils (interactif)
              </h2>
              <p className="text-xs text-[#9CA3B2] mt-1">
                Rendu fidèle du popup Chrome / Firefox avec interrupteur ON/OFF, mode daltonien et
                sélecteurs de couleurs rapides.
              </p>
            </div>

            <div className="max-w-[344px] mx-auto rounded-none border border-[rgba(242,238,230,0.18)] bg-[#0B0E14] overflow-hidden shadow-lg">
              {/* Popup Header */}
              <div className="flex items-center justify-between px-3.5 py-3 bg-[#141A26] border-b border-[rgba(242,238,230,0.09)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-none bg-[#0E1116] border border-[#C9A45C] flex items-center justify-center font-display text-xs font-bold text-[#F2EEE6]">
                    U
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#F4F6FA] leading-tight">Upkeep</div>
                    <div
                      className={`text-[10.5px] font-semibold leading-tight ${
                        config.enabled ? 'text-[#4CB782]' : 'text-[#E06C75]'
                      }`}
                    >
                      {config.enabled ? 'Active on endstep.cc' : 'Disabled'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.enabled}
                  onClick={() => updateField('enabled', !config.enabled)}
                  className={`relative w-10 h-5 rounded-none border transition-colors cursor-pointer ${
                    config.enabled
                      ? 'bg-[#C9A45C]/25 border-[#C9A45C]'
                      : 'bg-[#1D2534] border-[rgba(242,238,230,0.18)]'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-3.5 h-3.5 rounded-none transition-all ${
                      config.enabled ? 'left-[22px] bg-[#C9A45C]' : 'left-[2px] bg-[#7E889C]'
                    }`}
                  />
                </button>
              </div>

              {!config.enabled && (
                <div className="px-3.5 py-2 bg-[#E06C75]/12 border-b border-[#E06C75]/25 text-[11px] text-[#F0A4AA]">
                  Upkeep is disabled — original Endstep UI is active.
                </div>
              )}

              {/* Popup Feature Switches + Quick Colors */}
              <div
                className={`p-3.5 space-y-2 text-xs transition-opacity ${
                  config.enabled ? 'opacity-100' : 'opacity-45 pointer-events-none'
                }`}
              >
                <div className="text-[10px] font-bold tracking-wider uppercase text-[#8490A3]">
                  Layout &amp; Panels
                </div>
                {(
                  [
                    ['showMidlineTimeline', 'Horizontal Phase Timeline (midline)'],
                    ['alwaysShowOpponentGraveyard', 'Dual Graveyards in right rail (Opp + You)'],
                    ['autoOpenLogsLeft', 'Auto-open & dock Game Log (left rail)'],
                    ['hideActionToasts', 'Hide right-side action notifications'],
                    ['anchorStackTopLeft', 'Anchor "The Stack" at top-left of board'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 cursor-pointer text-[#E4E8F0]"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(config[key])}
                      onChange={(e) => updateField(key, e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#C9A45C] cursor-pointer"
                    />
                  </label>
                ))}

                <div className="pt-2 border-t border-[rgba(242,238,230,0.08)] text-[10px] font-bold tracking-wider uppercase text-[#8490A3]">
                  Readability
                </div>
                {(
                  [
                    ['highContrastHud', 'High-legibility Player Plates'],
                    ['enableHoverZoom', 'Card hover zoom in Graveyards'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 cursor-pointer text-[#E4E8F0]"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(config[key])}
                      onChange={(e) => updateField(key, e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#C9A45C] cursor-pointer"
                    />
                  </label>
                ))}

                <div className="pt-2 border-t border-[rgba(242,238,230,0.08)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-[#8490A3]">
                      Colors &amp; Colorblind
                    </span>
                    <button
                      type="button"
                      onClick={resetColorsOnly}
                      className="px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider rounded-none bg-[#141A26] border border-[rgba(244,246,250,0.14)] text-[#BCC5D4] hover:border-[#C9A45C] hover:text-[#E6C67E] cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  <label className="flex items-center justify-between gap-2 text-[11.5px] text-[#E4E8F0]">
                    <span>Colorblind preset</span>
                    <select
                      value={config.colorblindMode}
                      onChange={(e) => applyColorblindPreset(e.target.value as ColorblindMode)}
                      className="w-[172px] px-2 py-1 rounded-none bg-[#141A26] border border-[rgba(244,246,250,0.16)] text-[11px] font-semibold text-[#F4F6FA] focus:outline-none focus:border-[#C9A45C]"
                    >
                      <option value="none">Standard</option>
                      <option value="deuteranopia">Deuteranopia / Protanopia</option>
                      <option value="tritanopia">Tritanopia</option>
                      <option value="high-contrast">High Contrast</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-3 gap-1">
                    {ALL_COLOR_FIELDS.map((field) => (
                      <label
                        key={field.key}
                        title={field.label}
                        className="flex items-center gap-1.5 p-1 rounded-none bg-[#141A26] border border-[rgba(244,246,250,0.11)] hover:border-[#C9A45C]/60 cursor-pointer min-w-0"
                      >
                        <input
                          type="color"
                          value={config.colors[field.key]}
                          onChange={(e) => updateColor(field.key, e.target.value)}
                          className="w-5 h-5 p-0 border border-white/25 rounded-none bg-transparent cursor-pointer shrink-0"
                        />
                        <span className="flex flex-col min-w-0 leading-tight">
                          <span className="text-[9px] font-bold text-[#E4E8F0] truncate">
                            {field.short}
                          </span>
                          <span className="font-mono-tabular text-[8.5px] text-[#8490A3] uppercase">
                            {config.colors[field.key]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 bg-[#141A26] border-t border-[rgba(242,238,230,0.09)] space-y-2">
                <div className="text-[10px] text-[#8490A3] text-center">
                  Shortcuts: <span className="text-[#C9A45C] font-bold">U</span> On/Off ·{' '}
                  <span className="text-[#C9A45C] font-bold">G</span> Graveyards ·{' '}
                  <span className="text-[#C9A45C] font-bold">L</span> Logs
                </div>
                <div className="w-full py-1.5 text-center rounded-none border border-[#C9A45C]/45 bg-[#C9A45C]/12 text-[#E6C67E] text-[10.5px] font-bold uppercase tracking-[0.05em]">
                  Colors &amp; DOM Settings
                </div>
              </div>
            </div>
          </div>

          {/* Rail Dimensions */}
          <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
              Dimensions des rails
            </h2>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#9CA3B2]">Largeur du rail gauche (Logs &amp; Decision)</span>
                <span className="font-mono-tabular text-[#C9A45C]">{config.logsWidth}px</span>
              </div>
              <input
                type="range"
                min={230}
                max={340}
                step={4}
                value={config.logsWidth}
                onChange={(e) => updateField('logsWidth', Number(e.target.value))}
                className="w-full accent-[#C9A45C]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#9CA3B2]">Largeur du rail droit (Double cimetière)</span>
                <span className="font-mono-tabular text-[#C9A45C]">{config.graveyardWidth}px</span>
              </div>
              <input
                type="range"
                min={220}
                max={340}
                step={4}
                value={config.graveyardWidth}
                onChange={(e) => updateField('graveyardWidth', Number(e.target.value))}
                className="w-full accent-[#C9A45C]"
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Theme Colors & Colorblind Mode + Endstep DOM Selector Editor */}
        <div className="lg:col-span-7 space-y-6">
          {/* Theme Colors & Colorblind Presets */}
          <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[rgba(242,238,230,0.08)]">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
                  Couleurs du thème &amp; Mode daltonien
                </h2>
                <p className="mt-1 text-xs text-[#9CA3B2] leading-relaxed">
                  Sélectionnez un preset accessible ou saisissez n’importe quelle couleur
                  hexadécimale <span className="font-mono-tabular text-[#DFBD78]">#RRGGBB</span>{' '}
                  (identique à la page Options de l’extension).
                </p>
              </div>
              <button
                type="button"
                onClick={resetColorsOnly}
                className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] rounded-none bg-[#0E1116] hover:bg-[#1B2230] text-[#BCC5D4] hover:text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C] transition-colors cursor-pointer"
              >
                Reset couleurs
              </button>
            </div>

            {/* 4 Colorblind Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Mode daltonien">
              {COLORBLIND_OPTIONS.map((preset) => {
                const active = config.colorblindMode === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => applyColorblindPreset(preset.id)}
                    className={`p-3 rounded-none border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#C9A45C]/12 border-[#C9A45C]'
                        : 'bg-[#0E1116] border-[rgba(242,238,230,0.12)] hover:border-[#C9A45C]/50'
                    }`}
                  >
                    <div
                      className={`text-xs font-bold ${
                        active ? 'text-[#F2D58B]' : 'text-[#F2EEE6]'
                      }`}
                    >
                      {preset.title}
                    </div>
                    <div className="text-[11px] text-[#8F9BB0] mt-0.5">{preset.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Grouped Color Pickers + Hex Inputs */}
            <div className="space-y-5">
              {COLOR_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#C9A45C]">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.fields.map((field) => {
                      const draft = hexDrafts[field.key] ?? config.colors[field.key];
                      const normalizedDraft = draft.trim().startsWith('#')
                        ? draft.trim()
                        : `#${draft.trim()}`;
                      const isHexValid = /^#[0-9a-fA-F]{6}$/.test(normalizedDraft);
                      return (
                        <div
                          key={field.key}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-none bg-[#0E1116] border border-[rgba(242,238,230,0.1)]"
                        >
                          <div className="min-w-0">
                            <label
                              htmlFor={`color-hex-${field.key}`}
                              className="block text-xs font-semibold text-[#F2EEE6] truncate"
                            >
                              {field.label}
                            </label>
                            <span className="block text-[10.5px] text-[#7E889C] leading-snug">
                              {field.hint}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="color"
                              aria-label={field.label}
                              value={config.colors[field.key]}
                              onChange={(e) => updateColor(field.key, e.target.value)}
                              className="w-8 h-7 p-0 border border-white/25 rounded-none bg-transparent cursor-pointer"
                            />
                            <input
                              id={`color-hex-${field.key}`}
                              type="text"
                              maxLength={7}
                              spellCheck={false}
                              value={draft.toUpperCase()}
                              onChange={(e) => handleHexInputChange(field.key, e.target.value)}
                              onBlur={() => handleHexBlur(field.key)}
                              className={`w-[80px] px-2 py-1 rounded-none bg-[#151922] font-mono-tabular text-xs uppercase border focus:outline-none ${
                                isHexValid
                                  ? 'border-[rgba(242,238,230,0.18)] text-[#F2EEE6] focus:border-[#C9A45C]'
                                  : 'border-[#E06C75] text-[#F0A4AA]'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resilient Endstep DOM Selector Editor */}
          <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 space-y-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
                Sélecteurs CSS Endstep (fallback multi-sélecteurs)
              </h2>
              <p className="mt-1 text-xs text-[#9CA3B2] leading-relaxed">
                Si <span className="font-mono-tabular text-[#D8D3C9]">endstep.cc</span> modifie ses
                attributs HTML, mettez à jour ces sélecteurs ici ou depuis la page d’options de
                l’extension.
              </p>
            </div>

            <div className="space-y-4">
              {(Object.keys(config.selectors) as (keyof DomSelectorConfig)[]).map((key) => {
                const value = config.selectors[key];
                const valid = isValidCssSelector(value);
                const meta = SELECTOR_LABELS[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`selector-${key}`}
                        className="text-xs font-semibold text-[#F2EEE6]"
                      >
                        {meta.label}
                      </label>
                      <span className="text-[11px] text-[#6C7486]">{meta.hint}</span>
                    </div>
                    <input
                      id={`selector-${key}`}
                      type="text"
                      value={value}
                      onChange={(e) => updateSelector(key, e.target.value)}
                      className={`w-full rounded-none bg-[#0E1116] px-3 py-2 font-mono-tabular text-xs text-[#F2EEE6] border focus:outline-none ${
                        valid
                          ? 'border-[rgba(242,238,230,0.14)] focus:border-[#C9A45C]'
                          : 'border-[#D9534F] focus:border-[#D9534F]'
                      }`}
                    />
                    {!valid && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] text-[#D9534F]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Sélecteur CSS invalide — corrigez la syntaxe avant de packager.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
