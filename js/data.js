// データの読み込みと結合（神社データ ＋ 御朱印データ ＋ 掲載しない神社）
import { getJSON } from "./core.js";

export let prefectures = [];
let goshuin = {};
let blocked = new Set();
const cache = new Map(); // 都道府県コード → 神社の配列（読めなかったら null）

export async function loadBase() {
  const [p, g, b] = await Promise.all([
    getJSON("data/prefectures.json"),
    getJSON("data/goshuin.json"),
    getJSON("data/blocked.json"),
  ]);
  prefectures = p;
  goshuin = g.items || {};
  blocked = new Set(b.ids || []);
}

export function prefName(code, lang) {
  const p = prefectures.find((x) => x.code === code);
  if (!p) return code;
  if (lang === "en") return p.en;
  return p.ja.length > 3 ? p.ja.replace(/[都府県]$/, "") : p.ja;
}

async function loadPref(code) {
  if (!cache.has(code)) {
    let list = null;
    try {
      const j = await getJSON(`data/shrines/${code}.json`);
      list = j.shrines.map((r) => ({ id: r[0], lat: r[1], lon: r[2], name: r[3], en: r[4], pref: code }));
    } catch (e) {
      list = null;
    }
    cache.set(code, list);
  }
  return cache.get(code);
}

// 選んだ都道府県の神社をまとめて返す
export async function build(codes) {
  const lists = await Promise.all(codes.map(loadPref));
  const byId = new Map();
  const missing = [];
  codes.forEach((code, i) => {
    if (!lists[i]) return missing.push(code);
    for (const s of lists[i]) if (!byId.has(s.id)) byId.set(s.id, s);
  });
  for (const s of byId.values()) {
    s.blocked = blocked.has(s.id);
    s.g = s.blocked ? null : goshuin[s.id] || null;
  }
  // OSMにない神社・OSMから消えた神社は、御朱印データ側の位置で表示する（F-83）
  for (const id in goshuin) {
    const g = goshuin[id];
    if (byId.has(id) || !codes.includes(g.pref) || blocked.has(id)) continue;
    byId.set(id, { id, lat: g.lat, lon: g.lon, name: g.name || "", en: "", pref: g.pref, g, blocked: false });
  }
  return { byId, missing };
}

export function statusOf(s) {
  return s.g ? s.g.status : "unknown";
}

// 緯度経度から都道府県を判定する：範囲に入る県を読み込み、一番近い神社の県を返す
export async function prefOfPoint(lat, lon) {
  const cands = prefectures.filter((p) => lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3]);
  if (!cands.length) return null;
  const lists = await Promise.all(cands.map((p) => loadPref(p.code)));
  const k = Math.cos((lat * Math.PI) / 180);
  let best = null;
  let bestD = Infinity;
  lists.forEach((list) => {
    if (!list) return;
    for (const s of list) {
      const dy = s.lat - lat;
      const dx = (s.lon - lon) * k;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = s.pref;
      }
    }
  });
  if (best) return best;
  // データがまだない場合は、範囲が一番狭い県を返す
  cands.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]));
  return cands[0].code;
}
