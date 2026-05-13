import type { PostSummary } from '../types';
import type { ReactNode } from 'react';

type EntryMetadataProps = {
  entry: PostSummary;
};

export function EntryMetadata({ entry }: EntryMetadataProps) {
  const hashtags = entry.hashtags ?? [];
  const handles = entry.handles ?? [];
  const tags = displayTags(entry.tags, entry.sourceType, hashtags);

  if (
    entry.categories.length === 0 &&
    tags.length === 0 &&
    hashtags.length === 0 &&
    handles.length === 0 &&
    !entry.location
  ) {
    return null;
  }

  return (
    <div className="entry-meta">
      <ChipGroup label="Categories" values={entry.categories} />
      <ChipGroup label="Tags" values={tags} />
      <ChipGroup
        label="Hashtags"
        values={hashtags}
        renderValue={(value) => (
          <a href={instagramHashtagUrl(value)} target="_blank" rel="noopener noreferrer">
            #{stripPrefix(value, '#')}
          </a>
        )}
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
      {entry.location ? (
        <div className="entry-meta__group">
          <span className="entry-meta__label">Location</span>
          <span className="entry-meta__chip">{entry.location}</span>
        </div>
      ) : null}
    </div>
  );
}

function ChipGroup({
  label,
  values,
  renderValue,
}: {
  label: string;
  values: string[];
  renderValue?: (value: string) => ReactNode;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="entry-meta__group">
      <span className="entry-meta__label">{label}</span>
      {values.map((value) => (
        <span className="entry-meta__chip" key={`${label}-${value}`}>
          {renderValue ? renderValue(value) : value}
        </span>
      ))}
    </div>
  );
}

function displayTags(tags: string[], sourceType: string | undefined, hashtags: string[]) {
  const normalizedSource = sourceType?.toLowerCase();
  const normalizedHashtags = new Set(hashtags.map(normalizeToken));

  return tags.filter((tag) => {
    const normalized = normalizeToken(tag);

    return normalized !== normalizedSource && !normalizedHashtags.has(normalized);
  });
}

function instagramHashtagUrl(value: string) {
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(stripPrefix(value, '#'))}/`;
}

function instagramHandleUrl(value: string) {
  return `https://www.instagram.com/${encodeURIComponent(stripPrefix(value, '@'))}/`;
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(1) : value;
}

function normalizeToken(value: string) {
  return stripPrefix(stripPrefix(value.trim().toLowerCase(), '#'), '@');
}
