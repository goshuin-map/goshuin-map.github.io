// 設定・保存・文言。地図ページと文章ページの両方で使う。

export let config = null;

export async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

export async function loadConfig() {
  config = await getJSON("config.json");
  return config;
}

// ---- ブラウザへの保存（localStorage）----
const PREFIX = "gm.";
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* 保存できない環境では何もしない */
    }
  },
};

// ---- 文言 ----
let dict = {};
export let lang = "ja";

export async function setLang(next) {
  lang = next === "en" ? "en" : "ja";
  dict = await getJSON(`i18n/${lang}.json`);
  store.set("lang", lang);
  document.documentElement.lang = lang;
  applyI18n(document);
}

export function initialLang() {
  const saved = store.get("lang", null);
  if (saved) return saved;
  return (navigator.language || "ja").toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function t(key, vars) {
  let s = dict[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

export function applyI18n(root) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
  // 文章ページ：<div data-lang="ja"> と <div data-lang="en"> を切り替える
  root.querySelectorAll("[data-lang]").forEach((el) => {
    el.hidden = el.dataset.lang !== lang;
  });
  const btn = document.getElementById("langBtn");
  if (btn) btn.textContent = t("lang.other");
}

// ---- アクセス解析（設定が空なら読み込まない）----
export function initAnalytics() {
  const code = config?.analytics?.goatcounter;
  if (!code) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// 小さな部品を作る
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "class") node.className = props[k];
      else if (k === "text") node.textContent = props[k];
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), props[k]);
      else if (props[k] !== false && props[k] != null) node.setAttribute(k, props[k]);
    }
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
