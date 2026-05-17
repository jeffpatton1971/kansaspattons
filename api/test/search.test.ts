import assert from 'node:assert/strict';
import test from 'node:test';
import { rankedSearchResults, searchTerms } from '../src/search.js';
import type { SearchIndexItem } from '../src/types.js';

test('search terms are normalized and de-duplicated', () => {
  assert.deepEqual(searchTerms('#Breakfast breakfast!'), ['breakfast']);
});

test('ranked search returns matching items without internal search text', () => {
  const results = rankedSearchResults(
    [
      searchItem({
        id: 'story-breakfast',
        type: 'story',
        title: '#breakfast',
        date: '2026-04-05T11:53:15Z',
        hashtags: ['breakfast'],
        searchText: 'breakfast pancakes family',
      }),
      searchItem({
        id: 'post-field-trip',
        type: 'post',
        title: 'Field Trip',
        date: '2025-09-20T10:00:00Z',
        searchText: 'school bus museum',
      }),
    ],
    'breakfast',
  );

  assert.equal(results.terms.length, 1);
  assert.equal(results.items.length, 1);
  assert.equal(results.items[0].id, 'story-breakfast');
  assert.equal('searchText' in results.items[0], false);
  assert.deepEqual(results.items[0].matchedTerms, ['breakfast']);
});

test('ranked search can filter by content type', () => {
  const results = rankedSearchResults(
    [
      searchItem({
        id: 'story-breakfast',
        type: 'story',
        title: 'Breakfast',
        date: '2026-04-05T11:53:15Z',
        searchText: 'breakfast',
      }),
      searchItem({
        id: 'gallery-breakfast',
        type: 'gallery',
        title: 'Breakfast Gallery',
        date: '2026-04-05T11:53:15Z',
        searchText: 'breakfast',
      }),
    ],
    'breakfast',
    'gallery',
  );

  assert.deepEqual(results.items.map((item) => item.id), ['gallery-breakfast']);
});

function searchItem(overrides: Partial<SearchIndexItem>): SearchIndexItem {
  return {
    siteKey: 'fixture',
    id: 'fixture',
    type: 'post',
    title: 'Fixture',
    date: '2026-01-01T00:00:00Z',
    year: '2026',
    month: '01',
    day: '01',
    route: '/posts/2026/01/01/fixture',
    summary: '',
    authors: ['Jeff Patton'],
    people: [],
    categories: [],
    hashtags: [],
    locations: [],
    searchText: '',
    ...overrides,
  };
}
