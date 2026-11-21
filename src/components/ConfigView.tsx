import { useState } from 'react';
import { AlertTriangle, Check, RotateCcw } from 'lucide-react';
import { DEFAULT_UPKEEP_CONFIG, SELECTOR_LABELS } from '../extension/defaults';
import type { DomSelectorConfig, UpkeepConfig } from '../extension/types';

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

export function ConfigView({ config, onChange }: ConfigViewProps) {
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  function updateField<K extends keyof UpkeepConfig>(key: K, value: UpkeepConfig[K]) {
    onChange({ ...config, [key]: value });
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
    setSavedNotice('Configuration par défaut restaurée.');
    window.setTimeout(() => setSavedNotice(null), 2600);
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setSavedNotice('JSON de configuration copié dans le presse-papiers.');
    window.setTimeout(() => setSavedNotice(null), 2600);
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(242,238,230,0.09)] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2EEE6]">
            Préférences &amp; adaptateur DOM Endstep
          </h1>
          <p className="mt-1.5 text-sm text-[#9CA3B2] max-w-2xl">
            Tous vos réglages sont synchronisés en direct avec le simulateur et injectés dans les
            archives Chrome et Firefox téléchargées.
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
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#151922] hover:bg-[#1C222E] text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] transition-colors whitespace-nowrap cursor-pointer"
          >
            Copier JSON
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#151922] hover:bg-[#1C222E] text-[#9CA3B2] hover:text-[#F2EEE6] border border-[rgba(242,238,230,0.12)] transition-colors whitespace-nowrap cursor-pointer"
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
          <div className="rounded-xl border border-[rgba(242,238,230,0.09)] bg-[#151922] p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
                Popup de la barre d’outils (interactif)
              </h2>
              <p className="text-xs text-[#9CA3B2] mt-1">
                Rendu fidèle du panneau Chrome / Firefox avec interrupteur principal ON/OFF et
                activation module par module.
              </p>
            </div>

            <div className="max-w-[320px] mx-auto rounded-lg border border-[rgba(242,238,230,0.16)] bg-[#0F131B] overflow-hidden shadow-lg">
              {/* Popup Header */}
              <div className="flex items-center justify-between px-3.5 py-3 bg-[#151B26] border-b border-[rgba(242,238,230,0.09)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-[5px] bg-[#0E1116] border border-[#C9A45C] flex items-center justify-center font-display text-xs font-bold text-[#F2EEE6]">
                    U
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#F4F6FA] leading-tight">Upkeep</div>
                    <div className="text-[10.5px] text-[#8E98AC] leading-tight">
                      {config.enabled ? 'Active on endstep.cc' : 'Paused — native Endstep UI'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.enabled}
                  onClick={() => updateField('enabled', !config.enabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                    config.enabled ? 'bg-[#C9A45C]' : 'bg-[#283142]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#0E1116] transition-transform ${
                      config.enabled ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {!config.enabled && (
                <div className="px-3.5 py-2 bg-[#C9A45C]/12 border-b border-[#C9A45C]/25 text-[11px] text-[#DFBD78]">
                  Upkeep is disabled — original Endstep UI is active.
                </div>
              )}

              {/* Popup Feature Switches */}
              <div
                className={`p-3.5 space-y-2.5 text-xs transition-opacity ${
                  config.enabled ? 'opacity-100' : 'opacity-45'
                }`}
              >
                <div className="text-[10px] font-bold tracking-wider uppercase text-[#7E889C]">
                  Layout &amp; Panels
                </div>
                {(
                  [
                    ['showMidlineTimeline', 'Horizontal Phase Timeline (midline)'],
                    ['alwaysShowOpponentGraveyard', 'Dual Graveyards (2-card grid)'],
                    ['autoOpenLogsLeft', 'Fixed Game Log & Decision (left rail)'],
                    ['hideActionToasts', 'Hide right-side action notifications'],
                    ['anchorStackTopLeft', 'Anchor "The Stack" at top-left'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 cursor-pointer text-[#D4DCE9]"
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

                <div className="pt-2 border-t border-[rgba(242,238,230,0.08)] text-[10px] font-bold tracking-wider uppercase text-[#7E889C]">
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
                    className="flex items-center justify-between gap-3 cursor-pointer text-[#D4DCE9]"
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
              </div>

              <div className="px-3.5 py-2.5 bg-[#121721] border-t border-[rgba(242,238,230,0.08)] flex items-center justify-between text-[10.5px] text-[#8E98AC]">
                <span>Shortcuts: U · G · L</span>
                <span className="font-mono-tabular text-[#C9A45C]">v{config.version}</span>
              </div>
            </div>
          </div>

          {/* Rail Dimensions */}
          <div className="rounded-xl border border-[rgba(242,238,230,0.09)] bg-[#151922] p-6 space-y-4">
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

        {/* RIGHT COLUMN: Resilient Endstep DOM Selector Editor */}
        <div className="lg:col-span-7 rounded-xl border border-[rgba(242,238,230,0.09)] bg-[#151922] p-6 space-y-5">
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
                    className={`w-full rounded-md bg-[#0E1116] px-3 py-2 font-mono-tabular text-xs text-[#F2EEE6] border focus:outline-none ${
                      valid
                        ? 'border-[rgba(242,238,230,0.12)] focus:border-[#C9A45C]'
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
    </section>
  );
}
