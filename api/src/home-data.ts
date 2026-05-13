import { readContentJson } from './content-store.js';
import type { HomeSummary, SiteSummary } from './types.js';

export async function loadHomePayload() {
  const [home, site] = await Promise.all([
    readContentJson<HomeSummary>('home.json'),
    readContentJson<SiteSummary>('site.json'),
  ]);

  return {
    generatedAt: home.generatedAt,
    site: {
      title: site.title,
      nav: [
        { label: 'Home', href: '/' },
        { label: 'Posts', href: '/posts' },
        { label: 'Stories', href: '/stories' },
        { label: 'Images', href: '/images' },
      ],
      author: {
        name: 'Jeff Patton',
        bio: 'Just a dad who takes too many pictures.',
        imageUrl: '/assets/images/bio-photo.jpg',
        links: [
          { label: 'Website', href: 'https://patton-tech.com' },
          { label: 'Bluesky', href: 'https://bsky.app/profile/jeffpatton.bsky.social' },
          { label: 'GitHub', href: 'https://github.com/jeffpatton1971' },
          { label: 'Instagram', href: 'https://instagram.com/jspatton1971' },
        ],
      },
    },
    counts: home.counts,
    recentEntries: home.recentEntries,
    recentPosts: home.recentPosts,
    recentStories: home.recentStories,
    recentImages: home.recentImages,
  };
}
