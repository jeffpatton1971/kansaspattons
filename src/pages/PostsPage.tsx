import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatDateLabel, monthName } from '../archive';
import { ArchiveCalendar, resolveSelection } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { PostList, StoryList } from '../components/PostList';
import { fetchPostIndex, fetchStoryIndex, type ArchiveQuery } from '../content';
import { useAsyncData } from '../hooks';
import type { PostIndex } from '../types';

type PostParams = {
  year?: string;
  month?: string;
  day?: string;
};

type EntryArchivePageProps = {
  basePath: '/posts' | '/stories';
  label: string;
  titleLabel: string;
  loader: (query?: ArchiveQuery) => Promise<PostIndex>;
};

export function PostsPage() {
  return (
    <EntryArchivePage
      basePath="/posts"
      label="Post Archive"
      titleLabel="Posts"
      loader={fetchPostIndex}
    />
  );
}

export function StoriesPage() {
  return (
    <EntryArchivePage
      basePath="/stories"
      label="Story Archive"
      titleLabel="Stories"
      loader={fetchStoryIndex}
    />
  );
}

function EntryArchivePage({ basePath, label, titleLabel, loader }: EntryArchivePageProps) {
  const params = useParams<PostParams>();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source') || undefined;
  const sourceSearch = source ? `?source=${encodeURIComponent(source)}` : '';
  const query = {
    year: params.year,
    month: params.month,
    day: params.day,
    source,
  };
  const state = useAsyncData(() => loader(query), [basePath, params.year, params.month, params.day, source]);

  if (state.status === 'loading') {
    return <LoadingState label={`Loading ${titleLabel.toLowerCase()}`} />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const index = state.data;
  const selection = resolveSelection(index.years, params.year, params.month);
  const activeParams = query;
  const posts = index.posts;
  const total = index.page?.total ?? posts.length;

  const title = pageTitle(activeParams, total, sourceLabel(source, titleLabel));

  return (
    <main className="page page--archive page--landing">
      <div className="archive-rail archive-rail--left">
        <ArchiveCalendar
          basePath={basePath}
          label={label}
          years={index.years}
          selectedYear={activeParams.year}
          selectedMonth={activeParams.month}
          selectedDay={activeParams.day}
          search={sourceSearch}
        />
      </div>

      <section className="archive-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{titleLabel}</p>
            <h1>{title}</h1>
          </div>
          <Link className="quiet-link" to={basePath}>
            Reset
          </Link>
        </div>
        {basePath === '/stories' ? <StoryList stories={posts} /> : <PostList posts={posts} />}
        {index.page && index.page.total > posts.length ? (
          <p className="archive-count">
            Showing {posts.length.toLocaleString()} of {index.page.total.toLocaleString()}
          </p>
        ) : null}
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function sourceLabel(source: string | undefined, titleLabel: string) {
  if (!source) {
    return titleLabel;
  }

  return `${source.charAt(0).toUpperCase()}${source.slice(1)} ${titleLabel}`;
}

function pageTitle(params: PostParams, count: number, titleLabel: string) {
  if (params.year && params.month && params.day) {
    return `${formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)} (${count})`;
  }

  if (params.year && params.month) {
    return `${monthName(params.year, params.month)} (${count})`;
  }

  if (params.year) {
    return `${params.year} (${count})`;
  }

  return `All ${titleLabel} (${count})`;
}
