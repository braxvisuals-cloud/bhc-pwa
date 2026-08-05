# Bush Hills Church of Christ — Website Automation Projects

This folder covers three related projects built on top of [bushhillschurch.com](https://bushhillschurch.com/) (a Durable site):

1. **PWA install** — the site can be installed as an app icon on phone home screens (Android Chrome and iOS Safari).
2. **Live stream automation** — the `/service-stream` page automatically shows the church's YouTube livestream when it's live, a waiting-music video when it's not, and a self-updating "Recent Videos" section. No more manually pasting a link every Sunday.
3. **Announcements** — a backend that takes a rough-draft announcement, cleans up the phrasing with AI, publishes it, and emails a one-click delete link as a moderation safety net. Backend is fully built and tested; the frontend (a submission form + a feed on the site) is written but not yet wired into Durable.

**Status: PWA and live-stream automation fully deployed and working. Announcements backend fully working; frontend integration still pending.**

Durable allows custom code injection (a Head Code box and a Footer Code box, under Website Settings → Integrations → Custom Code) but does not allow uploading arbitrary files to its own root, and page-editor blocks (Video, "Embed object with code") turned out to silently mangle certain URLs. Everything here works around those two constraints.

## What's in this folder

| File | Purpose |
|---|---|
| `manifest.json` | Web app manifest — name, icons, colors, display mode. Hosted on Netlify. |
| `_headers` | Netlify config — adds CORS headers to `manifest.json`/`icons/*` so Chrome can fully verify installability (see "Android icon" note below). |
| `icons/icon-192.png`, `icons/icon-512.png` | App icons for the home screen / app switcher. Hosted on Netlify. |
| `icons/apple-touch-icon.png` | 180×180 icon iOS uses for "Add to Home Screen". Hosted on Netlify. |
| `icons/logo-source-480.png` | Original 480×480 logo, kept for regenerating icons later. |
| `index.html` | Placeholder page at the Netlify site's root (Netlify Drop requires *something* at `/`; visitors never see this). |
| `durable-head-snippet.html` | **In use.** Paste into Durable's Head Code box. |
| `durable-body-snippet.html`, `sw.js` | **Not in use.** Dead-end offline-caching attempt, kept as reference — see below. |
| `ios-install-banner-snippet.html` | **In use.** One of the scripts in Durable's Footer Code box (see below). |
| `live-stream/worker.js` | **In use, deployed to Cloudflare.** The live-check + recent-videos backend. |
| `live-stream/durable-footer-snippet.html` | **In use.** The other script in Durable's Footer Code box. |
| `announcements/schema.sql` | Run once in D1's Console to create the `announcements` table. |
| `announcements/worker.js` | **In use, deployed to Cloudflare.** The announcements backend (AI cleanup, storage, email, delete). |
| `announcements/durable-submission-form-snippet.html` | **Not yet in Durable.** The write-up form for posting a new announcement. |
| `announcements/durable-footer-feed-snippet.html` | **Not yet in Durable.** Renders the public announcements feed. |

## Where everything is actually deployed

**Netlify** (static files — manifest, icons): `https://marvelous-halva-940fc1.netlify.app`, account `braxvisuals@gmail.com`.
- Visitor Access / Team Protection must stay **off**, or the manifest/icons 401 and installability breaks.
- To redeploy: open the **marvelous-halva-940fc1** project → **Deploys** tab → drag this folder onto the drop zone there (not the main Projects page — that creates an unrelated new site with a different URL).

**Cloudflare Worker** (live-stream backend): `https://bhcoclivecheck-98db.braxvisuals.workers.dev`, same account.
- Has one secret env var: `YOUTUBE_API_KEY` (Settings → Variables and Secrets → must be type **Secret**, name is case-sensitive).
- To redeploy: open the Worker → Edit code → paste in updated `live-stream/worker.js` → Deploy.
- Caches its response for 5 minutes (`caches.default`, fixed cache key) — code changes or channel-ID changes won't show up until that cache naturally expires, or the `if (cached) {...}` block is temporarily commented out to bypass it while testing.

**Durable** (Website Settings → Integrations → Custom Code):
- **Head Code**: contents of `durable-head-snippet.html`.
- **Footer Code**: contains **two** separate `<script>` blocks, both required:
  1. `live-stream/durable-footer-snippet.html` (live-stream swap + recent videos)
  2. `ios-install-banner-snippet.html` (iOS install banner)

**Video block on `/service-stream`**: set to whatever static "waiting music" video should show when nothing's live — currently *"Christian Lofi Mix Vol 1" by Gospel Hydration* (`https://www.youtube.com/watch?v=0tk6MUyEuTk`). This is a normal Durable edit, change it anytime; the automation only overrides it when the channel is actually live.

**Cloudflare Worker** (announcements backend): `https://fragrant-dream-ef85.braxvisuals.workers.dev`, same account.
- Bindings: D1 database named `DB` → `announcements-db`; Workers AI named `AI`.
- Secrets: `SUBMIT_PIN` (shared passphrase for posting), `RESEND_API_KEY` (from resend.com).
- To redeploy: open the Worker → Edit code → paste in updated `announcements/worker.js` → Deploy.
- No caching layer on this one (unlike the live-stream Worker) — code changes take effect on the very next request.

## Branding used

The site itself is minimal (plain white header, black text, no CSS brand color defined in the page). The one piece of real branding is the site's own favicon/logo — a "bhcoc" wordmark with a cross over a copper/rust curtain background. That image is reused as the app icon, and its copper tone (`#7A3E1D`) was sampled from it for `theme_color` and the iOS install banner's background. `background_color` is plain white to match the site.

## How the live-stream automation works

The Worker (`live-stream/worker.js`) does two things, both scoped to the church's own channel (`UCk5g_eEcpDzTRHcmoM1UFcA`):
1. **Live check** — calls YouTube's `search.list?eventType=live` for that channel. If something's live, returns its video ID.
2. **Recent uploads** — calls `playlistItems.list` on the channel's uploads playlist (cheap on API quota, unlike the live check) for the 3 most recent videos.

The Footer Code script (`live-stream/durable-footer-snippet.html`), on `/service-stream` only:
- Fetches the Worker's response.
- If live, overwrites the existing YouTube iframe's `src` with the live video (normal `youtube.com/embed/VIDEO_ID` format — the same format that already worked for manual updates; a separate `youtube.com/embed/live_stream?channel=` trick was tried first and abandoned after extensive testing showed it's unreliable, likely due to a broader Dec 2025 YouTube referrer change).
- Renders a "Recent Videos" row under the player from the 3 recent uploads. Clicking one plays it in the main player (no redirect to YouTube) and reveals a "← Back to Live Stream / Main Video" button that restores whatever was originally there.
- If nothing's live, does nothing — the Video block's static "waiting music" video just plays as normal.

**Why the Worker exists at all** instead of doing this client-side: Durable's page-editor blocks (Video block, "Embed object with code") both turned out to silently rewrite/strip any YouTube URL that isn't a plain `watch?v=`/`embed/VIDEO_ID` link — including dropping query strings entirely. That broke every attempt at a URL-only trick. The Worker sidesteps this by doing the real lookup server-side and only ever handing Durable a plain, well-formed embed URL.

## How the announcements feature works

The Worker (`announcements/worker.js`) has three endpoints:
- `POST /submit` — takes `{ text, pin }`. Rejects if `pin` doesn't match the `SUBMIT_PIN` secret. Otherwise: runs `text` through Workers AI (`@cf/zai-org/glm-4.7-flash`) with a prompt that cleans up grammar/phrasing while preserving every fact, date, and name; saves both the raw and cleaned text to D1 with a random `delete_token`; emails a one-click delete link to `NOTIFY_EMAIL`; publishes immediately (no approval queue).
- `GET /delete/:token` — the link in that email. Marks the announcement `deleted` in D1 (soft delete, not removed from the table).
- `GET /list` — returns the 10 most recent `active` announcements as JSON, for the site's feed to render.

**Design choice worth knowing:** this publishes immediately and relies on the delete-email as an *after-the-fact* moderation safety net, not a pre-publish approval gate. The `SUBMIT_PIN` requirement keeps random internet traffic from posting, but anyone who has the PIN can publish instantly. If stricter moderation is ever wanted, `handleSubmit` would need to insert with `status: 'pending'` instead of `'active'` and add an approve step.

**AI model note:** `@cf/meta/llama-3.1-8b-instruct` (the original choice) turned out to be deprecated as of 2026-05-30, and its replacement `@cf/meta/llama-3.2-3b-instruct` was *also* deprecated — Workers AI's Llama lineup was apparently deprecated wholesale around that date. Currently using `@cf/zai-org/glm-4.7-flash` instead, which returns OpenAI-style responses (`choices[0].message.content`) rather than the Llama family's simpler `.response` field — `cleanUpText()` in the Worker checks both shapes so it degrades gracefully if the model changes again.

**Email note:** `NOTIFY_EMAIL` is currently `braxvisuals@gmail.com`, not the church's actual desired address, because Resend's free tier (sending from the shared `onboarding@resend.dev` domain) only allows delivery to the account's own verified email. To notify a different address for real, verify a custom domain at resend.com/domains and update both `NOTIFY_EMAIL` and the `from` address in `sendDeleteEmail`.

**What's left:** the two frontend snippets in `announcements/` need to actually go into Durable. Suggested placement: the submission form on a private/unlinked page (not the homepage, so it's not stumbled into — the PIN is a backstop, not the only line of defense) and the feed `<div id="bhcoc-announcements-feed"></div>` wherever announcements should show, likely the homepage. Neither has been pasted into Durable yet.

## What didn't work: offline page caching (separate from live-stream)

An earlier attempt to add a service worker for offline page caching hit a hard wall: service workers must be **same-origin** with the registering page (no CORS workaround exists), and Durable won't allow uploading `sw.js` to `bushhillschurch.com` itself. A `Blob`-URL registration trick was tried and confirmed **not** to work — browsers reject `blob:`/`data:` URLs for service worker registration outright (`TypeError: Failed to register a ServiceWorker: The URL protocol of the script ('blob:...') is not supported.`). A real fix would require proxying the domain's DNS through something like a Cloudflare Worker to serve `/sw.js` same-origin — a separate, larger project needing DNS/registrar access, not pursued. `sw.js` and `durable-body-snippet.html` are kept only as reference; **Durable's Footer Code box should not contain their content.**

Installability doesn't need a service worker at all — confirmed working on both platforms without one.

## Testing

**PWA install — Android Chrome:** visit the site, tap ⋮ → "Install app", confirm the real bhcoc icon shows (not a generic "B") and it opens without a browser address bar.

**PWA install — iOS Safari:** Share → "Add to Home Screen". No automatic prompt exists on iOS (Apple doesn't offer one) — that's what the install banner is for.

**iOS install banner:** visit in Safari on an iPhone/iPad that hasn't installed the app yet — a copper banner should slide in at the bottom pointing to Share → Add to Home Screen. Dismissing it (✕) is remembered via `localStorage` and won't reappear. Shows to iOS Safari only — never Android, desktop, or Chrome/Firefox-on-iOS, and never once the app is actually installed.

**Live stream:** the real test is an actual Sunday service — start streaming as normal, then check `/service-stream` within ~5 minutes (the Worker's cache window); it should swap over with zero manual action. Can also be sanity-checked anytime by temporarily pointing the Worker's `CHANNEL_ID` at a known always-live channel (e.g. Lofi Girl, `UCSJ4gkVC6NrvII8umztf0Ow`) to visually confirm the swap mechanism still works, then switching it back.

## Troubleshooting

- **Wrong/blank icon on install** → confirm Durable's Head Code box actually contains the real HTML from `durable-head-snippet.html` (not a file path typed as text — happened once during setup) and the site's been republished.
- **Android installs as a plain shortcut instead of a full app** → this happened once due to Netlify not sending CORS headers on `manifest.json`, which broke Chrome's full installability check. Fixed by adding `_headers`. If it recurs, verify with: `curl -sI -H "Origin: https://bushhillschurch.com" https://marvelous-halva-940fc1.netlify.app/manifest.json` and check for `Access-Control-Allow-Origin`.
- **Manifest/icons not loading at all** → check Netlify's Visitor Access setting isn't re-enabled (causes a 401 on every file).
- **iOS still showing a stale icon after a fix** → old installs cache the icon per-domain; remove the home screen icon, clear Safari's website data for `bushhillschurch.com` (Settings → Safari → Advanced → Website Data), then revisit and re-add.
- **Android app stuck on an old icon after a fix** → Chrome bakes the icon into a signed package (WebAPK) at install time, which doesn't auto-refresh. Fully uninstall (long-press → Uninstall, not just remove from home screen) and reinstall.
- **Live-stream/recent-videos changes not showing up** → almost always the Worker's 5-minute cache serving a stale response from before the change. Wait it out, or temporarily comment out the `if (cached) {...}` block in `worker.js`, deploy, and check the Worker URL directly to confirm the new code is correct before re-enabling the cache.
- **Worker returning `isLive:false` unexpectedly** → check `env.YOUTUBE_API_KEY` is actually set (case-sensitive name) in Cloudflare's Settings → Variables and Secrets, and hasn't hit its daily quota.
