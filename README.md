# みんなの御朱印マップ

全国の神社で「御朱印がもらえるか」「直書きか書き置きか」を地図で調べられるサイト。

- サイト：https://goshuin-map.github.io/
- 使い方・ライセンス：[about.html](about.html)

## しくみ

- サーバーなし。HTML・CSS・JavaScriptだけの静的サイト（ビルド不要）を GitHub Pages で公開。
- 神社の位置と名前は OpenStreetMap（Overpass API）から月1回取得（`scripts/fetch_osm.py`）。
- 御朱印の情報は Googleフォーム で受け付け、運営者がスプレッドシートで承認すると、Apps Script（`gas/Code.gs`）→ GitHub Actions（`scripts/apply_inbox.py`）でサイトに反映。

| 場所 | 中身 |
|---|---|
| `config.json` | 設定（公開URL、フォーム、解析など）はここだけ |
| `data/shrines/` | 神社データ（都道府県ごと。OSM由来） |
| `data/goshuin.json` | 御朱印データ（投稿由来） |
| `data/blocked.json` | 掲載しない神社 |
| `data/photos/` | 投稿された写真 |
| `js/`, `css/`, `i18n/` | サイトのプログラムと文言（日本語・英語） |
| `docs/セットアップ手順.md` | 運営者向けの手順書 |
| `要件定義書.md`, `設計書.md` | 要件と設計（手元のみ。`.gitignore` で公開対象から外している） |

## 手元で動かす

Windows（PowerShell）：

```
powershell -ExecutionPolicy Bypass -File scripts/dev-server.ps1
```

Pythonがある場合：

```
python -m http.server 8765
```

どちらも http://localhost:8765/ を開く。

## お寺版を作るには

`config.json` の `osm.religion` を `buddhist` に変え、`i18n/` の文言を差し替える。

## ライセンス

| 対象 | ライセンス |
|---|---|
| プログラム | [MIT License](LICENSE) |
| 神社の位置・名前（`data/shrines/`） | © OpenStreetMap contributors、[ODbL](https://opendatacommons.org/licenses/odbl/) |
| 投稿された文字情報（`data/goshuin.json`） | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 投稿された写真（`data/photos/`） | 著作権は各投稿者にあります。本サイトへの掲載のみ許可されています。**転載・再利用はできません** |

同梱しているライブラリ：Leaflet（BSD 2-Clause）、Leaflet.markercluster（MIT）、MapLibre GL JS（BSD 3-Clause）、maplibre-gl-leaflet（ISC）。

背景地図は [OpenFreeMap](https://openfreemap.org/) のベクトル地図（Positron）を、店のアイコンや道路番号を消して使っている（`js/basemap.js`）。切り替えは `config.json` の `map.tiles`。
