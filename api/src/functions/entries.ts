import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { filterByDate, pageItems, type PageQuery } from '../pagination.js';
import type { ContentShape, EntryDocument, EntryIndex } from '../types.js';

type EntryFamily = {
  contentPath: 'posts' | 'stories';
  shape: ContentShape;
};

const entryFamilies = [
  { contentPath: 'posts', shape: 'post' },
  { contentPath: 'stories', shape: 'story' },
] satisfies EntryFamily[];

for (const family of entryFamilies) {
  app.http(`${family.contentPath}List`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: family.contentPath,
    handler: async (request) =>
      withErrors(async () => {
        const index = await readContentJson<EntryIndex>(`${family.contentPath}/index.json`);
        const filtered = filterByDate(index.posts, pageQuery(request));
        const paged = pageItems(filtered, pageQuery(request), 24);

        return jsonResponse({
          generatedAt: index.generatedAt,
          contentShape: family.shape,
          filters: pageQuery(request),
          years: index.years,
          ...paged,
        });
      }),
  });

  app.http(`${family.contentPath}Detail`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: `${family.contentPath}/{year}/{month}/{day}/{slug}`,
    handler: async (request) =>
      withErrors(async () => {
        const { year, month, day, slug } = request.params;
        const document = await readContentJson<EntryDocument>(
          `${family.contentPath}/${year}/${month}/${day}/${slug}.json`,
        );

        return jsonResponse(document);
      }),
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
