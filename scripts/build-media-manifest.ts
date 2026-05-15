import path from 'node:path';
import { buildLegacyMediaManifest, writeMediaManifest } from './media-manifest-lib';

const root = process.cwd();
const siteKey = cleanSiteKey(process.env.CONTENT_SITE_KEY || process.env.SITE_KEY || 'kansaspattons');
const siteTitle = process.env.CONTENT_SITE_TITLE || process.env.SITE_TITLE || 'KansasPattons';
const manifestPath = path.join(root, 'content', 'media', 'index.json');
const write = process.argv.includes('--write');

async function main() {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
