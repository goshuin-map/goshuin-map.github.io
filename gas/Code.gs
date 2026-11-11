/**
 * みんなの御朱印マップ：承認の自動化（スプレッドシートに付けるApps Script）
 *
 * 使い方は docs/セットアップ手順.md を参照。
 * 秘密の値はここに書かず、「スクリプト プロパティ」に保存する（N-09）。
 *   GITHUB_TOKEN  このリポジトリだけを操作できるトークン
 *   GITHUB_REPO   例: goshuin-map/goshuin-map.github.io
 *   SITE_URL      例: https://goshuin-map.github.io/
 *   BULK_FOLDER_ID 一括登録用の写真フォルダ（setup が自動で入れる）
 */

// ---- シート名 ----
var SHEET_REVIEW = '承認';
var SHEET_BULK = '一括登録';
var SHEET_BLOCK = '掲載しない神社';
var SHEET_LOG = 'ログ';

// ---- フォームの質問名（フォームと一字一句同じにする）----
var Q = {
  kind: '投稿の種類', name: '神社名', status: '御朱印の状態', place: '授与場所', fee: '初穂料',
  hours: '受付時間', limited: '限定・季節の御朱印', book: '御朱印帳の授与',
  photo1: '写真1', photo2: '写真2', photo3: '写真3', comment: 'コメント',
  byMode: '投稿者名の表示', nick: 'ニックネーム', visited: '参拝日',
  id: '神社ID', lat: '緯度', lon: '経度', pref: '都道府県コード'
};

var STATUS = { '直書きあり': 'direct', '書き置きのみ': 'paper', '御朱印なし': 'none' };
var BOOK = { 'あり': 'yes', 'なし': 'no', '分からない': 'unknown', '': 'unknown' };

var REVIEW_HEAD = ['承認', '却下', '状態', '受付日時', '種類', '神社名', '御朱印の状態', '写真1', '写真2', '写真3',
  '授与場所', '初穂料', '受付時間', '限定', '御朱印帳', 'コメント', '投稿者名', '参拝日', '地図で見る', 'メモ',
  '神社ID', '緯度', '経度', '都道府県', '投稿ID', '写真ファイルID'];
var BULK_HEAD = ['承認', '状態', '神社ID', '神社名', '緯度', '経度', '都道府県', '御朱印の状態', '授与場所', '初穂料',
  '受付時間', '限定', '御朱印帳', '写真1', '写真2', '写真3', 'コメント', '投稿者名', '参拝日', '投稿ID', 'メモ'];
var BLOCK_HEAD = ['実行', '状態', '操作', '神社ID', '神社名（メモ）', '依頼の内容（メモ）', '投稿ID'];
var BLOCK_OPS = { '掲載停止': 'block', '削除のみ': 'remove', '掲載停止の解除': 'unblock' };

var ST_WAIT = '承認待ち';
var ST_SENT = '送信済み';
var ST_REJECT = '却下';
var ST_ERROR = 'エラー';

// =====================================================================
// 最初に1回だけ実行する
// =====================================================================
function setup() {
  var ss = SpreadsheetApp.getActive();
  makeSheet_(ss, SHEET_REVIEW, REVIEW_HEAD, 2);
  var bulk = makeSheet_(ss, SHEET_BULK, BULK_HEAD, 1);
  var block = makeSheet_(ss, SHEET_BLOCK, BLOCK_HEAD, 1);
  makeSheet_(ss, SHEET_LOG, ['日時', '種類', '内容'], 0);

  // 入力しやすいように、選択肢と チェックボックス を付ける
  var rows = 500;
  bulk.getRange(2, 1, rows, 1).insertCheckboxes();
  bulk.getRange(2, col_(BULK_HEAD, '御朱印の状態'), rows, 1).setDataValidation(list_(Object.keys(STATUS)));
  bulk.getRange(2, col_(BULK_HEAD, '御朱印帳'), rows, 1).setDataValidation(list_(['あり', 'なし', '分からない']));
  bulk.getRange(2, col_(BULK_HEAD, '参拝日'), rows, 1).setNumberFormat('yyyy-mm-dd');
  bulk.getRange(2, col_(BULK_HEAD, '神社ID'), rows, 1).setNumberFormat('@');
  bulk.getRange(2, col_(BULK_HEAD, '都道府県'), rows, 1).setNumberFormat('@');
  block.getRange(2, 1, 200, 1).insertCheckboxes();
  block.getRange(2, col_(BLOCK_HEAD, '操作'), 200, 1).setDataValidation(list_(Object.keys(BLOCK_OPS)));
  block.getRange(2, col_(BLOCK_HEAD, '神社ID'), 200, 1).setNumberFormat('@');

  // 一括登録用の写真フォルダ
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BULK_FOLDER_ID')) {
    var folder = DriveApp.createFolder('御朱印マップ_一括登録の写真');
    props.setProperty('BULK_FOLDER_ID', folder.getId());
  }

  // トリガー（フォーム送信時・編集時）を付け直す
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmitTrigger').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('onEditTrigger').forSpreadsheet(ss).onEdit().create();

  var missing = ['GITHUB_TOKEN', 'GITHUB_REPO', 'SITE_URL'].filter(function (k) { return !props.getProperty(k); });
  log_('設定', 'setup を実行しました' + (missing.length ? '（未設定: ' + missing.join(', ') + '）' : ''));
  SpreadsheetApp.getUi().alert(missing.length
    ? 'シートとトリガーを作りました。\nスクリプト プロパティに次の値を設定してください：\n' + missing.join('\n')
    : '準備ができました。');
}

function makeSheet_(ss, name, head, frozenCols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.setFrozenRows(1);
  if (frozenCols) sh.setFrozenColumns(frozenCols);
  return sh;
}

function list_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function col_(head, name) {
  var i = head.indexOf(name);
  if (i < 0) throw new Error('列がありません: ' + name);
  return i + 1;
}

// =====================================================================
// フォームが送信されたとき：「承認」シートに1行追加する
// =====================================================================
function onFormSubmitTrigger(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var v = function (key) {
      var a = e.namedValues[Q[key]];
      return a && a.length ? String(a[0]).trim() : '';
    };
    var id = v('id');
    var now = new Date();

    // 掲載しない神社への投稿は、承認シートに出さずに自動で却下する（F-75d）
    if (id && blockedIds_().indexOf(id) >= 0) {
      log_('自動却下', '掲載しない神社への投稿: ' + id + ' ' + v('name'));
      return;
    }

    var memo = [];
    if (id && !/^(?:[nwr]\d{1,15}|x\d{8,20})$/.test(id)) memo.push('神社IDの形式が正しくありません');
    var lat = Number(v('lat')), lon = Number(v('lon'));
    if (!(lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154)) memo.push('緯度経度が日本の範囲外です');
    if (!/^\d{1,2}$/.test(v('pref'))) memo.push('都道府県コードがありません');
    if (!STATUS[v('status')]) memo.push('御朱印の状態がありません');

    var fileIds = ['photo1', 'photo2', 'photo3'].map(function (k) { return driveId_(v(k)); }).filter(String);
    var by = v('byMode').indexOf('匿名') >= 0 ? '' : v('nick');
    var sid = newSid_('s', now);
    var site = prop_('SITE_URL', true);
    var mapLink = site && id ? site + '#s=' + encodeURIComponent(id) + '&p=' + pad2_(v('pref'))
      : 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=18/' + lat + '/' + lon;

    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_REVIEW);
    var row = sh.getLastRow() + 1;
    var values = {
      '承認': false, '却下': false, '状態': ST_WAIT, '受付日時': now, '種類': v('kind'), '神社名': v('name'),
      '御朱印の状態': v('status'), '授与場所': v('place'), '初穂料': v('fee'), '受付時間': v('hours'),
      '限定': v('limited'), '御朱印帳': v('book'), 'コメント': v('comment'), '投稿者名': by || '（匿名）',
      '参拝日': v('visited'), '地図で見る': mapLink, 'メモ': memo.join(' / '),
      '神社ID': id, '緯度': lat, '経度': lon, '都道府県': pad2_(v('pref')), '投稿ID': sid, '写真ファイルID': fileIds.join(',')
    };
    var line = REVIEW_HEAD.map(function (h) { return values[h] === undefined ? '' : values[h]; });
    sh.getRange(row, col_(REVIEW_HEAD, '神社ID'), 1, 6).setNumberFormat('@');
    sh.getRange(row, 1, 1, line.length).setValues([line]);
    sh.getRange(row, 1, 1, 2).insertCheckboxes();
    sh.setRowHeight(row, fileIds.length ? 110 : 30);

    // 写真をセルの中に縮小して表示する（F-71）。できなければリンクを入れる
    fileIds.forEach(function (fid, i) {
      var cell = sh.getRange(row, col_(REVIEW_HEAD, '写真1') + i);
      try {
        var blob = thumbnail_(fid, 300);
        var url = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        cell.setValue(SpreadsheetApp.newCellImage().setSourceUrl(url).setAltTextDescription('写真' + (i + 1)).build());
      } catch (err) {
        cell.setFormula('=HYPERLINK("https://drive.google.com/file/d/' + fid + '/view","写真を開く")');
      }
    });
  } catch (err) {
    log_('エラー', 'フォーム送信の処理: ' + err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// チェックが入ったとき
// =====================================================================
function onEditTrigger(e) {
  if (!e || !e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  if (e.range.getValue() !== true) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  var row = e.range.getRow();
  var c = e.range.getColumn();
  if (row < 2) return;

  if (name === SHEET_REVIEW && c === col_(REVIEW_HEAD, '承認')) run_(sh, row, REVIEW_HEAD, c, approveReview_);
  else if (name === SHEET_REVIEW && c === col_(REVIEW_HEAD, '却下')) reject_(sh, row);
  else if (name === SHEET_BULK && c === col_(BULK_HEAD, '承認')) run_(sh, row, BULK_HEAD, c, approveBulk_);
  else if (name === SHEET_BLOCK && c === col_(BLOCK_HEAD, '実行')) run_(sh, row, BLOCK_HEAD, c, sendBlock_);
}

// 共通：ロックをかけ、状態を見て、成功・失敗をシートに書く
function run_(sh, row, head, checkCol, fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var stCell = sh.getRange(row, col_(head, '状態'));
  try {
    var st = String(stCell.getValue());
    if (st === ST_SENT || st === ST_REJECT) return; // 二重送信を防ぐ
    var rec = {};
    var values = sh.getRange(row, 1, 1, head.length).getValues()[0];
    head.forEach(function (h, i) { rec[h] = values[i]; });
    stCell.setValue('送信中…');
    SpreadsheetApp.flush();
    var sid = fn(rec, sh, row);
    if (sid) sh.getRange(row, col_(head, '投稿ID')).setNumberFormat('@').setValue(sid);
    stCell.setValue(ST_SENT);
    sh.getRange(row, 1, 1, head.length).setBackground('#e6f4ea');
  } catch (err) {
    stCell.setValue(ST_ERROR);
    sh.getRange(row, checkCol).setValue(false); // もう一度チェックすればやり直せる
    var memoCol = head.indexOf('メモ');
    if (memoCol >= 0) sh.getRange(row, memoCol + 1).setValue(String(err.message || err));
    log_('エラー', sh.getName() + ' ' + row + '行目: ' + err);
  } finally {
    lock.releaseLock();
  }
}

function reject_(sh, row) {
  var stCell = sh.getRange(row, col_(REVIEW_HEAD, '状態'));
  if (String(stCell.getValue()) === ST_SENT) return;
  stCell.setValue(ST_REJECT);
  sh.getRange(row, col_(REVIEW_HEAD, '承認')).setValue(false);
  sh.getRange(row, 1, 1, REVIEW_HEAD.length).setBackground('#eeeeee');
}

// ---- 「承認」シート ----
function approveReview_(rec) {
  if (rec['却下'] === true) throw new Error('却下にチェックが入っています');
  var sid = String(rec['投稿ID']);
  var item = buildItem_(rec, rec['投稿者名'] === '（匿名）' ? '' : rec['投稿者名']);
  var id = String(rec['神社ID'] || '');
  if (id && blockedIds_().indexOf(id) >= 0) throw new Error('掲載しない神社です');
  var blobs = String(rec['写真ファイルID'] || '').split(',').filter(String).slice(0, 3)
    .map(function (fid) { return safePhoto_(thumbnail_(fid, 1200)); });
  send_(sid, { sid: sid, op: 'upsert', id: id, item: item }, blobs);
}

// ---- 「一括登録」シート（F-76〜F-79）----
function approveBulk_(rec) {
  var sid = String(rec['投稿ID'] || '') || newSid_('b', new Date());
  var item = buildItem_(rec, rec['投稿者名']);
  var folder = DriveApp.getFolderById(prop_('BULK_FOLDER_ID'));
  var blobs = ['写真1', '写真2', '写真3'].map(function (h) { return String(rec[h] || '').trim(); }).filter(String)
    .map(function (fname) {
      var files = folder.getFilesByName(fname);
      if (!files.hasNext()) throw new Error('写真が見つかりません: ' + fname);
      return safePhoto_(thumbnail_(files.next().getId(), 1200));
    });
  send_(sid, { sid: sid, op: 'upsert', id: String(rec['神社ID'] || '').trim(), item: item }, blobs);
  return sid;
}

// ---- 「掲載しない神社」シート（F-75b）----
function sendBlock_(rec) {
  var op = BLOCK_OPS[String(rec['操作'])];
  var id = String(rec['神社ID'] || '').trim();
  if (!op) throw new Error('操作を選んでください');
  if (!/^(?:[nwr]\d{1,15}|x\d{8,20})$/.test(id)) throw new Error('神社IDが正しくありません');
  var sid = newSid_('b', new Date());
  send_(sid, { sid: sid, op: op, id: id }, []);
  return sid;
}

function blockedIds_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_BLOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  var state = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, BLOCK_HEAD.length).getValues().forEach(function (r) {
    if (String(r[1]) !== ST_SENT) return;
    var id = String(r[3]).trim();
    if (r[2] === '掲載停止') state[id] = true;
    if (r[2] === '掲載停止の解除') state[id] = false;
  });
  return Object.keys(state).filter(function (k) { return state[k]; });
}

// シートの1行から、サイトに載せるデータを作る
function buildItem_(rec, by) {
  var status = STATUS[String(rec['御朱印の状態'])];
  if (!status) throw new Error('御朱印の状態が正しくありません');
  var lat = Number(rec['緯度']), lon = Number(rec['経度']);
  if (!(lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154)) throw new Error('緯度経度が正しくありません');
  var pref = pad2_(rec['都道府県']);
  if (!/^\d{2}$/.test(pref) || Number(pref) < 1 || Number(pref) > 47) throw new Error('都道府県コードが正しくありません');
  var name = String(rec['神社名'] || '').trim();
  if (!name) throw new Error('神社名がありません');
  var visited = rec['参拝日'];
  if (visited instanceof Date) visited = Utilities.formatDate(visited, 'Asia/Tokyo', 'yyyy-MM-dd');
  visited = String(visited || '').trim().replace(/\//g, '-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2}).*$/, function (m, y, mo, d) {
    return y + '-' + pad2_(mo) + '-' + pad2_(d);
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visited)) throw new Error('参拝日が正しくありません');
  var book = BOOK[String(rec['御朱印帳'] || '')];
  return {
    pref: pref, name: name, lat: lat, lon: lon, status: status,
    place: String(rec['授与場所'] || ''), fee: String(rec['初穂料'] || ''), hours: String(rec['受付時間'] || ''),
    limited: String(rec['限定'] || ''), book: book || 'unknown', comment: String(rec['コメント'] || ''),
    by: String(by || '').trim() || null, visited: visited
  };
}

// =====================================================================
// 写真
// =====================================================================
// Googleドライブが作り直した縮小画像を取り出す（元の写真のExifは引き継がれない）
function thumbnail_(fileId, size) {
  var token = ScriptApp.getOAuthToken();
  var opt = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  var res = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + size, opt);
  if (res.getResponseCode() !== 200 || String(res.getHeaders()['Content-Type']).indexOf('image/') !== 0) {
    // 別の取り方：Drive APIの thumbnailLink を使う
    var meta = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=thumbnailLink', opt);
    var link = JSON.parse(meta.getContentText()).thumbnailLink;
    if (!link) throw new Error('写真の縮小画像を取得できません（少し待ってからやり直してください）');
    res = UrlFetchApp.fetch(link.replace(/=s\d+$/, '=s' + size), opt);
    if (res.getResponseCode() !== 200) throw new Error('写真の縮小画像を取得できません');
  }
  return res.getBlob();
}

// 念のための確認：Exif や XMP が残っている画像は送らない（位置情報を公開しないため）
function safePhoto_(blob) {
  var type = String(blob.getContentType());
  if (type !== 'image/jpeg' && type !== 'image/png') throw new Error('写真の形式に対応していません: ' + type);
  var bytes = blob.getBytes();
  var n = Math.min(bytes.length, 131072);
  var head = '';
  for (var i = 0; i < n; i += 8192) {
    head += String.fromCharCode.apply(null, bytes.slice(i, Math.min(i + 8192, n)).map(function (b) { return b & 255; }));
  }
  if (head.indexOf('Exif\u0000\u0000') >= 0 || head.indexOf('ns.adobe.com/xap') >= 0 || head.indexOf('eXIf') >= 0) {
    throw new Error('写真に付加情報（Exifなど）が残っています。送信を中止しました');
  }
  return blob;
}

function driveId_(url) {
  var m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

// =====================================================================
// GitHubへ送る：inbox/<投稿ID>/ に写真と submission.json を置く
// =====================================================================
function send_(sid, submission, blobs) {
  var names = [];
  blobs.forEach(function (blob, i) {
    var name = (i + 1) + (blob.getContentType() === 'image/png' ? '.png' : '.jpg');
    putFile_('inbox/' + sid + '/' + name, Utilities.base64Encode(blob.getBytes()), sid + ' 写真' + (i + 1));
    names.push(name);
  });
  submission.photos = names;
  var json = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(submission, null, 2), 'application/json').getBytes());
  putFile_('inbox/' + sid + '/submission.json', json, sid + ' 投稿'); // 最後に置く（処理開始の合図）
}

function putFile_(path, base64, message) {
  var url = 'https://api.github.com/repos/' + prop_('GITHUB_REPO') + '/contents/' + encodeURI(path);
  var headers = {
    Authorization: 'Bearer ' + prop_('GITHUB_TOKEN'),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  var body = {
    message: message,
    content: base64,
    committer: { name: 'goshuin-map', email: 'goshuin-map@users.noreply.github.com' }
  };
  var res = UrlFetchApp.fetch(url, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() === 422 || res.getResponseCode() === 409) {
    // やり直しなどで同じファイルがすでにある場合は、上書きする
    var cur = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
    if (cur.getResponseCode() === 200) {
      body.sha = JSON.parse(cur.getContentText()).sha;
      res = UrlFetchApp.fetch(url, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    }
  }
  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHubに送れませんでした（' + code + '）。トークンの期限と権限を確認してください');
  }
}

// =====================================================================
// 小さな道具
// =====================================================================
function prop_(key, optional) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v && !optional) throw new Error('スクリプト プロパティ ' + key + ' が設定されていません');
  if (key === 'SITE_URL' && v && v.slice(-1) !== '/') v += '/';
  return v;
}

function pad2_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  return s.length === 1 ? '0' + s : s;
}

// 投稿ID：s（フォーム）または b（運営者の操作）＋ 日時14桁。同じ秒に重なったら連番を付ける
function newSid_(prefix, date) {
  var base = prefix + Utilities.formatDate(date, 'Asia/Tokyo', 'yyyyMMddHHmmss');
  var props = PropertiesService.getScriptProperties();
  var last = props.getProperty('LAST_SID') || '';
  var sid = base;
  if (last.indexOf(base) === 0) {
    var n = Number((last.split('-')[1]) || 0) + 1;
    sid = base + '-' + n;
  }
  props.setProperty('LAST_SID', sid);
  return sid;
}

function log_(kind, message) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  if (sh) sh.appendRow([new Date(), kind, String(message)]);
}
