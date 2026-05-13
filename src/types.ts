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

export type EntrySource = {
  type?: string;
  subtype?: string;
  id?: string;
  url?: string;
  caption?: string;
  mediaCount?: number;
  crossPostSource?: string;
};

export type PostSummary = {
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
  source?: EntrySource;
  galleryIds: string[];
  coverImage?: {
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
};

export type PostDocument = PostSummary & {
  bodyHtml: string;
};

export type PostIndex = {
  generatedAt: string;
  posts: PostSummary[];
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
  recentEntries: PostSummary[];
  recentPosts: PostSummary[];
  recentStories: PostSummary[];
  recentImages: ImageSummary[];
};
