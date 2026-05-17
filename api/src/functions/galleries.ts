import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { archiveYears, filterByDate, filterBySource, pageItems, type PageQuery } from '../pagination.js';
import { siteKeyFromRequest } from '../site.js';
import type { GalleryDocument, GalleryIndex } from '../types.js';

app.http('galleriesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'galleries',
  handler: galleriesListHandler,
});

app.http('siteGalleriesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/galleries',
  handler: galleriesListHandler,
});

app.http('galleryDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'galleries/{year}/{month}/{day}/{slug}',
  handler: galleryDetailHandler,
});

app.http('siteGalleryDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/galleries/{year}/{month}/{day}/{slug}',
  handler: galleryDetailHandler,
});

async function galleriesListHandler(request: HttpRequest) {
  return withErrors(async () => {
    const query = pageQuery(request);
    const index = await readContentJson<GalleryIndex>('galleries/index.json', siteKeyFromRequest(request));
    const filtered = filterByDate(filterBySource(index.galleries, query), query);
    const paged = pageItems(filtered, query, 24, 2_000);

    return jsonResponse({
      generatedAt: index.generatedAt,
      contentType: 'gallery',
      filters: query,
      years: archiveYears(filtered, '/galleries'),
      ...paged,
    });
  });
}

async function galleryDetailHandler(request: HttpRequest) {
  return withErrors(async () => {
    const { year, month, day, slug } = request.params;
    const document = await readContentJson<GalleryDocument>(
      `galleries/${year}/${month}/${day}/${slug}.json`,
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
    source: request.query.get('source') || undefined,
  };
}
