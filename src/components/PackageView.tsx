import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, GitBranch, Package } from 'lucide-react';
import {
  auditStoreCompliance,
  downloadExtensionPackage,
  type PackageTarget,
} from '../extension/packager';
import { getAllGeneratedFiles } from '../extension/templates';
import type { UpkeepConfig } from '../extension/types';

interface PackageViewProps {
  config: UpkeepConfig;
}

export function PackageView({ config }: PackageViewProps) {
  const files = useMemo(() => getAllGeneratedFiles(config), [config]);
  const compliance = useMemo(() => auditStoreCompliance(config), [config]);
  const [selectedPath, setSelectedPath] = useState<string>(files[0].path);
  const [busyTarget, setBusyTarget] = useState<PackageTarget | null>(null);
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activeFile = files.find((f) => f.path === selectedPath) ?? files[0];

  async function handleDownload(target: PackageTarget) {
    setBusyTarget(target);
    try {
      const filename = await downloadExtensionPackage(target, config);
      setLastDownload(filename);
    } finally {
      setBusyTarget(null);
    }
  }

  function handleCopyFile() {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(242,238,230,0.09)] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2EEE6]">
            Packaging Chrome, Firefox &amp; CI / CD GitHub
          </h1>
          <p className="mt-1.5 text-sm text-[#9CA3B2] max-w-2xl">
            Archives Manifest V3 conformes Chrome Web Store et Mozilla AMO, builds CI-only (sans
            dossiers <span className="font-mono-tabular text-[#D8D3C9]">artifacts/</span> ni{' '}
            <span className="font-mono-tabular text-[#D8D3C9]">dist-extension/</span> committés) et
            CD manuelle indépendante sur{' '}
            <span className="font-mono-tabular text-[#D8D3C9]">github.com/LPauzies/Upkeep</span>.
          </p>
        </div>

        {lastDownload && (
          <div className="inline-flex items-center gap-2 text-xs text-[#3FA372] font-medium">
            <Check className="w-4 h-4" />
            <span>Archive générée : {lastDownload}</span>
          </div>
        )}
      </div>

      {/* 3 Store-Ready Download Targets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chrome Web Store */}
        <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F2EEE6]">
                Chrome Web Store
              </h2>
              <span className="font-mono-tabular text-xs text-[#C9A45C]">MV3</span>
            </div>
            <p className="text-xs text-[#9CA3B2] leading-relaxed">
              Archive prête pour upload sur le Chrome Web Store ou chargement local via{' '}
              <span className="font-mono-tabular text-[#D8D3C9]">chrome://extensions</span>.
            </p>
            <ul className="space-y-2 pt-2 border-t border-[rgba(242,238,230,0.07)]">
              {compliance.chrome.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-[#3FA372] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[#E8E3D9]">{item.label}</div>
                    <div className="text-[11px] text-[#7E8799]">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={busyTarget !== null}
            onClick={() => handleDownload('chrome')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-[#C9A45C] hover:bg-[#DFBD78] text-[#0E1116] border border-[#DFBD78]/60 text-[11px] font-bold uppercase tracking-[0.07em] transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{busyTarget === 'chrome' ? 'Génération...' : 'Télécharger ZIP Chrome'}</span>
          </button>
        </div>

        {/* Firefox AMO */}
        <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F2EEE6]">
                Firefox Add-ons (AMO)
              </h2>
              <span className="font-mono-tabular text-xs text-[#C9A45C]">MV3 · Gecko</span>
            </div>
            <p className="text-xs text-[#9CA3B2] leading-relaxed">
              Archive prête pour soumission Mozilla AMO (listed) ou test local via{' '}
              <span className="font-mono-tabular text-[#D8D3C9]">about:debugging</span>.
            </p>
            <ul className="space-y-2 pt-2 border-t border-[rgba(242,238,230,0.07)]">
              {compliance.firefox.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-[#3FA372] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[#E8E3D9]">{item.label}</div>
                    <div className="text-[11px] text-[#7E8799]">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={busyTarget !== null}
            onClick={() => handleDownload('firefox')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-[#1C222E] hover:bg-[#252D3D] text-[#F2EEE6] border border-[#C9A45C]/50 hover:border-[#C9A45C] text-[11px] font-bold uppercase tracking-[0.07em] transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Package className="w-4 h-4 text-[#C9A45C]" />
            <span>{busyTarget === 'firefox' ? 'Génération...' : 'Télécharger ZIP Firefox'}</span>
          </button>
        </div>

        {/* Complete Git Repository Bundle */}
        <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F2EEE6]">
                Dépôt LPauzies/Upkeep
              </h2>
              <span className="font-mono-tabular text-xs text-[#C9A45C]">CI / CD</span>
            </div>
            <p className="text-xs text-[#9CA3B2] leading-relaxed">
              Arborescence complète avec CI, CD indépendante manuelle/tag, script de build et
              templates d’issues GitHub.
            </p>
            <ul className="space-y-2 pt-2 border-t border-[rgba(242,238,230,0.07)] text-xs">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-[#3FA372] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[#E8E3D9]">CI sur main &amp; PR (ci.yml)</div>
                  <div className="text-[11px] text-[#7E8799]">
                    Build bi-cible + web-ext lint --warnings-as-errors
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-[#3FA372] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[#E8E3D9]">CD manuelle ou tag v* (release.yml)</div>
                  <div className="text-[11px] text-[#7E8799]">
                    workflow_dispatch (patch/minor/major) → GitHub Release
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-[#3FA372] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[#E8E3D9]">Templates d’issues GitHub</div>
                  <div className="text-[11px] text-[#7E8799]">
                    Formulaires Bug Report &amp; Feature Request prêts à l’emploi
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <button
            type="button"
            disabled={busyTarget !== null}
            onClick={() => handleDownload('repo')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-[#1C222E] hover:bg-[#252D3D] text-[#F2EEE6] border border-[rgba(242,238,230,0.18)] hover:border-[rgba(242,238,230,0.34)] text-[11px] font-bold uppercase tracking-[0.07em] transition-colors disabled:opacity-60 cursor-pointer"
          >
            <GitBranch className="w-4 h-4 text-[#C9A45C]" />
            <span>
              {busyTarget === 'repo' ? 'Génération...' : 'Télécharger le dépôt complet'}
            </span>
          </button>
        </div>
      </div>

      {/* GitHub Actions Workflows & Secrets Table */}
      <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#F2EEE6]">
            Pipeline CI / CD &amp; Secrets GitHub Actions
          </h2>
          <p className="text-xs text-[#9CA3B2] mt-1">
            La CD est totalement découplée des merges sur{' '}
            <span className="font-mono-tabular text-[#D8D3C9]">main</span> : lancez une release à la
            main depuis l’onglet <span className="font-mono-tabular text-[#D8D3C9]">Actions</span>{' '}
            ou en poussant un tag <span className="font-mono-tabular text-[#D8D3C9]">v*</span>.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[rgba(242,238,230,0.1)] text-[#9CA3B2]">
                <th className="py-2.5 pr-4 font-medium">Plateforme</th>
                <th className="py-2.5 pr-4 font-medium">Secrets requis (optionnels)</th>
                <th className="py-2.5 font-medium">Déclencheur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(242,238,230,0.06)]">
              <tr>
                <td className="py-3 pr-4 font-medium text-[#F2EEE6] whitespace-nowrap">
                  Chrome Web Store
                </td>
                <td className="py-3 pr-4 font-mono-tabular text-[#C9A45C]">
                  CHROME_EXTENSION_ID · CHROME_PUBLISHER_ID · CHROME_CLIENT_ID ·
                  CHROME_CLIENT_SECRET · CHROME_REFRESH_TOKEN
                </td>
                <td className="py-3 text-[#9CA3B2] whitespace-nowrap">
                  Manuel (<span className="font-mono-tabular text-[#D8D3C9]">workflow_dispatch</span>
                  ) ou tag <span className="font-mono-tabular text-[#D8D3C9]">v*</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-[#F2EEE6] whitespace-nowrap">
                  Firefox Add-ons (AMO)
                </td>
                <td className="py-3 pr-4 text-[#9CA3B2]">
                  Aucun secret requis — upload manuel du{' '}
                  <span className="font-mono-tabular text-[#D8D3C9]">upkeep-firefox-v*.zip</span>{' '}
                  depuis la GitHub Release
                </td>
                <td className="py-3 text-[#9CA3B2] whitespace-nowrap">
                  Validation <span className="font-mono-tabular text-[#D8D3C9]">web-ext lint</span>{' '}
                  auto en CI/CD
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Source Code & Workflow Inspector */}
      <div className="rounded-none border border-[rgba(242,238,230,0.12)] bg-[#151922] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[rgba(242,238,230,0.08)]">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 className="w-4 h-4 text-[#C9A45C] shrink-0" />
            <span className="font-mono-tabular text-xs font-semibold text-[#F2EEE6] truncate">
              {activeFile.path}
            </span>
            <span className="text-xs text-[#6C7486] hidden md:inline">·</span>
            <span className="text-xs text-[#9CA3B2] hidden md:inline truncate">
              {activeFile.description}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyFile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-[#1C222E] hover:bg-[#252D3D] text-[11px] font-bold uppercase tracking-[0.06em] text-[#F2EEE6] border border-[rgba(242,238,230,0.16)] hover:border-[#C9A45C]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#3FA372]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copié' : 'Copier'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[420px]">
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-[rgba(242,238,230,0.08)] bg-[#11151D] p-2 max-h-[480px] overflow-y-auto upkeep-scroll space-y-0.5">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full text-left px-3 py-2 rounded-none font-mono-tabular text-xs transition-colors truncate cursor-pointer border-l-2 ${
                  file.path === activeFile.path
                    ? 'bg-[#1F2634] text-[#C9A45C] border-[#C9A45C] font-medium'
                    : 'text-[#9CA3B2] border-transparent hover:text-[#F2EEE6] hover:bg-[#171C27]'
                }`}
              >
                {file.path}
              </button>
            ))}
          </div>

          <div className="lg:col-span-9 bg-[#0B0E13] max-h-[480px] overflow-auto upkeep-scroll p-5">
            <pre className="font-mono-tabular text-xs leading-relaxed text-[#DFDBD2] whitespace-pre">
              {activeFile.content}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
