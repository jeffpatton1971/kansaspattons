# Site Configuration

Site-level presentation lives in:

```text
content/site.config.json
```

The content build reads this file and emits the public API shape in:

```text
public/content/site.json
dist/content/site.json
```

The React shell reads that API-provided site object, so sibling sites can change
site identity without changing React components.

The top-level `key` is the site id for shared API calls. In GitHub Actions,
`VITE_API_SITE_ID` should match this configured `key`; `CONTENT_SITE_KEY` is
used by the publish scripts and should match it too.

Optional presentation sections are opt-in. If a site omits `banner`, the home
banner should not render. If a site omits `author`, the author card should not
render. An `author.imageUrl` by itself does not create an author card; provide a
name, bio, or links. The content build must not fill missing site sections with
reference site defaults.

## Shape

```ts
type SiteConfig = {
  key?: string;
  title?: string;
  url?: string;
  nav?: SiteNavItem[];
  banner?: SiteBanner;
  author?: SiteAuthor;
  footer?: SiteFooter;
  theme?: SiteTheme;
};

type SiteNavItem = {
  label: string;
  href: string;
  icon?: string;
};

type SiteBanner = {
  eyebrow?: string;
  title?: string;
  text?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
};

type SiteFooter = {
  brandText?: string;
  text?: string;
  links?: SiteNavItem[];
  copyright?: string;
};

type SiteTheme = {
  fontFamily?: string;
  background?: string;
  text?: string;
  surface?: string;
  surfaceRaised?: string;
  border?: string;
  muted?: string;
  accent?: string;
  accentStrong?: string;
  bannerBackground?: string;
  headerBackground?: string;
  footerBackground?: string;
};
```

## Navigation

Navigation links can point at React routes or regular external URLs.

```json
{
  "nav": [
    { "label": "Home", "href": "/" },
    { "label": "Posts", "href": "/posts" },
    { "label": "Patton Tech", "href": "https://patton-tech.com" }
  ]
}
```

Known icon names are optional: `home`, `posts`, `stories`, `galleries`,
`images`, `library`, and `external`. If no icon is provided, the app chooses a
reasonable icon from the link path.

## Banner

The home banner sits below the masthead. It can be text-only or image-backed.
Omit the `banner` object entirely when the site should not render a home banner.

```json
{
  "banner": {
    "eyebrow": "Family archive",
    "title": "KansasPattons",
    "text": "Posts, stories, galleries, and images from the family archive.",
    "backgroundImage": "/assets/images/banner.jpg",
    "backgroundPosition": "center",
    "backgroundSize": "cover"
  }
}
```

## Theme

The theme maps onto CSS variables used by the React shell. Start small: change
`fontFamily`, `accent`, or `bannerBackground` first.

```json
{
  "theme": {
    "fontFamily": "\"Geist Variable\", Inter, ui-sans-serif, system-ui",
    "background": "#1d2027",
    "text": "#e6e9ee",
    "surface": "#242832",
    "accent": "#78a6cb",
    "bannerBackground": "#20242d"
  }
}
```

## Environment Overrides

Deployment can still override selected values:

```powershell
$env:CONTENT_SITE_TITLE = "KansasPattons"
$env:CONTENT_SITE_URL = "https://kansaspattons.org"
$env:CONTENT_SITE_NAV_JSON = '[{"label":"Home","href":"/"}]'
$env:CONTENT_SITE_AUTHOR_JSON = '{"name":"Jeff Patton"}'
$env:CONTENT_SITE_THEME_JSON = '{"accent":"#78a6cb"}'
npm run build:content
```

Use config for normal site personality. Use environment variables for deployment
differences or one-off build overrides.
