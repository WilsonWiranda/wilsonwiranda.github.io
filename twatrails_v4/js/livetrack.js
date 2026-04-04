/* ============================================================
   livetrack.js — Live position + Strava activity sharing
   via Firebase Realtime DB. Config is hardcoded.

   Firebase paths:
     /hiker/position        — live GPS position (existing)
     /shared/strava         — shared Strava activity route
   ============================================================ */

'use strict';

const LiveTrack = (() => {

  // ── Hardcoded Firebase config ─────────────────────────────
  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyDFvgSXtvHheMgyTjNR34HGqRJYIGt7Lhw',
    authDomain:        'twatrails.firebaseapp.com',
    projectId:         'twatrails',
    storageBucket:     'twatrails.firebasestorage.app',
    messagingSenderId: '132893790640',
    appId:             '1:132893790640:web:f11a84c750a270fa87c675',
    databaseURL:       'https://twatrails-default-rtdb.europe-west1.firebasedatabase.app/',
  };

  const SK_HIKER = 'tm_fb_is_hiker';

  let db               = null;
  let posRef           = null;   // /shared/positions/{ownerKey} — per-user position
  let positionsRef     = null;   // /shared/positions — all hikers
  let stravaRef        = null;   // legacy single-activity (kept for compat)
  let activitiesRef    = null;   // multi-activity map
  let photosRef        = null;
  let notesRef         = null;
  let ownerRef         = null;   // /owner/{userKey}
  let ownerNotesRef    = null;   // /owner/{userKey}/notes
  let ownerPhotosRef   = null;   // /owner/{userKey}/photos
  let _ownerEmail      = null;   // current user's email (for position writes)
  let isSharing        = false;
  let viewerListener   = null;
  let hikersListener   = null;
  let stravaListener      = null;
  let activitiesListener  = null;
  let photosListener      = null;
  let statusCb         = null;

  // ── Auto-init on load ─────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined') {
      console.error('[LiveTrack] Firebase SDK not available');
      return false;
    }
    try {
      if (firebase.apps && firebase.apps.length > 0) {
        firebase.app();
      } else {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db            = firebase.database();
      positionsRef  = db.ref('/shared/positions');  // all hikers
      posRef        = null;                          // set per-user in setOwner
      stravaRef     = db.ref('/shared/strava');     // kept for compat
      activitiesRef = db.ref('/shared/activities'); // multi-activity
      photosRef     = db.ref('/shared/photos');
      notesRef      = db.ref('/shared/notes');
      return true;
    } catch (e) {
      console.error('[LiveTrack] Init failed:', e.message);
      return false;
    }
  }

  // ── Owner private paths ───────────────────────────────────
  // Call after init() once the user's email is known.
  // userKey sanitises email for Firebase key restrictions.
  function setOwner(email) {
    if (!db || !email) return;
    _ownerEmail   = email;
    const key     = email.replace(/[.#$\[\]@]/g, '_');
    ownerRef      = db.ref(`/owner/${key}`);
    ownerNotesRef  = ownerRef.child('notes');
    ownerPhotosRef = ownerRef.child('photos');
    // Per-user public position slot
    posRef = positionsRef ? positionsRef.child(key) : null;
  }

  // ── Private notes ─────────────────────────────────────────
  async function publishPrivateNote(pin) {
    if (!ownerNotesRef) return false;
    try {
      const id = String(pin.id).replace(/[.#$\[\]]/g, '_');
      await ownerNotesRef.child(id).set({
        id:     Number(pin.id),
        lat:    parseFloat(pin.lat.toFixed(6)),
        lon:    parseFloat(pin.lon.toFixed(6)),
        name:   pin.name   || '',
        note:   pin.note   || '',
        date:   pin.date   || Date.now(),
        shared: pin.shared || false,
        ts:     Date.now(),
      });
      return true;
    } catch(e) { console.warn('[LiveTrack] Private note save failed:', e.message); return false; }
  }

  async function unpublishPrivateNote(pinId) {
    if (!ownerNotesRef) return;
    const id = String(pinId).replace(/[.#$\[\]]/g, '_');
    try { await ownerNotesRef.child(id).remove(); } catch(_) {}
  }

  async function loadPrivateNotes() {
    if (!ownerNotesRef) return [];
    try {
      const snap = await ownerNotesRef.once('value');
      const data = snap.val();
      if (!data) return [];
      return Object.values(data).filter(n => n && n.lat);
    } catch(e) { console.warn('[LiveTrack] Load private notes failed:', e.message); return []; }
  }

  // ── Private photos ────────────────────────────────────────
  async function publishPrivatePhoto(photo) {
    if (!ownerPhotosRef) return false;
    try {
      const id    = String(photo.id).replace(/[.#$\[\]]/g, '_');
      const thumb = photo.shareThumb || photo.thumb || '';
      await ownerPhotosRef.child(id).set({
        id:       Number(photo.id),
        lat:      parseFloat(photo.lat.toFixed(6)),
        lon:      parseFloat(photo.lon.toFixed(6)),
        name:     photo.name     || '',
        note:     photo.note     || '',
        thumb,
        datetime: photo.datetime || '',
        shared:   photo.shared   || false,
        ts:       Date.now(),
      });
      return true;
    } catch(e) { console.warn('[LiveTrack] Private photo save failed:', e.message); return false; }
  }

  async function unpublishPrivatePhoto(photoId) {
    if (!ownerPhotosRef) return;
    const id = String(photoId).replace(/[.#$\[\]]/g, '_');
    try { await ownerPhotosRef.child(id).remove(); } catch(_) {}
  }

  async function loadPrivatePhotos() {
    if (!ownerPhotosRef) return [];
    try {
      const snap = await ownerPhotosRef.once('value');
      const data = snap.val();
      if (!data) return [];
      return Object.entries(data)
        .filter(([, p]) => p && p.lat && p.thumb)
        .map(([key, p]) => ({ ...p, firebaseId: key }));
    } catch(e) { console.warn('[LiveTrack] Load private photos failed:', e.message); return []; }
  }

  // Publish a single photo to /shared/photos (explicit share action)
  async function publishSharedPhoto(photo) {
    if (!photosRef) return false;
    try {
      const id    = String(photo.id).replace(/[.#$\[\]]/g, '_');
      const thumb = photo.shareThumb || photo.thumb || '';
      await photosRef.child(id).set({
        lat:      parseFloat(photo.lat.toFixed(6)),
        lon:      parseFloat(photo.lon.toFixed(6)),
        name:     photo.name     || '',
        note:     photo.note     || '',
        thumb,
        datetime: photo.datetime || '',
        owner:    photo.owner    || '',
        ts:       Date.now(),
      });
      _publishedPhotoIds.add(id);
      return true;
    } catch(e) { console.warn('[LiveTrack] Shared photo publish failed:', e.message); return false; }
  }

  // ── Hiker flag ────────────────────────────────────────────
  function setIsHiker(v) { localStorage.setItem(SK_HIKER, v ? '1' : '0'); }
  function getIsHiker()  { return localStorage.getItem(SK_HIKER) === '1'; }

  // ── Hiker: GPS sharing ────────────────────────────────────
  function startSharing() {
    if (!posRef) return false;
    isSharing = true;
    if (statusCb) statusCb('sharing');
    return true;
  }

  async function stopSharing() {
    isSharing = false;
    if (posRef) {
      try { await posRef.update({ sharing: false }); } catch (_) {}
    }
    if (statusCb) statusCb('stopped');
  }

  async function pushPosition(pos) {
    if (!posRef || !isSharing) return;
    const { latitude: lat, longitude: lon, altitude, accuracy, speed, heading } = pos.coords;
    try {
      await posRef.set({
        lat:      parseFloat(lat.toFixed(6)),
        lon:      parseFloat(lon.toFixed(6)),
        alt:      altitude  != null ? Math.round(altitude)                : null,
        accuracy: Math.round(accuracy),
        speed:    speed     != null ? parseFloat((speed * 3.6).toFixed(1)) : null,
        heading:  heading   != null ? Math.round(heading)                 : null,
        ts:       Date.now(),
        sharing:  true,
        owner:    _ownerEmail || '',
      });
    } catch (e) {
      console.warn('[LiveTrack] Push failed:', e.message);
    }
  }

  // ── Multi-activity Strava sharing ────────────────────────
  // Each activity is stored under /shared/activities/{activityId}
  // so multiple can be shared simultaneously.

  async function publishStrava(latlngs, stats, owner) {
    if (!activitiesRef) return false;
    try {
      const id  = String(stats.stravaId || stats.id || Date.now());
      let pts   = latlngs;
      let alts  = stats.alts || [];
      if (pts.length > 500) {
        const step = (pts.length - 1) / 499;
        pts  = Array.from({ length: 500 }, (_, i) => pts[Math.round(i * step)]);
        pts[499] = latlngs[latlngs.length - 1];
        if (alts.length) {
          alts = Array.from({ length: 500 }, (_, i) => alts[Math.round(i * step)] || 0);
          alts[499] = stats.alts[stats.alts.length - 1] || 0;
        }
      }
      const payload = {
        latlngs:   pts,
        name:      stats.name      || '',
        distance:  stats.distance  || 0,
        elevation: stats.elevation || 0,
        time:      stats.movingTime|| 0,
        points:    pts.length,
        owner:     owner || '',
        ts:        Date.now(),
        shared:    true,
      };
      if (alts.length) payload.alts = alts;
      await activitiesRef.child(id).set(payload);
      return true;
    } catch (e) {
      console.warn('[LiveTrack] Strava publish failed:', e.message);
      return false;
    }
  }

  async function unpublishStrava(activityId) {
    if (!activitiesRef) return;
    try {
      if (activityId) {
        await activitiesRef.child(String(activityId)).remove();
      } else {
        // Legacy: clear all
        await activitiesRef.remove();
      }
    } catch (_) {}
  }

  async function unpublishAllStrava() {
    if (!activitiesRef) return;
    try { await activitiesRef.remove(); } catch (_) {}
  }

  // ── Viewer: GPS subscription ──────────────────────────────
  function subscribeViewer(cb) {
    if (!posRef) return;
    viewerListener = posRef.on('value', snap => cb(snap.val()), err => {
      console.warn('[LiveTrack] Listener error:', err.message);
    });
  }

  function unsubscribeViewer() {
    if (posRef && viewerListener !== null) {
      posRef.off('value', viewerListener);
      viewerListener = null;
    }
  }

  // ── All hikers: subscribe to /shared/positions ────────────
  // cb receives array of { ownerKey, owner, lat, lon, alt, speed, accuracy, ts, sharing }
  function subscribeAllHikers(cb) {
    if (!positionsRef) { cb([]); return; }
    hikersListener = positionsRef.on('value', snap => {
      const val = snap.val();
      if (!val) { cb([]); return; }
      const hikers = Object.entries(val)
        .map(([key, d]) => ({ ...d, ownerKey: key }))
        .filter(d => d && d.lat && d.lon);
      cb(hikers);
    }, err => console.warn('[LiveTrack] Hikers listener error:', err.message));
  }

  function unsubscribeAllHikers() {
    if (positionsRef && hikersListener !== null) {
      positionsRef.off('value', hikersListener);
      hikersListener = null;
    }
  }

  // ── Viewer: multi-activity subscription ──────────────────
  // cb receives array of activity objects (may be empty)
  function subscribeStrava(cb) {
    if (!activitiesRef) return;
    activitiesListener = activitiesRef.on('value', snap => {
      const data = snap.val();
      if (!data) { cb([]); return; }
      // Include Firebase key as `firebaseId` so observers can deduplicate
      const activities = Object.entries(data)
        .filter(([, a]) => a && a.shared)
        .map(([key, a]) => ({ ...a, firebaseId: key }));
      cb(activities);
    }, err => {
      console.warn('[LiveTrack] Activities listener error:', err.message);
    });
  }

  function unsubscribeStrava() {
    if (activitiesRef && activitiesListener !== null) {
      activitiesRef.off('value', activitiesListener);
      activitiesListener = null;
    }
  }

  // ── Photos sharing ───────────────────────────────────────────
  // photos: array of { lat, lon, thumb, name, note }
  // Note: thumb is an object URL — we store the URL as-is.
  // Observers load it from the same Firebase entry.
  // ── Per-photo child nodes ─────────────────────────────────────
  // Each photo is stored under /shared/photos/{photoId} separately.
  // This avoids:
  //   a) Overwriting all photos when one changes
  //   b) Firebase 1MB per-write limit (base64 images are large)
  // photosRef.child(id).set() only touches that one photo node.

  // Track which photo IDs we've written so we can remove deleted ones
  const _publishedPhotoIds = new Set();
  const _publishedNoteIds  = new Set();

  async function publishPhotos(photos, owner) {
    if (!photosRef) return;
    try {
      const currentIds = new Set(photos.map(p => String(p.id)));

      // Remove photos that were deleted locally
      for (const id of _publishedPhotoIds) {
        if (!currentIds.has(id)) {
          await photosRef.child(id).remove();
          _publishedPhotoIds.delete(id);
        }
      }

      // Add / update each photo individually using shareThumb (~20KB)
      // shareThumb is a small 200px version safe for Firebase Realtime DB
      for (const p of photos) {
        const id    = String(p.id).replace(/[.#$\[\]]/g, '_'); // sanitize Firebase key chars
        const thumb = p.shareThumb || p.thumb || ''; // prefer small version
        try {
          await photosRef.child(id).set({
            lat:      parseFloat(p.lat.toFixed(6)),
            lon:      parseFloat(p.lon.toFixed(6)),
            name:     p.name     || '',
            note:     p.note     || '',
            thumb,
            datetime: p.datetime || '',
            owner:    owner || '',
            ts:       Date.now(),
          });
          _publishedPhotoIds.add(id);
        } catch (writeErr) {
          console.error('[LiveTrack] Photo write failed for id', id, ':', writeErr.message, writeErr.code);
        }
      }
    } catch (e) {
      console.error('[LiveTrack] Photos publish outer error:', e.message);
    }
  }

  function subscribePhotos(cb) {
    if (!photosRef) return;
    photosListener = photosRef.on('value', snap => {
      const data = snap.val();
      if (!data) { cb([]); return; }
      // Include Firebase key as `firebaseId` so Remove buttons can target the right node
      const photos = Object.entries(data)
        .filter(([, p]) => p && p.lat && p.thumb)
        .map(([key, p]) => ({ ...p, firebaseId: key }));
      cb(photos);
    }, err => {
      console.warn('[LiveTrack] Photos listener error:', err.message);
    });
  }

  async function unpublishPhoto(photoId) {
    if (!photosRef) return;
    const id = String(photoId);
    try { await photosRef.child(id).remove(); _publishedPhotoIds.delete(id); } catch (_) {}
  }

  function unsubscribePhotos() {
    if (photosRef && photosListener !== null) {
      photosRef.off('value', photosListener);
      photosListener = null;
    }
  }

  // ── Notes sharing ───────────────────────────────────────────
  async function publishNote(pin, owner) {
    if (!notesRef) return false;
    try {
      const id = String(pin.id).replace(/[.#$\[\]]/g, '_');
      await notesRef.child(id).set({
        lat:   parseFloat(pin.lat.toFixed(6)),
        lon:   parseFloat(pin.lon.toFixed(6)),
        name:  pin.name || '',
        note:  pin.note || '',
        date:  pin.date || Date.now(),
        owner: owner || '',
        ts:    Date.now(),
      });
      _publishedNoteIds.add(id);
      return true;
    } catch(e) {
      console.error('[LiveTrack] Note publish failed:', e.message);
      return false;
    }
  }

  async function unpublishNote(pinId) {
    if (!notesRef) return;
    const id = String(pinId).replace(/[.#$\[\]]/g, '_');
    try { await notesRef.child(id).remove(); _publishedNoteIds.delete(id); } catch(_) {}
  }

  function subscribeNotes(cb) {
    if (!notesRef) return;
    notesRef.on('value', snap => {
      const data = snap.val();
      cb(data ? Object.entries(data).map(([k, v]) => ({ ...v, firebaseId: k })) : []);
    }, err => console.warn('[LiveTrack] Notes listener:', err.message));
  }

  // ── Callbacks / state ─────────────────────────────────────
  function onStatus(cb)   { statusCb = cb; }
  function isReady()      { return !!db; }
  function isSharingNow() { return isSharing; }

  return {
    init, setOwner,
    setIsHiker, getIsHiker,
    startSharing, stopSharing, pushPosition,
    publishStrava, unpublishStrava, unpublishAllStrava,
    publishNote, unpublishNote, subscribeNotes,
    publishPhotos, unpublishPhoto, publishSharedPhoto,
    publishPrivateNote, unpublishPrivateNote, loadPrivateNotes,
    publishPrivatePhoto, unpublishPrivatePhoto, loadPrivatePhotos,
    subscribeViewer, unsubscribeViewer,
    subscribeAllHikers, unsubscribeAllHikers,
    subscribeStrava, unsubscribeStrava,
    subscribePhotos, unsubscribePhotos,
    onStatus, isReady, isSharingNow,
  };

})();
