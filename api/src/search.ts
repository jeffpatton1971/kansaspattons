import type { SearchContentType, SearchIndexItem, SearchResult } from './types.js';

export function rankedSearchResults(
  items: SearchIndexItem[],
  query: string,
  type?: SearchContentType,
): { terms: string[]; items: SearchResult[] } {
  const terms = searchTerms(query);
  const candidates = type ? items.filter((item) => item.type === type) : items;
  const results = terms.length > 0 ? rankedResults(candidates, terms) : [];

  return {
    terms,
    items: results,
  };
}

export function searchTerms(query: string) {
  return unique(
    normalizeSearchText(query)
      .split(' ')
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  );
}

export function searchType(value: string | null): SearchContentType | undefined {
  if (value === 'post' || value === 'story' || value === 'gallery') {
    return value;
  }

  return undefined;
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

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/^#+|\B#/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}
