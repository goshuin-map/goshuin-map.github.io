// 背景地図。ピンが目立つよう、情報をできるだけ減らした淡い地図を使う。
// 既定は OpenFreeMap のベクトル地図（Positron）を MapLibre で描き、
// 店などのアイコンや道路番号を消し、地名を日本語（英語表示のときは英語）にする。
/* global L, maplibregl */

// 地図から消すレイヤー（道路番号の看板など）
const HIDE = /shield|^airport$|^aeroway|^highway-name-path$/;

function labelField(lang) {
  return lang === "en"
    ? ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
    : ["coalesce", ["get", "name:ja"], ["get", "name"]];
}

function isNameLabel(layer) {
  const f = layer.layout && layer.layout["text-field"];
  return layer.type === "symbol" && f && JSON.stringify(f).includes("name");
}

function customize(style, lang) {
  style.layers = style.layers.filter((l) => !HIDE.test(l.id));
  for (const l of style.layers) {
    if (isNameLabel(l)) l.layout["text-field"] = labelField(lang);
    // 位置が分かりやすいよう、公園は薄い緑、水は薄い青にする（ほかは灰色のまま）
    if (l.id === "park") l.paint = { ...l.paint, "fill-color": "#DCEBD3", "fill-opacity": 1 };
    if (l.id === "landcover_wood") l.paint = { ...l.paint, "fill-color": "#E4EEDD", "fill-opacity": 1 };
    if (l.id === "water")l.paint = { ...l.paint, "fill-color": "#C6DFEE" };
    if (l.id === "waterway") l.paint = { ...l.paint, "line-color": "#C6DFEE" };
    // 道路名・川の名前は拡大したときだけ出す
    if (/^highway-name|^waterway_line_label/.test(l.id)) l.minzoom = Math.max(l.minzoom || 0, 16);
  }
  return style;
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(window.maplibregl && L.maplibreGL && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) {
    return false;
  }
}

function addRaster(map, base) {
  L.tileLayer(base.url, {
    attribution: base.attribution,
    subdomains: base.subdomains || "abc",
    maxZoom: 19,
    maxNativeZoom: base.maxNativeZoom || 19,
  }).addTo(map);
  return { setLang() {} };
}

// 戻り値の setLang(lang) で地名の言語を切り替えられる
export async function addBasemap(map, cfg, lang) {
  const name = new URLSearchParams(location.search).get("tiles") || cfg.tiles;
  const base = cfg.tileSets[name] || cfg.tileSets[cfg.tiles];
  if (base.type !== "vector") return addRaster(map, base);
  if (!webglOk()) return addRaster(map, cfg.tileSets.osm);
  try {
    const res = await fetch(base.style);
    if (!res.ok) throw new Error(res.status);
    const style = customize(await res.json(), lang);
    const layer = L.maplibreGL({ style, attribution: base.attribution, interactive: false }).addTo(map);
    const gl = () => layer.getMaplibreMap();
    // 読み込みが終わったら位置を合わせ直す（最初の描画が空白のままになるのを防ぐ）
    gl().once("load", () => layer._update && layer._update());
    return {
      setLang(next) {
        const m = gl();
        if (!m || !m.isStyleLoaded()) return;
        for (const l of m.getStyle().layers) {
          if (isNameLabel(l)) m.setLayoutProperty(l.id, "text-field", labelField(next));
        }
      },
    };
  } catch (e) {
    console.warn("背景地図を読み込めなかったため、標準の地図を使います", e);
    return addRaster(map, cfg.tileSets.osm);
  }
}
