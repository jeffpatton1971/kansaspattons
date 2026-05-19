# Adding Content Routes

Use this guide when adding a route family like `/stories` that has:

- a landing/archive page,
- date-filtered archive URLs,
- individual item detail pages,
- generated JSON under `public/content`,
- shared API routes under `/api/{siteid}/...`.

The current framework already implements this pattern for `/posts` and
`/stories`. Prefer extending those reusable pieces before creating a parallel
implementation.

## Route Shape

Use one consistent route shape for every date-based content family:

```text
/<family>
/<family>/<year>
/<family>/<year>/<month>
/<family>/<year>/<month>/<day>
/<family>/<year>/<month>/<day>/<slug>
```

For stories, that means:

```text
/stories
/stories/2026
/stories/2026/04
/stories/2026/04/16
/stories/2026/04/16/194804-better-late-than-never
```

The matching API routes are:

```text
/api/{siteid}/stories
/api/{siteid}/stories/{year}/{month}/{day}/{slug}
```

## Existing Stories Pattern

The frontend routes live in `src/App.tsx`:

```tsx
<Route path="/stories" element={<StoriesPage />} />
<Route path="/stories/:year" element={<StoriesPage />} />
<Route path="/stories/:year/:month" element={<StoriesPage />} />
<Route path="/stories/:year/:month/:day" element={<StoriesPage />} />
<Route path="/stories/:year/:month/:day/:slug" element={<StoryDetailPage />} />
```

The data loaders live in `src/content.ts`:

```ts
export function fetchStoryIndex(query: ArchiveQuery = {}) {
  return fetchJson<ApiListResponse<PostSummary>>(`stories${queryString({ limit: 48, ...query })}`).then(toPostIndex);
}

export function fetchStoryDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`stories/${year}/${month}/${day}/${slug}`);
}
```

The archive page is a configured instance of `EntryArchivePage` in
`src/pages/PostsPage.tsx`:

```tsx
export function StoriesPage() {
  return (
    <EntryArchivePage
      basePath="/stories"
      label="Story Archive"
      titleLabel="Stories"
      loader={fetchStoryIndex}
    />
  );
}
```

The detail page is a configured instance of `EntryDetailPage` in
`src/pages/PostDetailPage.tsx`:

```tsx
export function StoryDetailPage() {
  return (
    <EntryDetailPage
      basePath="/stories"
      calendarLabel="Story Archive"
      loader={fetchStoryDocument}
      indexLoader={fetchStoryIndex}
    />
  );
}
```

## Adding A New Route Family

Use this checklist for a new family such as `/notes`.

1. Decide whether the new family is a new content type or a view of existing
   entries.

If it is just another way to view existing posts/stories, add a frontend route
and API query/filter. Do not create a new generated content family.

If it is a durable content family, add generated content, API routes, frontend
loaders, pages, navigation, and tests.

2. Add generated content in `scripts/build-content.ts`.

Emit an index and detail files:

```text
public/content/notes/index.json
public/content/notes/{year}/{month}/{day}/{slug}.json
```

The index should match the existing API list shape:

```json
{
  "generatedAt": "2026-05-19T00:00:00.000Z",
  "posts": [],
  "years": []
}
```

For a new family, also update:

- `home.json` if the family appears on the homepage,
- `entries/index.json` if it participates in all-up archives,
- `search/index.json` if it should be searchable,
- `taxonomy.json` if it participates in categories, hashtags, people, or
  locations,
- `site.json` counts if the site should expose the family count.

3. Add shared API routes in `ptech-sites-api`.

Follow the existing functions in `src/functions/entries.ts`.

Add list and detail routes:

```ts
app.http('notes', {
  methods: ['GET'],
  route: '{siteid}/notes',
  handler: notesIndexHandler,
});

app.http('noteDetail', {
  methods: ['GET'],
  route: '{siteid}/notes/{year}/{month}/{day}/{slug}',
  handler: noteDetailHandler,
});
```

The handlers should read:

```text
notes/index.json
notes/{year}/{month}/{day}/{slug}.json
```

Return the same paged list response shape the frontend expects:

```ts
{
  generatedAt,
  years,
  items,
  page
}
```

4. Add frontend loaders in `src/content.ts`.

```ts
export function fetchNoteIndex(query: ArchiveQuery = {}) {
  return fetchJson<ApiListResponse<PostSummary>>(`notes${queryString({ limit: 48, ...query })}`).then(toPostIndex);
}

export function fetchNoteDocument(year: string, month: string, day: string, slug: string) {
  return fetchJson<PostDocument>(`notes/${year}/${month}/${day}/${slug}`);
}
```

If the new family has a different payload, define `NoteSummary`,
`NoteDocument`, and `NoteIndex` in `src/types.ts` instead of reusing
`PostSummary` and `PostDocument`.

5. Add archive and detail page components.

If the new family uses the same archive behavior, reuse `EntryArchivePage`:

```tsx
export function NotesPage() {
  return (
    <EntryArchivePage
      basePath="/notes"
      label="Notes Archive"
      titleLabel="Notes"
      loader={fetchNoteIndex}
    />
  );
}
```

If the detail layout is close to posts or stories, reuse `EntryDetailPage`.
Otherwise, create a focused `NoteDetailPage` that:

- reads `year`, `month`, `day`, and `slug` from `useParams`,
- calls the detail loader,
- renders loading and error states,
- renders the item body,
- includes taxonomy/media/related content only if the payload supports it.

6. Register routes in `src/App.tsx`.

```tsx
<Route path="/notes" element={<NotesPage />} />
<Route path="/notes/:year" element={<NotesPage />} />
<Route path="/notes/:year/:month" element={<NotesPage />} />
<Route path="/notes/:year/:month/:day" element={<NotesPage />} />
<Route path="/notes/:year/:month/:day/:slug" element={<NoteDetailPage />} />
```

Add a nav icon mapping if needed:

```ts
const iconMap = {
  notes: Notebook,
};
```

And update `navIcon()`:

```ts
if (href.startsWith('/notes')) {
  return 'notes';
}
```

7. Add navigation in `content/site.config.json`.

```json
{ "label": "Notes", "href": "/notes", "icon": "notes" }
```

8. Update publish validation.

If the new family is required content, update `scripts/publish-content.ts` so
full publishes fail when the required index is missing:

```ts
'notes/index.json'
```

Update `scripts/validate-content.ts` if source documents need new frontmatter
rules or duplicate-route checks.

9. Update tests.

Add a Playwright smoke test in `tests/site/site-smoke.spec.ts`:

```ts
test('notes archive renders note cards', async ({ page }) => {
  await page.goto('/notes');

  await expect(page.getByRole('heading', { name: 'All Notes' })).toBeVisible();
  await expect(page.locator('.note-card').first()).toBeVisible();
});
```

Extend the API mock in that test file:

```ts
if (apiPath === 'notes') {
  const index = await readContentJson('notes/index.json');
  await fulfillJson(route, pagedIndex(index, url));
  return;
}
```

Add a detail-page test if the item layout differs from posts/stories.

10. Run validation.

```powershell
npm run content:validate
npm run build
npm run test
git diff --check
```

If the API repo changed, also run this in `ptech-sites-api`:

```powershell
npm test
npm run build
```

## Common Mistakes

- Adding a React route without generating the matching `public/content` JSON.
- Generating JSON but not adding the API route in `ptech-sites-api`.
- Adding an API route but forgetting the site id prefix: use
  `/api/{siteid}/notes`, not `/api/notes`.
- Creating flat files such as `notes.json` when the API expects
  `notes/index.json`.
- Forgetting direct refresh routes in `webapp/server.cjs`. The current server
  already falls back to `index.html` for extensionless paths, so no per-route
  server change is needed for normal React routes.
- Adding nav to `content/site.config.json` before the route is implemented,
  which exposes a broken link.
- Reusing `PostDocument` for a new family that has a materially different
  payload. Use shared types only when the shape is really the same.

