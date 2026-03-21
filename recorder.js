/* ============================================================
   recorder.js — Live track recording
   Records GPS breadcrumbs while hiking, draws them on map,
   computes live distance + elapsed time, exports as GPX.
   ============================================================ */

'use strict';

const Recorder = (() => {
  let points = [];       // [{lat, lon, ele, time, accuracy}]
  let polyline = null;   // Leaflet polyline
  let map = null;
  let startTime = null;
  let intervalId = null;
  let isRecording = false;
  let onUpdateCb = null;

  function init(leafletMap) {
    map = leafletMap;
  }

  function onUpdate(cb) { onUpdateCb = cb; }

  function start() {
    if (isRecording) return;
    points    = [];
    startTime = Date.now();
    isRecording = true;

    polyline = L.polyline([], {
      color: '#f87171', weight: 3.5, opacity: 0.9,
      dashArray: null, lineJoin: 'round',
    }).addTo(map);

    // Tick timer every second for elapsed display
    intervalId = setInterval(() => {
      if (onUpdateCb) onUpdateCb(getStats());
    }, 1000);
  }

  function addPoint(pos) {
    if (!isRecording) return;
    const { latitude: lat, longitude: lon, altitude, accuracy } = pos.coords;
    const pt = { lat, lon, ele: altitude || 0, time: new Date().toISOString(), accuracy };
    points.push(pt);
    polyline.addLatLng([lat, lon]);
    if (onUpdateCb) onUpdateCb(getStats());
  }

  function stop() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(intervalId);
    intervalId = null;
  }

  function clear() {
    stop();
    points = [];
    if (polyline) { map.removeLayer(polyline); polyline = null; }
    startTime = null;
    if (onUpdateCb) onUpdateCb(null);
  }

  function getStats() {
    if (!points.length) return { distance: 0, elapsed: 0, points: 0, avgSpeed: 0 };

    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += L.latLng([points[i-1].lat, points[i-1].lon])
               .distanceTo(L.latLng([points[i].lat, points[i].lon]));
    }

    const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const avgSpeed = elapsed > 0 ? (dist / elapsed) * 3.6 : 0; // km/h

    let elevGain = 0;
    for (let i = 1; i < points.length; i++) {
      const diff = (points[i].ele || 0) - (points[i-1].ele || 0);
      if (diff > 0) elevGain += diff;
    }

    return { distance: dist, elapsed, points: points.length, avgSpeed, elevGain };
  }

  function exportGPX(name = 'TrailMate Recording') {
    if (!points.length) return null;

    const trkpts = points.map(p =>
      `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
      (p.ele ? `\n      <ele>${p.ele.toFixed(1)}</ele>` : '') +
      `\n      <time>${p.time}</time>\n    </trkpt>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailMate" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  }

  function downloadGPX() {
    const gpx = exportGPX(`TrailMate ${new Date().toLocaleDateString()}`);
    if (!gpx) return false;
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `trailmate-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  function getPoints()    { return points; }
  function getIsRecording() { return isRecording; }
  function fitBounds()    { if (polyline && points.length > 1) map.fitBounds(polyline.getBounds(), { padding: [40,40] }); }

  return { init, start, addPoint, stop, clear, getStats, downloadGPX, getPoints, getIsRecording, fitBounds, onUpdate };
})();
