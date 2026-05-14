import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { filterByDate, pageItems, type PageQuery } from '../pagination.js';
import { siteKeyFromRequest } from '../site.js';
import type { ContentShape, EntryDocument, EntryIndex } from '../types.js';

type EntryFamily = {
  contentPath: 'posts' | 'stories';
  shape: ContentShape;
};

const entryFamilies = [
  { contentPath: 'posts', shape: 'post' },
  { contentPath: 'stories', shape: 'story' },
] satisfies EntryFamily[];

app.http('entriesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entries',
  handler: entriesListHandler,
});

app.http('siteEntriesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/entries',
  handler: entriesListHandler,
});

for (const family of entryFamilies) {
  app.http(`${family.contentPath}List`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: family.contentPath,
    handler: entryListHandler(family),
  });

  app.http(`site${family.contentPath}List`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: `sites/{site}/${family.contentPath}`,
    handler: entryListHandler(family),
  });

  app.http(`${family.contentPath}Detail`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: `${family.contentPath}/{year}/{month}/{day}/{slug}`,
    handler: entryDetailHandler(family),
  });

  app.http(`site${family.contentPath}Detail`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: `sites/{site}/${family.contentPath}/{year}/{month}/{day}/{slug}`,
    handler: entryDetailHandler(family),
  });
}

async function entriesListHandler(request: HttpRequest) {
  return withErrors(async () => {
    const query = pageQuery(request);
    const index = await readContentJson<EntryIndex>('entries/index.json', siteKeyFromRequest(request));
    const filtered = filterByDate(index.posts, query);
    const paged = pageItems(filtered, query, 24, 2_000);

    return jsonResponse({
      generatedAt: index.generatedAt,
      filters: query,
      years: index.years,
      ...paged,
    });
  });
}

function entryListHandler(family: EntryFamily) {
  return async (request: HttpRequest) =>
    withErrors(async () => {
      const query = pageQuery(request);
      const index = await readContentJson<EntryIndex>(
        `${family.contentPath}/index.json`,
        siteKeyFromRequest(request),
      );
      const filtered = filterByDate(index.posts, query);
      const paged = pageItems(filtered, query, 24, 2_000);

      return jsonResponse({
        generatedAt: index.generatedAt,
        contentShape: family.shape,
        filters: query,
        years: index.years,
        ...paged,
      });
    });
}

function entryDetailHandler(family: EntryFamily) {
  return async (request: HttpRequest) =>
    withErrors(async () => {
      const { year, month, day, slug } = request.params;
      const document = await readContentJson<EntryDocument>(
        `${family.contentPath}/${year}/${month}/${day}/${slug}.json`,
        siteKeyFromRequest(request),
      );

      return jsonResponse(document);
    });
}

function pageQuery(request: HttpRequest): PageQuery {
  return {
    year: request.query.get('year') || undefined,
    month: request.query.get('month') || undefined,
    day: request.query.get('day') || undefined,
    cursor: request.query.get('cursor') || undefined,
    limit: request.query.get('limit') || undefined,
  };
}
