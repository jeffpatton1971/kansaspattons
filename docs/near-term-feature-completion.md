# Near-Term Feature Completion

This is the short-list of low-friction work that clears the path toward a
feature-complete React/API content platform. These items are not all blockers by
themselves, but they reduce ambiguity before the publish pipeline and `_gallery`
retirement work get heavier.

## Recommended Order

1. Tighten validation.
2. Add taxonomy cleanup maps.
3. Lock golden content examples.
4. Finish taxonomy result pages and links.
5. Remove user-facing import/source leftovers.
6. Validate media references against the media manifest.
7. Document exact authoring examples.
8. Add a dry-run publish plan command.

## 1. Tighten Validation

Why this matters:

The validator should become the guardrail for both old migration cleanup and new
content authoring. If it catches shape drift early, the API and frontend can stay
boring.

Work:

- Require `content_type` to be one of `post`, `story`, or `gallery`.
- Warn or fail when legacy `article` terminology reappears.
- Require `title`, `date`, `slug`, and authors for published content.
- Require hashtags to be lowercase, one word, and stored without `#`.
- Require canonical media keys after publish rewrite:

```text
yyyy/mm/dd/filename.ext
```

- Require galleries to have `cover_image` and `images`.
- Require a gallery `cover_image` to exist in that gallery's `images` list or
  in the media manifest.
- Require posts and stories to use direct `images` or linked `galleries`, rather
  than legacy `_gallery` page references.
- Check route uniqueness across posts, stories, and galleries.

Acceptance criteria:

- `npm run content:validate` stays clean for currently accepted content.
- `npm run content:validate:strict` can be used to preview future stricter
  failures.
- `.tmp/content-validation-report.json` clearly separates hard errors from
  cleanup warnings.

## 2. Add Taxonomy Cleanup Maps

Why this matters:

Imported content has spelling variants, casing drift, and old system labels.
Cleanup maps let us fix that repeatably instead of hand-editing one file at a
time.

Work:

- Keep hashtag aliases in one place.
- Keep category aliases in one place.
- Keep people aliases in one place.
- Keep location aliases in one place.
- Make aliases usable by both cleanup scripts and validation.

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

## 3. Lock Golden Content Examples

Why this matters:

The imported archive has many edge cases. We still need a few clean examples
that describe the desired future shape without legacy noise.

Work:

- Create or designate one post with direct images.
- Create or designate one post that renders a linked gallery inline.
- Create or designate one story with images.
- Create or designate one standalone gallery.
- Keep these examples small and easy to review.

Acceptance criteria:

- The examples validate cleanly.
- The examples render correctly in React.
- The examples are referenced from the authoring workflow docs.

## 4. Finish Taxonomy Result Pages And Links

Why this matters:

Hashtags, categories, people, and locations should become real discovery paths,
not just metadata in generated JSON.

Work:

- Ensure detail pages render clickable hashtags as `#hashtag`.
- Render categories below hashtags.
- Decide where people and locations should appear.
- Make taxonomy result pages show posts, stories, and galleries together.
- Sort taxonomy results by date.
- Add empty-state behavior for taxonomy terms with no matches.

Acceptance criteria:

- `/hashtags/breakfast` renders all matching content types.
- `/categories/{slug}` renders matching posts/stories/galleries.
- `/people/{slug}` and `/locations/{slug}` work from API data.
- All taxonomy links use internal React routes.

## 5. Remove User-Facing Import/Source Leftovers

Why this matters:

`wordpress`, `instagram`, and `facebook` were useful during import, but they
should not look like user-facing topics unless we intentionally add a source
filter UI.

Work:

- Keep source information only in legacy metadata or admin metrics.
- Remove source labels from hashtags.
- Remove source labels from categories.
- Ensure source labels do not render in content cards or detail taxonomy.
- Keep the right-column source metrics only if they are intentionally useful for
  migration review.

Acceptance criteria:

- User-facing taxonomy pages do not include import/source labels.
- Source values remain available for migration/debugging if needed.
- The UI does not present import source as a normal topic.

## 6. Validate Media References Against The Manifest

Why this matters:

Before `_gallery` can disappear, the compiler needs to trust
`content/media/index.json` as the media source of truth.

Work:

- Check every `cover_image` against `content/media/index.json`.
- Check every `images[].id` against `content/media/index.json`.
- Check every gallery media item against `content/media/index.json`.
- Check inline Markdown image references after publish rewrite.
- Report missing media IDs separately from storage/blob copy issues.

Acceptance criteria:

- `npm run content:validate` reports missing media references clearly.
- The report identifies the content file and missing media key.
- The site can build without reading `_gallery`.

## 7. Document Exact Authoring Examples

Why this matters:

The authoring model should be obvious months from now, especially once images
are uploaded and rewritten by automation.

Work:

- Add final examples for:
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

Why this matters:

Before real Azure uploads are part of the normal path, we should be able to see
exactly what publish would do.

Work:

- Detect changed Markdown.
- Detect local media files referenced by changed Markdown.
- List affected content JSON files.
- List affected index JSON files.
- List media files that would upload.
- List Markdown rewrites that would happen.
- Avoid writing files or uploading blobs in dry-run mode.

Acceptance criteria:

- A dry run can be reviewed before publish writes anything.
- The command exits nonzero when planned work has collisions or missing media.
- The dry-run output is suitable for GitHub Actions logs.

Possible command shape:

```powershell
npm run publish:plan
```

or extend the existing dry-run command:

```powershell
npm run publish:content:dry-run
```

## Working Rule

When an item above is implemented, update this document from planned work to
current behavior, then record the decision in `iteration-log.md`. Only update
`CHANGELOG.md` when the work changes how the site builds, validates, publishes,
or renders.
