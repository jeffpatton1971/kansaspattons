import { Link, useParams } from 'react-router-dom';
import { filterByDate, formatDateLabel, monthName } from '../archive';
import { ArchiveCalendar, resolveSelection } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { PostList, StoryList } from '../components/PostList';
import { fetchPostIndex, fetchStoryIndex } from '../content';
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
  loader: () => Promise<PostIndex>;
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
  const state = useAsyncData(loader, [basePath]);

  if (state.status === 'loading') {
    return <LoadingState label={`Loading ${titleLabel.toLowerCase()}`} />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const index = state.data;
  const selection = resolveSelection(index.years, params.year, params.month);
  const activeParams = {
    year: selection?.year.year,
    month: selection?.month.month,
    day: params.day,
  };
  const posts = filterByDate(index.posts, activeParams);

  const title = pageTitle(activeParams, posts.length);

  return (
    <main className="page page--archive">
      <div className="archive-rail archive-rail--left">
        <ArchiveCalendar
          basePath={basePath}
          label={label}
          years={index.years}
          selectedYear={activeParams.year}
          selectedMonth={activeParams.month}
          selectedDay={activeParams.day}
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
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function pageTitle(params: PostParams, count: number) {
  if (params.year && params.month && params.day) {
    return `${formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)} (${count})`;
  }

  if (params.year && params.month) {
    return `${monthName(params.year, params.month)} (${count})`;
  }

  if (params.year) {
    return `${params.year} (${count})`;
  }

  return `Latest (${count})`;
}
