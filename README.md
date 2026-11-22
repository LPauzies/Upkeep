# Upkeep — Refonte UI Endstep (Extension Chrome & Firefox)

**Upkeep** est une extension navigateur **Manifest V3** (Chrome & Firefox) conçue pour transformer l'interface en partie sur [endstep.cc](https://endstep.cc/) (`https://endstep.cc/game/*`).

## Fonctionnalités clés

- **Charte tapis de tournoi ardoise & or mat** : surfaces sombres neutres (`#0E1116` / `#151922`), filets 1px sobres et accents or mat (`#C9A45C`) inspirés du coverage pro Magic.
- **Cimetière adverse visible en continu** : panneau latéral droit fixe avec compteur de cartes, décompte de types distincts (Délire), filtres rapides (`Tout`, `Créatures`, `Sorts`, `Terrains`) et agrandissement haute lisibilité au survol.
- **Compteurs vitaux haute lisibilité** : Points de vie (PV) en grand corps tabulaire (`JetBrains Mono`) avec variation récente et état critique, suivis du nombre de cartes dans le **Deck**, en **Main** et en **Exil**.
- **Journal ouvert automatiquement à gauche** : dès l'entrée sur une partie `/game/*` (navigation SPA incluse), les logs s'ouvrent et s'ancrent sur la colonne gauche.
- **Raccourcis clavier** : `L` (Logs), `G` (Cimetière adverse), `U` (Activer/désactiver l'interface Upkeep).
- **Adaptateur DOM résilient** : page d'options et outil de ciblage visuel dans le popup pour ajuster les sélecteurs CSS en quelques secondes si Endstep modifie son HTML.

---

## 1. Générer les archives Chrome & Firefox

### Option A — Depuis l'interface web Upkeep Studio
1. Ouvrez l'onglet **Packaging & CI** de l'application Upkeep.
2. Téléchargez directement :
   - `upkeep-chrome-mv3-v1.0.0.zip` (Chrome Web Store / chargement local Chrome)
   - `upkeep-firefox-mv3-v1.0.0.zip` (Mozilla AMO / chargement local Firefox)
   - `upkeep-repo-LPauzies-v1.0.0.zip` (dépôt Git complet prêt à pousser vers `github.com/LPauzies/Upkeep`)

### Option B — En ligne de commande dans le dépôt `LPauzies/Upkeep`
```bash
# Construire et packager les deux cibles dans ./dist/ et ./artifacts/
npm run build:all

# Valider la conformité Firefox AMO avec Mozilla web-ext
npm run lint:firefox
```

---

## 2. Installation locale pour tester sur `endstep.cc`

### Chrome / Brave / Edge / Arc
1. Décompressez `upkeep-chrome-mv3-v1.0.0.zip` dans un dossier local (ou utilisez `dist/chrome/`).
2. Ouvrez `chrome://extensions` dans votre navigateur.
3. Activez le **Mode développeur** (coin supérieur droit).
4. Cliquez sur **Charger l'extension non empaquetée** (*Load unpacked*) et sélectionnez le dossier contenant `manifest.json`.
5. Ouvrez une partie sur `https://endstep.cc/game/...` : Upkeep s'active automatiquement.

### Firefox (≥ 142)
1. Décompressez `upkeep-firefox-mv3-v1.0.0.zip` dans un dossier local (ou utilisez `dist/firefox/`).
2. Ouvrez `about:debugging#/runtime/this-firefox` dans Firefox.
3. Cliquez sur **Charger un module complémentaire temporaire...** (*Load Temporary Add-on*).
4. Sélectionnez le fichier `manifest.json` du dossier décompressé.
5. Rendez-vous sur `https://endstep.cc/game/...`.

> Pour une installation permanente sur Firefox sans passer par `about:debugging`, publiez ou signez l'extension via Mozilla AMO (section suivante).

---

## 3. Déploiement sur le Chrome Web Store

### Publication manuelle (première mise en ligne)
1. Créez ou connectez-vous au [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Cliquez sur **Nouvel élément** (*Add new item*) et importez `upkeep-chrome-mv3-v1.0.0.zip`.
3. Remplissez la fiche :
   - **Catégorie** : Divertissement / Outils de jeu
   - **Justification des permissions** : `storage` (sauvegarde locale des préférences et sélecteurs DOM) et `https://endstep.cc/*` (injection CSS/JS uniquement sur les parties Endstep).
   - **Collecte de données** : aucune donnée utilisateur collectée ni transmise à un serveur tiers.
4. Soumettez pour validation et notez l'**ID d'extension** attribué par Google (`CHROME_EXTENSION_ID`).

### Publication automatique via GitHub Actions (API Chrome Web Store v2)
Configurez les 5 secrets suivants dans `Settings → Secrets and variables → Actions` de `LPauzies/Upkeep` :
- `CHROME_EXTENSION_ID` : identifiant de l'extension (32 caractères) sur le Chrome Web Store
- `CHROME_PUBLISHER_ID` : identifiant éditeur visible dans *Developer Dashboard → Account / Publisher Settings*
- `CHROME_CLIENT_ID` : Client ID OAuth Google Cloud (API Chrome Web Store activée)
- `CHROME_CLIENT_SECRET` : Client Secret OAuth associé
- `CHROME_REFRESH_TOKEN` : Refresh Token OAuth autorisé sur le scope `https://www.googleapis.com/auth/chromewebstore` (générable via `npx chrome-webstore-upload-keys`)

---

## 4. Déploiement sur Firefox Add-ons (Mozilla AMO)

Le manifeste Firefox (`manifest.firefox.json`) est pré-configuré pour les règles Mozilla MV3 :
- `browser_specific_settings.gecko.id`: `"upkeep-endstep@lpauzies.dev"`
- `strict_min_version`: `"142.0"`
- `data_collection_permissions.required`: `["none"]` (obligatoire pour la validation AMO)

### Publication automatique via GitHub Actions (`web-ext sign --channel=listed`)
1. Créez la fiche une première fois sur le [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/) avec `upkeep-firefox-vX.Y.Z.zip`.
2. Générez une paire de clés API JWT sur [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/).
3. Configurez les 2 secrets suivants dans `Settings → Secrets and variables → Actions` de `LPauzies/Upkeep` :
   - `MOZILLA_JWT_ISSUER` : champ **JWT issuer** fourni par AMO
   - `MOZILLA_JWT_SECRET` : champ **JWT secret** associé
4. Lors de chaque release, le job `publish-firefox-amo` décompresse `upkeep-firefox-vX.Y.Z.zip` et soumet automatiquement la nouvelle version publique (`--channel=listed --approval-timeout=0`).

### Publication et mises à jour manuelles (alternative)
1. Téléchargez `upkeep-firefox-vX.Y.Z.zip` depuis la dernière GitHub Release (déjà validé par `web-ext lint --warnings-as-errors` en CI/CD).
2. Importez l'archive dans votre fiche AMO pour soumettre la nouvelle version.

---

## 5. Workflows GitHub Actions inclus

- **`.github/workflows/ci.yml`** (sur chaque `push` et `pull_request` vers `main`) :
  - Construit les cibles Chrome MV3 et Firefox MV3 (`npm run build:all`)
  - Vérifie les manifestes et exécute `web-ext lint --warnings-as-errors` sur la cible Firefox
  - Met à disposition les archives `.zip` en artefacts de build
- **`.github/workflows/release.yml`** (déclenchement manuel `workflow_dispatch` ou tag `v*`) :
  - Génère `upkeep-chrome-vX.Y.Z.zip` et `upkeep-firefox-vX.Y.Z.zip`
  - Crée automatiquement une **GitHub Release** avec notes générées et archives attachées
  - Déploie automatiquement sur le **Chrome Web Store** (API v2 via `mnao305/chrome-extension-upload@v7.0.0`) dès que les 5 secrets `CHROME_*` sont renseignés
  - Soumet automatiquement sur **Firefox Add-ons (AMO listed)** (`web-ext@latest sign --channel=listed --approval-timeout=0`) dès que les 2 secrets `MOZILLA_*` sont renseignés

```bash
# Exemple de release par tag (ou via GitHub → Actions → Run workflow)
git tag v1.0.0
git push origin v1.0.0
```
