import { readFile } from 'node:fs/promises';
import path from 'node:path';

type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

const jsonCache = new Map<string, CacheEntry>();

export async function readContentJson<T>(relativePath: string): Promise<T> {
  const contentPath = cleanContentPath(relativePath);
  const cacheKey = contentLocationKey(contentPath);
  const cached = jsonCache.get(cacheKey);

  if (!cached || cached.expiresAt <= Date.now()) {
    const value = readContentJsonUncached<T>(contentPath).catch((error) => {
      jsonCache.delete(cacheKey);
      throw error;
    });

    jsonCache.set(cacheKey, {
      expiresAt: Date.now() + cacheMilliseconds(),
      value,
    });
  }

  return jsonCache.get(cacheKey)!.value as Promise<T>;
}

async function readContentJsonUncached<T>(contentPath: string): Promise<T> {
  const baseUrl = normalizedBaseUrl(process.env.CONTENT_BASE_URL);

  if (baseUrl) {
    const response = await fetch(new URL(contentPath, baseUrl));

    if (!response.ok) {
      throw new ContentNotFoundError(contentPath);
    }

    return (await response.json()) as T;
  }

  const localRoot = path.resolve(process.cwd(), process.env.CONTENT_LOCAL_ROOT || '../public/content');
  const fullPath = path.resolve(localRoot, contentPath);

  if (!fullPath.startsWith(`${localRoot}${path.sep}`) && fullPath !== localRoot) {
    throw new Error(`Refusing to read content outside configured root: ${contentPath}`);
  }

  try {
    return JSON.parse(await readFile(fullPath, 'utf8')) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new ContentNotFoundError(contentPath);
    }

    throw error;
  }
}

export class ContentNotFoundError extends Error {
  constructor(contentPath: string) {
    super(`Content artifact not found: ${contentPath}`);
    this.name = 'ContentNotFoundError';
  }
}

function cleanContentPath(relativePath: string) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');

  if (normalized.includes('..')) {
    throw new Error(`Invalid content path: ${relativePath}`);
  }

  return normalized;
}

function contentLocationKey(contentPath: string) {
  return `${process.env.CONTENT_BASE_URL || process.env.CONTENT_LOCAL_ROOT || '../public/content'}:${contentPath}`;
}

function cacheMilliseconds() {
  const seconds = Number(process.env.CONTENT_CACHE_SECONDS || 60);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return 60_000;
  }

  return seconds * 1000;
}

function normalizedBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
