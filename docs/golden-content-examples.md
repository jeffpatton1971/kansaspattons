# Golden Content Examples

These files are the small reference set for the target authoring model. They are
real archive content, but they are also useful smoke-test fixtures when changing
the compiler, validator, API, or React detail views.

## Post With Direct Images

File:

```text
_posts/2013-05-29-big-boy.md
```

Why this is useful:

- Uses `content_type: post`.
- Has one direct `images` item.
- Uses a canonical media key in `cover_image` and `images[].id`.
- Does not need a gallery.

Route:

```text
/posts/2013/05/29/big-boy
```

## Post With A Linked Gallery

File:

```text
_posts/2009-10-18-pumpkin-patch.md
```

Why this is useful:

- Uses `content_type: post`.
- Keeps the article body separate from the photo set.
- Links to a gallery through `related`.
- The linked gallery should render inline on the post detail page.

Route:

```text
/posts/2009/10/18/pumpkin-patch
```

## Story With Direct Images

File:

```text
_posts/2026-04-16-194804-better-late-than-never.md
```

Why this is useful:

- Uses `content_type: story`.
- Has multiple direct `images`.
- Exercises the image-first story detail layout.
- Keeps the story body short and caption-like.

Route:

```text
/stories/2026/04/16/194804-better-late-than-never
```

## Standalone Gallery

File:

```text
_posts/2009-10-18-pumpkin-patch-gallery.md
```

Why this is useful:

- Uses `content_type: gallery`.
- Has `cover_image`.
- Owns an ordered `images` list.
- Links back to the companion post through `related`.

Route:

```text
/galleries/2009/10/18/pumpkin-patch
```

## Smoke Check

After a content-contract or rendering change, run:

```powershell
npm run content:validate
npm run build
```

Then check the routes above in the local React app.
