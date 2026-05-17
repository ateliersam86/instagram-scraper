# Instagram surfaces — research notes (2026-05)

Live recon performed against the logged-in production site on 2026-05-10
using Sam's session. The structure described here was observed in the
actual served HTML; treat it as a snapshot — Instagram changes field
names often.

## Bootstrap data location

Instagram embeds page data in `<script type="application/json">` blobs
inside the HTML — typically 30–200 KB each, ~40 such scripts per page.

The relevant blobs use Apollo client cache shape:

```json
{
  "require": [["...", "...", null, [...payload...]]]
}
```

The payload typically contains a `__bbox` wrapper with the GraphQL result:

```json
{
  "__bbox": {
    "complete": true,
    "result": {
      "data": {
        "xdt_api__v1__media__shortcode__web_info": { ... }
      }
    }
  }
}
```

To find the right script, search for the structural keyword (e.g.
`xdt_api__v1__media__shortcode__web_info`) — searching for the username
alone returns false positives because the username appears in UI strings
across multiple bootstrap scripts.

## Confirmed structural keywords by surface

| URL | Keyword to find the right `<script>` |
| --- | ------------------------------------ |
| `/p/{shortcode}/` | `xdt_api__v1__media__shortcode__web_info` |
| `/reel/{shortcode}/` | same as `/p/` |
| `/{username}/` | `PolarisProfilePageContentQuery` (TBD — wasn't in our recon. May load via XHR after first paint.) |
| `/stories/{username}/` | Loaded via XHR after page-render. Won't appear in raw HTML. Requires Playwright `waitForResponse('**/api/v1/feed/reels_media/?...**')`. |
| `/explore/tags/{tag}/` | `xdt_api__v1__tags__web_info` (TBD — recon needed) |

## Post web-info structure (verified)

Top-level keys observed in `xdt_api__v1__media__shortcode__web_info.items[0]`:

```
code (shortcode)
pk, id (post ids)
ad_id, inventory_source (mostly null for organic posts)
taken_at (unix seconds)
video_versions (array; null for photos)
coauthor_producers (collab posts)
invited_coauthor_producers
facepile_top_likers
is_dash_eligible, number_of_qualities, video_dash_manifest (video streaming)
image_versions2.candidates[]  ← multiple resolutions, pick the highest by width
```

`image_versions2.candidates[*]` shape:

```
url      (CDN URL, query-string-signed)
height
width
```

For carousels, the response has `carousel_media[]` where each item has its
own `image_versions2.candidates[]` and optional `video_versions`.

## Profile page caveat

Sam's profile recon found NO Apollo cache containing
`PolarisProfilePageContentQuery` or similar — only the meta tags had the
useful info:

```html
<meta property="og:title" content="Example User (@example_user) • Photos et vidéos Instagram">
<meta property="og:description" content="399 followers, 512 suivis, 174 publications - Voir les photos et vidéos Instagram de Example User (@example_user)">
<meta property="og:image" content="https://scontent-cdg6-1.cdninstagram.com/...">
```

The profile parser will:
1. Parse the og:description for follower / following / post counts
   (regex against the locale-specific pattern)
2. Parse og:image for HD avatar URL
3. Parse og:title for full name
4. Try to find a `xdt_api__v1__user_by_username` blob if present
5. Fall back to triggering a Playwright XHR to
   `/api/v1/users/web_profile_info/?username={u}` if the HTML alone is
   insufficient (this is what the Instagram web client itself uses)

## Stories require Playwright

Stories don't appear in the raw HTML at all. The `/stories/{u}/` URL
serves a shell page; the actual story media + metadata loads via XHR to
something like `/api/v1/feed/reels_media/?reel_ids=...`.

Two implementation paths:
1. **Recommended**: Playwright with `page.on("response")` to capture the
   reels_media XHR. Robust, but adds Playwright dependency to the Stories
   phase.
2. Build the reels_media URL ourselves with the right cookies + CSRF
   token. Brittle (Instagram rotates these signatures).

We'll start with path 1 for reliability.

## Data we DO get from the post page recon

From `/p/DYKbk_gCFm6/` (Sam's recent post), the post-data.json blob
exposed:

- `code`, `pk`, `id`, `taken_at`
- `image_versions2.candidates[]` with multiple sizes (highest 1439×959)
- `video_versions`, `is_dash_eligible` (null for photo posts)
- `coauthor_producers` (empty for solo posts)
- `facepile_top_likers` (subset of users who liked, for hover preview)

The blob is 27,488 chars total — far smaller than the 193-KB-or-so
"largest matching" scripts we initially saved (those were Sam's wider
account context, not page data).

## Key takeaway

The pattern is: search by GraphQL field name, not by user string. Each
surface has its own `xdt_api__v1__*__web_info` (or similar) field. Map
the surface → field name once, and the parser is a one-liner extracting
that nested path.
