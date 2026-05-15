import { app, type HttpRequest } from '@azure/functions';
import { ContentNotFoundError, readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { siteKeyFromRequest } from '../site.js';
import type { TaxonomyIndex, TaxonomyTerm } from '../types.js';

type TaxonomyFamily = 'hashtags' | 'categories' | 'people' | 'locations';

const taxonomyFamilies = new Set<TaxonomyFamily>(['hashtags', 'categories', 'people', 'locations']);

app.http('taxonomyIndex', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'taxonomy',
  handler: taxonomyIndexHandler,
});

app.http('siteTaxonomyIndex', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/taxonomy',
  handler: taxonomyIndexHandler,
});

app.http('taxonomyTerm', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'taxonomy/{family}/{slug}',
  handler: taxonomyTermHandler,
});

app.http('siteTaxonomyTerm', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/taxonomy/{family}/{slug}',
  handler: taxonomyTermHandler,
});

async function taxonomyIndexHandler(request: HttpRequest) {
  return withErrors(async () => {
    const index = await readContentJson<TaxonomyIndex>('taxonomy.json', siteKeyFromRequest(request));
    return jsonResponse(index);
  });
}

async function taxonomyTermHandler(request: HttpRequest) {
  return withErrors(async () => {
    const family = taxonomyFamily(request.params.family);
    const slug = request.params.slug;
    const index = await readContentJson<TaxonomyIndex>('taxonomy.json', siteKeyFromRequest(request));
    const term = index[family].find((item) => item.slug === slug);

    if (!term) {
      throw new ContentNotFoundError(`taxonomy:${family}/${slug}`);
    }

    return jsonResponse({
      ...term,
      items: sortItems(term.items),
    });
  });
}

function taxonomyFamily(value: string | undefined): TaxonomyFamily {
  if (taxonomyFamilies.has(value as TaxonomyFamily)) {
    return value as TaxonomyFamily;
  }

  throw new ContentNotFoundError(`taxonomy:${value}`);
}

function sortItems(items: TaxonomyTerm['items']) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}
