import type { UpkeepConfig } from './types';
import rawWsSpyJs from '../../extension/src/content/ws-spy.js?raw';
import rawUpkeepCss from '../../extension/src/content/upkeep.css?raw';
import rawUpkeepJs from '../../extension/src/content/upkeep.js?raw';

export interface GeneratedRepoFile {
  path: string;
  content: string;
  language: 'json' | 'js' | 'css' | 'html' | 'yaml' | 'md';
  category: 'chrome' | 'firefox' | 'extension' | 'ci' | 'repo';
  description: string;
}

export function generateChromeManifest(config: UpkeepConfig): string {
  const manifest = {
    manifest_version: 3,
    name: 'Upkeep',
    short_name: 'Upkeep',
    version: config.version,
    description:
      "Refonte ergonomique de endstep.cc en partie : cimetière adverse en continu, compteurs PV/Deck/Main haute lisibilité et journal ouvert à gauche.",
    homepage_url: 'https://github.com/LPauzies/Upkeep',
    permissions: ['storage'],
    host_permissions: ['https://endstep.cc/*'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_title: 'Upkeep — Options Endstep',
      default_popup: 'src/popup/popup.html',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
    options_ui: {
      page: 'src/options/options.html',
      open_in_tab: true,
    },
    content_scripts: [
      {
        matches: ['https://endstep.cc/*'],
        js: ['src/content/ws-spy.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
      {
        matches: ['https://endstep.cc/*'],
        css: ['src/content/upkeep.css'],
        js: ['src/content/upkeep.js'],
        run_at: 'document_idle',
      },
    ],
  };
  return JSON.stringify(manifest, null, 2) + '\n';
}

export function generateFirefoxManifest(config: UpkeepConfig): string {
  const base = JSON.parse(generateChromeManifest(config));
  const firefoxManifest = {
    ...base,
    browser_specific_settings: {
      gecko: {
        id: 'upkeep@lpauzies.dev',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  };
  return JSON.stringify(firefoxManifest, null, 2) + '\n';
}

export function generateWsSpyJs(): string {
  return rawWsSpyJs;
}

export function generateContentCss(config: UpkeepConfig): string {
  return rawUpkeepCss.replace(
    /width: var\(--upkeep-gy-width, 268px\);/,
    `width: var(--upkeep-gy-width, ${config.graveyardWidth}px);`
  );
}

export function generateContentJs(config: UpkeepConfig): string {
  const injectedConfig = JSON.stringify(
    {
      enabled: config.enabled,
      autoOpenLogsLeft: config.autoOpenLogsLeft,
      alwaysShowOpponentGraveyard: config.alwaysShowOpponentGraveyard,
      highContrastHud: config.highContrastHud,
      enableHoverZoom: config.enableHoverZoom,
      logsWidth: config.logsWidth,
      graveyardWidth: config.graveyardWidth,
      shortcuts: config.shortcuts,
      selectors: config.selectors,
    },
    null,
    2
  );
  return rawUpkeepJs.replace(
    /const DEFAULT_CONFIG = \{[\s\S]*?\n  \};/,
    `const DEFAULT_CONFIG = ${injectedConfig};`
  );
}


export function generatePopupHtml(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Upkeep</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header class="header">
      <div class="brand">Upkeep</div>
      <label class="switch">
        <input type="checkbox" id="toggle-enabled" />
        <span class="slider"></span>
      </label>
    </header>

    <main class="content">
      <section class="group">
        <label class="row">
          <span>Logs ouverts à gauche au démarrage</span>
          <input type="checkbox" id="toggle-logs" />
        </label>
        <label class="row">
          <span>Cimetière adverse en continu</span>
          <input type="checkbox" id="toggle-gy" />
        </label>
        <label class="row">
          <span>HUD PV / Deck / Main agrandi</span>
          <input type="checkbox" id="toggle-hud" />
        </label>
        <label class="row">
          <span>Zoom carte au survol</span>
          <input type="checkbox" id="toggle-zoom" />
        </label>
      </section>

      <section class="group">
        <div class="slider-row">
          <div class="slider-meta">
            <span>Largeur logs (gauche)</span>
            <span class="mono" id="val-logs-width">264px</span>
          </div>
          <input type="range" id="range-logs" min="210" max="340" step="4" />
        </div>
        <div class="slider-row">
          <div class="slider-meta">
            <span>Largeur cimetière (droite)</span>
            <span class="mono" id="val-gy-width">276px</span>
          </div>
          <input type="range" id="range-gy" min="220" max="350" step="4" />
        </div>
      </section>

      <div class="shortcuts">
        <span>Raccourcis sur Endstep :</span>
        <span class="mono">L Logs · G Cimetière · U Thème</span>
      </div>
    </main>

    <footer class="footer">
      <button type="button" id="btn-pick-gy" class="btn-secondary">Cibler cimetière</button>
      <button type="button" id="btn-options" class="btn-primary">Sélecteurs DOM</button>
    </footer>

    <script src="popup.js"></script>
  </body>
</html>
`;
}

export function generatePopupCss(): string {
  return `body {
  width: 312px;
  margin: 0;
  background: #0E1116;
  color: #F2EEE6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.09);
  background: #151922;
}

.brand {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.content {
  padding: 12px 16px;
}

.group {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.08);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  color: #E2DDD3;
  cursor: pointer;
}

.slider-row {
  padding: 6px 0;
}

.slider-meta {
  display: flex;
  justify-content: space-between;
  color: #9CA3B2;
  font-size: 12px;
  margin-bottom: 4px;
}

input[type="range"] {
  width: 100%;
  accent-color: #C9A45C;
}

input[type="checkbox"] {
  accent-color: #C9A45C;
  width: 15px;
  height: 15px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  color: #C9A45C;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #9CA3B2;
}

.footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(242, 238, 230, 0.09);
  background: #151922;
}

button {
  flex: 1;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: #C9A45C;
  color: #0E1116;
}

.btn-secondary {
  background: #1C222E;
  color: #F2EEE6;
  border-color: rgba(242, 238, 230, 0.14);
}
`;
}

export function generatePopupJs(config: UpkeepConfig): string {
  return `(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';
  const DEFAULTS = ${JSON.stringify(config, null, 2)};

  let current = structuredClone(DEFAULTS);

  async function save() {
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
  }

  function bindUI() {
    const elEnabled = document.getElementById('toggle-enabled');
    const elLogs = document.getElementById('toggle-logs');
    const elGy = document.getElementById('toggle-gy');
    const elHud = document.getElementById('toggle-hud');
    const elZoom = document.getElementById('toggle-zoom');
    const rangeLogs = document.getElementById('range-logs');
    const rangeGy = document.getElementById('range-gy');
    const valLogs = document.getElementById('val-logs-width');
    const valGy = document.getElementById('val-gy-width');

    elEnabled.checked = current.enabled;
    elLogs.checked = current.autoOpenLogsLeft;
    elGy.checked = current.alwaysShowOpponentGraveyard;
    elHud.checked = current.highContrastHud;
    elZoom.checked = current.enableHoverZoom;
    rangeLogs.value = String(current.logsWidth);
    rangeGy.value = String(current.graveyardWidth);
    valLogs.textContent = current.logsWidth + 'px';
    valGy.textContent = current.graveyardWidth + 'px';

    elEnabled.addEventListener('change', () => { current.enabled = elEnabled.checked; save(); });
    elLogs.addEventListener('change', () => { current.autoOpenLogsLeft = elLogs.checked; save(); });
    elGy.addEventListener('change', () => { current.alwaysShowOpponentGraveyard = elGy.checked; save(); });
    elHud.addEventListener('change', () => { current.highContrastHud = elHud.checked; save(); });
    elZoom.addEventListener('change', () => { current.enableHoverZoom = elZoom.checked; save(); });

    rangeLogs.addEventListener('input', () => {
      current.logsWidth = Number(rangeLogs.value);
      valLogs.textContent = current.logsWidth + 'px';
      save();
    });

    rangeGy.addEventListener('input', () => {
      current.graveyardWidth = Number(rangeGy.value);
      valGy.textContent = current.graveyardWidth + 'px';
      save();
    });

    document.getElementById('btn-options').addEventListener('click', () => {
      extApi.runtime.openOptionsPage();
    });

    document.getElementById('btn-pick-gy').addEventListener('click', async () => {
      const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        extApi.tabs.sendMessage(tab.id, { type: 'UPKEEP_PICK_SELECTOR', key: 'opponentGraveyardZone' });
        window.close();
      }
    });
  }

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      current = { ...DEFAULTS, ...stored[STORAGE_KEY] };
    }
    bindUI();
  }

  init();
})();
`;
}

export function generateOptionsHtml(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Upkeep — Sélecteurs DOM &amp; Préférences</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <h1>Upkeep — Adaptateur DOM Endstep</h1>
          <p>Ajustez les sélecteurs CSS si endstep.cc met à jour sa structure HTML.</p>
        </div>
        <div class="actions">
          <button type="button" id="btn-reset" class="btn-secondary">Réinitialiser</button>
          <button type="button" id="btn-save" class="btn-primary">Enregistrer</button>
        </div>
      </header>
      <div id="status" class="status" aria-live="polite"></div>
      <div id="selectors-grid" class="grid"></div>
    </div>
    <script src="options.js"></script>
  </body>
</html>
`;
}

export function generateOptionsCss(): string {
  return `body {
  margin: 0;
  background: #0E1116;
  color: #F2EEE6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.shell {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(242, 238, 230, 0.1);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

p {
  margin: 0;
  color: #9CA3B2;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 10px;
}

button {
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: #C9A45C;
  color: #0E1116;
}

.btn-secondary {
  background: #151922;
  color: #F2EEE6;
  border-color: rgba(242, 238, 230, 0.16);
}

.status {
  min-height: 22px;
  margin: 14px 0;
  font-size: 13px;
  color: #3FA372;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.field {
  background: #151922;
  border: 1px solid rgba(242, 238, 230, 0.09);
  border-radius: 10px;
  padding: 14px 16px;
}

.field label {
  display: block;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  box-sizing: border-box;
  background: #0E1116;
  color: #F2EEE6;
  border: 1px solid rgba(242, 238, 230, 0.14);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
`;
}

export function generateOptionsJs(config: UpkeepConfig): string {
  return `(() => {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'upkeep_config_v2';
  const DEFAULTS = ${JSON.stringify(config, null, 2)};

  let current = structuredClone(DEFAULTS);

  function render() {
    const grid = document.getElementById('selectors-grid');
    grid.innerHTML = '';
    Object.entries(current.selectors).forEach(([key, value]) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const label = document.createElement('label');
      label.setAttribute('for', 'sel-' + key);
      label.textContent = key;
      const input = document.createElement('input');
      input.id = 'sel-' + key;
      input.value = value;
      input.addEventListener('input', () => {
        current.selectors[key] = input.value;
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
  }

  document.getElementById('btn-save').addEventListener('click', async () => {
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
    document.getElementById('status').textContent = 'Sélecteurs enregistrés et synchronisés.';
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    current = structuredClone(DEFAULTS);
    await extApi.storage.sync.set({ [STORAGE_KEY]: current });
    render();
    document.getElementById('status').textContent = 'Valeurs par défaut restaurées.';
  });

  async function init() {
    const stored = await extApi.storage.sync.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      current = {
        ...DEFAULTS,
        ...stored[STORAGE_KEY],
        selectors: { ...DEFAULTS.selectors, ...(stored[STORAGE_KEY].selectors || {}) },
      };
    }
    render();
  }

  init();
})();
`;
}

export function generateBuildScript(): string {
  return `#!/usr/bin/env node
/**
 * Upkeep — Dual-Target Extension Build & Packager (Chrome MV3 + Firefox MV3)
 * Usage:
 *   node scripts/build-extension.mjs --target=all
 *   node scripts/build-extension.mjs --target=chrome
 *   node scripts/build-extension.mjs --target=firefox
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const argTarget = process.argv.find((a) => a.startsWith('--target='));
const requested = argTarget ? argTarget.split('=')[1] : 'all';
const targets = requested === 'all' ? ['chrome', 'firefox'] : [requested];

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function validateManifest(manifest, target) {
  if (manifest.manifest_version !== 3) {
    throw new Error(\`[\${target}] manifest_version must be 3\`);
  }
  if (target === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id) {
      throw new Error('[firefox] Missing browser_specific_settings.gecko.id');
    }
    if (!gecko?.data_collection_permissions?.required) {
      throw new Error('[firefox] Missing required data_collection_permissions for AMO');
    }
  }
  if (target === 'chrome' && manifest.browser_specific_settings) {
    throw new Error('[chrome] Remove browser_specific_settings to keep Chrome Web Store manifest clean');
  }
}

fs.mkdirSync(path.join(rootDir, 'artifacts'), { recursive: true });

for (const target of targets) {
  const outDir = path.join(rootDir, 'dist', target);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const manifestFile = path.join(rootDir, \`manifest.\${target}.json\`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = version;
  validateManifest(manifest, target);

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\\n');
  copyRecursive(path.join(rootDir, 'src'), path.join(outDir, 'src'));
  copyRecursive(path.join(rootDir, 'icons'), path.join(outDir, 'icons'));

  const zipName = \`upkeep-\${target}-v\${version}.zip\`;
  const zipPath = path.join(rootDir, 'artifacts', zipName);
  fs.rmSync(zipPath, { force: true });

  execSync(\`cd "\${outDir}" && zip -rq "\${zipPath}" .\`);
  console.log(\`✔ Built \${target} MV3 -> artifacts/\${zipName}\`);
}
`;
}

export function generateRepoPackageJson(config: UpkeepConfig): string {
  return (
    JSON.stringify(
      {
        name: 'upkeep',
        version: config.version,
        private: true,
        type: 'module',
        description:
          "Extension Chrome & Firefox (MV3) pour refondre l'interface en partie de endstep.cc",
        repository: {
          type: 'git',
          url: 'https://github.com/LPauzies/Upkeep.git',
        },
        scripts: {
          'build:chrome': 'node scripts/build-extension.mjs --target=chrome',
          'build:firefox': 'node scripts/build-extension.mjs --target=firefox',
          'build:all': 'node scripts/build-extension.mjs --target=all',
          'lint:firefox': 'npx --yes web-ext lint --source-dir dist/firefox',
          verify: 'npm run build:all && npm run lint:firefox',
        },
        devDependencies: {
          'web-ext': '^8.3.0',
        },
      },
      null,
      2
    ) + '\n'
  );
}

export function generateCiWorkflowYaml(): string {
  return `name: CI — Build & Validate Upkeep

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-and-build:
    name: Build Chrome & Firefox MV3 + web-ext lint
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build & validate Chrome and Firefox manifests
        run: npm run build:all

      - name: Lint Firefox MV3 package with Mozilla web-ext
        run: npx --yes web-ext lint --source-dir dist/firefox --warnings-as-errors

      - name: Upload preview extension artifacts
        uses: actions/upload-artifact@v4
        with:
          name: upkeep-preview-bundles
          path: artifacts/*.zip
          retention-days: 14
`;
}

export function generateReleaseWorkflowYaml(): string {
  return `name: Release & Publish (Chrome Web Store + Firefox AMO)

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version explicite (ex: 1.1.0). Laisser vide pour auto-versioning 1.0.<run_number>'
        required: false
        default: ''
      publish_stores:
        description: 'Publier sur Chrome Web Store et Firefox AMO si les secrets sont configurés'
        type: boolean
        default: true

permissions:
  contents: write

jobs:
  build-release:
    name: Build & Publish GitHub Release
    runs-on: ubuntu-latest
    outputs:
      version: \${{ steps.meta.outputs.version }}
      tag: \${{ steps.meta.outputs.tag }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Compute SemVer version (Chrome & Firefox MV3 compatible)
        id: meta
        run: |
          if [[ "\${GITHUB_REF}" == refs/tags/v* ]]; then
            RAW="\${GITHUB_REF#refs/tags/v}"
          elif [[ -n "\${{ inputs.version }}" ]]; then
            RAW="\${{ inputs.version }}"
            RAW="\${RAW#v}"
          else
            RAW="1.0.\${GITHUB_RUN_NUMBER}"
          fi
          echo "version=\${RAW}" >> "$GITHUB_OUTPUT"
          echo "tag=v\${RAW}" >> "$GITHUB_OUTPUT"

      - name: Build Chrome & Firefox MV3 ZIP archives
        run: node scripts/build-extension.mjs --target=all --version=\${{ steps.meta.outputs.version }}

      - name: Validate Firefox bundle with web-ext lint
        run: npx --yes web-ext lint --source-dir dist-extension/firefox --warnings-as-errors

      - name: Upload build artifacts for deploy jobs
        uses: actions/upload-artifact@v4
        with:
          name: upkeep-release-zips
          path: |
            artifacts/upkeep-chrome-*.zip
            artifacts/upkeep-firefox-*.zip
            dist-extension/firefox/**

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: \${{ steps.meta.outputs.tag }}
          name: Upkeep \${{ steps.meta.outputs.tag }}
          generate_release_notes: true
          make_latest: true
          files: |
            artifacts/upkeep-chrome-v\${{ steps.meta.outputs.version }}.zip
            artifacts/upkeep-firefox-v\${{ steps.meta.outputs.version }}.zip

  publish-chrome-web-store:
    name: Publish to Chrome Web Store
    needs: build-release
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || inputs.publish_stores == true }}
    steps:
      - name: Download Chrome ZIP artifact
        uses: actions/download-artifact@v4
        with:
          name: upkeep-release-zips
          path: release-bundle

      - name: Check Chrome Web Store secrets
        id: check_chrome
        env:
          CHROME_EXTENSION_ID: \${{ secrets.CHROME_EXTENSION_ID }}
          CHROME_CLIENT_ID: \${{ secrets.CHROME_CLIENT_ID }}
          CHROME_CLIENT_SECRET: \${{ secrets.CHROME_CLIENT_SECRET }}
          CHROME_REFRESH_TOKEN: \${{ secrets.CHROME_REFRESH_TOKEN }}
        run: |
          if [ -n "$CHROME_EXTENSION_ID" ] && [ -n "$CHROME_CLIENT_ID" ] && [ -n "$CHROME_CLIENT_SECRET" ] && [ -n "$CHROME_REFRESH_TOKEN" ]; then
            echo "ready=true" >> "$GITHUB_OUTPUT"
          else
            echo "ready=false" >> "$GITHUB_OUTPUT"
            echo "Chrome Web Store secrets non configurés — étape ignorée."
          fi

      - name: Upload & publish to Chrome Web Store
        if: steps.check_chrome.outputs.ready == 'true'
        uses: mnao305/chrome-extension-upload@v5.0.0
        with:
          file-path: release-bundle/artifacts/upkeep-chrome-v\${{ needs.build-release.outputs.version }}.zip
          extension-id: \${{ secrets.CHROME_EXTENSION_ID }}
          client-id: \${{ secrets.CHROME_CLIENT_ID }}
          client-secret: \${{ secrets.CHROME_CLIENT_SECRET }}
          refresh-token: \${{ secrets.CHROME_REFRESH_TOKEN }}
          publish: true

  publish-firefox-amo:
    name: Publish to Firefox Add-ons (AMO)
    needs: build-release
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || inputs.publish_stores == true }}
    steps:
      - name: Download Firefox bundle
        uses: actions/download-artifact@v4
        with:
          name: upkeep-release-zips
          path: release-bundle

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Check AMO secrets
        id: check_amo
        env:
          AMO_JWT_ISSUER: \${{ secrets.AMO_JWT_ISSUER }}
          AMO_JWT_SECRET: \${{ secrets.AMO_JWT_SECRET }}
        run: |
          if [ -n "$AMO_JWT_ISSUER" ] && [ -n "$AMO_JWT_SECRET" ]; then
            echo "ready=true" >> "$GITHUB_OUTPUT"
          else
            echo "ready=false" >> "$GITHUB_OUTPUT"
            echo "Secrets Firefox AMO non configurés — étape ignorée."
          fi

      - name: Sign & submit to Mozilla AMO (listed)
        if: steps.check_amo.outputs.ready == 'true'
        env:
          WEB_EXT_API_KEY: \${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: \${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx --yes web-ext sign \\
            --source-dir release-bundle/dist-extension/firefox \\
            --artifacts-dir release-bundle/amo-signed \\
            --channel=listed
`;
}

export function generateRepoReadme(config: UpkeepConfig): string {
  return `# Upkeep — Refonte UI Endstep (Chrome & Firefox)

Extension navigateur **Manifest V3** pour [endstep.cc](https://endstep.cc/) conçue pour les parties Magic: The Gathering :

- **Cimetière adverse en continu** ancré sur la colonne droite (\`${config.graveyardWidth}px\`) avec filtres par type de carte, décompte des types distincts et zoom haute lisibilité au survol.
- **Compteurs vitaux haute lisibilité** : Points de vie en grand corps tabulaire (avec delta récent et état critique), cartes restantes dans le Deck et cartes en Main.
- **Journal de partie ouvert à gauche** (\`${config.logsWidth}px\`) automatiquement dès l'ouverture d'une URL \`/game/*\`.
- **Charte tapis de tournoi** : ardoise obsidienne mate (\`#0E1116\`), surfaces structurées (\`#151922\`) et accents or mat (\`#C9A45C\`).
- **Résilience DOM** : sélecteur visuel interactif et page d'options permettant de réassocier n'importe quelle zone en cas de mise à jour d'Endstep.

---

## 1. Build & Packaging local

\`\`\`bash
# Générer les archives Chrome MV3 et Firefox MV3 dans ./dist/ et ./artifacts/
npm run build:all

# Valider le package Firefox avec Mozilla web-ext
npm run lint:firefox
\`\`\`

---

## 2. Installation locale pour tester sur \`endstep.cc\`

### Chrome / Brave / Edge
1. Lancez \`npm run build:chrome\` (ou décompressez \`upkeep-chrome-v${config.version}.zip\`).
2. Ouvrez \`chrome://extensions\` et activez **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez \`dist/chrome/\`.
4. Ouvrez une partie sur \`https://endstep.cc/game/...\`.

### Firefox (Desktop &amp; Android ≥ 142)
1. Lancez \`npm run build:firefox\` (ou décompressez \`upkeep-firefox-v${config.version}.zip\`).
2. Ouvrez \`about:debugging#/runtime/this-firefox\`.
3. Cliquez sur **Charger un module complémentaire temporaire...** et sélectionnez \`dist/firefox/manifest.json\`.
4. Ouvrez une partie sur \`https://endstep.cc/game/...\`.

---

## 3. Déploiement sur le Chrome Web Store

1. Connectez-vous au [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Importez \`artifacts/upkeep-chrome-v${config.version}.zip\`.
3. Permissions déclarées : \`storage\` uniquement + hôte \`https://endstep.cc/*\` (aucune collecte de données).
4. Une fois validée, récupérez \`CHROME_EXTENSION_ID\` pour automatiser les mises à jour via GitHub Actions.

---

## 4. Déploiement sur Firefox Add-ons (Mozilla AMO)

Le manifeste \`manifest.firefox.json\` inclut déjà les champs obligatoires AMO :
- \`browser_specific_settings.gecko.id\`: \`upkeep@lpauzies.dev\`
- \`strict_min_version\`: \`142.0\`
- \`data_collection_permissions.required\`: \`["none"]\`

1. Rendez-vous sur [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. Soumettez \`artifacts/upkeep-firefox-v${config.version}.zip\` (distribution publique *listed* ou auto-signée *unlisted*).
3. Pour la publication automatique CI, générez une clé API sur \`addons.mozilla.org/developers/addon/api/key/\`.

---

## 5. GitHub Actions CI & Release automatique

- \`.github/workflows/ci.yml\` : validation des manifestes, build Chrome/Firefox et \`web-ext lint --warnings-as-errors\` sur chaque push/PR.
- \`.github/workflows/release.yml\` : sur tag \`v*\` (ex: \`git tag v${config.version} && git push origin v${config.version}\`), crée la GitHub Release avec les \`.zip\` et publie automatiquement sur les stores si les secrets sont définis :

| Store | Secrets GitHub Actions requis |
| --- | --- |
| **Chrome Web Store** | \`CHROME_EXTENSION_ID\`, \`CHROME_CLIENT_ID\`, \`CHROME_CLIENT_SECRET\`, \`CHROME_REFRESH_TOKEN\` |
| **Firefox Add-ons (AMO)** | \`AMO_JWT_ISSUER\`, \`AMO_JWT_SECRET\` |
`;
}

export function getAllGeneratedFiles(config: UpkeepConfig): GeneratedRepoFile[] {
  return [
    {
      path: 'manifest.chrome.json',
      content: generateChromeManifest(config),
      language: 'json',
      category: 'chrome',
      description: 'Manifeste MV3 propre pour le Chrome Web Store (sans clé Gecko).',
    },
    {
      path: 'manifest.firefox.json',
      content: generateFirefoxManifest(config),
      language: 'json',
      category: 'firefox',
      description: 'Manifeste MV3 Mozilla AMO avec gecko.id et data_collection_permissions.',
    },
    {
      path: 'src/content/ws-spy.js',
      content: generateWsSpyJs(),
      language: 'js',
      category: 'extension',
      description: 'Observateur passif WebSocket/Fetch (MAIN world) pour lire le cimetière en temps réel.',
    },
    {
      path: 'src/content/upkeep.js',
      content: generateContentJs(config),
      language: 'js',
      category: 'extension',
      description: 'Contrôleur DOM : logs ancrés dans le rail gauche, cimetière continu 3 couches et plaques PV.',
    },
    {
      path: 'src/content/upkeep.css',
      content: generateContentCss(config),
      language: 'css',
      category: 'extension',
      description: 'Surcharge Ardoise & Or mat sans réduction du champ de bataille ni modification des cartes.',
    },
    {
      path: 'src/popup/popup.html',
      content: generatePopupHtml(),
      language: 'html',
      category: 'extension',
      description: 'Interface popup de la barre d’outils Chrome/Firefox.',
    },
    {
      path: 'src/popup/popup.css',
      content: generatePopupCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles du popup Upkeep.',
    },
    {
      path: 'src/popup/popup.js',
      content: generatePopupJs(config),
      language: 'js',
      category: 'extension',
      description: 'Synchronisation storage.sync et lancement du sélecteur visuel.',
    },
    {
      path: 'src/options/options.html',
      content: generateOptionsHtml(),
      language: 'html',
      category: 'extension',
      description: 'Page d’options pour adapter les sélecteurs DOM Endstep.',
    },
    {
      path: 'src/options/options.css',
      content: generateOptionsCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles de la page d’options.',
    },
    {
      path: 'src/options/options.js',
      content: generateOptionsJs(config),
      language: 'js',
      category: 'extension',
      description: 'Édition et sauvegarde des sélecteurs CSS personnalisés.',
    },
    {
      path: '.github/workflows/ci.yml',
      content: generateCiWorkflowYaml(),
      language: 'yaml',
      category: 'ci',
      description: 'CI GitHub Actions : build Chrome/Firefox + web-ext lint sur push/PR.',
    },
    {
      path: '.github/workflows/release.yml',
      content: generateReleaseWorkflowYaml(),
      language: 'yaml',
      category: 'ci',
      description: 'CD GitHub Actions : Release GitHub + publication Chrome Web Store & Firefox AMO.',
    },
    {
      path: 'scripts/build-extension.mjs',
      content: generateBuildScript(),
      language: 'js',
      category: 'repo',
      description: 'Script Node.js de compilation et de validation des archives MV3.',
    },
    {
      path: 'package.json',
      content: generateRepoPackageJson(config),
      language: 'json',
      category: 'repo',
      description: 'Manifeste NPM du dépôt LPauzies/Upkeep.',
    },
    {
      path: 'README.md',
      content: generateRepoReadme(config),
      language: 'md',
      category: 'repo',
      description: 'Documentation d’installation, build et secrets GitHub Actions.',
    },
  ];
}
