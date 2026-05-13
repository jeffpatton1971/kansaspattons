import type { HomeSummary, ImageIndex, PostDocument, PostIndex } from './types';

const jsonCache = new Map<string, Promise<unknown>>();

type ApiListResponse<T> = {
  generatedAt: string;
  years: PostIndex['years'];
  items: T[];
};

type ApiImageListResponse = {
  generatedAt: string;
  years: ImageIndex['years'];
  items: ImageIndex['images'];
};

export function apiUrl(path: string) {
  return `/api/${path.replace(/^\/+/, '')}`;
}

export function fetchJson<T>(path: string): Promise<T> {
  const url = apiUrl(path);

  if (!jsonCache.has(url)) {
    jsonCache.set(
      url,
      fetch(url).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${url}: ${response.status}`);
        }

        return response.json() as Promise<T>;
      }),
    );
  }

  return jsonCache.get(url)! as Promise<T>;
}

export function fetchPostIndex() {
  return fetchJson<ApiListResponse<PostIndex['posts'][number]>>('posts?limit=2000').then(toPostIndex);
}

export function fetchHomeSummary() {
  return fetchJson<HomeSummary>('home');
}

export function fetchStoryIndex() {
  return fetchJson<ApiListResponse<PostIndex['posts'][number]>>('stories?limit=2000').then(toPostIndex);
}

export function fetchEntryIndex() {
  return fetchJson<ApiListResponse<PostIndex['posts'][number]>>('entries?limit=2000').then(toPostIndex);
}

export function fetchImageIndex() {
  return fetchJson<ApiImageListResponse>('images?limit=10000').then((response) => ({
    generatedAt: response.generatedAt,
    images: response.items,
    years: response.years,
  }));
}

export function fetchPostDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`posts/${year}/${month}/${day}/${slug}`);
}

export function fetchStoryDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`stories/${year}/${month}/${day}/${slug}`);
}

function toPostIndex(response: ApiListResponse<PostIndex['posts'][number]>): PostIndex {
  return {
    generatedAt: response.generatedAt,
    posts: response.items,
    years: response.years,
  };
}
