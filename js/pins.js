// ピンのアイコン。色だけでなく形も状態ごとに変える（F-10〜F-13）
/* global L */

export const COLORS = { direct: "#2E9E5B", paper: "#E6B422", none: "#D64545", unknown: "#9AA0A6" };

function shape(status) {
  switch (status) {
    case "direct": // 丸＋筆
      return `<circle cx="17" cy="17" r="12" fill="${COLORS.direct}" stroke="#fff" stroke-width="2"/>
        <path d="M22.5 10.5 15.5 19" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <path d="M15.8 17.6 11 24l6.6-3z" fill="#fff"/>`;
    case "paper": // 四角＋紙
      return `<rect x="5.5" y="5.5" width="23" height="23" rx="4" fill="${COLORS.paper}" stroke="#fff" stroke-width="2"/>
        <path d="M12 10h10v14H12z" fill="#fff"/>
        <path d="M14.5 14h5M14.5 17h5M14.5 20h3" stroke="#8A6A00" stroke-width="1.4" stroke-linecap="round"/>`;
    case "none": // ひし形＋×
      return `<path d="M17 3.5 30.5 17 17 30.5 3.5 17z" fill="${COLORS.none}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12.8 12.8l8.4 8.4M21.2 12.8l-8.4 8.4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    default: // 小さめの白抜きの丸
      return `<circle cx="17" cy="17" r="7.5" fill="#fff" stroke="${COLORS.unknown}" stroke-width="3.5"/>`;
  }
}

const STAR = `<path d="M8.5 1.2l2.2 4.5 4.9.7-3.6 3.4.9 4.9-4.4-2.4-4.4 2.4.9-4.9L1.4 6.4l4.9-.7z" fill="#FFD54A" stroke="#6B5000" stroke-width="1" stroke-linejoin="round"/>`;
const CHECK = `<g transform="translate(19 19)"><circle cx="7" cy="7" r="6.5" fill="#1F3A5F" stroke="#fff" stroke-width="1.5"/>
  <path d="M3.9 7.2l2.2 2.2 4-4.4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;

export function pinSvg(status, star, visited, size = 34) {
  return `<svg class="pin-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="${size}" height="${size}" aria-hidden="true">${shape(status)}${star ? STAR : ""}${visited ? CHECK : ""}</svg>`;
}

const cache = new Map();
export function pinIcon(status, star, visited) {
  const key = `${status}|${star ? 1 : 0}|${visited ? 1 : 0}`;
  if (!cache.has(key)) {
    cache.set(key, L.divIcon({ html: pinSvg(status, star, visited), className: "pin", iconSize: [34, 34], iconAnchor: [17, 17] }));
  }
  return cache.get(key);
}
