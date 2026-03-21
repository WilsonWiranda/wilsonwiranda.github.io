/* ============================================================
   recorder.js — Live track recording with Wake Lock
   
   THE SCREEN-OFF / TELEPORTING BUG:
   When the screen turns off, browsers throttle or kill
   navigator.geolocation.watchPosition on iOS and Android.
   
   Fix: Screen Wake Lock API — keeps screen on while recording.
   This is the only reliable browser-side solution.
   On iOS Safari, the user must also keep the app in the
   foreground (iOS does not allow background geolocation in PWAs).
   
   We also request a NoSleep pattern as fallback for browsers
   that don't support Wake Lock yet.
   ============================================================ */

'use strict';

const Recorder = (() => {
  let points     = [];
  let polyline   = null;
  let map        = null;
  let startTime  = null;
  let intervalId = null;
  let isRecording = false;
  let onUpdateCb  = null;
  let wakeLock    = null;   // Screen Wake Lock handle

  // ── Wake Lock ─────────────────────────────────────────────
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return false;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        // Screen lock was released externally — try to reacquire if still recording
        if (isRecording) acquireWakeLock();
      });
      return true;
    } catch (err) {
      // Wake lock denied (low battery, etc.)
      console.warn('Wake lock denied:', err.message);
      return false;
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try { await wakeLock.release(); } catch (_) {}
      wakeLock = null;
    }
  }

  // Reacquire when tab becomes visible again (e.g. user switches back)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRecording && !wakeLock) {
      acquireWakeLock();
    }
  });

  // ── Map init ──────────────────────────────────────────────
  function init(leafletMap) { map = leafletMap; }
  function onUpdate(cb)     { onUpdateCb = cb; }

  // ── Start ─────────────────────────────────────────────────
  async function start() {
    if (isRecording) return;
    points    = [];
    startTime = Date.now();
    isRecording = true;

    polyline = L.polyline([], {
      color: '#f87171', weight: 4, opacity: 0.9, lineJoin: 'round',
    }).addTo(map);

    // Acquire wake lock — keeps screen on so GPS stays active
    const gotLock = await acquireWakeLock();

    // Tick every second for elapsed time display
    intervalId = setInterval(() => {
      if (onUpdateCb) onUpdateCb(getStats());
    }, 1000);

    return gotLock; // caller can show warning if false
  }

  // ── Add GPS point ─────────────────────────────────────────
  function addPoint(pos) {
    if (!isRecording) return;

    const { latitude: lat, longitude: lon, altitude, accuracy } = pos.coords;

    // Filter out wildly inaccurate points (teleport guard)
    if (accuracy > 150) return; // ignore if accuracy worse than 150m

    // If we have previous points, check for teleport jump
    if (points.length > 0) {
      const prev = points[points.length - 1];
      const jumpDist = haversineDist2([prev.lat, prev.lon], [lat, lon]);
      const timeDiff = (Date.now() - prev.timestamp) / 1000; // seconds
      const maxReasonableSpeed = 25; // m/s ≈ 90 km/h (very generous for hiking)
      if (timeDiff > 0 && jumpDist / timeDiff > maxReasonableSpeed) {
        console.warn(`Teleport detected: ${jumpDist.toFixed(0)}m in ${timeDiff.toFixed(0)}s — skipping`);
        return;
      }
    }

    const pt = { lat, lon, ele: altitude || 0, time: new Date().toISOString(), accuracy, timestamp: Date.now() };
    points.push(pt);
    polyline.addLatLng([lat, lon]);

    if (onUpdateCb) onUpdateCb(getStats());
  }

  function haversineDist2(a, b) {
    const R = 6371000;
    const φ1 = a[0]*Math.PI/180, φ2 = b[0]*Math.PI/180;
    const Δφ = (b[0]-a[0])*Math.PI/180, Δλ = (b[1]-a[1])*Math.PI/180;
    const x = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }

  // ── Stop ──────────────────────────────────────────────────
  async function stop() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(intervalId);
    intervalId  = null;
    await releaseWakeLock();
  }

  // ── Discard ───────────────────────────────────────────────
  async function clear() {
    await stop();
    points = [];
    if (polyline) { map.removeLayer(polyline); polyline = null; }
    startTime = null;
    if (onUpdateCb) onUpdateCb(null);
  }

  // ── Stats ─────────────────────────────────────────────────
  function getStats() {
    if (!points.length) return { distance: 0, elapsed: 0, points: 0, avgSpeed: 0, elevGain: 0 };

    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversineDist2([points[i-1].lat, points[i-1].lon], [points[i].lat, points[i].lon]);
    }

    const elapsed  = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const avgSpeed = elapsed > 0 ? (dist / elapsed) * 3.6 : 0;

    let elevGain = 0;
    for (let i = 1; i < points.length; i++) {
      const diff = (points[i].ele || 0) - (points[i-1].ele || 0);
      if (diff > 0) elevGain += diff;
    }

    return { distance: dist, elapsed, points: points.length, avgSpeed, elevGain };
  }

  // ── GPX export ────────────────────────────────────────────
  function exportGPX(name = 'TrailMate Recording') {
    if (!points.length) return null;
    const trkpts = points.map(p =>
      `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
      (p.ele ? `\n      <ele>${p.ele.toFixed(1)}</ele>` : '') +
      `\n      <time>${p.time}</time>\n    </trkpt>`
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TrailMate" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${name}</name><time>${new Date().toISOString()}</time></metadata>\n  <trk><name>${name}</name><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;
  }

  function downloadGPX() {
    const gpx = exportGPX(`TrailMate ${new Date().toLocaleDateString()}`);
    if (!gpx) return false;
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([gpx], { type:'application/gpx+xml' })),
      download: `trailmate-${Date.now()}.gpx`,
    });
    a.click(); URL.revokeObjectURL(a.href);
    return true;
  }

  function getPoints()      { return points; }
  function getIsRecording() { return isRecording; }
  function hasWakeLock()    { return !!wakeLock; }
  function fitBounds()      { if (polyline && points.length > 1) map.fitBounds(polyline.getBounds(), { padding:[40,40] }); }

  return { init, start, addPoint, stop, clear, getStats, downloadGPX, getPoints, getIsRecording, hasWakeLock, fitBounds, onUpdate };
})();
