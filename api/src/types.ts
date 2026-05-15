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
export type ContentType = 'article' | 'story' | 'gallery';
export type EntryType = Exclude<ContentType, 'gallery'>;
export type ContentStatus = 'draft' | 'published' | 'archived';

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

export type SourceCount = {
  source: 'wordpress' | 'instagram' | 'facebook';
  label: string;
  count: number;
  href: string;
};

export type SiteInfo = {
  key?: string;
  title: string;
  url?: string;
  nav?: SiteNavItem[];
  author?: SiteAuthor;
  sourceCounts?: SourceCount[];
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

export type ContentLink = {
  type?: ContentType;
  id: string;
  title?: string;
  route?: string;
  rel?: string;
};

export type EntrySummary = {
  siteKey?: string;
  id: string;
  type?: EntryType;
  title: string;
  date: string;
  status?: ContentStatus;
  contentShape: ContentShape;
  year: string;
  month: string;
  day: string;
  slug: string;
  route: string;
  legacyUrl: string;
  authors?: string[];
  people?: string[];
  summary?: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  hashtags: string[];
  handles: string[];
  location?: string;
  locations?: string[];
  sourceType?: string;
  source?: EntrySource;
  galleryIds: string[];
  imageIds?: string[];
  related?: ContentLink[];
  caption?: string;
  coverImageId?: string;
  coverImage?: {
    id?: string;
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
};

export type EntryDocument = EntrySummary & {
  bodyMarkdown?: string;
  bodyHtml: string;
};

export type EntryIndex = {
  generatedAt: string;
  posts: EntrySummary[];
  years: ArchiveYear[];
};

export type ImageSummary = {
  siteKey?: string;
  id: string;
  type?: 'image';
  kind?: 'image' | 'video';
  title: string;
  date: string;
  year: string;
  month: string;
  day: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  caption?: string;
  alt?: string;
  galleryId?: string;
  source?: string;
  sourceFilename?: string;
  postId?: string;
  postRoute?: string;
};

export type GallerySummary = {
  siteKey?: string;
  id: string;
  type: 'gallery';
  title: string;
  date: string;
  status?: ContentStatus;
  year: string;
  month: string;
  day: string;
  slug: string;
  route: string;
  legacyUrl?: string;
  authors?: string[];
  people?: string[];
  summary?: string;
  categories: string[];
  tags: string[];
  locations?: string[];
  sourceType?: string;
  source?: EntrySource;
  imageIds: string[];
  imageCount: number;
  coverImageId: string;
  coverImage: {
    id: string;
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
  related?: ContentLink[];
};

export type GalleryDocument = GallerySummary & {
  descriptionMarkdown?: string;
  descriptionHtml?: string;
  images: ImageSummary[];
};

export type GalleryIndex = {
  generatedAt: string;
  galleries: GallerySummary[];
  years: ArchiveYear[];
};

export type ImageIndex = {
  generatedAt: string;
  images: ImageSummary[];
  years: ArchiveYear[];
};

export type HomeSummary = {
  generatedAt: string;
  site?: SiteInfo;
  counts: {
    posts: number;
    stories: number;
    galleries?: number;
    images: number;
  };
  sourceCounts?: SourceCount[];
  recentEntries: Array<EntrySummary | GallerySummary>;
  recentPosts: EntrySummary[];
  recentStories: EntrySummary[];
  recentGalleries?: GallerySummary[];
  recentImages: ImageSummary[];
};

export type TaxonomyContentType = 'post' | 'story' | 'gallery';

export type TaxonomyContentRef = {
  id: string;
  type: TaxonomyContentType;
  title: string;
  date: string;
  route: string;
};

export type TaxonomyTerm = {
  value: string;
  label: string;
  slug: string;
  count: number;
  href: string;
  items: TaxonomyContentRef[];
};

export type TaxonomyIndex = {
  generatedAt: string;
  hashtags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  people: TaxonomyTerm[];
  locations: TaxonomyTerm[];
};

export type SiteSummary = {
  generatedAt: string;
  key?: string;
  title: string;
  url?: string;
  nav?: SiteNavItem[];
  author?: SiteAuthor;
  sourceCounts?: SourceCount[];
  entries: number;
  posts: number;
  stories: number;
  galleries?: number;
  images: number;
};
