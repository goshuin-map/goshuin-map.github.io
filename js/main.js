// 地図ページの起動と、各部品の組み立て
import { config, loadConfig, store, setLang, initialLang, lang, t, el, initAnalytics } from "./core.js";
import { loadBase, build, statusOf, prefOfPoint, prefName } from "./data.js";
import { createMap } from "./map.js";
import { pinSvg } from "./pins.js";
import { renderSheet, shrineName } from "./detail.js";
import { createRegionPicker } from "./region.js";

const $ = (id) => document.getElementById(id);
const STATUSES = ["direct", "paper", "none", "unknown"];
const DEFAULT_FILTERS = { direct: true, paper: true, none: true, unknown: true, unnamed: true, limitedOnly: false };

const state = {
  codes: [],
  byId: new Map(),
  list: [],
  filters: { ...DEFAULT_FILTERS, ...store.get("filters", {}) },
  visited: store.get("visited", {}),
  selected: null,
  sheetOpen: false,
  newPin: null,
};
let mapApi;
let picker;

// ---- お知らせ（トースト）----
let toastTimer;
function toast(msg, ms = 2800) {
  const box = $("toast");
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (box.hidden = true), ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  $("toast").hidden = true;
}

// ---- 地域 ----
function updateChip() {
  const names = state.codes.map((c) => prefName(c, lang));
  $("regionBtn").textContent = names.length ? t("hdr.region", { names: names.join(lang === "en" ? ", " : "・") }) : t("hdr.regionNone");
}

async function setRegion(codes, fit) {
  toast(t("toast.loading"), 0);
  try {
    const { byId, missing } = await build(codes);
    state.codes = codes;
    state.byId = byId;
    state.list = [...byId.values()];
    for (const s of state.list) s._k = null;
    store.set("regions", codes);
    updateChip();
    refreshMap();
    if (fit) mapApi.fitTo(state.list);
    if (missing.length) toast(t("toast.noData", { names: missing.map((c) => prefName(c, lang)).join("・") }), 4000);
    else hideToast();
  } catch (e) {
    console.error(e);
    toast(t("toast.loadError"), 5000);
  }
}

// ---- 絞り込み ----
function refreshMap() {
  const f = state.filters;
  const pins = [];
  const unnamed = [];
  for (const s of state.list) {
    if (!s.name && !s.g) {
      if (f.unnamed && !f.limitedOnly) unnamed.push(s);
      continue;
    }
    if (!f[statusOf(s)]) continue;
    if (f.limitedOnly && !(s.g && s.g.limited)) continue;
    pins.push(s);
  }
  mapApi.setShrines(pins, unnamed, state.visited);
}

function renderFilters() {
  const box = $("filterList");
  box.replaceChildren();
  const add = (key, label, iconHtml, note) => {
    const input = el("input", { type: "checkbox" });
    input.checked = !!state.filters[key];
    input.addEventListener("change", () => {
      state.filters[key] = input.checked;
      store.set("filters", state.filters);
      refreshMap();
    });
    const icon = el("span");
    icon.innerHTML = iconHtml; // 固定のSVGだけ
    const text = el("span", { text: label });
    if (note) text.append(" ", el("span", { class: "f-note", text: `（${note}）` }));
    box.append(el("label", null, input, icon, text));
  };
  for (const st of STATUSES) add(st, t(`status.${st}`), pinSvg(st, false, false, 28));
  add("unnamed", t("filter.unnamed"), `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="4.5" fill="#6B7280" fill-opacity=".5" stroke="#fff"/></svg>`, t("filter.unnamedNote"));
  box.append(el("hr"));
  add("limitedOnly", t("filter.limitedOnly"), pinSvg("direct", true, false, 28));
}

// ---- 簡易表示・詳細 ----
function setHash(s) {
  history.replaceState(null, "", s ? `#s=${encodeURIComponent(s.id)}&p=${s.pref}` : location.pathname + location.search);
}

function renderSelected() {
  const sheet = $("sheet");
  const s = state.selected;
  $("app").classList.toggle("has-sheet", !!s);
  if (!s) {
    sheet.hidden = true;
    return;
  }
  renderSheet(sheet, s, {
    visited: state.visited,
    toast,
    onClose: () => select(null),
    onToggle: () => {
      state.sheetOpen = !state.sheetOpen;
      applySheetState();
    },
    onToggleVisited(sh) {
      if (state.visited[sh.id]) delete state.visited[sh.id];
      else state.visited[sh.id] = new Date().toISOString().slice(0, 10);
      store.set("visited", state.visited);
      mapApi.updateIcon(sh);
      renderSelected();
    },
    onPost: (sh) => openForm("new", sh),
    onReport: (sh) => openForm("fix", sh),
    onPhoto(src) {
      $("lightbox").querySelector("img").src = src;
      $("lightbox").hidden = false;
    },
  });
  sheet.hidden = false;
  applySheetState();
}

function applySheetState() {
  const sheet = $("sheet");
  sheet.classList.toggle("open", state.sheetOpen);
  sheet.classList.toggle("peek", !state.sheetOpen);
}

function select(s, move) {
  state.selected = s;
  state.sheetOpen = false;
  closePanels();
  setNewPin(null);
  mapApi.select(s, move);
  setHash(s);
  renderSelected();
}

function closePanels() {
  $("results").hidden = true;
  $("filterPanel").hidden = true;
  $("menu").hidden = true;
  $("menuBtn").setAttribute("aria-expanded", "false");
}

// ---- 投稿フォーム（事前入力URL）（F-50〜F-53）----
function openForm(kind, s) {
  const f = config.form.post;
  if (!f.url) return toast(t("toast.formNotReady"));
  const params = new URLSearchParams({ usp: "pp_url" });
  const put = (key, value) => {
    if (f.entries[key] && value !== "" && value != null) params.set(f.entries[key], value);
  };
  put("kind", f.kindValues[kind]);
  put("id", s.id);
  put("name", s.name);
  put("lat", Number(s.lat).toFixed(5));
  put("lon", Number(s.lon).toFixed(5));
  put("pref", s.pref);
  window.open(`${f.url}?${params}`, "_blank", "noopener");
}

// ---- OSMにない神社の登録（F-52）----
function setNewPin(pin) {
  state.newPin = pin;
  mapApi.setTemp(pin ? [pin.lat, pin.lon] : null);
  $("newPin").hidden = !pin;
}

async function onMapClick(latlng) {
  const hadSomething = state.selected || state.newPin || !$("results").hidden || !$("filterPanel").hidden || !$("menu").hidden;
  if (hadSomething) {
    // 何か開いているときのタップは「閉じる」だけにする（誤操作を防ぐ）
    select(null);
    return;
  }
  if (mapApi.map.getZoom() < config.map.newPinMinZoom) return;
  const pin = { id: "", name: "", lat: latlng.lat, lon: latlng.lng, pref: "" };
  setNewPin(pin);
  pin.pref = (await prefOfPoint(pin.lat, pin.lon)) || "";
}

// ---- 検索（F-30）----
const norm = (s) => s.normalize("NFKC").toLowerCase().trim();

function search(text) {
  const q = norm(text);
  const box = $("results");
  if (!q) {
    box.hidden = true;
    return;
  }
  const hits = [];
  for (const s of state.list) {
    if (!s.name && !s.en) continue;
    if (s._k == null) s._k = norm(`${s.name} ${s.en}`);
    const i = s._k.indexOf(q);
    if (i < 0) continue;
    hits.push([i === 0 ? 0 : 1, s.g ? 0 : 1, s]);
    if (hits.length > 400) break;
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].name.length - b[2].name.length);
  box.replaceChildren();
  if (!hits.length) box.append(el("li", { class: "r-empty", text: t("search.none") }));
  for (const [, , s] of hits.slice(0, 20)) {
    const icon = el("span");
    icon.innerHTML = pinSvg(statusOf(s), !!(s.g && s.g.limited), !!state.visited[s.id], 26);
    const b = el("button", { type: "button" }, icon, el("span", { class: "r-name", text: shrineName(s) }), el("span", { class: "r-pref", text: prefName(s.pref, lang) }));
    b.addEventListener("click", () => {
      $("q").blur();
      select(s, true);
    });
    box.append(el("li", null, b));
  }
  box.hidden = false;
}

// ---- 現在地（F-23, F-32）----
function locate(replaceRegion) {
  if (!navigator.geolocation) return toast(t("geo.error"));
  toast(t("toast.loading"), 0);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const code = await prefOfPoint(lat, lon);
      if (!code) return toast(t("geo.outside"));
      if (!state.codes.includes(code)) {
        const next = replaceRegion ? [code] : [...state.codes, code].slice(-config.map.maxPrefectures);
        await setRegion(next, false);
      } else hideToast();
      mapApi.showMe(lat, lon, 15);
    },
    () => toast(t("geo.error"), 4000),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

// ---- 起動 ----
// 前回の地域、または共有URLの神社から始める（F-24）
async function openFromHash(first) {
  const hash = parseHash();
  const target = hash.s;
  if (!first && (!target || (state.selected && state.selected.id === target))) return;
  let codes = first ? store.get("regions", []).filter((c) => /^\d{2}$/.test(c)) : [...state.codes];
  let changed = first;
  if (hash.p && /^\d{2}$/.test(hash.p) && !codes.includes(hash.p)) {
    codes = [...codes, hash.p].slice(-config.map.maxPrefectures);
    changed = true;
  }
  if (!codes.length) return picker.open([]);
  if (changed) await setRegion(codes, !target);
  const s = target && state.byId.get(target);
  if (s) select(s, true);
  else if (target && changed) mapApi.fitTo(state.list);
}

function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { s: p.get("s"), p: p.get("p") };
}

async function start() {
  await loadConfig();
  await setLang(initialLang());
  await loadBase();
  initAnalytics();
  if (config.form.contact.url) {
    $("menuContact").href = config.form.contact.url;
    $("menuContact").target = "_blank";
    $("menuContact").rel = "noopener";
  }

  mapApi = createMap(config.map, { select: (s) => select(s, false), mapClick: onMapClick, lang });
  picker = createRegionPicker({
    max: config.map.maxPrefectures,
    toast,
    onConfirm: (codes) => {
      select(null);
      setRegion(codes, true);
    },
    onLocate: () => locate(true),
  });
  renderFilters();
  updateChip();

  $("regionBtn").addEventListener("click", () => picker.open(state.codes));
  $("locateBtn").addEventListener("click", () => locate(false));
  $("langBtn").addEventListener("click", async () => {
    await setLang(lang === "ja" ? "en" : "ja");
    mapApi.setLang(lang);
    updateChip();
    renderFilters();
    renderSelected();
    picker.rerender();
    if (!$("results").hidden) search($("q").value);
  });
  $("menuBtn").addEventListener("click", () => {
    const open = $("menu").hidden;
    closePanels();
    $("menu").hidden = !open;
    $("menuBtn").setAttribute("aria-expanded", String(open));
  });
  $("filterBtn").addEventListener("click", () => {
    const open = $("filterPanel").hidden;
    closePanels();
    $("filterPanel").hidden = !open;
  });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => ($(b.dataset.close).hidden = true)));
  let timer;
  $("q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => search(e.target.value), 150);
  });
  $("q").addEventListener("focus", (e) => {
    $("filterPanel").hidden = true;
    if (e.target.value) search(e.target.value);
  });
  $("newPinGo").addEventListener("click", () => state.newPin && openForm("new", state.newPin));
  $("newPinCancel").addEventListener("click", () => setNewPin(null));
  $("lightbox").addEventListener("click", () => ($("lightbox").hidden = true));

  // 簡易表示を上に引くと詳細、下に引くと閉じる
  let startY = null;
  $("sheet").addEventListener("touchstart", (e) => (startY = e.target.closest(".sheet-head, .sheet-grip") ? e.touches[0].clientY : null), { passive: true });
  $("sheet").addEventListener("touchend", (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy < -30 && !state.sheetOpen) ((state.sheetOpen = true), applySheetState());
    else if (dy > 30) state.sheetOpen ? ((state.sheetOpen = false), applySheetState()) : select(null);
  });

  window.addEventListener("hashchange", () => openFromHash(false));
  await openFromHash(true);
}

start().catch((e) => {
  console.error(e);
  toast("読み込みに失敗しました / Failed to load", 0);
});
