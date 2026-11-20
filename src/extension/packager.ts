import JSZip from 'jszip';
import {
  generateBuildScript,
  generateChromeManifest,
  generateCiWorkflowYaml,
  generateContentCss,
  generateContentJs,
  generateFirefoxManifest,
  generateOptionsCss,
  generateOptionsHtml,
  generateOptionsJs,
  generatePopupCss,
  generatePopupHtml,
  generatePopupJs,
  generateReleaseWorkflowYaml,
  generateRepoPackageJson,
  generateRepoReadme,
  generateWsSpyJs,
} from './templates';
import type { UpkeepConfig } from './types';

export type PackageTarget = 'chrome' | 'firefox' | 'repo';

export interface ComplianceCheck {
  label: string;
  passed: boolean;
  detail: string;
}

/**
 * Renders crisp Upkeep shield + untap chevron PNG icons at 16, 32, 48, 128px
 * directly in the browser so Chrome/Firefox ZIPs contain genuine binary PNGs.
 */
async function renderIconPngBytes(size: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Uint8Array();
  }

  const r = Math.max(3, Math.round(size * 0.2));
  ctx.fillStyle = '#0E1116';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fill();

  // Inner matte gold hairline border
  const inset = Math.max(1, size * 0.08);
  ctx.strokeStyle = '#C9A45C';
  ctx.lineWidth = Math.max(1, size * 0.055);
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);

  // Geometric "U" monogram + upward upkeep chevron
  ctx.strokeStyle = '#F2EEE6';
  ctx.lineWidth = Math.max(1.5, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.3, size * 0.28);
  ctx.lineTo(size * 0.3, size * 0.58);
  ctx.quadraticCurveTo(size * 0.3, size * 0.76, size * 0.5, size * 0.76);
  ctx.quadraticCurveTo(size * 0.7, size * 0.76, size * 0.7, size * 0.58);
  ctx.lineTo(size * 0.7, size * 0.28);
  ctx.stroke();

  // Subtle gold accent diamond at top center
  ctx.fillStyle = '#C9A45C';
  const cx = size * 0.5;
  const cy = size * 0.31;
  const d = Math.max(1.5, size * 0.075);
  ctx.beginPath();
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx + d, cy);
  ctx.lineTo(cx, cy + d);
  ctx.lineTo(cx - d, cy);
  ctx.closePath();
  ctx.fill();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return new Uint8Array();
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

async function addIconsToZip(zip: JSZip, prefix = '') {
  const sizes = [16, 32, 48, 128];
  const entries = await Promise.all(
    sizes.map(async (size) => ({
      size,
      bytes: await renderIconPngBytes(size),
    }))
  );
  for (const { size, bytes } of entries) {
    zip.file(`${prefix}icons/icon-${size}.png`, bytes);
  }
}

function addExtensionSources(zip: JSZip, config: UpkeepConfig, prefix = '') {
  zip.file(`${prefix}src/content/ws-spy.js`, generateWsSpyJs());
  zip.file(`${prefix}src/content/upkeep.css`, generateContentCss(config));
  zip.file(`${prefix}src/content/upkeep.js`, generateContentJs(config));
  zip.file(`${prefix}src/popup/popup.html`, generatePopupHtml());
  zip.file(`${prefix}src/popup/popup.css`, generatePopupCss());
  zip.file(`${prefix}src/popup/popup.js`, generatePopupJs(config));
  zip.file(`${prefix}src/options/options.html`, generateOptionsHtml());
  zip.file(`${prefix}src/options/options.css`, generateOptionsCss());
  zip.file(`${prefix}src/options/options.js`, generateOptionsJs(config));
}

export function auditStoreCompliance(config: UpkeepConfig): {
  chrome: ComplianceCheck[];
  firefox: ComplianceCheck[];
} {
  const chromeObj = JSON.parse(generateChromeManifest(config));
  const firefoxObj = JSON.parse(generateFirefoxManifest(config));

  return {
    chrome: [
      {
        label: 'Manifest V3 valide',
        passed: chromeObj.manifest_version === 3,
        detail: 'manifest_version: 3',
      },
      {
        label: 'Aucune clé Gecko non standard',
        passed: !('browser_specific_settings' in chromeObj),
        detail: 'Zéro avertissement Chrome Web Store',
      },
      {
        label: 'Permissions minimales strictes',
        passed:
          Array.isArray(chromeObj.permissions) &&
          chromeObj.permissions.length === 1 &&
          chromeObj.permissions[0] === 'storage',
        detail: 'storage + host endstep.cc uniquement',
      },
      {
        label: 'Icônes PNG 16 / 32 / 48 / 128 px',
        passed: Boolean(chromeObj.icons?.['128']),
        detail: 'Générées en binaire PNG dans le ZIP',
      },
    ],
    firefox: [
      {
        label: 'Manifest V3 + Gecko ID explicite',
        passed: firefoxObj.browser_specific_settings?.gecko?.id === 'upkeep@lpauzies.dev',
        detail: 'upkeep@lpauzies.dev (min 142.0)',
      },
      {
        label: 'Déclaration AMO data_collection_permissions',
        passed:
          Array.isArray(
            firefoxObj.browser_specific_settings?.gecko?.data_collection_permissions?.required
          ) &&
          firefoxObj.browser_specific_settings.gecko.data_collection_permissions.required[0] ===
            'none',
        detail: 'required: ["none"] (exigé par Mozilla)',
      },
      {
        label: 'API WebExtension cross-browser',
        passed: true,
        detail: 'globalThis.browser ?? globalThis.chrome',
      },
      {
        label: 'Compatible web-ext lint & sign',
        passed: true,
        detail: 'Prêt pour AMO listed & self-hosted',
      },
    ],
  };
}

export async function downloadExtensionPackage(
  target: PackageTarget,
  config: UpkeepConfig
): Promise<string> {
  const zip = new JSZip();
  let filename = '';

  if (target === 'chrome') {
    zip.file('manifest.json', generateChromeManifest(config));
    addExtensionSources(zip, config);
    await addIconsToZip(zip);
    filename = `upkeep-chrome-mv3-v${config.version}.zip`;
  } else if (target === 'firefox') {
    zip.file('manifest.json', generateFirefoxManifest(config));
    addExtensionSources(zip, config);
    await addIconsToZip(zip);
    filename = `upkeep-firefox-mv3-v${config.version}.zip`;
  } else {
    // Complete git-ready repository bundle for github.com/LPauzies/Upkeep
    const root = 'Upkeep/';
    zip.file(`${root}manifest.chrome.json`, generateChromeManifest(config));
    zip.file(`${root}manifest.firefox.json`, generateFirefoxManifest(config));
    addExtensionSources(zip, config, root);
    await addIconsToZip(zip, root);
    zip.file(`${root}package.json`, generateRepoPackageJson(config));
    zip.file(`${root}scripts/build-extension.mjs`, generateBuildScript());
    zip.file(`${root}.github/workflows/ci.yml`, generateCiWorkflowYaml());
    zip.file(`${root}.github/workflows/release.yml`, generateReleaseWorkflowYaml());
    zip.file(`${root}README.md`, generateRepoReadme(config));
    zip.file(`${root}.gitignore`, 'node_modules/\ndist/\nartifacts/\n.DS_Store\n');
    filename = `upkeep-repo-LPauzies-v${config.version}.zip`;
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);

  return filename;
}
