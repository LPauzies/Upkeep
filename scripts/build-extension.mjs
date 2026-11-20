#!/usr/bin/env node
/**
 * Upkeep — Build & Packager Chrome MV3 + Firefox MV3 (zéro dépendance externe)
 * Génère ./dist-extension/{chrome,firefox} + ./artifacts/upkeep-{chrome,firefox}-vX.Y.Z.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const rootDir = process.cwd();
const extRoot = fs.existsSync(path.join(rootDir, 'extension', 'manifest.chrome.json'))
  ? path.join(rootDir, 'extension')
  : rootDir;

const argTarget = process.argv.find((a) => a.startsWith('--target='));
const argVersion = process.argv.find((a) => a.startsWith('--version='));
const requested = argTarget ? argTarget.split('=')[1] : 'all';
const targets = requested === 'all' ? ['chrome', 'firefox'] : [requested];

const chromeBase = JSON.parse(
  fs.readFileSync(path.join(extRoot, 'manifest.chrome.json'), 'utf8')
);
const version = (argVersion ? argVersion.split('=')[1] : chromeBase.version || '1.0.0').replace(/^v/, '');
if (!/^\d+(\.\d+){1,3}$/.test(version)) {
  throw new Error(`Version invalide pour Chrome/Firefox MV3 : "${version}" (format attendu : X.Y.Z)`);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, base));
    } else {
      out.push({
        rel: path.relative(base, full).split(path.sep).join('/'),
        data: fs.readFileSync(full),
      });
    }
  }
  return out;
}

function createZipBuffer(dir) {
  const files = collectFiles(dir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.rel, 'utf8');
    const compressed = zlib.deflateRawSync(file.data);
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

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
    throw new Error(`[${target}] manifest_version doit être 3`);
  }
  if (target === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id) throw new Error('[firefox] browser_specific_settings.gecko.id manquant');
    if (!gecko?.update_url || !gecko.update_url.startsWith('https://')) {
      throw new Error('[firefox] browser_specific_settings.gecko.update_url (HTTPS) manquant');
    }
    if (!gecko?.data_collection_permissions?.required) {
      throw new Error('[firefox] data_collection_permissions.required obligatoire pour AMO');
    }
  }
  if (target === 'chrome' && manifest.browser_specific_settings) {
    throw new Error('[chrome] supprimer browser_specific_settings pour le Chrome Web Store');
  }
}

const distBase = path.join(rootDir, 'dist-extension');
const artifactsDir = path.join(rootDir, 'artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

for (const target of targets) {
  const outDir = path.join(distBase, target);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const manifestFile = path.join(extRoot, `manifest.${target}.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = version;
  validateManifest(manifest, target);

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  copyRecursive(path.join(extRoot, 'src'), path.join(outDir, 'src'));
  copyRecursive(path.join(extRoot, 'icons'), path.join(outDir, 'icons'));

  const zipName = `upkeep-${target}-v${version}.zip`;
  const zipPath = path.join(artifactsDir, zipName);
  fs.writeFileSync(zipPath, createZipBuffer(outDir));
  console.log(`✔ Package ${target} MV3 prêt : artifacts/${zipName}`);

  if (target === 'firefox') {
    const gecko = manifest.browser_specific_settings.gecko;
    const xpiName = `upkeep-firefox-v${version}.xpi`;
    const updatesManifest = {
      addons: {
        [gecko.id]: {
          updates: [
            {
              version,
              update_link: `https://github.com/LPauzies/Upkeep/releases/download/v${version}/${xpiName}`,
              applications: {
                gecko: {
                  strict_min_version: gecko.strict_min_version || '142.0',
                },
              },
            },
          ],
        },
      },
    };
    fs.writeFileSync(
      path.join(artifactsDir, 'updates.json'),
      JSON.stringify(updatesManifest, null, 2) + '\n'
    );
    console.log(`✔ Manifeste auto-update Firefox généré : artifacts/updates.json`);
  }
}
