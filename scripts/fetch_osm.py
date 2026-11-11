#!/usr/bin/env python3
"""OSM(Overpass API)から神社データを取得し、都道府県ごとのJSONに保存する。

使い方:
  python scripts/fetch_osm.py            # 全都道府県
  python scripts/fetch_osm.py --only 13,14

取得に失敗した、または件数が前回より大きく減った都道府県は、
古いファイルを残したまま終了コード1で終わる（F-80〜F-84、設計書 §7.2）。
"""
import argparse
import datetime
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "data" / "shrines"
PREFIX = {"node": "n", "way": "w", "relation": "r"}
MAX_DROP = 0.2  # 前回よりこの割合を超えて減ったら異常とみなす
RETRIES = 6


def build_query(code):
    religion = CONFIG["osm"]["religion"]
    return (
        "[out:json][timeout:180];"
        f'area["ISO3166-2"="JP-{code}"]->.a;'
        f'nwr["amenity"="place_of_worship"]["religion"="{religion}"](area.a);'
        "out center tags;"
    )


def fetch(code):
    """Overpassに問い合わせて elements を返す。混雑時は待ってやり直す。"""
    endpoints = CONFIG["osm"]["endpoints"]
    body = urllib.parse.urlencode({"data": build_query(code)}).encode()
    agent = "goshuin-map/1.0 (+" + CONFIG["site"]["url"] + ")"
    last = None
    for attempt in range(RETRIES):
        url = endpoints[attempt % len(endpoints)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": agent})
            with urllib.request.urlopen(req, timeout=300) as res:
                data = json.loads(res.read().decode("utf-8"))
            if "elements" not in data:
                raise ValueError("elements がありません")
            if data.get("remark"):  # タイムアウトなどは remark に入る
                raise ValueError(data["remark"])
            return data["elements"]
        except Exception as e:  # noqa: BLE001
            last = e
            wait = 20 * (attempt + 1)
            print(f"  {code}: 失敗（{e}）。{wait}秒待ってやり直します", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"{code}: 取得できませんでした（{last}）")


def clean(text):
    return " ".join(str(text or "").split())


def convert(elements):
    rows = {}
    for e in elements:
        prefix = PREFIX.get(e.get("type"))
        if not prefix:
            continue
        pos = e if prefix == "n" else e.get("center")
        if not pos or "lat" not in pos or "lon" not in pos:
            continue
        tags = e.get("tags") or {}
        sid = f"{prefix}{e['id']}"
        rows[sid] = [
            sid,
            round(pos["lat"], 5),
            round(pos["lon"], 5),
            clean(tags.get("name") or tags.get("name:ja")),
            clean(tags.get("name:en")),
        ]
    return sorted(rows.values(), key=lambda r: (r[0][0], int(r[0][1:])))


def dump(code, updated, shrines):
    lines = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in shrines)
    return f'{{"pref":"{code}","updated":"{updated}","shrines":[\n{lines}\n]}}\n'


def update(code, today):
    path = OUT_DIR / f"{code}.json"
    old = None
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
    shrines = convert(fetch(code))
    if old:
        before = len(old["shrines"])
        if before and len(shrines) < before * (1 - MAX_DROP):
            raise RuntimeError(f"{code}: 件数が {before} → {len(shrines)} に減りました。古いデータを残します")
        if old["shrines"] == shrines:
            print(f"{code}: 変更なし（{len(shrines)}件）", flush=True)
            return
    elif not shrines:
        raise RuntimeError(f"{code}: 0件でした")
    path.write_text(dump(code, today, shrines), encoding="utf-8")
    print(f"{code}: {len(shrines)}件を保存しました", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="都道府県コードをカンマ区切りで（例: 13,14）")
    args = ap.parse_args()
    codes = [f"{i:02d}" for i in range(1, 48)]
    if args.only:
        codes = [c.strip().zfill(2) for c in args.only.split(",") if c.strip()]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    failed = []
    for i, code in enumerate(codes):
        if i:
            time.sleep(CONFIG["osm"]["sleepSeconds"])
        try:
            update(code, today)
        except Exception as e:  # noqa: BLE001
            print(f"エラー: {e}", flush=True)
            failed.append(code)
    if failed:
        print("失敗した都道府県: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
