import { BookOpen, Images, Library, Newspaper } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ImagesPage } from './pages/ImagesPage';
import { LegacyPostRedirect } from './pages/LegacyPostRedirect';
import { NotFoundPage } from './pages/NotFoundPage';
import { PostDetailPage, StoryDetailPage } from './pages/PostDetailPage';
import { PostsPage, StoriesPage } from './pages/PostsPage';

export function App() {
  return (
    <>
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="KansasPattons home">
          <Library aria-hidden="true" size={24} />
          <span>KansasPattons</span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/posts">
            <Newspaper aria-hidden="true" size={17} />
            Posts
          </NavLink>
          <NavLink to="/stories">
            <BookOpen aria-hidden="true" size={17} />
            Stories
          </NavLink>
          <NavLink to="/images">
            <Images aria-hidden="true" size={17} />
            Images
          </NavLink>
        </nav>
      </header>

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
        <Route path="/blog/:year/:month/:day/:slug" element={<LegacyPostRedirect />} />
        <Route path="/images" element={<ImagesPage />} />
        <Route path="/images/:year" element={<ImagesPage />} />
        <Route path="/images/:year/:month" element={<ImagesPage />} />
        <Route path="/images/:year/:month/:day" element={<ImagesPage />} />
        <Route path="/images/:year/:month/:day/:imageId" element={<ImagesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
