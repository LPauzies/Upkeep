import { useEffect, useState } from 'react';
import { ConfigView } from './components/ConfigView';
import { EndstepSimulator } from './components/EndstepSimulator';
import { PackageView } from './components/PackageView';
import { DEFAULT_UPKEEP_CONFIG } from './extension/defaults';
import { downloadExtensionPackage } from './extension/packager';
import type { UpkeepConfig } from './extension/types';

type ActiveTab = 'simulator' | 'config' | 'package';

const LOCAL_STORAGE_KEY = 'upkeep_studio_config_v2';

function loadInitialConfig(): UpkeepConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_UPKEEP_CONFIG);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_UPKEEP_CONFIG,
      ...parsed,
      shortcuts: { ...DEFAULT_UPKEEP_CONFIG.shortcuts, ...(parsed.shortcuts || {}) },
      selectors: { ...DEFAULT_UPKEEP_CONFIG.selectors, ...(parsed.selectors || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_UPKEEP_CONFIG);
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [config, setConfig] = useState<UpkeepConfig>(loadInitialConfig);
  const [quickDownloading, setQuickDownloading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
  }, [config]);

  async function handleQuickDownload() {
    if (activeTab !== 'package') {
      setActiveTab('package');
      return;
    }
    setQuickDownloading(true);
    try {
      await downloadExtensionPackage('repo', config);
    } finally {
      setQuickDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E1116] text-[#F2EEE6] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#0E1116]/95 backdrop-blur-md border-b border-[rgba(242,238,230,0.09)]">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className="font-display text-xl font-bold tracking-tight text-[#F2EEE6] hover:text-[#C9A45C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upkeep
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="flex items-center gap-7 text-sm font-medium" aria-label="Navigation principale">
            {(
              [
                ['simulator', 'Aperçu injection'],
                ['config', 'Sélecteurs DOM'],
                ['package', 'Packaging & CI'],
              ] as const
            ).map(([tab, label]) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                    isActive
                      ? 'text-[#F2EEE6] border-[#C9A45C]'
                      : 'text-[#9CA3B2] border-transparent hover:text-[#F2EEE6]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="shrink-0">
            <button
              type="button"
              disabled={quickDownloading}
              onClick={handleQuickDownload}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A45C] hover:bg-[#DFBD78] text-[#0E1116] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            >
              {quickDownloading
                ? 'Export...'
                : activeTab === 'package'
                ? 'Exporter le dépôt'
                : 'Packager Chrome / Firefox'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container (Full 1440px Presence) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'simulator' && <EndstepSimulator config={config} />}
        {activeTab === 'config' && <ConfigView config={config} onChange={setConfig} />}
        {activeTab === 'package' && <PackageView config={config} />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[rgba(242,238,230,0.08)] mt-8">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6C7486]">
          <span>Upkeep · Extension Manifest V3 pour endstep.cc (Chrome &amp; Firefox)</span>
          <a
            href="https://github.com/LPauzies/Upkeep"
            target="_blank"
            rel="noreferrer"
            className="text-[#9CA3B2] hover:text-[#C9A45C] transition-colors"
          >
            github.com/LPauzies/Upkeep
          </a>
        </div>
      </footer>
    </div>
  );
}
