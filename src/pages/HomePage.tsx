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
  const site = summary.site ?? { title: 'KansasPattons' };
  const author = site.author;
  const recentUpdates = summary.recentEntries.slice(0, 6);

  return (
    <main className="page page--archive page--landing page--home">
      <aside className="archive-rail archive-rail--left">
        {author ? (
          <section className="author-card" aria-label="Author information">
            {author.imageUrl ? <img src={author.imageUrl} alt={author.name} /> : null}
            <div>
              <p className="eyebrow">Author</p>
              <h2>{author.name}</h2>
              {author.bio ? <p>{author.bio}</p> : null}
            </div>
            {author.links && author.links.length > 0 ? (
              <nav aria-label="Author links">
                {author.links.map((link, index) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                    {index === 0 ? <Globe aria-hidden="true" size={16} /> : <ExternalLink aria-hidden="true" size={16} />}
                    {link.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </section>
        ) : null}
      </aside>

      <section className="archive-main">
        <div className="overview">
          <div>
            <p className="eyebrow">Family archive</p>
            <h1>{site.title}</h1>
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
                <Link to="/galleries">Galleries</Link>
              </div>
            </div>
            <EntrySummaryList entries={recentUpdates} />
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
