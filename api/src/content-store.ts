import { readFile } from 'node:fs/promises';
import path from 'node:path';

type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

type ContentLocation = {
  baseUrl?: string;
  localRoot?: string;
  cacheLabel: string;
};

const jsonCache = new Map<string, CacheEntry>();

export async function readContentJson<T>(relativePath: string, siteKey?: string): Promise<T> {
  const contentPath = cleanContentPath(relativePath);
  const location = contentLocation(siteKey);
  const cacheKey = contentLocationKey(contentPath, location);
  const cached = jsonCache.get(cacheKey);

  if (!cached || cached.expiresAt <= Date.now()) {
    const value = readContentJsonUncached<T>(contentPath, location).catch((error) => {
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

async function readContentJsonUncached<T>(contentPath: string, location: ContentLocation): Promise<T> {
  if (location.baseUrl) {
    const response = await fetch(new URL(contentPath, location.baseUrl));

    if (!response.ok) {
      throw new ContentNotFoundError(contentPath);
    }

    return (await response.json()) as T;
  }

  const localRoot = path.resolve(process.cwd(), location.localRoot || '../public/content');
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

export function cleanSiteKey(value: string | undefined | null) {
  const trimmed = value?.trim().toLowerCase();

  if (!trimmed) {
    return undefined;
  }

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed)) {
    throw new Error(`Invalid site key: ${value}`);
  }

  return trimmed;
}

function cleanContentPath(relativePath: string) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');

  if (normalized.includes('..')) {
    throw new Error(`Invalid content path: ${relativePath}`);
  }

  return normalized;
}

function contentLocation(siteKey: string | undefined): ContentLocation {
  if (!siteKey) {
    const baseUrl = normalizedBaseUrl(process.env.CONTENT_BASE_URL);
    const localRoot = process.env.CONTENT_LOCAL_ROOT || '../public/content';

    return {
      baseUrl,
      localRoot,
      cacheLabel: baseUrl || localRoot,
    };
  }

  const baseUrl =
    normalizedBaseUrl(siteSpecificEnvValue('CONTENT_BASE_URL', siteKey)) ||
    normalizedBaseUrl(mappedSiteValue('CONTENT_SITE_BASE_URLS', siteKey)) ||
    normalizedBaseUrl(templateSiteValue('CONTENT_BASE_URL_TEMPLATE', siteKey));
  const localRoot =
    siteSpecificEnvValue('CONTENT_LOCAL_ROOT', siteKey) ||
    mappedSiteValue('CONTENT_SITE_LOCAL_ROOTS', siteKey) ||
    templateSiteValue('CONTENT_LOCAL_ROOT_TEMPLATE', siteKey);

  if (!baseUrl && !localRoot) {
    throw new ContentNotFoundError(`site:${siteKey}`);
  }

  return {
    baseUrl,
    localRoot,
    cacheLabel: baseUrl || localRoot || siteKey,
  };
}

function contentLocationKey(contentPath: string, location: ContentLocation) {
  return `${location.cacheLabel}:${contentPath}`;
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

function mappedSiteValue(envName: string, siteKey: string) {
  const raw = process.env[envName]?.trim();

  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const value = parsed[siteKey];

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function templateSiteValue(envName: string, siteKey: string) {
  return process.env[envName]?.replaceAll('{site}', siteKey).trim() || undefined;
}

function siteSpecificEnvValue(prefix: string, siteKey: string) {
  return process.env[`${prefix}_${siteKey.replaceAll('-', '_').toUpperCase()}`]?.trim() || undefined;
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
