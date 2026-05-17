import assert from 'node:assert/strict';
import test from 'node:test';
import { contentRuntimeDiagnostics } from '../src/content-store.js';

const keys = [
  'CONTENT_BASE_URL',
  'CONTENT_STORAGE_ACCOUNT',
  'CONTENT_STORAGE_CONTAINER',
  'CONTENT_STORAGE_PREFIX',
  'CONTENT_SITE_KEY',
  'CONTENT_LOCAL_ROOT',
  'CONTENT_SITE_BASE_URLS',
  'CONTENT_BASE_URL_TEMPLATE',
];

test('content diagnostics reports configured content base URL', () => {
  withCleanContentEnv(() => {
    process.env.CONTENT_BASE_URL = 'https://example.test/content-root';

    const diagnostics = contentRuntimeDiagnostics();

    assert.equal(diagnostics.location.source, 'CONTENT_BASE_URL');
    assert.equal(diagnostics.location.baseUrl, 'https://example.test/content-root/');
    assert.equal(diagnostics.settings.hasContentBaseUrl, true);
  });
});

test('content diagnostics can derive a storage-backed content base URL', () => {
  withCleanContentEnv(() => {
    process.env.CONTENT_STORAGE_ACCOUNT = 'account';
    process.env.CONTENT_STORAGE_CONTAINER = 'site-container';
    process.env.CONTENT_STORAGE_PREFIX = 'current';

    const diagnostics = contentRuntimeDiagnostics();

    assert.equal(diagnostics.location.source, 'CONTENT_STORAGE_*');
    assert.equal(diagnostics.location.baseUrl, 'https://account.blob.core.windows.net/site-container/current/');
  });
});

test('content diagnostics preserves explicit local root for local development', () => {
  withCleanContentEnv(() => {
    process.env.CONTENT_LOCAL_ROOT = '../public/content';

    const diagnostics = contentRuntimeDiagnostics();

    assert.equal(diagnostics.location.source, 'CONTENT_LOCAL_ROOT');
    assert.equal(diagnostics.location.localRoot, '../public/content');
  });
});

function withCleanContentEnv(callback: () => void) {
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  try {
    callback();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
