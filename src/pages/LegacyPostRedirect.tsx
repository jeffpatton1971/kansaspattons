import { Navigate, useParams } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { fetchEntryIndex } from '../content';
import { useAsyncData } from '../hooks';

type LegacyParams = {
  year: string;
  month: string;
  day: string;
  slug: string;
};

export function LegacyPostRedirect() {
  const params = useParams<LegacyParams>();
  const slug = params.slug?.replace(/\.html$/, '');
  const state = useAsyncData(fetchEntryIndex, []);

  if (!params.year || !params.month || !params.day || !slug) {
    return <Navigate to="/posts" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Finding legacy post" />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const match = state.data.posts.find(
    (post) =>
      post.year === params.year &&
      post.month === params.month &&
      post.day === params.day &&
      post.slug === slug,
  );

  return <Navigate to={match?.route ?? `/posts/${params.year}/${params.month}/${params.day}/${slug}`} replace />;
}
