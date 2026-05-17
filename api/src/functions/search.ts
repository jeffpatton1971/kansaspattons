import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { pageItems } from '../pagination.js';
import { siteKeyFromRequest } from '../site.js';
import type { SearchContentType, SearchIndex, SearchIndexItem, SearchResult } from '../types.js';

app.http('search', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'search',
  handler: searchHandler,
});

app.http('siteSearch', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/search',
  handler: searchHandler,
});

async function searchHandler(request: HttpRequest) {
  return withErrors(async () => {
    const query = request.query.get('q')?.trim() ?? '';
    const terms = searchTerms(query);
    const type = searchType(request.query.get('type'));
    const index = await readContentJson<SearchIndex>('search/index.json', siteKeyFromRequest(request));
    const candidates = type ? index.items.filter((item) => item.type === type) : index.items;
    const results = terms.length > 0 ? rankedResults(candidates, terms) : [];
    const paged = pageItems(results, {
      cursor: request.query.get('cursor') || undefined,
      limit: request.query.get('limit') || undefined,
    }, 12, 100);

    return jsonResponse({
      generatedAt: index.generatedAt,
      query,
      terms,
      filters: {
        type,
      },
      ...paged,
    });
  });
}

function rankedResults(items: SearchIndexItem[], terms: string[]): SearchResult[] {
  return items
    .map((item) => scoreItem(item, terms))
    .filter((result): result is SearchResult => Boolean(result))
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

function scoreItem(item: SearchIndexItem, terms: string[]): SearchResult | undefined {
  const title = normalizeSearchText(item.title);
  const summary = normalizeSearchText(item.summary);
  const fields = searchableFields(item);
  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of terms) {
    let termScore = 0;

    if (title === term) {
      termScore += 40;
    } else if (title.startsWith(term)) {
      termScore += 24;
    } else if (title.includes(term)) {
      termScore += 16;
    }

    if (fields.exact.has(term)) {
      termScore += 18;
    }

    if (summary.includes(term)) {
      termScore += 8;
    }

    if ((item.searchText ?? '').includes(term)) {
      termScore += 4;
    }

    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  if (matchedTerms.length !== terms.length) {
    return undefined;
  }

  const { searchText: _searchText, ...publicItem } = item;

  return {
    ...publicItem,
    score,
    matchedTerms,
  };
}

function searchableFields(item: SearchIndexItem) {
  const exact = new Set(
    [
      ...(item.hashtags ?? []),
      ...(item.categories ?? []),
      ...(item.people ?? []),
      ...(item.locations ?? []),
      ...(item.authors ?? []),
    ].map(normalizeSearchText),
  );

  return { exact };
}

function searchTerms(query: string) {
  return unique(
    normalizeSearchText(query)
      .split(' ')
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/^#+|\B#/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function searchType(value: string | null): SearchContentType | undefined {
  if (value === 'post' || value === 'story' || value === 'gallery') {
    return value;
  }

  return undefined;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
