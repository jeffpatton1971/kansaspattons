export type ArchiveDay = {
  day: string;
  count: number;
  href: string;
};

export type ArchiveMonth = {
  month: string;
  count: number;
  href: string;
  days: ArchiveDay[];
};

export type ArchiveYear = {
  year: string;
  count: number;
  href: string;
  months: ArchiveMonth[];
};

export type ContentShape = 'post' | 'story';

export type EntrySummary = {
  id: string;
  title: string;
  date: string;
  contentShape: ContentShape;
  year: string;
  month: string;
  day: string;
  slug: string;
  route: string;
  legacyUrl: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  hashtags: string[];
  handles: string[];
  location?: string;
  sourceType?: string;
  galleryIds: string[];
  coverImage?: {
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
};

export type EntryDocument = EntrySummary & {
  bodyHtml: string;
};

export type EntryIndex = {
  generatedAt: string;
  posts: EntrySummary[];
  years: ArchiveYear[];
};

export type ImageSummary = {
  id: string;
  title: string;
  date: string;
  year: string;
  month: string;
  day: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  galleryId?: string;
  source?: string;
  sourceFilename?: string;
  postId?: string;
  postRoute?: string;
};

export type ImageIndex = {
  generatedAt: string;
  images: ImageSummary[];
  years: ArchiveYear[];
};

export type HomeSummary = {
  generatedAt: string;
  counts: {
    posts: number;
    stories: number;
    images: number;
  };
  recentEntries: EntrySummary[];
  recentPosts: EntrySummary[];
  recentStories: EntrySummary[];
  recentImages: ImageSummary[];
};

export type SiteSummary = {
  generatedAt: string;
  title: string;
  entries: number;
  posts: number;
  stories: number;
  images: number;
};
