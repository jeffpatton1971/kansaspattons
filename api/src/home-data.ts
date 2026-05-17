import { readContentJson } from './content-store.js';
import type { HomeSummary, SiteInfo, SiteSummary } from './types.js';

export async function loadHomePayload(siteKey?: string) {
  const [home, site] = await Promise.all([
    readContentJson<HomeSummary>('home.json', siteKey),
    readContentJson<SiteSummary>('site.json', siteKey),
  ]);

  return {
    generatedAt: home.generatedAt,
    site: siteInfo(site, siteKey),
    counts: home.counts,
    sourceCounts: home.sourceCounts ?? site.sourceCounts,
    recentEntries: home.recentEntries,
    recentPosts: home.recentPosts,
    recentStories: home.recentStories,
    recentGalleries: home.recentGalleries,
    recentImages: home.recentImages,
  };
}

function siteInfo(site: SiteSummary, siteKey: string | undefined): SiteInfo {
  return {
    key: site.key || siteKey,
    title: site.title,
    url: site.url,
    nav: site.nav ?? defaultNav(),
    author: site.author ?? defaultAuthor(),
    banner: site.banner ?? defaultBanner(site.title),
    footer: site.footer ?? defaultFooter(site.title),
    theme: site.theme ?? {},
    sourceCounts: site.sourceCounts,
  };
}

function defaultBanner(title: string) {
  return {
    eyebrow: 'Family archive',
    title,
    text: 'Posts, stories, galleries, and images from the family archive, rebuilt from Markdown and structured media.',
  };
}

function defaultFooter(title: string) {
  return {
    brandText: title,
    links: defaultNav().filter((item) => item.href !== '/'),
  };
}

function defaultNav() {
  return [
    { label: 'Home', href: '/' },
    { label: 'Posts', href: '/posts' },
    { label: 'Stories', href: '/stories' },
    { label: 'Galleries', href: '/galleries' },
    { label: 'Images', href: '/images' },
    { label: 'Search', href: '/search' },
  ];
}

function defaultAuthor() {
  return {
    name: 'Jeff Patton',
    bio: 'Just a dad who takes too many pictures.',
    imageUrl: '/assets/images/bio-photo.jpg',
    links: [
      { label: 'Website', href: 'https://patton-tech.com' },
      { label: 'Bluesky', href: 'https://bsky.app/profile/jeffpatton.bsky.social' },
      { label: 'GitHub', href: 'https://github.com/jeffpatton1971' },
      { label: 'Instagram', href: 'https://instagram.com/jspatton1971' },
    ],
  };
}
