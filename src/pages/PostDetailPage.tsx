import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatDateLabel } from '../archive';
import { ArchiveCalendar } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { EntryMetadata } from '../components/EntryMetadata';
import { ImageCarousel } from '../components/ImageCarousel';
import { ErrorState, LoadingState } from '../components/LoadingState';
import {
  fetchGalleryDocument,
  fetchGalleryIndex,
  fetchImagesForEntry,
  fetchPostDocument,
  fetchPostIndex,
  fetchStoryDocument,
  fetchStoryIndex,
  type ArchiveQuery,
} from '../content';
import { useAsyncData } from '../hooks';
import type { GalleryDocument, ImageSummary, PostDocument, PostIndex } from '../types';

type DetailParams = {
  year: string;
  month: string;
  day: string;
  slug: string;
};

export function PostDetailPage() {
  return (
    <EntryDetailPage
      basePath="/posts"
      calendarLabel="Post Archive"
      loader={fetchPostDocument}
      indexLoader={fetchPostIndex}
    />
  );
}

export function StoryDetailPage() {
  return (
    <EntryDetailPage
      basePath="/stories"
      calendarLabel="Story Archive"
      loader={fetchStoryDocument}
      indexLoader={fetchStoryIndex}
    />
  );
}

function EntryDetailPage({
  basePath,
  calendarLabel,
  loader,
  indexLoader,
}: {
  basePath: '/posts' | '/stories';
  calendarLabel: string;
  loader: (year: string, month: string, day: string, slug: string) => Promise<PostDocument>;
  indexLoader: (query?: ArchiveQuery) => Promise<PostIndex>;
}) {
  const params = useParams<DetailParams>();
  const navigate = useNavigate();
  const state = useAsyncData(
    async () => {
      const [post, index] = await Promise.all([
        loader(params.year!, params.month!, params.day!, params.slug!),
        indexLoader({ limit: 1 }),
      ]);
      const relatedGalleryIds = relatedGalleryIdsForPost(post);
      const [imageIndex, relatedGalleries] = await Promise.all([
        fetchImagesForEntry(post.imageIds ?? [], post.galleryIds),
        fetchRelatedGalleries(relatedGalleryIds),
      ]);

      return {
        post,
        index,
        relatedImages: imageIndex.images,
        relatedGalleries,
      };
    },
    [params.year, params.month, params.day, params.slug, loader, indexLoader],
  );

  if (state.status === 'loading') {
    return <LoadingState label={basePath === '/stories' ? 'Loading story' : 'Loading post'} />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const { post, index, relatedImages, relatedGalleries } = state.data;
  const isStory = basePath === '/stories';

  return (
    <main className="page page--archive">
      <div className="archive-rail archive-rail--left">
        <ArchiveCalendar
          basePath={basePath}
          label={calendarLabel}
          years={index.years}
          selectedYear={post.year}
          selectedMonth={post.month}
          selectedDay={post.day}
        />
      </div>

      <section className="archive-main">
        <button className="icon-line" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" size={18} />
          Back
        </button>

        {isStory ? (
          <StoryDetail post={post} relatedImages={relatedImages} relatedGalleries={relatedGalleries} />
        ) : (
          <PostDetail post={post} relatedImages={relatedImages} relatedGalleries={relatedGalleries} />
        )}
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function PostDetail({
  post,
  relatedImages,
  relatedGalleries,
}: {
  post: PostDocument;
  relatedImages: ImageSummary[];
  relatedGalleries: GalleryDocument[];
}) {
  return (
    <>
      <article className="post-detail">
        <header>
          <time dateTime={post.date}>{formatDateLabel(post.date)}</time>
          <h1>{post.title}</h1>
          {post.sourceType ? <p className="source-label">{post.sourceType}</p> : null}
          <EntryMetadata entry={post} />
        </header>
        <div className="rich-text" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      </article>

      {relatedImages.length > 0 ? <ImageCarousel images={relatedImages} title="Images" /> : null}
      <RelatedGallerySections galleries={relatedGalleries} />
    </>
  );
}

function StoryDetail({
  post,
  relatedImages,
  relatedGalleries,
}: {
  post: PostDocument;
  relatedImages: ImageSummary[];
  relatedGalleries: GalleryDocument[];
}) {
  return (
    <>
      <article className="post-detail story-detail" aria-label={post.title}>
        <header>
          <time dateTime={post.date}>{formatDateLabel(post.date)}</time>
          {post.sourceType ? <p className="source-label">{post.sourceType}</p> : null}
          <EntryMetadata entry={post} />
        </header>

        {relatedImages.length > 0 ? <ImageCarousel images={relatedImages} title="Story images" /> : <h1>{post.title}</h1>}

        <div className="rich-text" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      </article>
      <RelatedGallerySections galleries={relatedGalleries} />
    </>
  );
}

function RelatedGallerySections({ galleries }: { galleries: GalleryDocument[] }) {
  if (galleries.length === 0) {
    return null;
  }

  return (
    <>
      {galleries.map((gallery) => (
        <section className="related-gallery" aria-labelledby={`${gallery.id}-title`} key={gallery.id}>
          <div className="related-gallery__heading">
            <div>
              <p className="eyebrow">Related Gallery</p>
              <h2 id={`${gallery.id}-title`}>{gallery.title}</h2>
              {gallery.summary ? <p>{gallery.summary}</p> : null}
            </div>
            <Link className="quiet-link" to={gallery.route}>
              Open gallery
            </Link>
          </div>
          <ImageCarousel images={gallery.images} title={gallery.title} />
        </section>
      ))}
    </>
  );
}

function relatedGalleryIdsForPost(post: PostDocument) {
  const ids = new Set<string>();

  for (const item of post.related ?? []) {
    if (item.type === 'gallery' && item.id) {
      ids.add(item.id);
    }
  }

  return [...ids];
}

async function fetchRelatedGalleries(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const index = await fetchGalleryIndex({ limit: 2000 });
  const summariesById = new Map(index.galleries.map((gallery) => [gallery.id, gallery]));
  const galleries = await Promise.all(
    ids.map((id) => {
      const gallery = summariesById.get(id);

      if (!gallery) {
        return undefined;
      }

      return fetchGalleryDocument(gallery.year, gallery.month, gallery.day, gallery.slug);
    }),
  );

  return galleries.filter(Boolean) as GalleryDocument[];
}
