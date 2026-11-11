// 簡易表示と詳細画面（F-40〜F-45）。投稿された文字は textContent で表示する
import { el, t, lang } from "./core.js";
import { statusOf } from "./data.js";
import { pinSvg } from "./pins.js";

export function shrineName(s) {
  if (lang === "en" && s.en) return s.en;
  return s.name || t("shrine.unnamed");
}

function row(dl, key, value) {
  if (value === null || value === undefined || value === "") return;
  dl.append(el("dt", { text: t(key) }), el("dd", { text: String(value) }));
}

// ctx: { visited, onToggleVisited, onPost, onReport, onClose, onPhoto, toast }
export function renderSheet(sheet, s, ctx) {
  const g = s.g;
  const status = statusOf(s);
  const isVisited = !!ctx.visited[s.id];
  sheet.replaceChildren();

  // ---- 簡易表示 ----
  const title = el("div", { class: "sheet-title" }, el("h2", { text: shrineName(s) }));
  if (lang === "en" ? s.en && s.name : s.en) title.append(el("div", { class: "en", text: lang === "en" ? s.name : s.en }));
  const badges = el("div", { class: "badges" }, el("span", { class: `badge s-${status}`, text: t(`status.${status}`) }));
  if (g && g.limited) badges.append(el("span", { class: "badge star", text: t("badge.limited") }));
  if (isVisited) badges.append(el("span", { class: "badge", text: t("badge.visited") }));
  title.append(badges);

  const icon = el("span");
  icon.innerHTML = pinSvg(status, !!(g && g.limited), isVisited, 40); // 固定のSVGだけ
  const head = el(
    "div",
    { class: "sheet-head" },
    icon,
    title,
    el("button", { class: "sheet-more", type: "button", text: t("detail.more") }),
    el("button", {
      class: "x",
      type: "button",
      "aria-label": t("close"),
      text: "✕",
      onclick: (e) => {
        e.stopPropagation();
        ctx.onClose();
      },
    })
  );
  head.addEventListener("click", () => ctx.onToggle());
  sheet.append(el("div", { class: "sheet-grip" }), head);

  // ---- 詳細 ----
  const body = el("div", { class: "sheet-body" });
  if (s.blocked) {
    body.append(el("p", { class: "notice", text: t("detail.blocked") }));
  } else if (!g) {
    body.append(el("p", { class: "notice", text: t("detail.noInfo") }));
  } else {
    if (g.photos && g.photos.length) {
      const photos = el("div", { class: "photos" });
      for (const file of g.photos.slice(0, 3)) {
        const src = `data/photos/${encodeURIComponent(s.id)}/${encodeURIComponent(file)}`;
        photos.append(el("img", { src, alt: "", loading: "lazy", onclick: () => ctx.onPhoto(src) }));
      }
      body.append(photos);
    }
    const dl = el("dl", { class: "dl" });
    row(dl, "detail.place", g.place);
    row(dl, "detail.fee", g.fee);
    row(dl, "detail.hours", g.hours);
    row(dl, "detail.limited", g.limited);
    if (g.book) row(dl, "detail.book", t(`detail.book.${g.book}`));
    row(dl, "detail.comment", g.comment);
    row(dl, "detail.by", g.by || t("detail.anonymous"));
    row(dl, "detail.checked", g.visited);
    body.append(dl, el("p", { class: "small", text: t("detail.disclaimer") }));
  }

  const actions = el(
    "div",
    { class: "actions" },
    el("button", {
      class: "btn " + (isVisited ? "btn-on" : "btn-line"),
      type: "button",
      "aria-pressed": String(isVisited),
      text: t(isVisited ? "detail.visited" : "detail.visit"),
      onclick: () => ctx.onToggleVisited(s),
    })
  );
  if (!s.blocked) {
    actions.append(el("button", { class: "btn btn-accent", type: "button", text: t("detail.post"), onclick: () => ctx.onPost(s) }));
  }
  body.append(actions, el("p", { class: "small", text: t("detail.visitNote") }));

  // 一番下：目立たない「誤りを報告」と、運営者向けのID表示（F-45, F-78）
  const foot = el("div", { class: "foot" });
  if (g && !s.blocked) foot.append(el("button", { type: "button", text: t("detail.report"), onclick: () => ctx.onReport(s) }));
  foot.append(
    el("span", null, "ID: ", el("code", { text: s.id })),
    el("button", {
      type: "button",
      text: t("detail.copy"),
      onclick: async () => {
        try {
          // 一括登録シートにそのまま貼れる形（ID・神社名・緯度・経度・都道府県）でコピーする（F-78）
          await navigator.clipboard.writeText([s.id, s.name, s.lat, s.lon, s.pref].join("\t"));
          ctx.toast(t("detail.copied"));
        } catch (e) {
          /* コピーできない環境では、表示されているIDを手で写す */
        }
      },
    })
  );
  body.append(foot);
  sheet.append(body);
}
