/* ============================================================
   photos.js — Photo upload with EXIF GPS extraction
   Reads lat/lon/datetime from JPEG EXIF metadata,
   lets the user add a note, then plots a marker on the map.

   EXIF is parsed manually — no external library needed.
   Supports JPEG/HEIC-as-JPEG from both Android and iOS.
   ============================================================ */

'use strict';

const Photos = (() => {

  let map        = null;
  const photos   = [];   // { id, marker, thumb, name, note, lat, lon, datetime }
  let onChangeCb = null;

  // ── Init ──────────────────────────────────────────────────
  function init(leafletMap) { map = leafletMap; }
  function onChange(cb)     { onChangeCb = cb; }

  // ── EXIF binary parser ────────────────────────────────────
  // Reads a DataView of the JPEG file and extracts GPS IFD.
  // Returns { lat, lon, datetime } or null if not found.
  function parseExif(buffer) {
    const view = new DataView(buffer);

    // JPEG must start with FFD8
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) {
        // APP1 segment — contains Exif
        const segLen = view.getUint16(offset);
        // Check for "Exif\0\0" header
        if (view.getUint32(offset + 2) === 0x45786966 &&
            view.getUint16(offset + 6) === 0x0000) {
          return readExifBlock(buffer, offset + 8, segLen - 8);
        }
        offset += segLen;
      } else if ((marker & 0xFF00) === 0xFF00) {
        offset += view.getUint16(offset);
      } else {
        break;
      }
    }
    return null;
  }

  function readExifBlock(buffer, start, length) {
    const view   = new DataView(buffer, start, length);
    const little = view.getUint16(0) === 0x4949; // II = little-endian
    const get16  = o => view.getUint16(o, little);
    const get32  = o => view.getUint32(o, little);

    if (get16(2) !== 0x002A) return null; // TIFF magic
    const ifdOffset = get32(4);

    // Read IFD0 to find GPS sub-IFD tag (0x8825)
    let gpsIfdOffset = null;
    let datetime     = null;
    const ifd0Count  = get16(ifdOffset);

    for (let i = 0; i < ifd0Count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag  = get16(entryOffset);
      const type = get16(entryOffset + 2);
      const val  = get32(entryOffset + 8);

      if (tag === 0x8825) gpsIfdOffset = val;           // GPSInfo
      if (tag === 0x0132) {                              // DateTime
        // type 2 = ASCII, value is offset to string
        try {
          const strOffset = get32(entryOffset + 8);
          let s = '';
          for (let j = 0; j < 19; j++) {
            s += String.fromCharCode(view.getUint8(strOffset + j));
          }
          datetime = s; // "YYYY:MM:DD HH:MM:SS"
        } catch (_) {}
      }
    }

    if (!gpsIfdOffset) return null;

    // Read GPS IFD
    const gpsCount = get16(gpsIfdOffset);
    let latDMS = null, latRef = 'N', lonDMS = null, lonRef = 'E';

    for (let i = 0; i < gpsCount; i++) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      const tag   = get16(entryOffset);
      const count = get32(entryOffset + 4);
      const valOff= get32(entryOffset + 8);

      if (tag === 0x0001) { // GPSLatitudeRef
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
      } else if (tag === 0x0002) { // GPSLatitude
        latDMS = readRationals(view, valOff, 3, little);
      } else if (tag === 0x0003) { // GPSLongitudeRef
        lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
      } else if (tag === 0x0004) { // GPSLongitude
        lonDMS = readRationals(view, valOff, 3, little);
      }
    }

    if (!latDMS || !lonDMS) return null;

    let lat = dmsToDecimal(latDMS);
    let lon = dmsToDecimal(lonDMS);
    if (latRef === 'S') lat = -lat;
    if (lonRef === 'W') lon = -lon;

    // Sanity check
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return null;

    return { lat, lon, datetime };
  }

  function readRationals(view, offset, count, little) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const num = view.getUint32(offset + i * 8,     little);
      const den = view.getUint32(offset + i * 8 + 4, little);
      result.push(den !== 0 ? num / den : 0);
    }
    return result;
  }

  function dmsToDecimal([d, m, s]) {
    return d + m / 60 + s / 3600;
  }

  function fmtDatetime(raw) {
    if (!raw) return '';
    // "YYYY:MM:DD HH:MM:SS" → "DD Mon YYYY HH:MM"
    try {
      const [date, time] = raw.split(' ');
      const [y, mo, d]   = date.split(':');
      const [h, min]     = time.split(':');
      const months       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${parseInt(d)} ${months[parseInt(mo)-1]} ${y} ${h}:${min}`;
    } catch (_) { return raw; }
  }

  // ── Photo icon ────────────────────────────────────────────
  function makePhotoIcon(thumb) {
    return L.divIcon({
      className: '',
      html: `
        <div class="photo-marker">
          <div class="photo-marker-img" style="background-image:url('${thumb}')"></div>
          <div class="photo-marker-tip"></div>
        </div>`,
      iconSize:   [48, 56],
      iconAnchor: [24, 56],
      popupAnchor:[0, -58],
    });
  }

  // ── Add photo to map ──────────────────────────────────────
  function addPhoto(lat, lon, thumb, name, note, datetime, id, shareThumb) {
    const marker = L.marker([lat, lon], { icon: makePhotoIcon(thumb), zIndexOffset: 500 })
      .addTo(map);

    marker.bindPopup(() => buildPopup(id), { maxWidth: 220 });

    // shareThumb is a small 200px JPEG for Firebase (~20KB)
    // thumb is the full 800px version for local display only
    const entry = { id, marker, thumb, shareThumb: shareThumb || thumb, name, note, lat, lon, datetime };
    photos.push(entry);
    marker.on('click', () => {
      // Rebuild popup content each time (note may have changed)
      marker.setPopupContent(buildPopup(id));
    });
    if (onChangeCb) onChangeCb([...photos]);
    return entry;
  }

  function buildPopup(id) {
    const p = photos.find(x => x.id === id);
    if (!p) return '';
    // If a note is set, use it as the title; otherwise fall back to filename
    const title  = p.note ? p.note : p.name;
    const dtStr  = p.datetime ? `<div style="font-family:var(--mono);font-size:.65rem;color:#888;margin-top:2px">${fmtDatetime(p.datetime)}</div>` : '';
    return `
      <div style="font-family:Syne,sans-serif;min-width:180px">
        <img src="${p.thumb}" style="width:100%;border-radius:6px;margin-bottom:6px;display:block"/>
        <b style="font-size:.85rem">${title}</b>
        ${dtStr}
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:#666;margin-top:4px">
          ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
        </div>
        <button onclick="Photos.remove(${id})"
          style="margin-top:7px;font-size:.7rem;background:#f87171;color:#fff;border:none;
                 border-radius:4px;padding:3px 9px;cursor:pointer;width:100%">Remove</button>
      </div>`;
  }

  // ── Process file ──────────────────────────────────────────────
  // Two FileReaders: ArrayBuffer for EXIF, DataURL (base64) for thumb.
  // Base64 thumbnails are portable — they work on any device, including
  // Firebase observers on other phones/browsers (blob: URLs are local only).
  function processFile(file, note) {
    return new Promise((resolve, reject) => {

      // Step 1: parse EXIF from ArrayBuffer
      const exifReader = new FileReader();
      exifReader.onerror = () => reject(new Error('Could not read file'));
      exifReader.onload = function(ev) {
        const buffer = ev.target.result;
        const exif   = parseExif(buffer);
        if (!exif) {
          reject(new Error('No GPS location found in photo EXIF data.'));
          return;
        }

        // Step 2: generate base64 thumbnail via canvas resize
        const thumbReader = new FileReader();
        thumbReader.onerror = () => reject(new Error('Could not read file for thumbnail'));
        thumbReader.onload = function(tv) {
          const img = new Image();
          img.onerror = () => reject(new Error('Could not decode image'));
          img.onload = function() {
            const MAX    = 800; // ~300KB base64 JPEG threshold
            const scale  = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.85);

            // Also generate a small share thumb (~20KB) for Firebase
            // Firebase Realtime DB nodes can silently fail if too large
            const shareCanvas = document.createElement('canvas');
            const shareScale  = Math.min(1, 200 / Math.max(img.width, img.height));
            shareCanvas.width  = Math.round(img.width  * shareScale);
            shareCanvas.height = Math.round(img.height * shareScale);
            shareCanvas.getContext('2d').drawImage(img, 0, 0, shareCanvas.width, shareCanvas.height);
            const shareThumb = shareCanvas.toDataURL('image/jpeg', 0.6);

            const id    = Date.now() * 1000 + Math.floor(Math.random() * 1000); // integer only — no dot in Firebase key
            const name  = file.name.replace(/\.[^.]+$/, '');
            const entry = addPhoto(exif.lat, exif.lon, thumb, name, note, exif.datetime, id, shareThumb);
            map.setView([exif.lat, exif.lon], 16, { animate: true });
            resolve(entry);
          };
          img.src = tv.target.result;
        };
        thumbReader.readAsDataURL(file);
      };
      exifReader.readAsArrayBuffer(file);
    });
  }

    // ── Remove ────────────────────────────────────────────────
  function remove(id) {
    const idx = photos.findIndex(p => p.id === id);
    if (idx === -1) return;
    const p = photos[idx];
    map.removeLayer(p.marker);
    photos.splice(idx, 1);
    if (onChangeCb) onChangeCb([...photos]);
  }

  // ── Update note ───────────────────────────────────────────
  function updateNote(id, note) {
    const p = photos.find(x => x.id === id);
    if (!p) return;
    p.note = note;
    if (p.marker.isPopupOpen()) p.marker.setPopupContent(buildPopup(id));
    if (onChangeCb) onChangeCb([...photos]);
  }

  function flyTo(id) {
    const p = photos.find(x => x.id === id);
    if (!p) return;
    map.setView([p.lat, p.lon], 16, { animate: true });
    p.marker.openPopup();
  }

  function getAll() { return [...photos]; }

  // ── GPX export ────────────────────────────────────────────
  function exportGPX() {
    if (!photos.length) return null;
    const wpts = photos.map(p => {
      const name = p.name.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
      const desc = p.note ? p.note.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])) : '';
      return `  <wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">\n    <name>${name}</name>${desc ? `\n    <desc>${desc}</desc>` : ''}${p.datetime ? `\n    <time>${p.datetime.replace(/^(\d+):(\d+):(\d+) /, '$1-$2-$3T')}</time>` : ''}\n  </wpt>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="P-11.50">\n${wpts}\n</gpx>`;
  }

  return { init, onChange, processFile, remove, updateNote, flyTo, getAll, exportGPX };
})();
