import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

type PlannedMediaUpload = {
  contentFile: string;
  reference: string;
  canonicalKey: string;
  localPath?: string;
  exists: boolean;
  kind: 'image' | 'video';
  byteSize?: number;
  hash?: {
    algorithm: 'sha256';
    value: string;
  };
  rawBlobPath: string;
  thumbBlobPath?: string;
  manifestAction: 'none' | 'add' | 'reuse-existing' | 'collision';
};

type PublishPlanReport = {
  generatedAt: string;
  mode: 'plan' | 'write-source';
  mediaManifest: {
    storage: {
      accountName: string;
      containerName: string;
      baseUrl: string;
      rawPrefix: 'images';
      thumbPrefix: 'thumbs';
    };
  };
  plannedMediaUploads: PlannedMediaUpload[];
  issues: Array<{
    code: string;
    file: string;
    message: string;
  }>;
};

type MediaPublishOptions = {
  reportPath: string;
  resultPath: string;
  write: boolean;
  overwrite: boolean;
  skipThumbFallbacks: boolean;
  concurrency: number;
  maxErrors: number;
  cacheControl: string;
  connectionString?: string;
};

type UploadOperation = {
  contentFile: string;
  canonicalKey: string;
  localPath: string;
  kind: 'raw' | 'thumb-fallback';
  mediaKind: 'image' | 'video';
  blobName: string;
  byteSize?: number;
  hash?: {
    algorithm: 'sha256';
    value: string;
  };
};

type PublishStats = {
  uploaded: number;
  skippedExisting: number;
  skippedReuseExisting: number;
  failed: number;
  processed: number;
};

type PublishError = {
  contentFile: string;
  canonicalKey: string;
  localPath: string;
  kind: UploadOperation['kind'];
  blobName: string;
  message: string;
};

const root = process.cwd();
const args = process.argv.slice(2);
const defaultCacheControl = 'public, max-age=31536000, immutable';

async function main() {
  const options = publishOptions();
  const report = await readReport(options.reportPath);
  assertReportPublishable(report);
  const skippedReuseExisting = report.plannedMediaUploads.filter(
    (upload) => upload.manifestAction === 'reuse-existing',
  ).length;
  const operations = uploadOperations(report, options);

  printPlan(report, options, operations, skippedReuseExisting);

  if (!options.write) {
    printDryRunSample(operations);
    console.log('\nDry run only. Re-run with --write to upload media blobs.');
    return;
  }

  const containerClient = await containerClientForReport(report, options);
  await containerClient.createIfNotExists();
  const result = await uploadAll(containerClient, operations, options);

  result.stats.skippedReuseExisting = skippedReuseExisting;
  await writeResult(options.resultPath, report, options, operations.length, result.stats, result.errors);

  if (result.errors.length > 0) {
    throw new Error(`Media publish completed with ${result.errors.length.toLocaleString()} failed operations.`);
  }

  console.log('\nMedia publish complete.');
}

function publishOptions(): MediaPublishOptions {
  const reportPath = path.resolve(root, argValue('--report') || '.tmp/publish-plan-report.json');
  const resultPath = path.resolve(root, argValue('--result') || '.tmp/publish-media-result.json');
  const concurrency = numberArg('--concurrency', 8);
  const maxErrors = numberArg('--max-errors', 20);

  if (concurrency < 1 || concurrency > 64) {
    throw new Error('--concurrency must be between 1 and 64.');
  }

  if (maxErrors < 1) {
    throw new Error('--max-errors must be at least 1.');
  }

  return {
    reportPath,
    resultPath,
    write: hasArg('--write'),
    overwrite: hasArg('--overwrite'),
    skipThumbFallbacks: hasArg('--skip-thumb-fallbacks'),
    concurrency,
    maxErrors,
    cacheControl: process.env.MEDIA_STORAGE_CACHE_CONTROL || defaultCacheControl,
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING?.trim(),
  };
}

async function readReport(reportPath: string): Promise<PublishPlanReport> {
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as PublishPlanReport;

  if (!report.mediaManifest?.storage) {
    throw new Error(`Publish plan ${reportPath} does not include media manifest storage settings.`);
  }

  if (!Array.isArray(report.plannedMediaUploads)) {
    throw new Error(`Publish plan ${reportPath} does not include plannedMediaUploads.`);
  }

  return report;
}

function assertReportPublishable(report: PublishPlanReport) {
  if (report.issues.length > 0) {
    throw new Error(
      `Publish plan has ${report.issues.length.toLocaleString()} issue(s). Run npm run publish:plan and fix them before publishing media.`,
    );
  }

  const missingLocalFiles = report.plannedMediaUploads.filter(
    (upload) => upload.manifestAction === 'add' && (!upload.localPath || !upload.exists),
  );

  if (missingLocalFiles.length > 0) {
    throw new Error(
      `Publish plan includes ${missingLocalFiles.length.toLocaleString()} upload(s) without local files.`,
    );
  }
}

function uploadOperations(report: PublishPlanReport, options: MediaPublishOptions) {
  const operations: UploadOperation[] = [];

  for (const upload of report.plannedMediaUploads) {
    if (upload.manifestAction !== 'add') {
      continue;
    }

    if (!upload.localPath) {
      continue;
    }

    operations.push({
      contentFile: upload.contentFile,
      canonicalKey: upload.canonicalKey,
      localPath: upload.localPath,
      kind: 'raw',
      mediaKind: upload.kind,
      blobName: upload.rawBlobPath,
      byteSize: upload.byteSize,
      hash: upload.hash,
    });

    if (!options.skipThumbFallbacks && upload.kind === 'image' && upload.thumbBlobPath) {
      operations.push({
        contentFile: upload.contentFile,
        canonicalKey: upload.canonicalKey,
        localPath: upload.localPath,
        kind: 'thumb-fallback',
        mediaKind: upload.kind,
        blobName: upload.thumbBlobPath,
        byteSize: upload.byteSize,
        hash: upload.hash,
      });
    }
  }

  return operations.sort((a, b) => a.blobName.localeCompare(b.blobName));
}

function printPlan(
  report: PublishPlanReport,
  options: MediaPublishOptions,
  operations: UploadOperation[],
  skippedReuseExisting: number,
) {
  console.log('Media publish');
  console.log(`Report: ${path.relative(root, options.reportPath)}`);
  console.log(`Report generated: ${report.generatedAt}`);
  console.log(`Report mode: ${report.mode}`);
  console.log(`Target: ${report.mediaManifest.storage.baseUrl}`);
  console.log(`Mode: ${options.write ? 'write' : 'dry-run'}`);
  console.log(`Overwrite existing blobs: ${options.overwrite ? 'yes' : 'no'}`);
  console.log(`Thumbnail fallback uploads: ${options.skipThumbFallbacks ? 'no' : 'yes'}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Planned media references: ${report.plannedMediaUploads.length.toLocaleString()}`);
  console.log(`Upload operations: ${operations.length.toLocaleString()}`);
  console.log(`Reuse-existing media references: ${skippedReuseExisting.toLocaleString()}`);
  console.log(`Cache-Control: ${options.cacheControl}`);
}

function printDryRunSample(operations: UploadOperation[]) {
  if (operations.length === 0) {
    console.log('\nNo media upload operations are currently planned.');
    return;
  }

  console.log('\nFirst media upload operations:');

  for (const operation of operations.slice(0, 12)) {
    console.log(`- ${operation.kind}: ${operation.localPath} -> ${operation.blobName}`);
  }

  if (operations.length > 12) {
    console.log(`...and ${(operations.length - 12).toLocaleString()} more.`);
  }
}

async function containerClientForReport(report: PublishPlanReport, options: MediaPublishOptions) {
  const target = report.mediaManifest.storage;
  const connectionAccount = accountNameFromConnectionString(options.connectionString)?.toLowerCase();

  if (connectionAccount && connectionAccount !== target.accountName.toLowerCase()) {
    throw new Error(
      `AZURE_STORAGE_CONNECTION_STRING targets ${connectionAccount}, but the publish plan targets ${target.accountName}.`,
    );
  }

  const serviceClient = options.connectionString
    ? BlobServiceClient.fromConnectionString(options.connectionString)
    : new BlobServiceClient(`https://${target.accountName}.blob.core.windows.net`, new DefaultAzureCredential());

  return serviceClient.getContainerClient(target.containerName);
}

async function uploadAll(
  containerClient: ContainerClient,
  operations: UploadOperation[],
  options: MediaPublishOptions,
) {
  const stats: PublishStats = {
    uploaded: 0,
    skippedExisting: 0,
    skippedReuseExisting: 0,
    failed: 0,
    processed: 0,
  };
  const errors: PublishError[] = [];
  const startedAt = Date.now();
  let nextIndex = 0;
  let stopForErrors = false;

  async function worker() {
    while (!stopForErrors) {
      const operation = operations[nextIndex];
      nextIndex += 1;

      if (!operation) {
        return;
      }

      try {
        await uploadOperation(containerClient, operation, options);
        stats.uploaded += 1;
      } catch (error) {
        if (error instanceof SkipExistingError) {
          stats.skippedExisting += 1;
        } else {
          stats.failed += 1;
          errors.push({
            contentFile: operation.contentFile,
            canonicalKey: operation.canonicalKey,
            localPath: operation.localPath,
            kind: operation.kind,
            blobName: operation.blobName,
            message: errorMessage(error),
          });

          if (stats.failed >= options.maxErrors) {
            stopForErrors = true;
          }
        }
      } finally {
        stats.processed += 1;
        printProgress(stats, operations.length, startedAt);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, operations.length) }, worker));

  if (stopForErrors) {
    console.log(`\nStopped after reaching --max-errors=${options.maxErrors}.`);
  }

  return {
    stats,
    errors,
  };
}

async function uploadOperation(
  containerClient: ContainerClient,
  operation: UploadOperation,
  options: MediaPublishOptions,
) {
  const fullPath = path.resolve(root, operation.localPath);
  const blob = containerClient.getBlockBlobClient(operation.blobName);

  if (!options.overwrite && (await blob.exists())) {
    const properties = await blob.getProperties();
    const existingHash = properties.metadata?.sha256;

    if (existingHash && operation.hash?.value && existingHash.toLowerCase() === operation.hash.value.toLowerCase()) {
      throw new SkipExistingError();
    }

    if (operation.kind === 'thumb-fallback') {
      throw new SkipExistingError();
    }

    throw new Error(
      `Target blob already exists without a matching sha256 metadata value: ${operation.blobName}. Re-run with --overwrite only if this replacement is intentional.`,
    );
  }

  await blob.uploadFile(fullPath, {
    blobHTTPHeaders: {
      blobContentType: contentType(operation.canonicalKey),
      blobCacheControl: options.cacheControl,
    },
    metadata: compactMetadata({
      sha256: operation.hash?.value,
      sitekey: siteKeyFromBlobClient(containerClient),
      mediakey: operation.canonicalKey,
      publishkind: operation.kind,
    }),
  });
}

async function writeResult(
  resultPath: string,
  report: PublishPlanReport,
  options: MediaPublishOptions,
  operationCount: number,
  stats: PublishStats,
  errors: PublishError[],
) {
  await mkdir(path.dirname(resultPath), { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    target: report.mediaManifest.storage,
    operationCount,
    options: {
      overwrite: options.overwrite,
      skipThumbFallbacks: options.skipThumbFallbacks,
      concurrency: options.concurrency,
      cacheControl: options.cacheControl,
    },
    stats,
    errors,
  };

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`\nWrote result: ${path.relative(root, resultPath)}`);
}

function printProgress(stats: PublishStats, total: number, startedAt: number) {
  if (total === 0) {
    return;
  }

  if (stats.processed % 25 !== 0 && stats.processed !== total) {
    return;
  }

  console.log(
    `Processed ${stats.processed.toLocaleString()} / ${total.toLocaleString()} uploaded=${stats.uploaded.toLocaleString()} skippedExisting=${stats.skippedExisting.toLocaleString()} failed=${stats.failed.toLocaleString()} elapsed=${formatDuration(
      Date.now() - startedAt,
    )}`,
  );
}

function contentType(value: string) {
  const extension = path.extname(value).toLowerCase();

  switch (extension) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.m4v':
      return 'video/x-m4v';
    case '.mov':
      return 'video/quicktime';
    case '.mp4':
      return 'video/mp4';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function compactMetadata(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value && /^[\x20-\x7E]+$/.test(value)),
  ) as Record<string, string>;
}

function siteKeyFromBlobClient(containerClient: ContainerClient) {
  return containerClient.containerName;
}

function hasArg(name: string) {
  return args.includes(name);
}

function argValue(name: string) {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function numberArg(name: string, defaultValue: number) {
  const value = argValue(name);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

function accountNameFromConnectionString(connectionString: string | undefined) {
  return /(?:^|;)AccountName=([^;]+)/.exec(connectionString || '')?.[1];
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function commandErrorMessage(error: unknown) {
  const message = errorMessage(error);

  if (message.includes('ChainedTokenCredential authentication failed')) {
    return [
      'Azure storage authentication failed before any media uploads ran.',
      'Set AZURE_STORAGE_CONNECTION_STRING, or authenticate with Azure CLI / PowerShell before running a write publish.',
      'Examples:',
      '  $env:AZURE_STORAGE_CONNECTION_STRING = "<storage connection string>"',
      '  npm run publish:media',
      '  Connect-AzAccount',
      '  npm run publish:media',
    ].join('\n');
  }

  return message;
}

class SkipExistingError extends Error {}

main().catch((error) => {
  console.error(commandErrorMessage(error));
  process.exitCode = 1;
});
