import type { UpkeepConfig } from './types';
import rawWsSpyJs from '../../extension/src/content/ws-spy.js?raw';
import rawUpkeepCss from '../../extension/src/content/upkeep.css?raw';
import rawUpkeepJs from '../../extension/src/content/upkeep.js?raw';
import rawPopupHtml from '../../extension/src/popup/popup.html?raw';
import rawPopupCss from '../../extension/src/popup/popup.css?raw';
import rawPopupJs from '../../extension/src/popup/popup.js?raw';
import rawOptionsHtml from '../../extension/src/options/options.html?raw';
import rawOptionsCss from '../../extension/src/options/options.css?raw';
import rawOptionsJs from '../../extension/src/options/options.js?raw';
import rawChromeManifest from '../../extension/manifest.chrome.json?raw';
import rawFirefoxManifest from '../../extension/manifest.firefox.json?raw';
import rawBuildScript from '../../scripts/build-extension.mjs?raw';
import rawCiWorkflow from '../../.github/workflows/ci.yml?raw';
import rawReleaseWorkflow from '../../.github/workflows/release.yml?raw';
import rawBugTemplate from '../../.github/ISSUE_TEMPLATE/bug_report.yml?raw';
import rawFeatureTemplate from '../../.github/ISSUE_TEMPLATE/feature_request.yml?raw';
import rawIssueConfig from '../../.github/ISSUE_TEMPLATE/config.yml?raw';
import rawStoreDescription from '../../STORE_DESCRIPTION.md?raw';

export interface GeneratedRepoFile {
  path: string;
  content: string;
  language: 'json' | 'js' | 'css' | 'html' | 'yaml' | 'md';
  category: 'chrome' | 'firefox' | 'extension' | 'ci' | 'repo';
  description: string;
}

export function generateChromeManifest(config: UpkeepConfig): string {
  const manifest = JSON.parse(rawChromeManifest);
  manifest.version = config.version;
  return JSON.stringify(manifest, null, 2) + '\n';
}

export function generateFirefoxManifest(config: UpkeepConfig): string {
  const manifest = JSON.parse(rawFirefoxManifest);
  manifest.version = config.version;
  return JSON.stringify(manifest, null, 2) + '\n';
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
      showMidlineTimeline: config.showMidlineTimeline,
      autoOpenLogsLeft: config.autoOpenLogsLeft,
      alwaysShowOpponentGraveyard: config.alwaysShowOpponentGraveyard,
      hideActionToasts: config.hideActionToasts,
      anchorStackTopLeft: config.anchorStackTopLeft,
      highContrastHud: config.highContrastHud,
      enableHoverZoom: config.enableHoverZoom,
      logsWidth: config.logsWidth,
      graveyardWidth: config.graveyardWidth,
      colorblindMode: config.colorblindMode,
      colors: config.colors,
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
  return rawPopupHtml;
}

export function generatePopupCss(): string {
  return rawPopupCss;
}

export function generatePopupJs(_config: UpkeepConfig): string {
  return rawPopupJs;
}

export function generateOptionsHtml(): string {
  return rawOptionsHtml;
}

export function generateOptionsCss(): string {
  return rawOptionsCss;
}

export function generateOptionsJs(config: UpkeepConfig): string {
  return rawOptionsJs.replace(
    /const DEFAULT_SELECTORS = \{[\s\S]*?\n  \};/,
    `const DEFAULT_SELECTORS = ${JSON.stringify(config.selectors, null, 2)};`
  );
}

export function generateBuildScript(): string {
  return rawBuildScript;
}

export function generateCiWorkflowYaml(): string {
  return rawCiWorkflow;
}

export function generateReleaseWorkflowYaml(): string {
  return rawReleaseWorkflow;
}

export function generateBugTemplateYaml(): string {
  return rawBugTemplate;
}

export function generateFeatureTemplateYaml(): string {
  return rawFeatureTemplate;
}

export function generateIssueConfigYaml(): string {
  return rawIssueConfig;
}

export function generateStoreDescriptionMd(): string {
  return rawStoreDescription;
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
          'lint:firefox':
            'npx --yes web-ext lint --source-dir dist-extension/firefox --warnings-as-errors',
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

export function generateRepoReadme(config: UpkeepConfig): string {
  return `# Upkeep — Client UI Extension for endstep.cc (Chrome & Firefox)

Extension navigateur **Manifest V3** pour [endstep.cc/game/*](https://endstep.cc/) conçue pour les parties Magic: The Gathering :

- **Double cimetière en continu (grille 2 cartes/ligne)** : cimetière adverse (or mat) et votre cimetière (bleu acier) repliables dans le rail droit, synchronisés en temps réel (WebSocket/Fetch + Game Log + sync silencieux) avec filtres par type, badges \`×N\` et zoom haute lisibilité au survol.
- **Barre de phases native sur la ligne médiane** : la vraie barre de phases d'Endstep (stops clic gauche, yields clic droit, infobulles) est déplacée à l'horizontale entre les deux champs de bataille sans réduire la taille des cartes.
- **Game Log & Decision à taille fixe** : zéro redimensionnement et zéro saut vertical entre \`WAITING\`, \`PASS PRIORITY\` et les décisions multi-boutons ; en-tête \`DECISION\` compacté à 28 px avec défilement interne si besoin.
- **Barre Auto-Pass 1 ligne (3 boutons + tooltips)** : \`EOT [E]\`, \`MY TURN [B]\`, \`ACTION [R]\` alignés horizontalement avec infobulles flottantes instantanées (~100 px récupérés).
- **The Stack ancrée en haut à gauche du plateau** & masquage des toasts redondants.
- **Icône de barre d'outils avec switch ON/OFF** et réglages individuels persistants.

---

## 1. Build & Validation locale

\`\`\`bash
# Générer les archives Chrome MV3 et Firefox MV3 (dossiers gitignored, build CI-only dans le dépôt)
npm run build:all

# Valider le package Firefox avec Mozilla web-ext
npm run lint:firefox
\`\`\`

---

## 2. CI / CD GitHub Actions (LPauzies/Upkeep)

- **CI (\`.github/workflows/ci.yml\`)** : exécutée sur \`main\` et chaque PR — build Chrome + Firefox et \`web-ext lint --warnings-as-errors\`.
- **CD indépendante (\`.github/workflows/release.yml\`)** : déclenchée uniquement **à la main** (\`Actions → Run workflow\` avec bump \`patch\`/\`minor\`/\`major\` ou version explicite) ou sur push d'un tag \`v*\`. Génère et valide les \`.zip\` Chrome et Firefox, publie la GitHub Release, puis déploie automatiquement sur le Chrome Web Store et Firefox Add-ons (AMO listed) si leurs secrets respectifs sont définis.
- **Templates d'issues (\`.github/ISSUE_TEMPLATE/\`)** : formulaires structurés pour signaler un bug ou proposer une fonctionnalité sur [github.com/LPauzies/Upkeep/issues](https://github.com/LPauzies/Upkeep/issues).

| Store | Déploiement |
| --- | --- |
| **Chrome Web Store** | Optionnel en CD (API v2) via \`CHROME_EXTENSION_ID\`, \`CHROME_PUBLISHER_ID\`, \`CHROME_CLIENT_ID\`, \`CHROME_CLIENT_SECRET\`, \`CHROME_REFRESH_TOKEN\` |
| **Firefox Add-ons (AMO)** | Optionnel en CD (\`web-ext sign --channel=listed --approval-timeout=0\`) via \`MOZILLA_JWT_ISSUER\`, \`MOZILLA_JWT_SECRET\` |
`;
}

export function getAllGeneratedFiles(config: UpkeepConfig): GeneratedRepoFile[] {
  return [
    {
      path: 'extension/manifest.chrome.json',
      content: generateChromeManifest(config),
      language: 'json',
      category: 'chrome',
      description: 'Manifeste MV3 propre pour Chrome Web Store (permissions minimales).',
    },
    {
      path: 'extension/manifest.firefox.json',
      content: generateFirefoxManifest(config),
      language: 'json',
      category: 'firefox',
      description:
        'Manifeste MV3 Mozilla AMO (upkeep-endstep@lpauzies.dev, navbar, data_collection_permissions).',
    },
    {
      path: 'extension/src/content/ws-spy.js',
      content: generateWsSpyJs(),
      language: 'js',
      category: 'extension',
      description: 'Observateur passif WebSocket/Fetch (MAIN world) pour les deux cimetières live.',
    },
    {
      path: 'extension/src/content/upkeep.js',
      content: generateContentJs(config),
      language: 'js',
      category: 'extension',
      description:
        'Contrôleur DOM : grille 2 cartes cimetières, log/décision fixes, Auto-Pass 3 boutons + tooltips, midline phase bar.',
    },
    {
      path: 'extension/src/content/upkeep.css',
      content: generateContentCss(config),
      language: 'css',
      category: 'extension',
      description: 'Surcharge Ardoise Obsidienne & Or mat sans jamais modifier les cartes Magic.',
    },
    {
      path: 'extension/src/popup/popup.html',
      content: generatePopupHtml(),
      language: 'html',
      category: 'extension',
      description: 'Popup barre d’outils avec interrupteur principal ON/OFF et options par module.',
    },
    {
      path: 'extension/src/popup/popup.css',
      content: generatePopupCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles Obsidian Slate & Gold du popup navigateur.',
    },
    {
      path: 'extension/src/popup/popup.js',
      content: generatePopupJs(config),
      language: 'js',
      category: 'extension',
      description: 'Synchronisation fiable storage.local + storage.sync avec la page Endstep.',
    },
    {
      path: 'extension/src/options/options.html',
      content: generateOptionsHtml(),
      language: 'html',
      category: 'extension',
      description: 'Page d’options pour adapter les sélecteurs DOM Endstep.',
    },
    {
      path: 'extension/src/options/options.css',
      content: generateOptionsCss(),
      language: 'css',
      category: 'extension',
      description: 'Styles de la page d’options.',
    },
    {
      path: 'extension/src/options/options.js',
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
      description: 'CI GitHub Actions : build Chrome/Firefox + web-ext lint sur main et PR.',
    },
    {
      path: '.github/workflows/release.yml',
      content: generateReleaseWorkflowYaml(),
      language: 'yaml',
      category: 'ci',
      description:
        'CD indépendante : lancement manuel (SemVer bump) ou tag v* → GitHub Release, Chrome Web Store & Firefox AMO.',
    },
    {
      path: '.github/ISSUE_TEMPLATE/bug_report.yml',
      content: generateBugTemplateYaml(),
      language: 'yaml',
      category: 'repo',
      description: 'Formulaire structuré pour déclarer un bug sur LPauzies/Upkeep.',
    },
    {
      path: '.github/ISSUE_TEMPLATE/feature_request.yml',
      content: generateFeatureTemplateYaml(),
      language: 'yaml',
      category: 'repo',
      description: 'Formulaire structuré pour proposer une amélioration UI/UX.',
    },
    {
      path: 'scripts/build-extension.mjs',
      content: generateBuildScript(),
      language: 'js',
      category: 'repo',
      description: 'Script Node.js de build & validation bi-cible Chrome/Firefox MV3.',
    },
    {
      path: 'README.md',
      content: generateRepoReadme(config),
      language: 'md',
      category: 'repo',
      description: 'Documentation d’installation, CI/CD et secrets GitHub Actions.',
    },
    {
      path: 'STORE_DESCRIPTION.md',
      content: generateStoreDescriptionMd(),
      language: 'md',
      category: 'repo',
      description: 'Description anglaise prête à copier-coller pour Chrome Web Store et Firefox AMO.',
    },
  ];
}
