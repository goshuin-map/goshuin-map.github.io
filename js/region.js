// 地域の選択（地方 → 都道府県の複数選択）（F-20〜F-25）
import { el, t, lang } from "./core.js";
import { prefectures } from "./data.js";

const REGIONS = ["hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu"];

// opts: { max, onConfirm(codes), onLocate(), toast }
export function createRegionPicker(opts) {
  const modal = document.getElementById("regionModal");
  const tabs = document.getElementById("regionTabs");
  const list = document.getElementById("prefList");
  const ok = document.getElementById("regionOk");
  let selected = new Set();
  let active = null;

  function render() {
    tabs.replaceChildren();
    for (const r of REGIONS) {
      const count = prefectures.filter((p) => p.region === r && selected.has(p.code)).length;
      const b = el("button", { type: "button", class: r === active ? "on" : "", text: t(`region.${r}`), onclick: () => ((active = r), render()) });
      if (count) b.append(el("span", { class: "cnt", text: String(count) }));
      tabs.append(b);
    }
    list.replaceChildren();
    if (!active) {
      list.append(el("p", { class: "hint", text: t("region.pick") }));
    } else {
      for (const p of prefectures.filter((x) => x.region === active)) {
        const input = el("input", { type: "checkbox", value: p.code });
        input.checked = selected.has(p.code);
        input.addEventListener("change", () => {
          if (input.checked && selected.size >= opts.max) {
            input.checked = false;
            opts.toast(t("region.max", { n: opts.max }));
            return;
          }
          if (input.checked) selected.add(p.code);
          else selected.delete(p.code);
          render();
        });
        list.append(el("label", null, input, el("span", { text: lang === "en" ? p.en : p.ja })));
      }
    }
    ok.disabled = selected.size === 0;
    ok.textContent = selected.size ? t("region.ok", { n: selected.size }) : t("region.okNone");
  }

  function close() {
    modal.hidden = true;
  }

  ok.addEventListener("click", () => {
    close();
    opts.onConfirm(prefectures.filter((p) => selected.has(p.code)).map((p) => p.code));
  });
  document.getElementById("regionClose").addEventListener("click", close);
  document.getElementById("regionLocate").addEventListener("click", () => {
    close();
    opts.onLocate();
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  return {
    open(codes) {
      selected = new Set(codes);
      const first = prefectures.find((p) => selected.has(p.code));
      active = first ? first.region : null;
      render();
      modal.hidden = false;
    },
    rerender() {
      if (!modal.hidden) render();
    },
  };
}
