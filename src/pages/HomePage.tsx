import { ExternalLink, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchHomeSummary } from '../content';
import { useAsyncData } from '../hooks';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { ImageGrid } from '../components/ImageGrid';
import { EntrySummaryList } from '../components/PostList';

export function HomePage() {
  const state = useAsyncData(fetchHomeSummary, []);

  if (state.status === 'loading') {
    return <LoadingState />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const summary = state.data;

  return (
    <main className="page page--archive page--home">
      <aside className="archive-rail archive-rail--left">
        <section className="author-card" aria-label="Author information">
          <img src="/assets/images/bio-photo.jpg" alt="Jeff Patton" />
          <div>
            <p className="eyebrow">Author</p>
            <h2>Jeff Patton</h2>
            <p>Just a dad who takes too many pictures.</p>
          </div>
          <nav aria-label="Author links">
            <a href="https://patton-tech.com" target="_blank" rel="noreferrer">
              <Globe aria-hidden="true" size={16} />
              Website
            </a>
            <a href="https://bsky.app/profile/jeffpatton.bsky.social" target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" size={16} />
              Bluesky
            </a>
            <a href="https://github.com/jeffpatton1971" target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" size={16} />
              GitHub
            </a>
            <a href="https://instagram.com/jspatton1971" target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" size={16} />
              Instagram
            </a>
          </nav>
        </section>
      </aside>

      <section className="archive-main">
        <div className="overview">
          <div>
            <p className="eyebrow">Family archive</p>
            <h1>KansasPattons</h1>
            <p>
              A React archive prototype reading generated content from the existing Markdown and
              gallery records.
            </p>
          </div>
        </div>

        <section className="split">
          <div>
            <div className="section-heading">
              <h2>Recent Updates</h2>
              <div className="section-heading__links">
                <Link to="/posts">Posts</Link>
                <Link to="/stories">Stories</Link>
              </div>
            </div>
            <EntrySummaryList entries={summary.recentEntries} />
          </div>
          <div>
            <div className="section-heading">
              <h2>Recent Images</h2>
              <Link to="/images">Browse all</Link>
            </div>
            <ImageGrid images={summary.recentImages} />
          </div>
        </section>
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}
