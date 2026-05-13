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

  const { counts } = state.data;

  return (
    <div className="metrics metrics--rail" aria-label="Archive totals">
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
      <Link to="/images" className="metric">
        <Images aria-hidden="true" size={22} />
        <strong>{counts.images.toLocaleString()}</strong>
        <span>images</span>
      </Link>
    </div>
  );
}
