import type { PostSummary } from '../types';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type EntryMetadataProps = {
  entry: PostSummary;
};

export function EntryMetadata({ entry }: EntryMetadataProps) {
  const hashtags = entry.hashtags ?? [];
  const handles = entry.handles ?? [];
  const people = entry.people ?? [];
  const locations = entry.locations ?? (entry.location ? [entry.location] : []);

  if (
    entry.categories.length === 0 &&
    hashtags.length === 0 &&
    handles.length === 0 &&
    people.length === 0 &&
    locations.length === 0
  ) {
    return null;
  }

  return (
    <div className="entry-meta">
      <ChipGroup label="Categories" values={entry.categories} hrefForValue={(value) => taxonomyHref('categories', value)} />
      <ChipGroup label="People" values={people} hrefForValue={(value) => taxonomyHref('people', value)} />
      <ChipGroup label="Locations" values={locations} hrefForValue={(value) => taxonomyHref('locations', value)} />
      <ChipGroup
        label="Hashtags"
        values={hashtags}
        hrefForValue={(value) => taxonomyHref('hashtags', value)}
        renderValue={(value) => `#${stripPrefix(value, '#')}`}
      />
      <ChipGroup
        label="Handles"
        values={handles}
        renderValue={(value) => (
          <a href={instagramHandleUrl(value)} target="_blank" rel="noopener noreferrer">
            @{stripPrefix(value, '@')}
          </a>
        )}
      />
    </div>
  );
}

function ChipGroup({
  label,
  values,
  renderValue,
  hrefForValue,
}: {
  label: string;
  values: string[];
  renderValue?: (value: string) => ReactNode;
  hrefForValue?: (value: string) => string;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="entry-meta__group">
      <span className="entry-meta__label">{label}</span>
      {values.map((value) => {
        const content = renderValue ? renderValue(value) : value;
        const href = hrefForValue?.(value);

        return (
          <span className="entry-meta__chip" key={`${label}-${value}`}>
            {href ? <Link to={href}>{content}</Link> : content}
          </span>
        );
      })}
    </div>
  );
}

function instagramHandleUrl(value: string) {
  return `https://www.instagram.com/${encodeURIComponent(stripPrefix(value, '@'))}/`;
}

function taxonomyHref(family: 'hashtags' | 'categories' | 'people' | 'locations', value: string) {
  return `/${family}/${encodeURIComponent(taxonomySlug(value))}`;
}

function taxonomySlug(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(1) : value;
}
