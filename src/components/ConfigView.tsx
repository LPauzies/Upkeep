import { useState } from 'react';
import { Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { DEFAULT_UPKEEP_CONFIG, SELECTOR_LABELS } from '../extension/defaults';
import type { DensityMode, DomSelectorConfig, UpkeepConfig } from '../extension/types';

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
            Tous vos réglages sont directement injectés dans le simulateur ainsi que dans les
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
        {/* LEFT COLUMN: Layout Preferences + Live Browser Popup Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-[rgba(242,238,230,0.09)] bg-[#151922] p-6 space-y-5">
            <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
              Comportement en partie
            </h2>

            <div className="space-y-3.5 text-sm">
              {(
                [
                  ['autoOpenLogsLeft', 'Ouvrir les logs à gauche au démarrage'],
                  ['alwaysShowOpponentGraveyard', 'Afficher le cimetière adverse en continu'],
                  ['highContrastHud', 'HUD agrandi PV / Deck / Main'],
                  ['showExtendedCounters', 'Afficher le compteur Exil'],
                  ['enableHoverZoom', 'Activer le zoom carte au survol'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-4 cursor-pointer text-[#D8D3C9]"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={(e) => updateField(key, e.target.checked)}
                    className="w-4 h-4 accent-[#C9A45C] cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <div className="pt-4 border-t border-[rgba(242,238,230,0.08)] space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[#9CA3B2]">Largeur du rail logs (gauche)</span>
                  <span className="font-mono-tabular text-[#C9A45C]">{config.logsWidth}px</span>
                </div>
                <input
                  type="range"
                  min={210}
                  max={340}
                  step={4}
                  value={config.logsWidth}
                  onChange={(e) => updateField('logsWidth', Number(e.target.value))}
                  className="w-full accent-[#C9A45C]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[#9CA3B2]">Largeur du cimetière adverse (droite)</span>
                  <span className="font-mono-tabular text-[#C9A45C]">{config.graveyardWidth}px</span>
                </div>
                <input
                  type="range"
                  min={220}
                  max={350}
                  step={4}
                  value={config.graveyardWidth}
                  onChange={(e) => updateField('graveyardWidth', Number(e.target.value))}
                  className="w-full accent-[#C9A45C]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9CA3B2]">Densité de la liste du cimetière</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0E1116]">
                  {(
                    [
                      ['compact', 'Compacte'],
                      ['balanced', 'Équilibrée'],
                      ['spacious', 'Aérée'],
                    ] as [DensityMode, string][]
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateField('density', mode)}
                      className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        config.density === mode
                          ? 'bg-[#1C222E] text-[#C9A45C]'
                          : 'text-[#9CA3B2] hover:text-[#F2EEE6]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Miniature Chrome/Firefox Toolbar Popup Preview */}
          <div className="rounded-xl border border-[rgba(242,238,230,0.09)] bg-[#151922] p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
                Aperçu du popup navigateur
              </h2>
              <p className="text-xs text-[#9CA3B2] mt-1">
                Rendu fidèle du panneau qui s’ouvre depuis la barre d’outils Chrome ou Firefox.
              </p>
            </div>

            <div className="max-w-[312px] mx-auto rounded-lg border border-[rgba(242,238,230,0.15)] bg-[#0E1116] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-[#151922] border-b border-[rgba(242,238,230,0.09)]">
                <span className="font-display font-bold text-sm text-[#F2EEE6]">Upkeep</span>
                <label className="inline-flex items-center gap-2 text-xs text-[#9CA3B2] cursor-pointer">
                  <span>{config.enabled ? 'Actif' : 'Pause'}</span>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => updateField('enabled', e.target.checked)}
                    className="accent-[#C9A45C]"
                  />
                </label>
              </div>
              <div className="p-4 space-y-2.5 text-xs">
                <div className="flex justify-between text-[#D8D3C9]">
                  <span>Logs à gauche</span>
                  <span className="font-mono-tabular text-[#C9A45C]">
                    {config.autoOpenLogsLeft ? `${config.logsWidth}px` : 'Désactivé'}
                  </span>
                </div>
                <div className="flex justify-between text-[#D8D3C9]">
                  <span>Cimetière adverse</span>
                  <span className="font-mono-tabular text-[#C9A45C]">
                    {config.alwaysShowOpponentGraveyard ? `${config.graveyardWidth}px` : 'Masqué'}
                  </span>
                </div>
                <div className="pt-2 border-t border-[rgba(242,238,230,0.08)] flex justify-between text-[11px] text-[#9CA3B2]">
                  <span>Version manifeste</span>
                  <span className="font-mono-tabular">v{config.version}</span>
                </div>
              </div>
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
              classes HTML, mettez à jour ces sélecteurs ici ou utilisez le bouton « Cibler
              cimetière » intégré au popup de l’extension.
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
