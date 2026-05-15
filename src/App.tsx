import { BookOpen, Images, Library, Newspaper } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { GalleriesPage } from './pages/GalleriesPage';
import { ImagesPage } from './pages/ImagesPage';
import { LegacyPostRedirect } from './pages/LegacyPostRedirect';
import { NotFoundPage } from './pages/NotFoundPage';
import { PostDetailPage, StoryDetailPage } from './pages/PostDetailPage';
import { PostsPage, StoriesPage } from './pages/PostsPage';
import { TaxonomyTermPage } from './pages/TaxonomyTermPage';
import { TooltipProvider } from '@/components/ui/tooltip';

const primaryNav = [
  { to: '/posts', label: 'Posts', icon: Newspaper },
  { to: '/stories', label: 'Stories', icon: BookOpen },
  { to: '/galleries', label: 'Galleries', icon: Images },
  { to: '/images', label: 'Images', icon: Images },
];

export function App() {
  return (
    <TooltipProvider>
      <div className="app-shell">
        <header className="site-header">
          <NavLink to="/" className="brand" aria-label="KansasPattons home">
            <Library aria-hidden="true" size={24} />
            <span>KansasPattons</span>
          </NavLink>
          <nav aria-label="Primary navigation">
            {primaryNav.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink to={item.to} key={item.to}>
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </header>

        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:year" element={<PostsPage />} />
            <Route path="/posts/:year/:month" element={<PostsPage />} />
            <Route path="/posts/:year/:month/:day" element={<PostsPage />} />
            <Route path="/posts/:year/:month/:day/:slug" element={<PostDetailPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/stories/:year" element={<StoriesPage />} />
            <Route path="/stories/:year/:month" element={<StoriesPage />} />
            <Route path="/stories/:year/:month/:day" element={<StoriesPage />} />
            <Route path="/stories/:year/:month/:day/:slug" element={<StoryDetailPage />} />
            <Route path="/galleries" element={<GalleriesPage />} />
            <Route path="/galleries/:year" element={<GalleriesPage />} />
            <Route path="/galleries/:year/:month" element={<GalleriesPage />} />
            <Route path="/galleries/:year/:month/:day" element={<GalleriesPage />} />
            <Route path="/galleries/:year/:month/:day/:slug" element={<GalleriesPage />} />
            <Route path="/blog/:year/:month/:day/:slug" element={<LegacyPostRedirect />} />
            <Route path="/images" element={<ImagesPage />} />
            <Route path="/images/:year" element={<ImagesPage />} />
            <Route path="/images/:year/:month" element={<ImagesPage />} />
            <Route path="/images/:year/:month/:day" element={<ImagesPage />} />
            <Route path="/images/:year/:month/:day/:imageId" element={<ImagesPage />} />
            <Route path="/hashtags/:slug" element={<TaxonomyTermPage family="hashtags" eyebrow="Hashtag" />} />
            <Route path="/categories/:slug" element={<TaxonomyTermPage family="categories" eyebrow="Category" />} />
            <Route path="/people/:slug" element={<TaxonomyTermPage family="people" eyebrow="Person" />} />
            <Route path="/locations/:slug" element={<TaxonomyTermPage family="locations" eyebrow="Location" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>

        <footer className="site-footer">
          <NavLink to="/" className="site-footer__brand">
            KansasPattons
          </NavLink>
          <nav aria-label="Footer navigation">
            {primaryNav.map((item) => (
              <NavLink to={item.to} key={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </footer>
      </div>
    </TooltipProvider>
  );
}
