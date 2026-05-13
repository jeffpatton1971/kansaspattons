import { Link } from 'react-router-dom';
import { formatDateLabel } from '../archive';
import type { PostSummary } from '../types';

export function PostList({ posts, compact = false }: { posts: PostSummary[]; compact?: boolean }) {
  if (posts.length === 0) {
    return <p className="state-text">No posts found for this date.</p>;
  }

  return (
    <div className={compact ? 'post-list post-list--compact' : 'post-list post-list--articles'}>
      {posts.map((post) => (
        <Link className="article-card" to={post.route} key={post.route}>
          <div>
            <time dateTime={post.date}>{formatDateLabel(post.date)}</time>
            <h2>{post.title}</h2>
            {post.excerpt ? <p>{post.excerpt}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function EntrySummaryList({ entries }: { entries: PostSummary[] }) {
  if (entries.length === 0) {
    return <p className="state-text">No recent updates found.</p>;
  }

  return (
    <div className="entry-summary-list">
      {entries.map((entry) => (
        <Link className="entry-summary-card" to={entry.route} key={entry.route}>
          <time dateTime={entry.date}>{formatDateLabel(entry.date)}</time>
          <h2>{entry.title}</h2>
          {entry.excerpt ? <p>{entry.excerpt}</p> : null}
        </Link>
      ))}
    </div>
  );
}

export function StoryList({ stories }: { stories: PostSummary[] }) {
  if (stories.length === 0) {
    return <p className="state-text">No stories found for this date.</p>;
  }

  return (
    <div className="story-list">
      {stories.map((story) => (
        <Link className="story-card" to={story.route} key={story.route}>
          {story.coverImage ? (
            <img src={story.coverImage.thumbUrl} alt={story.coverImage.alt || story.title} loading="lazy" />
          ) : (
            <div className="story-card__placeholder" aria-hidden="true" />
          )}
          <div>
            <time dateTime={story.date}>{formatDateLabel(story.date)}</time>
            <h2>{story.title}</h2>
            {story.excerpt && story.excerpt !== story.title ? <p>{story.excerpt}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
