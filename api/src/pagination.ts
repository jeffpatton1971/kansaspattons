import type { EntrySummary, ImageSummary } from './types.js';

export type DateQuery = {
  year?: string;
  month?: string;
  day?: string;
};

export type PageQuery = DateQuery & {
  cursor?: string;
  limit?: string;
};

export type PagedResult<T> = {
  items: T[];
  page: {
    cursor: number;
    limit: number;
    total: number;
    nextCursor?: number;
  };
};

type DateItem = Pick<EntrySummary | ImageSummary, 'year' | 'month' | 'day'>;

export function filterByDate<T extends DateItem>(items: T[], query: DateQuery) {
  return items.filter((item) => {
    if (query.year && item.year !== query.year) {
      return false;
    }

    if (query.month && item.month !== query.month) {
      return false;
    }

    if (query.day && item.day !== query.day) {
      return false;
    }

    return true;
  });
}

export function pageItems<T>(items: T[], query: PageQuery, defaultLimit = 24, maxLimit = 100): PagedResult<T> {
  const cursor = nonNegativeInteger(query.cursor) ?? 0;
  const limit = Math.min(nonNegativeInteger(query.limit) ?? defaultLimit, maxLimit);
  const page = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < items.length ? cursor + limit : undefined;

  return {
    items: page,
    page: {
      cursor,
      limit,
      total: items.length,
      nextCursor,
    },
  };
}

function nonNegativeInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}
