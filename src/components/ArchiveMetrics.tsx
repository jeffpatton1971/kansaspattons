import { BookOpen, CalendarDays, Images } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchHomeSummary } from '../content';
import { useAsyncData } from '../hooks';

export function ArchiveMetrics() {
  const state = useAsyncData(fetchHomeSummary, []);

  if (state.status === 'loading') {
    return <div className="metrics metrics--rail metrics--loading" aria-label="Archive totals" />;
  }

  if (state.status === 'error') {
    return null;
  }

  const { counts, sourceCounts = [] } = state.data;

  return (
    <div className="metrics-stack" aria-label="Archive totals">
      <div className="metrics metrics--rail">
        <Link to="/posts" className="metric">
          <CalendarDays aria-hidden="true" size={22} />
          <strong>{counts.posts.toLocaleString()}</strong>
          <span>posts</span>
        </Link>
        <Link to="/stories" className="metric">
          <BookOpen aria-hidden="true" size={22} />
          <strong>{counts.stories.toLocaleString()}</strong>
          <span>stories</span>
        </Link>
        <Link to="/galleries" className="metric">
          <Images aria-hidden="true" size={22} />
          <strong>{(counts.galleries ?? 0).toLocaleString()}</strong>
          <span>galleries</span>
        </Link>
        <Link to="/images" className="metric">
          <Images aria-hidden="true" size={22} />
          <strong>{counts.images.toLocaleString()}</strong>
          <span>images</span>
        </Link>
      </div>
      {sourceCounts.length > 0 ? (
        <section className="source-badges" aria-label="Source filters">
          <p className="eyebrow">Sources</p>
          {sourceCounts.map((item) => (
            <Link className={`source-badge source-badge--${item.source}`} to={item.href} key={item.source}>
              <span>{item.label}</span>
              <strong>{item.count.toLocaleString()}</strong>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
