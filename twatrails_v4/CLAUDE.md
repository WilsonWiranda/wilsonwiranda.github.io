# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**twatrails_v3** (P-11.50) is a vanilla JS PWA for hiking trail tracking. No build system — files are served as-is. Deployable directly to GitHub Pages.

## Development

**Local dev**: Open `index.html` in a browser. No build step, no npm, no bundler.

**Deploy**: Push to `master` → GitHub Actions injects a Unix timestamp into `sw.js` for cache busting, then publishes to `gh-pages` branch.

**No linting, no tests, no type checking.** The CI pipeline does nothing except cache-bust and deploy.

## Architecture

### Stack
- Vanilla JavaScript (~4100 LOC across 14 modules in `js/`)
- Leaflet.js 1.9.4 (CDN) for maps
- Firebase Realtime DB for live position sharing, photos, notes
- Strava OAuth2 (via Cloudflare Worker proxy) for activity import
- Service Worker (`sw.js`) for offline map tile caching and app shell

### Module Responsibilities

| File | Role |
|------|------|
| `js/app.js` | Main controller: map init, UI lifecycle, tab panels, GPS tracking, off-route alerts |
| `js/livetrack.js` | All Firebase reads/writes; hardcoded Firebase config |
| `js/photos.js` | Photo upload, manual EXIF parsing (no lib), canvas resize, map markers |
| `js/waypoints.js` | Custom POI pins, localStorage persistence, GPX export |
| `js/recorder.js` | Live GPS track recording with segment detection and GPX export |
| `js/elevation.js` | Canvas elevation profile chart |
| `js/strava.js` | Strava OAuth2 token management + activity fetch |
| `js/geocoder.js` | Nominatim (OSM) place search |
| `js/routes.js` | Hardcoded trail data (GR11 Pyrenees, 7 Nutsturen Norway) |
| `cloudflare-worker.js` | Strava token proxy — deploy separately to Cloudflare Workers |

### Firebase Data Paths

```
/hiker/position/{userKey}           ← User's live GPS position
/shared/positions/{userKey}         ← All hikers' positions (multi-hiker)
/shared/activities/{activityId}     ← Shared Strava polylines
/shared/photos/{photoId}            ← Public photos
/shared/notes/{noteId}              ← Public notes
/owner/{userKey}/notes/{pinId}      ← Private notes (cross-device)
/owner/{userKey}/photos/{photoId}   ← Private photos (cross-device)
```

User key is derived from email: `email.replace(/[.#$\[\]@]/g, '_')`

### Storage Layers

| Layer | Keys | Purpose |
|-------|------|---------|
| `localStorage` | `p1150_user_email` | Logged-in user |
| `localStorage` | `p1150_custom_pins` | Waypoints JSON |
| `localStorage` | `tm_strava_*` | Strava tokens + config |
| Firebase `/owner/{key}/` | — | Private notes + photos (cross-device) |
| Firebase `/shared/` | — | Public sharing (live observers) |
| SW cache `p1150-{ts}` | — | App shell + Leaflet CDN |
| SW cache `p1150-tiles` | — | Offline map tiles |

## Critical Patterns

### Initialization Order in `app.js initLiveTrack()`
Private data **must** be restored before Firebase observers start. If observers fire first, they double-add markers on top of locally restored ones.

```javascript
startViewerSubscription();     // Observer hikers
startStravaObserver();
if (!currentUser.isGuest) {
  LiveTrack.setOwner(email);
  await restorePrivateData();  // MUST complete before observers
}
startPhotoObserver();          // Dedup now works
startNotesObserver();
```

### Photo Thumbnail Sizing
Firebase Realtime DB silently fails on writes > 1MB. Always use reduced thumbnails for Firebase writes:
- Local display: 800px, quality 0.85
- Firebase (`shareThumb`): 400px, quality 0.60

### Change Detection (Avoid Double-Publishes)
`_prevPhotoIds` and `_prevPinIds` sets in `livetrack.js` track what's already been published so onChange callbacks only push new items.

### Strava Activity Colors
- Loaded (not shared): orange `#f97316`
- Shared with observers: blue `#0437F2`

## External Services

| Service | Config location |
|---------|----------------|
| Firebase Realtime DB | Hardcoded in `js/livetrack.js` |
| Strava API | User-configured; stored in `localStorage` (`tm_strava_*`) |
| Cloudflare Worker (Strava proxy) | Deployed separately from `cloudflare-worker.js` |
| Nominatim geocoding | No config needed (free, anonymous) |
