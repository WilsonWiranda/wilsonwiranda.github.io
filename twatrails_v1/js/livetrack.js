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
  let posRef           = null;
  let stravaRef        = null;
  let photosRef        = null;
  let isSharing        = false;
  let viewerListener   = null;
  let stravaListener   = null;
  let photosListener   = null;
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
      db        = firebase.database();
      posRef    = db.ref('/hiker/position');
      stravaRef = db.ref('/shared/strava');
      photosRef = db.ref('/shared/photos');
      return true;
    } catch (e) {
      console.error('[LiveTrack] Init failed:', e.message);
      return false;
    }
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
      });
    } catch (e) {
      console.warn('[LiveTrack] Push failed:', e.message);
    }
  }

  // ── Strava activity sharing ───────────────────────────────
  // latlngs: array of [lat, lon] pairs
  // stats:   { name, distance, elevation, movingTime, points }
  async function publishStrava(latlngs, stats) {
    if (!stravaRef) return false;
    try {
      // Firebase has a 10 MB node limit. Decimate to ≤500 points if needed.
      let pts = latlngs;
      if (pts.length > 500) {
        const step = (pts.length - 1) / 499;
        pts = Array.from({ length: 500 }, (_, i) => pts[Math.round(i * step)]);
        pts[499] = latlngs[latlngs.length - 1];
      }
      await stravaRef.set({
        latlngs:  pts,
        name:     stats.name     || '',
        distance: stats.distance || 0,
        elevation:stats.elevation|| 0,
        time:     stats.movingTime || 0,
        points:   pts.length,
        ts:       Date.now(),
        shared:   true,
      });
      return true;
    } catch (e) {
      console.warn('[LiveTrack] Strava publish failed:', e.message);
      return false;
    }
  }

  async function unpublishStrava() {
    if (!stravaRef) return;
    try { await stravaRef.set({ shared: false, ts: Date.now() }); } catch (_) {}
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

  // ── Viewer: Strava subscription ───────────────────────────
  // cb receives the full strava data object (or null if cleared)
  function subscribeStrava(cb) {
    if (!stravaRef) return;
    stravaListener = stravaRef.on('value', snap => {
      const data = snap.val();
      cb(data && data.shared ? data : null);
    }, err => {
      console.warn('[LiveTrack] Strava listener error:', err.message);
    });
  }

  function unsubscribeStrava() {
    if (stravaRef && stravaListener !== null) {
      stravaRef.off('value', stravaListener);
      stravaListener = null;
    }
  }

  // ── Photos sharing ───────────────────────────────────────────
  // photos: array of { lat, lon, thumb, name, note }
  // Note: thumb is an object URL — we store the URL as-is.
  // Observers load it from the same Firebase entry.
  async function publishPhotos(photos) {
    if (!photosRef) return;
    try {
      if (!photos || photos.length === 0) {
        await photosRef.set({ photos: [], ts: Date.now() });
        return;
      }
      // Limit to 20 photos, strip large data
      const safe = photos.slice(0, 20).map(p => ({
        lat:      parseFloat(p.lat.toFixed(6)),
        lon:      parseFloat(p.lon.toFixed(6)),
        name:     p.name || '',
        note:     p.note || '',
        thumb:    p.thumb || '',
        datetime: p.datetime || '',
      }));
      await photosRef.set({ photos: safe, ts: Date.now() });
    } catch (e) {
      console.warn('[LiveTrack] Photos publish failed:', e.message);
    }
  }

  function subscribePhotos(cb) {
    if (!photosRef) return;
    photosListener = photosRef.on('value', snap => {
      const data = snap.val();
      cb(data && data.photos ? data.photos : []);
    }, err => {
      console.warn('[LiveTrack] Photos listener error:', err.message);
    });
  }

  function unsubscribePhotos() {
    if (photosRef && photosListener !== null) {
      photosRef.off('value', photosListener);
      photosListener = null;
    }
  }

  // ── Callbacks / state ─────────────────────────────────────
  function onStatus(cb)   { statusCb = cb; }
  function isReady()      { return !!db; }
  function isSharingNow() { return isSharing; }

  return {
    init,
    setIsHiker, getIsHiker,
    startSharing, stopSharing, pushPosition,
    publishStrava, unpublishStrava,
    publishPhotos,
    subscribeViewer, unsubscribeViewer,
    subscribeStrava, unsubscribeStrava,
    subscribePhotos, unsubscribePhotos,
    onStatus, isReady, isSharingNow,
  };

})();
