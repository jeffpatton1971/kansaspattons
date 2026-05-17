import type { ArchiveYear, EntrySummary, GallerySummary, ImageSummary } from './types.js';

export type DateQuery = {
  year?: string;
  month?: string;
  day?: string;
};

export type PageQuery = DateQuery & {
  cursor?: string;
  limit?: string;
  source?: string;
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

type DateItem = Pick<EntrySummary | GallerySummary | ImageSummary, 'year' | 'month' | 'day'>;
type SourceItem = Pick<EntrySummary | GallerySummary, 'sourceType'>;

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

export function filterBySource<T extends SourceItem>(items: T[], query: Pick<PageQuery, 'source'>) {
  const source = query.source?.toLowerCase();

  if (!source) {
    return items;
  }

  return items.filter((item) => item.sourceType?.toLowerCase() === source);
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

export function archiveYears(items: DateItem[], basePath: string): ArchiveYear[] {
  const years = new Map<string, Map<string, Map<string, number>>>();

  for (const item of items) {
    if (!years.has(item.year)) {
      years.set(item.year, new Map());
    }

    const months = years.get(item.year)!;
    if (!months.has(item.month)) {
      months.set(item.month, new Map());
    }

    const days = months.get(item.month)!;
    days.set(item.day, (days.get(item.day) ?? 0) + 1);
  }

  return [...years.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, months]) => {
      const monthList = [...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, days]) => {
          const dayList = [...days.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([day, count]) => ({
              day,
              count,
              href: `${basePath}/${year}/${month}/${day}`,
            }));

          return {
            month,
            count: sum(dayList.map((day) => day.count)),
            href: `${basePath}/${year}/${month}`,
            days: dayList,
          };
        });

      return {
        year,
        count: sum(monthList.map((month) => month.count)),
        href: `${basePath}/${year}`,
        months: monthList,
      };
    });
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

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
