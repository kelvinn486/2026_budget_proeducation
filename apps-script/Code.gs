/**
 * 전문교육부 예산관리 - Google Apps Script 백엔드
 * 시트: 전문교육부_예산관리_공용DB
 */

const SHEET_ID = '여기에_시트_ID_입력';

// 부서 공용 비밀번호 — Apps Script 편집기에서만 실제 값으로 바꾸세요.
// (GitHub 저장소에는 절대 실제 비밀번호를 올리지 마세요)
const PASSCODE = '여기에_비밀번호_입력';
const ITEMS_SHEET = 'items';
const EXECS_SHEET = 'executions';

/* ========== 요청 진입점 ========== */
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    let params = (e && e.parameter) ? Object.assign({}, e.parameter) : {};
    if (e && e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        Object.assign(params, body);
      } catch (err) { /* ignore, use e.parameter */ }
    }

    if (String(params.key || '') !== PASSCODE) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }

    const action = params.action || 'list';
    const ss = SpreadsheetApp.openById(SHEET_ID);

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

/* ========== 조회 (전체 데이터 반환) ========== */
function handleList(ss) {
  const itemsSheet = ss.getSheetByName(ITEMS_SHEET);
  const execsSheet = ss.getSheetByName(EXECS_SHEET);

  // items
  const itemsData = itemsSheet.getDataRange().getValues();
  const items = itemsData.slice(1)
    .filter(row => row[0] && String(row[0]).trim() !== '합계')
    .map(row => ({
      id: String(row[0]).trim(),
      name: String(row[1] || '').trim(),
      budget: Number(row[2]) || 0,
      order: Number(row[3]) || 0,
    }))
    .filter(it => it.id.indexOf('item') === 0);

  // executions
  const executions = [];
  const execsData = execsSheet.getDataRange().getValues();
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

  return { ok: true, items: items, executions: executions, server_time: new Date().toISOString() };
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
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'items 시트가 비어 있습니다.' };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const current = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  const next = ids.map((row, i) => {
    const id = String(row[0]).trim();
    return [rank[id] !== undefined ? rank[id] : current[i][0]];
  });
  sheet.getRange(2, 4, next.length, 1).setValues(next);
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
