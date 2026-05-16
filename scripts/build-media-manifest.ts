import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildLegacyMediaManifest, writeMediaManifest } from './media-manifest-lib';

const root = process.cwd();
const siteConfigPath = path.join(root, 'content', 'site.config.json');
const siteKey = cleanSiteKey(process.env.CONTENT_SITE_KEY || process.env.SITE_KEY || siteConfigKeyFromDisk() || 'kansaspattons');
const manifestPath = path.join(root, 'content', 'media', 'index.json');
const write = process.argv.includes('--write');

async function main() {
  const siteConfig = await readSiteConfig();
  const siteTitle = process.env.CONTENT_SITE_TITLE || process.env.SITE_TITLE || siteConfig.title || 'KansasPattons';
  const manifest = await buildLegacyMediaManifest({ root, siteKey, siteTitle });

  console.log('Media manifest');
  console.log(`Assets: ${manifest.assets.length.toLocaleString()}`);
  console.log(`Storage: ${manifest.storage.baseUrl || '(not detected)'}`);
  console.log(`Output: ${path.relative(root, manifestPath)}`);

  const kindCounts = countBy(manifest.assets, (asset) => asset.kind);
  const sourceCounts = countBy(manifest.assets, (asset) => asset.legacy?.source || 'unknown');

  console.log(`Kinds: ${JSON.stringify(kindCounts)}`);
  console.log(`Sources: ${JSON.stringify(sourceCounts)}`);

  if (write) {
    await writeMediaManifest(manifestPath, manifest);
    console.log(`Wrote manifest: ${path.relative(root, manifestPath)}`);
  } else {
    console.log('Dry run only. Re-run with --write to create the manifest.');
  }
}

async function readSiteConfig() {
  try {
    return JSON.parse(await readFile(siteConfigPath, 'utf8')) as { title?: string };
  } catch {
    return {};
  }
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function cleanSiteKey(value: string) {
  const key = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
    throw new Error(`Invalid CONTENT_SITE_KEY: ${value}`);
  }

  return key;
}

function siteConfigKeyFromDisk() {
  try {
    const config = JSON.parse(readFileSync(siteConfigPath, 'utf8')) as { key?: string };
    return config.key;
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
