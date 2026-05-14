import { app, type HttpRequest } from '@azure/functions';
import { readContentJson } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { filterByDate, pageItems, type PageQuery } from '../pagination.js';
import { siteKeyFromRequest } from '../site.js';
import type { ImageIndex, ImageSummary } from '../types.js';

app.http('imagesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'images',
  handler: imagesListHandler,
});

app.http('siteImagesList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/images',
  handler: imagesListHandler,
});

app.http('imageDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'images/{year}/{month}/{day}/{imageId}',
  handler: imageDetailHandler,
});

app.http('siteImageDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/images/{year}/{month}/{day}/{imageId}',
  handler: imageDetailHandler,
});

type ImageGroupBy = 'year' | 'month' | 'day';

type ImageGroup = {
  key: string;
  label: string;
  href: string;
  count: number;
  images: ImageSummary[];
};

async function imagesListHandler(request: HttpRequest) {
  return withErrors(async () => {
    const index = await readContentJson<ImageIndex>('images/index.json', siteKeyFromRequest(request));
    const query = pageQuery(request);
    const filtered = filterByRelationship(filterByDate(index.images, query), imageIds(request), galleryIds(request));
    const groupBy = groupByQuery(request);
    const grouped = groupBy ? groupImages(filtered, groupBy) : undefined;
    const paged = groupBy ? undefined : pageItems(filtered, query, 48, 10_000);

    return jsonResponse({
      generatedAt: index.generatedAt,
      filters: query,
      groupBy,
      years: index.years,
      groups: grouped,
      ...(paged ?? {}),
    });
  });
}

async function imageDetailHandler(request: HttpRequest) {
  return withErrors(async () => {
    const { year, month, day, imageId } = request.params;
    const index = await readContentJson<ImageIndex>('images/index.json', siteKeyFromRequest(request));
    const image = index.images.find(
      (item) => item.year === year && item.month === month && item.day === day && item.id === imageId,
    );

    if (!image) {
      return jsonResponse(
        {
          error: 'not_found',
          detail: `Image not found: ${year}/${month}/${day}/${imageId}`,
        },
        { status: 404 },
      );
    }

    return jsonResponse(image);
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

function groupByQuery(request: HttpRequest): ImageGroupBy | undefined {
  const value = request.query.get('groupBy');

  if (value === 'year' || value === 'month' || value === 'day') {
    return value;
  }

  return undefined;
}

function galleryIds(request: HttpRequest) {
  return (request.query.get('galleryId') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function imageIds(request: HttpRequest) {
  return (request.query.get('imageId') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function filterByRelationship(images: ImageSummary[], imageIds: string[], galleryIds: string[]) {
  if (imageIds.length === 0 && galleryIds.length === 0) {
    return images;
  }

  const directIds = new Set(imageIds);
  const galleryIdSet = new Set(galleryIds);

  return images.filter(
    (image) => directIds.has(image.id) || Boolean(image.galleryId && galleryIdSet.has(image.galleryId)),
  );
}

function groupImages(images: ImageSummary[], groupBy: ImageGroupBy): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();

  for (const image of images) {
    const group = imageGroup(image, groupBy);

    if (!groups.has(group.key)) {
      groups.set(group.key, {
        ...group,
        count: 0,
        images: [],
      });
    }

    const existing = groups.get(group.key)!;
    existing.count += 1;

    if (existing.images.length < 12) {
      existing.images.push(image);
    }
  }

  return [...groups.values()];
}

function imageGroup(image: ImageSummary, groupBy: ImageGroupBy) {
  if (groupBy === 'year') {
    return {
      key: image.year,
      label: image.year,
      href: `/images/${image.year}`,
    };
  }

  if (groupBy === 'month') {
    return {
      key: `${image.year}-${image.month}`,
      label: `${image.year}-${image.month}`,
      href: `/images/${image.year}/${image.month}`,
    };
  }

  return {
    key: `${image.year}-${image.month}-${image.day}`,
    label: `${image.year}-${image.month}-${image.day}`,
    href: `/images/${image.year}/${image.month}/${image.day}`,
  };
}
