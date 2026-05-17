# Near-Term Feature Completion

This is the short-list of low-friction work that clears the path toward a
feature-complete React/API content platform. These items are not all blockers by
themselves, but they reduce ambiguity around the publish pipeline and media
manifest work.

## Recommended Order

1. Tighten validation.
2. Add taxonomy cleanup maps.
3. Lock golden content examples.
4. Finish taxonomy result pages and links.
5. Remove user-facing import/source leftovers.
6. Validate media references against the media manifest.
7. Document exact authoring examples.
8. Add a dry-run publish plan command.
9. Add generated content search.

## 1. Tighten Validation

Status: baseline implemented.

Why this matters:

The validator should become the guardrail for both old migration cleanup and new
content authoring. If it catches shape drift early, the API and frontend can stay
boring.

Work:

- `content_type` must be one of `post`, `story`, or `gallery`.
- Legacy `article` terminology is a validation error in `content_type` and
  `related.type`.
- `title`, `date`, `slug`, `post_id`, `summary`, `status`, and authors are
  required for authored content.
- Hashtags must be lowercase, one word, and stored without `#`.
- Media references must use canonical keys after publish rewrite:

```text
yyyy/mm/dd/filename.ext
```

- External URLs and absolute paths are validation errors for authored media
  references.
- Galleries must have `cover_image` and `images`.
- A gallery `cover_image` must exist in that gallery's `images` list.
- Every `cover_image`, `images[].id`, and inline Markdown image reference must
  exist in `content/media/index.json`.
- Posts and stories cannot use legacy Jekyll `{% include gallery.html %}`
  references.
- Routes and content IDs must be unique across posts, stories, and galleries.
- The validation report now includes the count of unique media IDs referenced by
  authored content.

Acceptance criteria:

- `npm run content:validate` stays clean for currently accepted content.
- `npm run content:validate:strict` can be used to preview future stricter
  failures.
- `.tmp/content-validation-report.json` clearly separates hard errors from
  cleanup warnings.
- Current cleanup counters still include `source` frontmatter, remaining curated
  `categories`, and four legacy gallery includes on excluded Facebook Mobile
  Uploads gallery records.

## 2. Add Taxonomy Cleanup Maps

Status: baseline implemented.

Why this matters:

Imported content has spelling variants, casing drift, and old system labels.
Cleanup maps let us fix that repeatably instead of hand-editing one file at a
time.

Work:

- Keep hashtag aliases in `content/taxonomy.aliases.json`.
- Keep category aliases in `content/taxonomy.aliases.json`.
- Keep people aliases in `content/taxonomy.aliases.json`.
- Keep location aliases in `content/taxonomy.aliases.json`.
- Share those aliases through `scripts/taxonomy-rules.ts`.
- Use the shared aliases from validation and cleanup scripts.

Examples:

```text
brekfast -> breakfast
july fourth -> July 4th
fourth of july -> July 4th
new years day -> New Year
CPLS -> Cair Paravel Latin School
Cair Paravel -> Cair Paravel Latin School
```

Acceptance criteria:

- `npm run taxonomy:normalize` reports the planned changes.
- `npm run taxonomy:normalize:write` applies known hashtag/category aliases.
- `npm run entities:normalize:write` applies known people/location aliases.
- Validation warns when a known non-canonical term comes back.

Current dry-run result:

- `npm run taxonomy:normalize` reports `0` files needing changes.
- `npm run entities:normalize` reports `0` files needing changes.

## 3. Lock Golden Content Examples

Status: baseline implemented.

Why this matters:

The imported archive has many edge cases. We still need a few clean examples
that describe the desired future shape without legacy noise.

Work:

- Use [`golden-content-examples.md`](golden-content-examples.md) as the
  reference set.
- Designate one post with direct images.
- Designate one post that renders a linked gallery inline.
- Designate one story with images.
- Designate one standalone gallery.
- Keep these examples small and easy to review.

Acceptance criteria:

- The examples validate cleanly.
- The examples render correctly in React.
- The examples are referenced from the authoring workflow docs.

## 4. Finish Taxonomy Result Pages And Links

Status: baseline implemented.

Why this matters:

Hashtags, categories, people, and locations should become real discovery paths,
not just metadata in generated JSON.

Work:

- Detail pages render clickable hashtags as `#hashtag`.
- Categories render below hashtags.
- People and locations render in the detail metadata strip as clickable chips.
- Taxonomy result pages show posts, stories, and galleries together.
- API taxonomy term responses sort items by descending date.
- Frontend taxonomy result pages include an empty state for terms with no
  matches.

Acceptance criteria:

- `/hashtags/breakfast` renders all matching content types.
- `/categories/{slug}` renders matching posts/stories/galleries.
- `/people/{slug}` and `/locations/{slug}` work from API data.
- All taxonomy links use internal React routes.

## 5. Remove User-Facing Import/Source Leftovers

Status: baseline implemented.

Why this matters:

`wordpress`, `instagram`, and `facebook` were useful during import, but they
should not look like user-facing topics unless we intentionally add a source
filter UI.

Work:

- Source information remains in generated metadata for migration/debugging.
- Source labels are removed from user-facing hashtags.
- Source labels are removed from user-facing categories.
- Source labels do not render in content cards or detail taxonomy.
- The right-column archive metrics now show content totals only:
  posts, stories, galleries, and images.
- Source query filtering still exists as hidden migration/debug plumbing, but it
  is not presented as a normal topic navigation path.

Acceptance criteria:

- User-facing taxonomy pages do not include import/source labels.
- Source values remain available for migration/debugging if needed.
- The UI does not present import source as a normal topic.

## 6. Validate Media References Against The Manifest

Status: baseline implemented.

Why this matters:

The compiler needs to trust `content/media/index.json` as the media source of
truth.

Work:

- Check every `cover_image` against `content/media/index.json`.
- Check every `images[].id` against `content/media/index.json`.
- Check gallery media items through their authored `images` list.
- Check inline Markdown image references after publish rewrite.
- Report missing media IDs separately from storage/blob copy issues.
- Report the unique count of authored media references.

Acceptance criteria:

- `npm run content:validate` reports missing media references clearly.
- The report identifies the content file and missing media key.
- The site can build without one Markdown file per image.

Current validation reports `4,769` unique media IDs referenced by authored
content and `0` missing media references. The build and validator require
`content/media/index.json`.

## 7. Document Exact Authoring Examples

Status: baseline implemented.

Why this matters:

The authoring model should be obvious months from now, especially once images
are uploaded and rewritten by automation.

Work:

- `docs/authoring-publish-workflow.md` includes examples for:
  - new post with no images.
  - new post with 1-3 direct images.
  - new post with a linked gallery.
  - new story with images.
  - new standalone gallery.
- Show draft local image references.
- Show published canonical image references.
- Show how hashtags, categories, people, locations, and related content should
  be written.

Acceptance criteria:

- `docs/authoring-publish-workflow.md` includes copyable examples.
- Examples match the validator.
- Examples match the generated JSON contract.

## 8. Add A Dry-Run Publish Plan Command

Status: baseline implemented.

Why this matters:

Before real Azure uploads are part of the normal path, we should be able to see
exactly what publish would do.

Work:

- `npm run publish:plan` detects changed files from `git status`.
- Changed `_posts/*.md` files are mapped to affected content JSON paths.
- Changed local media files are listed separately.
- Local draft media references in changed Markdown are mapped to canonical
  `yyyy/mm/dd/filename.ext` keys.
- Affected index JSON files are listed.
- Planned media uploads are listed.
- Planned manifest assets are listed with canonical media keys.
- Planned Markdown rewrites are listed.
- The command writes `.tmp/publish-plan-report.json`.
- The command does not write Markdown, generate thumbnails, upload blobs, or
  publish generated JSON.

Acceptance criteria:

- A dry run can be reviewed before publish writes anything.
- The command exits nonzero when planned work has collisions or missing media.
- The dry-run output is suitable for GitHub Actions logs.
- Local draft media is hashed with SHA-256 and checked against existing
  manifest assets before upload work begins.

```powershell
npm run publish:plan
```

The existing generated-content dry run remains:

```powershell
npm run publish:content:dry-run
```

The source-prep write step is:

```powershell
npm run publish:prepare
```

It applies planned Markdown rewrites and media manifest additions only when the
publish plan has no issues.

## 9. Add Generated Content Search

Status: baseline implemented.

Why this matters:

Search is the first discovery feature that depends on posts, stories, and
galleries sharing a stable generated shape. It also gives the API, frontend, and
future tests a useful cross-type contract to protect.

Work:

- The content compiler emits `public/content/search/index.json`.
- The search index includes posts, stories, and galleries.
- Search text is generated from title, summary/excerpt, body text or gallery
  description, authors, people, categories, hashtags, locations, and date.
- The publish plan includes `search/index.json` as an affected index whenever
  content Markdown changes.
- Incremental content publish uploads the search index with other planned JSON
  artifacts.
- The API exposes `/api/search` and `/api/sites/{site}/search`.
- Search API responses rank matches and return public result data without the
  internal `searchText` field.
- The React app includes `/search` with a search form, content-type filter, and
  paged results.

Acceptance criteria:

- `npm run build:content` generates `public/content/search/index.json`.
- `/api/search?q=breakfast` returns posts, stories, and galleries sorted by
  relevance and date.
- `/search?q=breakfast` renders clickable result cards.
- Full and incremental content publish include `search/index.json` when
  appropriate.

## Working Rule

When an item above is implemented, update this document from planned work to
current behavior, then record the decision in `iteration-log.md`. Only update
`CHANGELOG.md` when the work changes how the site builds, validates, publishes,
or renders.
