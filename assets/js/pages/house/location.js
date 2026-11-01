// house/location.js - where the site is, on an OpenStreetMap map.
//
// Loaded ON DEMAND. Leaflet is 150KB and every tile is a request to
// openstreetmap.org, so nothing is fetched until the reader asks for the
// map. A reader who never opens it costs OpenStreetMap nothing and
// downloads nothing, which is the usage policy and also good manners.
//
// One marker only: the listing's own pin. OpenStreetMap's labels already
// carry the village, the open forest and the station, and a marker placed
// by hand would claim a precision nobody has checked.
import { escape } from '../../core/format.js';

const LEAFLET_JS = new URL('../../../vendor/leaflet/leaflet.js', import.meta.url).href;
const LEAFLET_CSS = new URL('../../../vendor/leaflet/leaflet.css', import.meta.url).href;
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The section body: what the pin is, and a button that loads the map. */
export function locationHtml(loc) {
  return `
    <p class="lede">The pin is the listing's own map position (${escape(loc.source)}), not a
      survey point. The map shows Wootton, the edge of the open forest and New Milton
      station from OpenStreetMap's own labels. Map tiles load only when you ask for them.</p>
    <p><button type="button" class="btn" data-location-map>Show the map</button></p>
    <div class="hv-map" data-location-host hidden
      data-lat="${Number(loc.lat)}" data-lon="${Number(loc.lon)}" data-zoom="${Number(loc.zoom ?? 13)}"
      role="region" aria-label="Location map"></div>`;
}

let loading = null;
function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => resolve(globalThis.L);
    js.onerror = () => { loading = null; reject(new Error('Leaflet did not load')); };
    document.head.append(js);
  });
  return loading;
}

/** Wire the button. Delegated, because the page re-renders its body. */
export function mountLocation() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-location-map]');
    if (!btn) return;
    const host = btn.closest('.hv-more__body')?.querySelector('[data-location-host]');
    if (!host) return;
    btn.disabled = true;
    try {
      const L = await loadLeaflet();
      host.hidden = false;
      const at = [Number(host.dataset.lat), Number(host.dataset.lon)];
      const map = L.map(host, { scrollWheelZoom: false }).setView(at, Number(host.dataset.zoom));
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
      L.circleMarker(at, { radius: 8, weight: 3, className: 'hv-map__pin' })
        .addTo(map).bindTooltip('The listing\'s pin');
      btn.closest('p').hidden = true;
    } catch {
      btn.disabled = false;
      host.hidden = false;
      host.textContent = 'The map could not load. The listing pin is '
        + `${host.dataset.lat}, ${host.dataset.lon}.`;
    }
  });
}
