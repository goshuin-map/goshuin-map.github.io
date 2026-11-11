#!/usr/bin/env python3
"""inbox/ に置かれた投稿を、御朱印データ（data/goshuin.json）と写真に反映する。

Apps Script が inbox/<投稿ID>/ に写真と submission.json を置く。
このスクリプトは古い順に処理し、処理した投稿のフォルダを消す（F-72、設計書 §7.1）。

  op=upsert   御朱印情報の登録・上書き
  op=remove   御朱印情報と写真の削除
  op=block    削除したうえで「掲載しない神社」に登録
  op=unblock  「掲載しない神社」から外す
"""
import datetime
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INBOX = ROOT / "inbox"
GOSHUIN = ROOT / "data" / "goshuin.json"
BLOCKED = ROOT / "data" / "blocked.json"
PHOTOS = ROOT / "data" / "photos"

ID_RE = re.compile(r"^(?:[nwr]\d{1,15}|x\d{8,20})$")
SID_RE = re.compile(r"^[sb]\d{14}(?:-\d{1,4})?$")
FILE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,60}$")
STATUS = {"direct", "paper", "none"}
BOOK = {"yes", "no", "unknown"}
LIMITS = {"name": 100, "place": 200, "fee": 100, "hours": 200, "limited": 500, "comment": 1000, "by": 30}
MAX_PHOTOS = 3
MAX_EDGE = 1200
JST = datetime.timezone(datetime.timedelta(hours=9))


def text(value, key, multiline=False):
    """文字を整える。制御文字を消し、長すぎるものは切る。"""
    s = "" if value is None else str(value)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = "".join(ch for ch in s if ch == "\n" or ch >= " ")
    if multiline:
        s = "\n".join(line.strip() for line in s.split("\n")).strip()
        s = re.sub(r"\n{3,}", "\n\n", s)
    else:
        s = " ".join(s.split())
    return s[: LIMITS[key]]


def validate_item(src):
    pref = str(src.get("pref", ""))
    if not re.fullmatch(r"\d{2}", pref) or not 1 <= int(pref) <= 47:
        raise ValueError(f"都道府県コードが正しくありません: {pref!r}")
    lat = float(src["lat"])
    lon = float(src["lon"])
    if not (20 <= lat <= 46 and 122 <= lon <= 154):
        raise ValueError(f"緯度経度が日本の範囲外です: {lat}, {lon}")
    status = src.get("status")
    if status not in STATUS:
        raise ValueError(f"御朱印の状態が正しくありません: {status!r}")
    book = src.get("book") or "unknown"
    if book not in BOOK:
        raise ValueError(f"御朱印帳の値が正しくありません: {book!r}")
    visited = str(src.get("visited", ""))
    day = datetime.date.fromisoformat(visited)  # 形式が違えばここでエラー
    if day > datetime.datetime.now(JST).date() + datetime.timedelta(days=1):
        raise ValueError(f"参拝日が未来の日付です: {visited}")
    name = text(src.get("name"), "name")
    if not name:
        raise ValueError("神社名がありません")
    by = text(src.get("by"), "by")
    return {
        "pref": pref,
        "name": name,
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "status": status,
        "place": text(src.get("place"), "place"),
        "fee": text(src.get("fee"), "fee"),
        "hours": text(src.get("hours"), "hours"),
        "limited": text(src.get("limited"), "limited", multiline=True),
        "book": book,
        "photos": [],
        "comment": text(src.get("comment"), "comment", multiline=True),
        "by": by or None,
        "visited": day.isoformat(),
    }


def process_photo(src, dest):
    """向きを直し、縮小し、Exifなどの付加情報をすべて捨ててJPEGで保存する。"""
    from PIL import Image, ImageOps  # 写真があるときだけ必要

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        clean = Image.new("RGB", im.size)  # 画素だけを写した新しい画像（付加情報なし）
        clean.paste(im)
    clean.save(dest, "JPEG", quality=80, optimize=True)


def remove_shrine(sid, goshuin):
    goshuin["items"].pop(sid, None)
    shutil.rmtree(PHOTOS / sid, ignore_errors=True)


def apply(folder, goshuin, blocked):
    sub = json.loads((folder / "submission.json").read_text(encoding="utf-8"))
    sid = str(sub.get("sid", ""))
    if not SID_RE.fullmatch(sid) or sid != folder.name:
        raise ValueError(f"投稿IDが正しくありません: {sid!r}")
    op = sub.get("op")
    shrine = str(sub.get("id") or "")
    if op == "upsert" and not shrine:
        shrine = "x" + re.sub(r"\D", "", sid)  # OSMにない神社の独自ID（F-83）
    if not ID_RE.fullmatch(shrine):
        raise ValueError(f"神社IDが正しくありません: {shrine!r}")

    if op == "upsert":
        if shrine in blocked:
            print(f"{sid}: {shrine} は掲載しない神社のため反映しません")
            return
        item = validate_item(sub.get("item") or {})
        names = list(sub.get("photos") or [])[:MAX_PHOTOS]
        done = []
        for i, name in enumerate(names, 1):
            if not FILE_RE.fullmatch(str(name)) or not (folder / name).is_file():
                raise ValueError(f"写真が見つかりません: {name!r}")
            out = folder / f"out-{i}.jpg"
            process_photo(folder / name, out)
            done.append(out)
        # ここまで成功してから、古い写真を消して置き換える（F-73）
        shutil.rmtree(PHOTOS / shrine, ignore_errors=True)
        if done:
            (PHOTOS / shrine).mkdir(parents=True, exist_ok=True)
            for i, out in enumerate(done, 1):
                fname = f"{sid}-{i}.jpg"
                shutil.move(str(out), str(PHOTOS / shrine / fname))
                item["photos"].append(fname)
        goshuin["items"][shrine] = item
        print(f"{sid}: {shrine}（{item['name']}）を反映しました。写真 {len(done)} 枚")
    elif op == "remove":
        remove_shrine(shrine, goshuin)
        print(f"{sid}: {shrine} を削除しました")
    elif op == "block":
        remove_shrine(shrine, goshuin)
        blocked.add(shrine)
        print(f"{sid}: {shrine} を掲載しない神社に登録しました")
    elif op == "unblock":
        blocked.discard(shrine)
        print(f"{sid}: {shrine} を掲載しない神社から外しました")
    else:
        raise ValueError(f"op が正しくありません: {op!r}")


def dump_goshuin(goshuin):
    """1神社1行で書き出す（差分を見やすくするため）。"""
    items = goshuin["items"]
    lines = ",\n".join(
        json.dumps(k, ensure_ascii=False) + ":" + json.dumps(items[k], ensure_ascii=False, separators=(",", ":"))
        for k in sorted(items)
    )
    body = f"\n{lines}\n" if lines else ""
    return '{"updated":' + json.dumps(goshuin["updated"]) + ',"items":{' + body + "}}\n"


def main():
    goshuin = json.loads(GOSHUIN.read_text(encoding="utf-8"))
    goshuin.setdefault("items", {})
    blocked = set(json.loads(BLOCKED.read_text(encoding="utf-8")).get("ids", []))
    folders = sorted(d for d in INBOX.iterdir() if d.is_dir() and (d / "submission.json").is_file()) if INBOX.exists() else []
    if not folders:
        print("処理する投稿はありません")
        return
    failed = []
    for folder in folders:
        try:
            apply(folder, goshuin, blocked)
        except Exception as e:  # noqa: BLE001
            print(f"エラー: {folder.name}: {e}")
            failed.append(folder.name)
        finally:
            shutil.rmtree(folder, ignore_errors=True)  # 失敗した投稿も残さない（シートから送り直す）
    goshuin["updated"] = datetime.datetime.now(JST).isoformat(timespec="seconds")
    GOSHUIN.write_text(dump_goshuin(goshuin), encoding="utf-8")
    BLOCKED.write_text(json.dumps({"ids": sorted(blocked)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if failed:
        print("反映できなかった投稿: " + ", ".join(failed) + "（スプレッドシートから承認し直してください）")
        sys.exit(1)


if __name__ == "__main__":
    main()
