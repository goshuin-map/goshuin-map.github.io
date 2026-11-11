// 地図（Leaflet）。クラスタ、名前のない神社の点、現在地、仮のピン
/* global L */
import { pinIcon } from "./pins.js";
import { statusOf } from "./data.js";

export function createMap(cfg, handlers) {
  const map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    minZoom: 4,
    maxZoom: 19,
    maxBounds: [[15, 115], [52, 160]],
  }).fitBounds([[30.5, 129], [45.5, 146]]);

  // 出典は常に表示する（F-02）。下から出るパネルに隠れないよう右上に置く
  L.control.attribution({ prefix: false, position: "topright" }).addTo(map);
  L.tileLayer(cfg.tileUrl, { attribution: cfg.attribution, maxZoom: 19 }).addTo(map);
  if (window.matchMedia("(min-width: 768px)").matches) L.control.zoom({ position: "bottomright" }).addTo(map);

  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 60,
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    iconCreateFunction(c) {
      const n = c.getChildCount();
      const size = n < 10 ? 32 : n < 100 ? 38 : n < 1000 ? 44 : 52;
      return L.divIcon({ html: `<span>${n}</span>`, className: "cl", iconSize: [size, size] });
    },
  }).addTo(map);

  const markers = new Map(); // 神社ID → マーカー
  let dots = []; // 名前のない神社
  let visited = {};
  const canvas = L.canvas({ padding: 0.3, tolerance: 8 });
  const dotLayer = L.layerGroup().addTo(map);

  function iconFor(s) {
    return pinIcon(statusOf(s), !!(s.g && s.g.limited), !!visited[s.id]);
  }

  function refreshDots() {
    dotLayer.clearLayers();
    if (map.getZoom() < cfg.unnamedMinZoom || !dots.length) return;
    const b = map.getBounds().pad(0.2);
    let n = 0;
    for (const s of dots) {
      if (!b.contains([s.lat, s.lon])) continue;
      L.circleMarker([s.lat, s.lon], {
        renderer: canvas,
        radius: visited[s.id] ? 5 : 4,
        color: "#fff",
        weight: 1,
        fillColor: visited[s.id] ? "#1F3A5F" : "#6B7280",
        fillOpacity: visited[s.id] ? 0.9 : 0.5,
        bubblingMouseEvents: false,
      })
        .on("click", () => handlers.select(s))
        .addTo(dotLayer);
      if (++n >= 3000) break;
    }
  }
  map.on("moveend", refreshDots);
  map.on("click", (e) => handlers.mapClick(e.latlng));
  // 画面の向きや大きさが変わったら地図を合わせ直す
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());

  let ring = null;
  let me = null;
  let temp = null;

  return {
    map,

    setShrines(pins, unnamed, visitedMap) {
      visited = visitedMap;
      dots = unnamed;
      cluster.clearLayers();
      markers.clear();
      const list = pins.map((s) => {
        const m = L.marker([s.lat, s.lon], { icon: iconFor(s), keyboard: false });
        m.on("click", () => handlers.select(s));
        markers.set(s.id, m);
        return m;
      });
      cluster.addLayers(list);
      refreshDots();
    },

    updateIcon(s) {
      const m = markers.get(s.id);
      if (m) m.setIcon(iconFor(s));
      else refreshDots();
    },

    select(s, move) {
      if (ring) ring.remove();
      ring = null;
      if (!s) return;
      ring = L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: "sel-ring", iconSize: [48, 48], iconAnchor: [24, 24] }),
        interactive: false,
        zIndexOffset: -1000,
      }).addTo(map);
      if (move) map.setView([s.lat, s.lon], Math.max(map.getZoom(), 17));
    },

    // 離島などで範囲が広がりすぎないよう、両端2%を除いた範囲に合わせる
    fitTo(list) {
      if (!list.length) return;
      const lats = list.map((s) => s.lat).sort((a, b) => a - b);
      const lons = list.map((s) => s.lon).sort((a, b) => a - b);
      const lo = Math.floor(list.length * 0.02);
      const hi = Math.max(lo, Math.ceil(list.length * 0.98) - 1);
      map.fitBounds([[lats[lo], lons[lo]], [lats[hi], lons[hi]]], { padding: [20, 20] });
    },

    showMe(lat, lon, zoom) {
      if (me) me.remove();
      me = L.circleMarker([lat, lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1, interactive: false }).addTo(map);
      map.setView([lat, lon], Math.max(map.getZoom(), zoom));
    },

    setTemp(latlng) {
      if (temp) temp.remove();
      temp = null;
      if (!latlng) return;
      temp = L.marker(latlng, {
        icon: L.divIcon({
          className: "temp-pin",
          html: `<svg viewBox="0 0 30 40" width="30" height="40"><path d="M15 1C7.3 1 1 7.3 1 15c0 10 14 24 14 24s14-14 14-24C29 7.3 22.7 1 15 1z" fill="#1F3A5F" stroke="#fff" stroke-width="2"/><path d="M15 9v12M9 15h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`,
          iconSize: [30, 40],
          iconAnchor: [15, 40],
        }),
        interactive: false,
      }).addTo(map);
    },
  };
}
