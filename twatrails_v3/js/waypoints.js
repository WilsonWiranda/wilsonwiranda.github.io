/* ============================================================
   waypoints.js — Map waypoint / POI system
   - Tap map to drop a custom pin
   - Show route waypoints from pre-loaded trails
   - Each pin has a name, note, icon
   ============================================================ */

'use strict';

const Waypoints = (() => {
  let map = null;
  const markers = [];     // { id, marker, type:'custom'|'route', name, note }
  let addMode   = false;
  let onChangeCb = null;

  const ROUTE_ICON_HTML = (color) => `
    <div style="
      width:22px;height:22px;border-radius:50% 50% 50% 0;
      background:${color};border:2px solid #fff;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,.5);
    "></div>`;

  const CUSTOM_ICON_HTML = `
    <div style="
      width:22px;height:22px;border-radius:50% 50% 50% 0;
      background:#38bdf8;border:2px solid #fff;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,.5);
    "></div>`;

  function makeIcon(html) {
    return L.divIcon({ className:'', html, iconSize:[22,22], iconAnchor:[11,22], popupAnchor:[0,-22] });
  }

  const PINS_KEY = 'p1150_custom_pins';

  function buildPinPopup(id, name, note, lat, lon) {
    return `
      <div style="font-family:Syne,sans-serif;min-width:150px">
        <b style="font-size:.88rem;color:#38bdf8">📍 ${name}</b><br/>
        ${note ? `<div style="font-size:.78rem;color:#ccc;margin-top:4px;line-height:1.45;white-space:pre-wrap">${note}</div>` : ''}
        <small style="color:#888;display:block;margin-top:4px">${lat.toFixed(5)}, ${lon.toFixed(5)}</small>
        <button onclick="Waypoints.remove(${id})" style="margin-top:7px;font-size:.72rem;background:#f87171;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;width:100%">Remove</button>
      </div>`;
  }

  function savePins() {
    try {
      const data = markers
        .filter(m => m.type === 'custom')
        .map(m => ({ id: m.id, name: m.name, note: m.note, lat: m.lat, lon: m.lon, date: m.date }));
      localStorage.setItem(PINS_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function restorePins() {
    try {
      const raw = localStorage.getItem(PINS_KEY);
      if (!raw) return;
      const pins = JSON.parse(raw);
      if (!Array.isArray(pins)) return;
      pins.forEach(p => {
        if (!p.lat || !p.lon) return;
        const marker = L.marker([p.lat, p.lon], { icon: makeIcon(CUSTOM_ICON_HTML) }).addTo(map);
        marker.bindPopup(buildPinPopup(p.id, p.name, p.note || '', p.lat, p.lon));
        markers.push({ id: p.id, marker, type: 'custom', name: p.name, note: p.note || '', lat: p.lat, lon: p.lon, date: p.date });
      });
      const custom = markers.filter(m => m.type === 'custom');
      if (custom.length && onChangeCb) onChangeCb(custom);
    } catch (_) {}
  }

  function init(leafletMap) {
    map = leafletMap;
    restorePins();

    map.on('click', e => {
      if (!addMode) return;
      const { lat, lng } = e.latlng;
      // Use the inline modal defined in index.html (multiline, no browser prompt)
      if (typeof showNoteForm === 'function') {
        showNoteForm(lat, lng, (name, note) => {
          addCustomPin(lat, lng, name || 'Note', note);
          setAddMode(false);
        });
      } else {
        // Fallback to prompt if modal not available
        const name = prompt('Note title:', '');
        if (name === null) return;
        const note = prompt('Note text (optional):', '') || '';
        addCustomPin(lat, lng, name || 'Note', note);
        setAddMode(false);
      }
    });
  }

  function setAddMode(active) {
    addMode = active;
    map.getContainer().style.cursor = active ? 'crosshair' : '';
  }

  function getAddMode() { return addMode; }

  function addCustomPin(lat, lon, name, note) {
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const marker = L.marker([lat, lon], { icon: makeIcon(CUSTOM_ICON_HTML) }).addTo(map);
    marker.bindPopup(buildPinPopup(id, name, note || '', lat, lon)).openPopup();
    markers.push({ id, marker, type:'custom', name, note: note || '', lat, lon, date: Date.now() });
    savePins();
    if (onChangeCb) onChangeCb(markers.filter(m => m.type==='custom'));
    return id;
  }

  function addRouteWaypoints(waypoints, color) {
    // Remove old route waypoints
    markers.filter(m => m.type==='route').forEach(m => { map.removeLayer(m.marker); });
    markers.splice(0, markers.length, ...markers.filter(m => m.type==='custom'));

    waypoints.forEach((wp, i) => {
      const marker = L.marker([wp.lat, wp.lon], { icon: makeIcon(ROUTE_ICON_HTML(color)) }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:Syne,sans-serif;min-width:140px">
          <b style="font-size:.88rem">${wp.name}</b><br/>
          ${wp.note ? `<span style="font-size:.75rem;color:#aaa">${wp.note}</span>` : ''}
        </div>
      `);
      markers.push({ id:`route-${i}`, marker, type:'route', name:wp.name, note:wp.note, lat:wp.lat, lon:wp.lon });
    });
  }

  function clearRouteWaypoints() {
    markers.filter(m => m.type==='route').forEach(m => map.removeLayer(m.marker));
    markers.splice(0, markers.length, ...markers.filter(m => m.type==='custom'));
  }

  function remove(id) {
    const idx = markers.findIndex(m => m.id === id);
    if (idx === -1) return;
    map.removeLayer(markers[idx].marker);
    markers.splice(idx, 1);
    savePins();
    if (onChangeCb) onChangeCb(markers.filter(m => m.type==='custom'));
  }

  function clearAll() {
    markers.forEach(m => map.removeLayer(m.marker));
    markers.length = 0;
    if (onChangeCb) onChangeCb([]);
  }

  function getCustom() { return markers.filter(m => m.type==='custom'); }

  function exportGPX() {
    const custom = getCustom();
    if (!custom.length) return null;
    const wpts = custom.map(m =>
      `  <wpt lat="${m.lat.toFixed(7)}" lon="${m.lon.toFixed(7)}">\n    <name>${m.name}</name>${m.note ? `\n    <desc>${m.note}</desc>` : ''}\n  </wpt>`
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TrailMate">\n${wpts}\n</gpx>`;
  }

  function onChange(cb) { onChangeCb = cb; }

  return { init, setAddMode, getAddMode, addCustomPin, addRouteWaypoints, clearRouteWaypoints, remove, clearAll, getCustom, exportGPX, onChange };
})();
