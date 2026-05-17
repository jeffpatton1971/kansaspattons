import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { pageItems } from '../pagination.js';
import { rankedSearchResults, searchType } from '../search.js';
import { siteKeyFromRequest } from '../site.js';
import type { SearchIndex } from '../types.js';

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
    const type = searchType(request.query.get('type'));
    const index = await readContentJson<SearchIndex>('search/index.json', siteKeyFromRequest(request));
    const results = rankedSearchResults(index.items, query, type);
    const paged = pageItems(results.items, {
      cursor: request.query.get('cursor') || undefined,
      limit: request.query.get('limit') || undefined,
    }, 12, 100);

    return jsonResponse({
      generatedAt: index.generatedAt,
      query,
      terms: results.terms,
      filters: {
        type,
      },
      ...paged,
    });
  });
}
