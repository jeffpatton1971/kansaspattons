import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { imagesForPost, formatDateLabel } from '../archive';
import { ArchiveCalendar } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { EntryMetadata } from '../components/EntryMetadata';
import { ImageCarousel } from '../components/ImageCarousel';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { fetchImageIndex, fetchPostDocument, fetchPostIndex, fetchStoryDocument, fetchStoryIndex } from '../content';
import { useAsyncData } from '../hooks';
import type { PostDocument, PostIndex } from '../types';

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
  indexLoader: () => Promise<PostIndex>;
}) {
  const params = useParams<DetailParams>();
  const navigate = useNavigate();
  const state = useAsyncData(
    async () => {
      const [post, index] = await Promise.all([
        loader(params.year!, params.month!, params.day!, params.slug!),
        indexLoader(),
      ]);
      const imageIndex = post.galleryIds.length > 0 ? await fetchImageIndex() : undefined;

      return {
        post,
        index,
        relatedImages: imageIndex ? imagesForPost(imageIndex.images, post.galleryIds) : [],
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

  const { post, index, relatedImages } = state.data;
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
          <StoryDetail post={post} relatedImages={relatedImages} />
        ) : (
          <PostDetail post={post} relatedImages={relatedImages} />
        )}
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

function PostDetail({ post, relatedImages }: { post: PostDocument; relatedImages: ReturnType<typeof imagesForPost> }) {
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
    </>
  );
}

function StoryDetail({ post, relatedImages }: { post: PostDocument; relatedImages: ReturnType<typeof imagesForPost> }) {
  return (
    <article className="post-detail story-detail" aria-label={post.title}>
      <header>
        <time dateTime={post.date}>{formatDateLabel(post.date)}</time>
        {post.sourceType ? <p className="source-label">{post.sourceType}</p> : null}
        <EntryMetadata entry={post} />
      </header>

      {relatedImages.length > 0 ? <ImageCarousel images={relatedImages} title="Story images" /> : <h1>{post.title}</h1>}

      <div className="rich-text" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
    </article>
  );
}
