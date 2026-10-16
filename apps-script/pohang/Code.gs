/**
 * 포항혁신지구 지원사업 예산관리 - Google Apps Script 백엔드
 * 이 코드는 예산 시트에서 [확장 프로그램 → Apps Script]로 연 편집기에 붙여넣습니다.
 * 그렇게 열면 시트와 자동으로 연결되므로 시트 ID를 따로 넣을 필요가 없습니다.
 */

// 비워 두면 이 코드가 붙어 있는 시트를 사용합니다.
const SHEET_ID = '';

// 부서 공용 비밀번호 — 전문교육부 사이트와 같은 비밀번호를 넣으세요.
// (GitHub 저장소에는 절대 실제 비밀번호를 올리지 마세요)
const PASSCODE = '여기에_비밀번호_입력';

const GROUPS_SHEET = 'groups';
const ITEMS_SHEET = 'items';
const EXECS_SHEET = 'executions';

/* ========== 최초 1회: 권한 승인 및 연결 확인용 ========== */
function setup() {
  const r = handleList(getSS());
  Logger.log('그룹 %s개, 항목 %s개, 집행 내역 %s건',
    r.groups.length, r.items.length, r.executions.length);
}

function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* ========== 요청 진입점 ========== */
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    let params = (e && e.parameter) ? Object.assign({}, e.parameter) : {};
    if (e && e.postData && e.postData.contents) {
      try { Object.assign(params, JSON.parse(e.postData.contents)); } catch (err) {}
    }

    if (String(params.key || '') !== PASSCODE) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }

    const action = params.action || 'list';
    const ss = getSS();

    let result;
    switch (action) {
      case 'list':         result = handleList(ss); break;
      case 'add_exec':     result = handleAddExec(ss, params); break;
      case 'update_exec':  result = handleUpdateExec(ss, params); break;
      case 'delete_exec':  result = handleDeleteExec(ss, params); break;
      case 'reorder':      result = handleReorder(ss, params); break;
      default: result = { ok: false, error: 'unknown action: ' + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========== 표 읽기 (첫 행을 열 이름으로 사용) ========== */
function readTable(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(h => String(h).trim());
  return values.slice(1).map(row => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = row[i]; });
    return o;
  });
}

/* ========== 조회 ========== */
function handleList(ss) {
  const groups = readTable(ss.getSheetByName(GROUPS_SHEET))
    .filter(g => String(g.id || '').trim())
    .map(g => ({
      id: String(g.id).trim(),
      name: String(g.name || '').trim(),
      order: Number(g.order) || 0,
    }));

  const items = readTable(ss.getSheetByName(ITEMS_SHEET))
    .filter(it => String(it.id || '').trim().indexOf('item') === 0)
    .map(it => ({
      id: String(it.id).trim(),
      name: String(it.name || '').trim(),
      budget: Number(it.budget) || 0,
      group: String(it.group || '').trim(),
      order: Number(it.order) || 0,
    }));

  const executions = [];
  const execsData = ss.getSheetByName(EXECS_SHEET).getDataRange().getValues();
  for (let i = 1; i < execsData.length; i++) {
    const row = execsData[i];
    if (!row[0] || !row[1]) continue;
    executions.push({
      exec_id: Number(row[0]),
      item_id: String(row[1]).trim(),
      date: formatDate(row[2]),
      desc: String(row[3] || ''),
      amount: Number(row[4]) || 0,
      author: String(row[5] || ''),
    });
  }

  return { ok: true, groups: groups, items: items, executions: executions,
           server_time: new Date().toISOString() };
}

function formatDate(v) {
  if (v === null || v === undefined || v === '') return '';
  let d = null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    d = v;
  } else {
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})\.?$/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    const t = new Date(s);
    if (isNaN(t.getTime())) return s;
    d = t;
  }
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

/* ========== 집행 내역 추가 ========== */
function handleAddExec(ss, p) {
  if (!p.item_id || !p.date || !p.amount) {
    return { ok: false, error: 'item_id, date, amount는 필수입니다.' };
  }
  const sheet = ss.getSheetByName(EXECS_SHEET);
  const exec_id = Date.now();
  sheet.appendRow([
    exec_id,
    String(p.item_id).trim(),
    String(p.date),
    String(p.desc || ''),
    Number(p.amount) || 0,
    String(p.author || ''),
  ]);
  return { ok: true, exec_id: exec_id };
}

/* ========== 집행 내역 수정 ========== */
function handleUpdateExec(ss, p) {
  const sheet = ss.getSheetByName(EXECS_SHEET);
  const data = sheet.getDataRange().getValues();
  const target = Number(p.exec_id);
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === target) {
      const r = i + 1;
      if (p.date   !== undefined) sheet.getRange(r, 3).setValue(String(p.date));
      if (p.desc   !== undefined) sheet.getRange(r, 4).setValue(String(p.desc));
      if (p.amount !== undefined) sheet.getRange(r, 5).setValue(Number(p.amount) || 0);
      if (p.author !== undefined) sheet.getRange(r, 6).setValue(String(p.author));
      return { ok: true };
    }
  }
  return { ok: false, error: 'exec_id not found: ' + target };
}

/* ========== 항목 순서 저장 ========== */
function handleReorder(ss, p) {
  let order = p.order;
  if (typeof order === 'string') {
    try { order = JSON.parse(order); } catch (e) { order = order.split(','); }
  }
  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: 'order 배열이 필요합니다.' };
  }
  const rank = {};
  order.forEach((id, i) => { rank[String(id).trim()] = i + 1; });

  const sheet = ss.getSheetByName(ITEMS_SHEET);
  const values = sheet.getDataRange().getValues();
  const head = values[0].map(h => String(h).trim());
  const idCol = head.indexOf('id');
  const orderCol = head.indexOf('order');
  if (idCol < 0 || orderCol < 0) return { ok: false, error: 'items 시트에 id/order 열이 없습니다.' };
  if (values.length < 2) return { ok: false, error: 'items 시트가 비어 있습니다.' };

  const next = values.slice(1).map(row => {
    const id = String(row[idCol]).trim();
    return [rank[id] !== undefined ? rank[id] : row[orderCol]];
  });
  sheet.getRange(2, orderCol + 1, next.length, 1).setValues(next);
  return { ok: true };
}

/* ========== 집행 내역 삭제 ========== */
function handleDeleteExec(ss, p) {
  const sheet = ss.getSheetByName(EXECS_SHEET);
  const data = sheet.getDataRange().getValues();
  const target = Number(p.exec_id);
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === target) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'exec_id not found: ' + target };
}
