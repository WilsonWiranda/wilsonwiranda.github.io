/* ============================================================
   livetrack.js — Live position sharing via Firebase Realtime DB

   Firebase SDK is loaded statically in index.html (v9 compat).
   This module just uses the global `firebase` object.

   ROLES:
     Hiker  — pushes GPS every fix while sharing is on
     Viewer — subscribes; receives real-time position updates

   FIREBASE SETUP (free, ~3 min):
   1. console.firebase.google.com → New project
   2. Add Web app → copy the firebaseConfig shown
   3. Build → Realtime Database → Create database → Test mode
   4. Paste config into the app's Live tab ⚙️ settings

   DATA PATH: /hiker/position
   { lat, lon, alt, accuracy, speed, heading, ts, sharing }

   FREE TIER: 1 GB storage, 10 GB/month transfer.
   ============================================================ */

'use strict';

const LiveTrack = (() => {

  const SK = {
    config:  'tm_fb_config',
    isHiker: 'tm_fb_is_hiker',
  };

  let db        = null;
  let posRef    = null;
  let isSharing = false;
  let viewerListener = null;
  let statusCb  = null;

  // ── Config persistence ─────────────────────────────────────
  function saveConfig(cfg) {
    localStorage.setItem(SK.config, JSON.stringify(cfg));
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(SK.config);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function clearConfig() {
    localStorage.removeItem(SK.config);
    localStorage.removeItem(SK.isHiker);
  }

  // ── Hiker flag ────────────────────────────────────────────
  function setIsHiker(v) { localStorage.setItem(SK.isHiker, v ? '1' : '0'); }
  function getIsHiker()  { return localStorage.getItem(SK.isHiker) === '1'; }

  // ── Firebase init ─────────────────────────────────────────
  async function init(config) {
    // Clean up any existing Firebase app
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded. Check your internet connection.');
    }

    try {
      // Delete existing app if present
      const existing = firebase.apps?.[0];
      if (existing) await existing.delete();
    } catch (_) {}

    firebase.initializeApp(config);
    db     = firebase.database();
    posRef = db.ref('/hiker/position');
    return true;
  }

  async function initFromStorage() {
    const cfg = loadConfig();
    if (!cfg) return false;
    try {
      await init(cfg);
      return true;
    } catch (e) {
      console.warn('[LiveTrack] Restore from storage failed:', e.message);
      return false;
    }
  }

  // ── Hiker: sharing control ─────────────────────────────────
  async function startSharing() {
    if (!posRef) return false;
    isSharing = true;
    if (statusCb) statusCb('sharing');
    return true;
  }

  async function stopSharing() {
    isSharing = false;
    // Mark position as "last known" (not live) in the DB
    if (posRef) {
      try { await posRef.update({ sharing: false }); } catch (_) {}
    }
    if (statusCb) statusCb('stopped');
  }

  // Called every GPS fix — only writes if sharing is on
  async function pushPosition(pos) {
    if (!posRef || !isSharing) return;
    const { latitude: lat, longitude: lon, altitude, accuracy, speed, heading } = pos.coords;
    try {
      await posRef.set({
        lat:      parseFloat(lat.toFixed(6)),
        lon:      parseFloat(lon.toFixed(6)),
        alt:      altitude  != null ? Math.round(altitude)              : null,
        accuracy: Math.round(accuracy),
        speed:    speed     != null ? parseFloat((speed * 3.6).toFixed(1)) : null,
        heading:  heading   != null ? Math.round(heading)               : null,
        ts:       Date.now(),
        sharing:  true,
      });
    } catch (e) {
      console.warn('[LiveTrack] Push failed:', e.message);
    }
  }

  // ── Viewer: real-time subscription ───────────────────────
  function subscribeViewer(cb) {
    if (!posRef) return;
    // 'value' fires immediately with current data, then on every change
    viewerListener = posRef.on('value', snapshot => {
      cb(snapshot.val()); // null if no data
    }, err => {
      console.warn('[LiveTrack] Listener error:', err.message);
    });
  }

  function unsubscribeViewer() {
    if (posRef && viewerListener !== null) {
      posRef.off('value', viewerListener);
      viewerListener = null;
    }
  }

  // ── Misc ──────────────────────────────────────────────────
  function onStatus(cb)   { statusCb = cb; }
  function isReady()      { return !!db; }
  function isSharingNow() { return isSharing; }

  return {
    init, initFromStorage,
    saveConfig, loadConfig, clearConfig,
    setIsHiker, getIsHiker,
    startSharing, stopSharing, pushPosition,
    subscribeViewer, unsubscribeViewer,
    onStatus, isReady, isSharingNow,
  };
})();
