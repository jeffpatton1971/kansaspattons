import type { HomeSummary, ImageIndex, PostDocument, PostIndex } from './types';

const jsonCache = new Map<string, Promise<unknown>>();

export function contentUrl(path: string) {
  return `/content/${path.replace(/^\/+/, '')}`;
}

export function fetchJson<T>(path: string): Promise<T> {
  const url = contentUrl(path);

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
  return fetchJson<PostIndex>('posts/index.json');
}

export function fetchHomeSummary() {
  return fetchJson<HomeSummary>('home.json');
}

export function fetchStoryIndex() {
  return fetchJson<PostIndex>('stories/index.json');
}

export function fetchEntryIndex() {
  return fetchJson<PostIndex>('entries/index.json');
}

export function fetchImageIndex() {
  return fetchJson<ImageIndex>('images/index.json');
}

export function fetchPostDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`posts/${year}/${month}/${day}/${slug}.json`);
}

export function fetchStoryDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`stories/${year}/${month}/${day}/${slug}.json`);
}
