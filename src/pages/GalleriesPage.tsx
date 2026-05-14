import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatDateLabel, monthName } from '../archive';
import { ArchiveCalendar, resolveSelection } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { ImageGrid } from '../components/ImageGrid';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { fetchGalleryDocument, fetchGalleryIndex } from '../content';
import { useAsyncData } from '../hooks';
import type { GallerySummary } from '../types';

type GalleryParams = {
  year?: string;
  month?: string;
  day?: string;
  slug?: string;
};

export function GalleriesPage() {
  const params = useParams<GalleryParams>();

  if (params.slug && params.year && params.month && params.day) {
    return <GalleryDetailPage params={params as Required<GalleryParams>} />;
  }

  return <GalleryArchivePage params={params} />;
}

function GalleryArchivePage({ params }: { params: GalleryParams }) {
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source') || undefined;
  const sourceSearch = source ? `?source=${encodeURIComponent(source)}` : '';
  const query = {
    year: params.year,
    month: params.month,
    day: params.day,
    source,
  };
  const state = useAsyncData(() => fetchGalleryIndex(query), [params.year, params.month, params.day, source]);

  if (state.status === 'loading') {
    return <LoadingState label="Loading galleries" />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const index = state.data;
  const selection = resolveSelection(index.years, params.year, params.month);
  const total = index.page?.total ?? index.galleries.length;

  return (
    <main className="page page--archive">
      <div className="archive-rail archive-rail--left">
        <ArchiveCalendar
          basePath="/galleries"
          label="Gallery Archive"
          years={index.years}
          selectedYear={selection?.year.year}
          selectedMonth={selection?.month.month}
          selectedDay={params.day}
          search={sourceSearch}
        />
      </div>

      <section className="archive-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Galleries</p>
            <h1>{pageTitle(params, total, source)}</h1>
          </div>
          <Link className="quiet-link" to="/galleries">
            Reset
          </Link>
        </div>

        <GalleryList galleries={index.galleries} />
        {index.page && index.page.total > index.galleries.length ? (
          <p className="archive-count">
            Showing {index.galleries.length.toLocaleString()} of {index.page.total.toLocaleString()}
          </p>
        ) : null}
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function GalleryDetailPage({ params }: { params: Required<GalleryParams> }) {
  const state = useAsyncData(
    () => fetchGalleryDocument(params.year, params.month, params.day, params.slug),
    [params.year, params.month, params.day, params.slug],
  );

  if (state.status === 'loading') {
    return <LoadingState label="Loading gallery" />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const gallery = state.data;

  return (
    <main className="page page--archive">
      <div className="archive-rail archive-rail--left">
        <nav className="image-breadcrumb" aria-label="Gallery archive location">
          <Link to="/galleries">Galleries</Link>
          <Link to={`/galleries/${gallery.year}`}>{gallery.year}</Link>
          <Link to={`/galleries/${gallery.year}/${gallery.month}`}>{monthName(gallery.year, gallery.month)}</Link>
          <Link to={`/galleries/${gallery.year}/${gallery.month}/${gallery.day}`}>
            {formatDateLabel(gallery.date)}
          </Link>
        </nav>
      </div>

      <article className="archive-main gallery-detail">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Gallery</p>
            <h1>{gallery.title}</h1>
            <p>{gallery.imageCount === 1 ? '1 image' : `${gallery.imageCount.toLocaleString()} images`}</p>
          </div>
        </div>

        {gallery.summary ? <p className="gallery-detail__summary">{gallery.summary}</p> : null}
        {gallery.related && gallery.related.length > 0 ? (
          <div className="gallery-detail__related">
            {gallery.related.map((item) =>
              item.route ? (
                <Link key={`${item.type}-${item.id}`} to={item.route}>
                  {item.title || item.id}
                </Link>
              ) : null,
            )}
          </div>
        ) : null}
        <ImageGrid images={gallery.images} />
      </article>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function GalleryList({ galleries }: { galleries: GallerySummary[] }) {
  if (galleries.length === 0) {
    return <p className="state-text">No galleries found for this date.</p>;
  }

  return (
    <div className="gallery-list">
      {galleries.map((gallery) => (
        <Link className="gallery-card" to={gallery.route} key={gallery.route}>
          <img src={gallery.coverImage.thumbUrl} alt={gallery.coverImage.alt || gallery.title} loading="lazy" />
          <div>
            <time dateTime={gallery.date}>{formatDateLabel(gallery.date)}</time>
            <h2>{gallery.title}</h2>
            <p>{gallery.imageCount === 1 ? '1 image' : `${gallery.imageCount.toLocaleString()} images`}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function pageTitle(params: GalleryParams, count: number, source?: string) {
  const label = source ? `${source.charAt(0).toUpperCase()}${source.slice(1)} Galleries` : 'Galleries';

  if (params.year && params.month && params.day) {
    return `${formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)} (${count})`;
  }

  if (params.year && params.month) {
    return `${monthName(params.year, params.month)} (${count})`;
  }

  if (params.year) {
    return `${params.year} (${count})`;
  }

  return `All ${label} (${count})`;
}
