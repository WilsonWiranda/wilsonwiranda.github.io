# P-11.50 twatrails_v3 — Development Log

## Session Summary (2026-04-01 / 2026-04-02)

---

## Overview

Full feature build + bug fix session for the GR11 Pyrenees hiking PWA.
Tech stack: Leaflet, Firebase Realtime DB (no auth), Strava OAuth2, GitHub Pages.

---

## Features Added

### 1. Splash Screen Login (Round 1 → Round 2 redesign)

**Round 1:** Login modal appeared after clicking "Open App".
**Round 2 (user feedback):** Login must be on the splash screen itself.

**Final splash layout:**
- Language selector (EN/ES/CA flag SVGs) — visible immediately
- Email input (`#splashEmailInput`) — pre-filled from localStorage
- `#splashEnter` — Open App (reads email; falls back to saved email; falls back to guest)
- `#splashGuest` — Open App as Guest 👁
- Enter key on email field triggers Open App

`#userModal` repurposed as "switch account" — triggered by badge in topbar.

---

### 2. User / Guest System

- `currentUser = { email, isGuest }` in app.js
- Email stored in `localStorage('p1150_user_email')`
- No Firebase Auth — soft identity only
- `applyGuestMode(bool)` toggles:
  - `#notesGuestLock` / `#notesContent`
  - `#photosGuestLock` / `#photosContent`
  - `#liveGuestLock` / `#liveHikerControls`
  - `.guest-locked` class on Notes, Photos, Live tab buttons

---

### 3. Private Data Storage (Firebase `/owner/` path)

**Decision:** Middle option — Firebase `/owner/{userKey}/` for private persistence; no Firebase Auth enforcement. Gives cross-device sync without auth complexity.

**Firebase structure:**
```
/owner/{userKey}/notes/{id}   — private notes (shared: false until user shares)
/owner/{userKey}/photos/{id}  — private photos (shared: false until user shares)
/shared/activities/{id}       — shared Strava activities
/shared/notes/{id}            — shared notes (public)
/shared/photos/{id}           — shared photos (public)
```

`userKey` = email with `.@#$[]` replaced by `_`.

**Firebase Rules:**
```json
{
  "rules": {
    "hiker": { "position": { ".read": true, ".write": true } },
    "owner": { "$userKey": { ".read": true, ".write": true } },
    "shared": {
      ".read": true, ".write": true,
      "activities": { "$activityId": { ".read": true, ".write": true } },
      "notes":      { "$noteId":     { ".read": true, ".write": true } },
      "photos":     { "$photoId":    { ".read": true, ".write": true } }
    }
  }
}
```

---

### 4. Notes Flow

1. Drop pin → `Waypoints.addCustomPin()` → saved to `localStorage` + `/owner/{key}/notes/` (`shared: false`)
2. Notes tab shows 📡 button per pin
3. Tap 📡 → `toggleNoteShare()` → `/shared/notes/`; private record updated (`shared: true`)
4. Tap ⏹ → removed from shared; private stays
5. Remove → deleted from both private + shared
6. **On refresh:** `restorePrivateData()` loads private → `Waypoints.loadCustomPin()` (silent, skips localStorage dupes) → `_sharedNoteIds` rebuilt

---

### 5. Photos Flow

1. Upload → EXIF parsed → canvas resize → marker on map
2. Saved to `/owner/{key}/photos/` (NOT auto-shared)
3. Photo list shows 📡 share button per photo
4. Tap 📡 → `togglePhotoShare()` → `LiveTrack.publishSharedPhoto()` → `/shared/photos/`
5. Tap ⏹ → removed from shared; private stays
6. Remove → deleted from private + shared
7. **On refresh:** `restorePrivateData()` → `Photos.addFromData()` (silent) → `_sharedPhotoIds` rebuilt

---

### 6. Strava Colors + Toggle

- **Loaded (not shared):** orange `#f97316`
- **Shared:** blue `#0437F2` (set via `polyline.setStyle()` on share/unshare)
- **Toggle off:** clicking already-loaded activity calls `clearStravaOverlay(false)` and returns
- Observer polylines always blue

---

### 7. Language Flags

Replaced emoji flags (`🇬🇧`, `🇪🇸`) with inline SVG:
- EN: Union Jack (full St George + Andrew + Patrick crosses, correct offset)
- ES: Spanish flag (red/yellow/red rectangles)
- CA: Catalan stripes (unchanged — was already SVG via `<img data:` uri)

Language selector appears on **both** splash and topbar.

---

### 8. Hide Photos / Hide Notes FABs

- `#btnTogglePhotos` (📷) and `#btnToggleNotes` (📝) in FAB group
- Hidden by default; shown via `refreshPhotoFab()` / `refreshNotesFab()` when markers exist
- Toggle opacity 45% when hidden; toast on toggle

---

## Bugs Fixed

### Double marker on photo upload + popup not opening

**Symptom:** After uploading a photo, clicking its marker on the map did nothing. After page refresh, two markers appeared at the same location.

**Root cause:** `startPhotoObserver()` subscribed to Firebase and fired immediately (Firebase fires on subscribe). At that moment `Photos.getAll()` was empty (private restore hadn't run yet), so dedup failed → observer added its own marker on top of the local one. The observer marker (DOM order: earlier) intercepted taps.

**Fix:** Made `initLiveTrack()` async. For logged-in users, `await restorePrivateData()` runs **before** `startPhotoObserver()` and `startNotesObserver()`. When the observer fires, local photos are already loaded → dedup works → no duplicate marker.

```javascript
// initLiveTrack ordering (critical):
startViewerSubscription();
startStravaObserver();
if (!currentUser.isGuest) {
  LiveTrack.setOwner(email);
  await restorePrivateData();   // ← must be awaited
}
startPhotoObserver();           // ← runs after private data loaded
startNotesObserver();
```

---

### Notes disappear on page refresh

**Root cause:** Custom pins lived only in JS memory (Waypoints module) and were not persisted.

**Fix:** `waypoints.js` now persists to `localStorage('p1150_custom_pins')`:
- `savePins()` — called on `addCustomPin()` and `remove()`
- `restorePins()` — called on `init()` before any click listeners
- `loadCustomPin(data)` — silent restore from Firebase (skips ID dupes from localStorage, no onChange trigger)

---

### Photo popup shows filename instead of caption

**Fix in `photos.js` `buildPopup()`:**
- Caption (`p.note`) shown as bold title
- Filename (`p.name`) shown as small grey secondary text below (only when caption is set)

---

### Photos FAB not appearing after upload

**Root cause:** `refreshPhotoFab()` was only called in the early-return (empty) branch of the observer, not after adding markers.

**Fix:** Added `refreshPhotoFab()` call at the end of the observer photos loop.

---

### Double Strava polyline (user is publisher + subscriber)

**Fix:** Observer skips activities where `data.firebaseId` is in `state.stravaSharedIds`.

---

### Notes popup showing wrong content

**Fix:** Observer popup shows `n.name` as bold title + `n.note` as body text (was showing only note text).

---

### Remove button missing on observer photo popup

**Fix:** `subscribePhotos()` in livetrack.js now includes `firebaseId` (Firebase node key) on each photo. Observer popup shows Remove button if `p.owner === currentUser.email || !p.owner` (the `!p.owner` handles old entries written before the owner field existed).

`window.removeSharedPhoto(firebaseId)` — global handler called from popup `onclick`.

---

## Key Implementation Details

### `_prevPinIds` / `_prevPhotoIds` pattern

Both `Waypoints.onChange` and `Photos.onChange` use diff detection to avoid re-publishing already-saved items:

```javascript
// On change:
const newIds = new Set(pins.map(p => String(p.id)));
pins.forEach(pin => {
  if (!_prevPinIds.has(String(pin.id))) LiveTrack.publishPrivateNote(pin); // new pin
});
for (const id of _prevPinIds) {
  if (!newIds.has(id)) LiveTrack.unpublishPrivateNote(id); // removed pin
}
_prevPinIds = newIds;
```

`restorePrivateData()` sets `_prevPinIds` and `_prevPhotoIds` after loading, so the first `onChange` after restore doesn't double-publish.

---

### Photo thumbnail sizes

| Use | Max size | Quality | ~Size |
|-----|---------|---------|-------|
| Local display (`thumb`) | 800px | 0.85 | ~300KB |
| Firebase share (`shareThumb`) | 400px | 0.60 | ~20KB |

Firebase Realtime DB silently fails writes >1MB. Always use `shareThumb` for Firebase writes. Both `/shared/photos/` and `/owner/photos/` store `shareThumb`.

---

### New livetrack.js functions (added this session)

| Function | Purpose |
|----------|---------|
| `setOwner(email)` | Sets `/owner/{userKey}` refs |
| `publishPrivateNote(pin)` | Save note to owner private path |
| `unpublishPrivateNote(id)` | Delete from private path |
| `loadPrivateNotes()` | Fetch all private notes (once) |
| `publishPrivatePhoto(photo)` | Save photo to owner private path |
| `unpublishPrivatePhoto(id)` | Delete from private path |
| `loadPrivatePhotos()` | Fetch all private photos (once) |
| `publishSharedPhoto(photo)` | Write to `/shared/photos/` (explicit share) |
| `unpublishPhoto(firebaseId)` | Delete single shared photo |

`subscribePhotos(cb)` now includes `firebaseId` key on each returned photo object.

---

### New app.js functions (added this session)

| Function | Purpose |
|----------|---------|
| `restorePrivateData()` | async; loads private notes + photos from Firebase |
| `togglePhotoShare(photoId)` | Share/unshare single photo |
| `toggleNoteShare(pinId)` | Share/unshare single note |
| `removeSharedPhoto(firebaseId)` | Delete shared photo (global, called from popup) |

---

### New waypoints.js functions

| Function | Purpose |
|----------|---------|
| `savePins()` | Write custom pins to localStorage |
| `restorePins()` | Read from localStorage and add markers (called on init) |
| `loadCustomPin(data)` | Silent add from Firebase (no onChange, no savePins) |
| `buildPinPopup(id, name, note, lat, lon)` | Shared popup HTML builder |

### New photos.js functions

| Function | Purpose |
|----------|---------|
| `addFromData(data)` | Silent restore from Firebase (no onChange) |
