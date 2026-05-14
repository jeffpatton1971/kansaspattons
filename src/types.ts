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

export type SiteNavItem = {
  label: string;
  href: string;
};

export type SiteAuthorLink = {
  label: string;
  href: string;
};

export type SiteAuthor = {
  name: string;
  bio?: string;
  imageUrl?: string;
  links?: SiteAuthorLink[];
};

export type SiteInfo = {
  key?: string;
  title: string;
  url?: string;
  nav?: SiteNavItem[];
  author?: SiteAuthor;
};

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
  page?: ApiPage;
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
  groups?: ImageGroup[];
  groupBy?: 'year' | 'month' | 'day';
  page?: ApiPage;
};

export type ApiPage = {
  cursor: number;
  limit: number;
  total: number;
  nextCursor?: number;
};

export type ImageGroup = {
  key: string;
  label: string;
  href: string;
  count: number;
  images: ImageSummary[];
};

export type HomeSummary = {
  generatedAt: string;
  site?: SiteInfo;
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
