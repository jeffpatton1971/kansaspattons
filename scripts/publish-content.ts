import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

type PublishOptions = {
  accountName: string;
  connectionString?: string;
  containerName: string;
  prefix: string;
  contentRoot: string;
  cacheControl: string;
  dryRun: boolean;
  fromPlan: boolean;
  planPath: string;
};

type PublishFile = {
  fullPath: string;
  relativePath: string;
  blobName: string;
  size: number;
};

const defaultCacheControl = 'public, max-age=60';

async function main() {
  const options = publishOptions();
  const planPaths = options.fromPlan ? await readPlanPaths(options.planPath) : undefined;
  const files = await contentFiles(options.contentRoot, options.prefix, planPaths);

  if (!options.fromPlan) {
    await assertContentLooksPublishable(options.contentRoot, files);
  }

  console.log(`Content root: ${options.contentRoot}`);
  console.log(`Target container: ${options.containerName}`);
  console.log(`Target prefix: ${options.prefix}`);
  console.log(`Publish scope: ${options.fromPlan ? 'incremental plan' : 'full content root'}`);
  console.log(`Files: ${files.length.toLocaleString()}`);
  console.log(`Bytes: ${sum(files.map((file) => file.size)).toLocaleString()}`);

  if (options.dryRun) {
    if (files.length === 0) {
      console.log('\nDry run only. No content files to publish.');
    } else {
      console.log('\nDry run only. First files:');

      for (const file of files.slice(0, 20)) {
        console.log(`- ${file.relativePath} -> ${file.blobName}`);
      }

      if (files.length > 20) {
        console.log(`...and ${(files.length - 20).toLocaleString()} more.`);
      }
    }

    console.log(`\nCONTENT_BASE_URL=${contentBaseUrl(options)}`);
    return;
  }

  if (files.length === 0) {
    console.log('\nNo content files to publish.');
    console.log(`CONTENT_BASE_URL=${contentBaseUrl(options)}`);
    return;
  }

  const containerClient = await containerClientForOptions(options);
  await containerClient.createIfNotExists();
  await uploadFiles(containerClient, files, options.cacheControl);
  await uploadManifest(containerClient, options, files);

  console.log('\nPublish complete.');
  console.log(`CONTENT_BASE_URL=${contentBaseUrl(options)}`);
}

function publishOptions(): PublishOptions {
  const args = new Set(process.argv.slice(2));
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const siteKey = cleanSiteKey(process.env.CONTENT_SITE_KEY || process.env.SITE_KEY || 'kansaspattons');
  const accountName = requiredValue(
    process.env.CONTENT_STORAGE_ACCOUNT || accountNameFromConnectionString(connectionString),
    'CONTENT_STORAGE_ACCOUNT',
  );
  const containerName = requiredValue(process.env.CONTENT_STORAGE_CONTAINER, 'CONTENT_STORAGE_CONTAINER');
  const prefix = cleanPrefix(process.env.CONTENT_STORAGE_PREFIX || defaultPrefix(siteKey));
  const contentRoot = path.resolve(process.cwd(), process.env.CONTENT_PUBLISH_ROOT || 'public/content');
  const cacheControl = process.env.CONTENT_STORAGE_CACHE_CONTROL || defaultCacheControl;
  const dryRun = args.has('--dry-run') || process.env.CONTENT_PUBLISH_DRY_RUN === 'true';
  const fromPlan = args.has('--from-plan') || process.env.CONTENT_PUBLISH_FROM_PLAN === 'true';
  const planPath = path.resolve(process.cwd(), process.env.CONTENT_PUBLISH_PLAN || '.tmp/publish-plan-report.json');

  return {
    accountName,
    connectionString,
    containerName,
    prefix,
    contentRoot,
    cacheControl,
    dryRun,
    fromPlan,
    planPath,
  };
}

async function contentFiles(contentRoot: string, prefix: string, planPaths?: Set<string>) {
  const files: PublishFile[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(contentRoot, fullPath).replaceAll(path.sep, '/');

      if (planPaths && !planPaths.has(relativePath)) {
        continue;
      }

      const details = await stat(fullPath);

      files.push({
        fullPath,
        relativePath,
        blobName: `${prefix}/${relativePath}`,
        size: details.size,
      });
    }
  }

  await visit(contentRoot);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function readPlanPaths(planPath: string) {
  const raw = await readFile(planPath, 'utf8');
  const report = JSON.parse(raw) as {
    issues?: unknown[];
    affectedJson?: string[];
    affectedIndexes?: string[];
  };

  if ((report.issues?.length ?? 0) > 0) {
    throw new Error(`Publish plan has ${report.issues!.length} issue(s). Run npm run publish:plan and fix them before incremental content publish.`);
  }

  return new Set(
    [...(report.affectedJson ?? []), ...(report.affectedIndexes ?? [])]
      .map((item) => item.replaceAll('\\', '/').replace(/^\/+/, ''))
      .filter(Boolean),
  );
}

async function assertContentLooksPublishable(contentRoot: string, files: PublishFile[]) {
  const expected = [
    'home.json',
    'site.json',
    'posts/index.json',
    'stories/index.json',
    'galleries/index.json',
    'images/index.json',
  ];
  const names = new Set(files.map((file) => file.relativePath));
  const missing = expected.filter((item) => !names.has(item));

  if (missing.length > 0) {
    throw new Error(`Content root ${contentRoot} is missing required artifacts: ${missing.join(', ')}`);
  }

  const site = JSON.parse(await readFile(path.join(contentRoot, 'site.json'), 'utf8')) as {
    title?: string;
    posts?: number;
    stories?: number;
    galleries?: number;
    images?: number;
  };

  console.log(
    `Site summary: ${site.title ?? 'Untitled'}; posts=${site.posts ?? '?'} stories=${
      site.stories ?? '?'
    } galleries=${site.galleries ?? '?'} images=${site.images ?? '?'}`,
  );
}

async function containerClientForOptions(options: PublishOptions) {
  if (options.connectionString) {
    return BlobServiceClient.fromConnectionString(options.connectionString).getContainerClient(options.containerName);
  }

  const credential = new DefaultAzureCredential();
  const serviceClient = new BlobServiceClient(
    `https://${options.accountName}.blob.core.windows.net`,
    credential,
  );

  return serviceClient.getContainerClient(options.containerName);
}

async function uploadFiles(containerClient: ContainerClient, files: PublishFile[], cacheControl: string) {
  let uploaded = 0;
  const concurrency = 8;
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();

      if (!file) {
        return;
      }

      const blob = containerClient.getBlockBlobClient(file.blobName);
      await blob.uploadFile(file.fullPath, {
        blobHTTPHeaders: {
          blobContentType: contentType(file.relativePath),
          blobCacheControl: cacheControl,
        },
      });

      uploaded += 1;

      if (uploaded % 100 === 0 || uploaded === files.length) {
        console.log(`Uploaded ${uploaded.toLocaleString()} / ${files.length.toLocaleString()}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function uploadManifest(containerClient: ContainerClient, options: PublishOptions, files: PublishFile[]) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    prefix: options.prefix,
    fileCount: files.length,
    totalBytes: sum(files.map((file) => file.size)),
    contentBaseUrl: contentBaseUrl(options),
  };
  const blob = containerClient.getBlockBlobClient(`${options.prefix}/_publish.json`);

  await blob.upload(JSON.stringify(manifest, null, 2), Buffer.byteLength(JSON.stringify(manifest, null, 2)), {
    blobHTTPHeaders: {
      blobContentType: 'application/json; charset=utf-8',
      blobCacheControl: options.cacheControl,
    },
  });
}

function contentBaseUrl(options: PublishOptions) {
  const prefix = cleanPrefix(options.prefix);
  return `https://${options.accountName}.blob.core.windows.net/${options.containerName}/${prefix}/`;
}

function contentType(relativePath: string) {
  if (relativePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }

  return 'application/octet-stream';
}

function defaultPrefix(siteKey: string) {
  return `content/${siteKey}/current`;
}

function cleanPrefix(value: string) {
  return value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function cleanSiteKey(value: string) {
  const siteKey = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(siteKey)) {
    throw new Error(`Invalid CONTENT_SITE_KEY: ${value}`);
  }

  return siteKey;
}

function requiredValue(value: string | undefined, name: string, allowMissing = false) {
  const trimmed = value?.trim();

  if (!trimmed && !allowMissing) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return trimmed || '';
}

function accountNameFromConnectionString(connectionString: string | undefined) {
  return /(?:^|;)AccountName=([^;]+)/.exec(connectionString || '')?.[1];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
