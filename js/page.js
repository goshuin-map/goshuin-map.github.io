// 文章ページ（このサイトについて・利用規約・プライバシーポリシー）用
import { config, loadConfig, setLang, initialLang, lang, initAnalytics } from "./core.js";
import { pinSvg } from "./pins.js";

async function start() {
  await loadConfig();
  await setLang(initialLang());
  initAnalytics();

  document.getElementById("langBtn").addEventListener("click", () => setLang(lang === "ja" ? "en" : "ja"));

  // お問い合わせフォームへのリンク（設定がなければ「準備中」と表示）
  document.querySelectorAll("[data-contact]").forEach((a) => {
    if (config.form.contact.url) {
      a.href = config.form.contact.url;
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a.removeAttribute("href");
      a.append(a.closest("[data-lang]")?.dataset.lang === "en" ? " (coming soon)" : "（準備中）");
    }
  });

  // ピンの見本
  document.querySelectorAll("[data-pin]").forEach((node) => {
    const [status, star, visited] = node.dataset.pin.split(",");
    node.innerHTML = pinSvg(status, star === "1", visited === "1", 34);
  });
}

start();
