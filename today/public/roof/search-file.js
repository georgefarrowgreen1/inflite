import { openViewer } from "./files-viewer350.js";

// Search previews live on the sheet stack. Leaving the page releases its read and any media URL.
export async function previewFile(F, files, item, { panel, current, signal }) {
  const { el, btn } = F.ui;
  const status = el('p', { role: 'status' });
  const download = btn('Download', { small: true, run: () => files.run(item.key, 'download', { signal, current }).catch(error => { if (current()) status.textContent = error.message; }) });
  panel.append(status, download);
  const gpx = /\.gpx$/i.test(item.name) && item.size <= 2 * 1024 * 1024;
  const text = /^(?:text\/(?:plain|csv|markdown)|application\/json)$/.test(item.mime) && item.size <= 262144;
  const media = /^(?:image\/(?:png|jpeg|gif|webp|avif)|audio\/(?:mpeg|mp4|ogg|wav|webm|aac|flac))$/.test(item.mime);
  if (item.mime === 'application/pdf') {
    panel.insertBefore(btn('View PDF', { run: () => openViewer(F, { item, service: files, sheet: spec => F.sheet.open(spec), current }).catch(error => { if (current()) status.textContent = error.message; }) }), download);
    return;
  }
  if (!gpx && !text && !media) {
    status.textContent = 'Download this file to view its contents.';
    return;
  }
  status.textContent = 'Opening preview…';
  const { file } = await files.read(item.key, { version: item.version, signal, current });
  if (!current()) return;
  if (media) {
    const url = URL.createObjectURL(file);
    signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true });
    const element = item.mime.startsWith('image/') ? el('img', { src: url, alt: item.name }) : el('audio', { src: url, controls: true });
    panel.insertBefore(element, download); status.textContent = '';
    return;
  }
  const content = await file.text();
  if (!current()) return;
  if (!gpx) { panel.insertBefore(el('pre', { text: content }), download); status.textContent = ''; return; }
  const xml = /<!DOCTYPE/i.test(content) ? null : new DOMParser().parseFromString(content, 'application/xml');
  if (xml?.documentElement.localName !== 'gpx') { status.textContent = 'This route could not be read.'; return; }
  const tracks = [...xml.querySelectorAll('trkseg')];
  const segments = tracks.length ? tracks : [...xml.querySelectorAll('rte')];
  const radians = Math.PI / 180;
  let metres = 0, ascent = 0, elevationPairs = 0, points = 0;
  const elevations = [];
  for (const segment of segments) {
    let previous = null;
    for (const node of segment.children) {
      if (!['trkpt', 'rtept'].includes(node.localName)) continue;
      const lat = node.getAttribute('lat'), lon = node.getAttribute('lon');
      if (!lat?.trim() || !lon?.trim() || !Number.isFinite(+lat) || !Number.isFinite(+lon) || Math.abs(+lat) > 90 || Math.abs(+lon) > 180) { previous = null; continue; }
      const raw = node.querySelector('ele')?.textContent.trim();
      const height = raw && Number.isFinite(+raw) ? +raw : null;
      if (previous) {
        const a = Math.sin((lat - previous.lat) * radians / 2) ** 2 + Math.cos(lat * radians) * Math.cos(previous.lat * radians) * Math.sin((lon - previous.lon) * radians / 2) ** 2;
        metres += 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, a))));
        if (height !== null && previous.height !== null) { ascent += Math.max(0, height - previous.height); elevationPairs++; }
      }
      if (height !== null) elevations.push([metres, height]);
      previous = { lat, lon, height }; points++;
    }
  }
  if (points < 2) { status.textContent = 'No route or track to preview.'; return; }
  status.textContent = (metres / 1000).toFixed(1) + ' km' + (elevationPairs ? ' · ' + Math.round(ascent) + ' m ascent' : '');
  if (elevationPairs && metres > 0) {
    let min = Infinity, max = -Infinity;
    for (const [, elevation] of elevations) { min = Math.min(min, elevation); max = Math.max(max, elevation); }
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), line = document.createElementNS(ns, 'polyline');
    svg.setAttribute('class', 'ifl-profile'); svg.setAttribute('viewBox', '0 0 320 90'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Elevation profile');
    const step = Math.max(1, Math.ceil(elevations.length / 320));
    line.setAttribute('points', elevations.filter((_, i) => i % step === 0 || i === elevations.length - 1).map(([x, y]) => (x / metres * 316 + 2).toFixed(1) + ',' + (82 - (y - min) / (max - min || 1) * 74).toFixed(1)).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', '2.5');
    svg.append(line); panel.insertBefore(svg, download);
  }
}

export function openDocumentHit(F, files, sheet, hit) {
  const controller = new AbortController();
  const current = () => !controller.signal.aborted && !F.signal.aborted && !sheet.closed;
  const context = { signal: controller.signal, current };
  const panel = F.ui.el('div', { class: 'ifl-search-detail' }, F.ui.el('p', { text: hit.snippet }));
  sheet.push({ page: 'document', title: hit.name, body: panel, onLeave: () => controller.abort() });
  files.locate(hit.id, context).then(item => {
    if (!current()) return;
    if (item.version !== hit.version) throw Error('This document has changed. Search again to see the latest version.');
    return previewFile(F, files, item, { ...context, panel });
  }).catch(error => { if (current()) panel.append(F.ui.el('p', { role: 'status', text: error.message })); });
}

export function openFileReference(F, files, item, originCurrent) {
  const controller = new AbortController();
  const panel = F.ui.el('div', { class: 'ifl-search-detail' });
  const sheet = F.sheet.open({ sheet: 'file-preview', title: item.name, body: panel, onClose: () => controller.abort() });
  const current = () => originCurrent() && !controller.signal.aborted && !sheet.closed;
  previewFile(F, files, item, { panel, current, signal: controller.signal }).catch(error => {
    if (current()) panel.append(F.ui.el('p', { role: 'status', text: error.message }));
  });
  return true;
}
