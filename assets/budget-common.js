/*
 * 예산 관리 화면 공용 코드 — 전문교육부(index.html)·포항(pohang/index.html)이 함께 씁니다.
 *
 * 이 파일을 불러오는 페이지는 아래 설정값과 함수를 정의해야 합니다.
 *   SCRIPT_URL       : Apps Script 웹앱 주소
 *   PROGRAM_NAME     : 백업 파일에 기록할 사업 이름
 *   BACKUP_PREFIX    : 백업 파일 이름 앞부분 (예: '전문교육부')
 *   USE_GROUPS       : true면 groups 시트를 읽어 항목을 그룹별로 묶음
 *   DESC_PLACEHOLDER : 집행 내용 입력칸의 예시 문구
 *   renderBody()     : 항목 목록을 그리는 함수
 */

/* ============== 설정 ============== */
const KEY_AUTHOR = 'bm_author_name';
const KEY_PASS = 'bm_passcode';
const AUTO_SYNC_SEC = 60;

/* ============== 상태 ============== */
let groups = [];   // [{id, name, order}] — USE_GROUPS일 때만 채워짐
let items = [];    // [{id, name, budget, group, order}] — 화면 순서대로
let state = {};    // { item_id: [{id, date, desc, amount, author}] }
let open = {}, editing = {};
let author = '';
let passcode = '';
let drag = null;   // { gid, idx }
try { passcode = localStorage.getItem(KEY_PASS) || ''; } catch(e) {}

/* ============== 유틸 ============== */
function fmt(n){ return Math.round(n).toLocaleString('ko-KR')+'원'; }
function pad2(n){ return String(n).padStart(2,'0'); }
function today(){ const d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function normDate(v){
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})\.?$/);
  if (m) return m[1]+'-'+pad2(m[2])+'-'+pad2(m[3]);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function showDate(v){ const n = normDate(v); return /^\d{4}-\d{2}-\d{2}$/.test(n) ? n.replace(/-/g, '.') : n; }
function pct(used,budget){ return budget===0?0:Math.min(Math.round(used/budget*1000)/10,100); }
function sc(used,budget){ const p=pct(used,budget); return p>=100?'over':p>=80?'warn':'ok'; }
function getExecs(id){ return state[id]||[]; }
function getUsed(id){ return getExecs(id).reduce((s,e)=>s+e.amount,0); }
// 그룹을 쓰지 않는 화면은 모든 항목을 한 묶음으로 봄
function groupItems(gid){ return USE_GROUPS ? items.filter(i => i.group === gid) : items.slice(); }
function groupBudget(gid){ return groupItems(gid).reduce((s,i)=>s+i.budget,0); }
function groupUsed(gid){ return groupItems(gid).reduce((s,i)=>s+getUsed(i.id),0); }
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ============== 로딩 UI ============== */
function showLoading(on){
  document.getElementById('loading').classList.toggle('show', on);
  if (on) document.getElementById('sync-dot').className = 'sync-dot loading';
}
function updateSyncStatus(ok, msg){
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (ok) {
    dot.className = 'sync-dot';
    const now = new Date();
    txt.textContent = '마지막 동기화: ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  } else {
    dot.className = 'sync-dot error';
    txt.textContent = '❌ ' + (msg || '동기화 실패');
  }
}

/* ============== 서버 통신 ============== */
function askPasscode(msg){
  const p = prompt(msg || '부서 공용 비밀번호를 입력해 주세요.');
  if (p === null) return false;
  passcode = p.trim();
  try { localStorage.setItem(KEY_PASS, passcode); } catch(e) {}
  return true;
}
async function api(action, params = {}, retried) {
  if (!passcode && !askPasscode()) return { ok: false, error: '비밀번호가 입력되지 않았습니다.' };
  const r = await apiRaw(action, params);
  if (!r.ok && r.error === 'unauthorized' && !retried) {
    if (askPasscode('비밀번호가 맞지 않습니다. 다시 입력해 주세요.')) return api(action, params, true);
    return { ok: false, error: '비밀번호가 맞지 않습니다.' };
  }
  if (!r.ok && r.error === 'unauthorized') r.error = '비밀번호가 맞지 않습니다.';
  return r;
}
async function apiRaw(action, params = {}) {
  const body = JSON.stringify(Object.assign({ action, key: passcode }, params));
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', body: body,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function fetchData() {
  showLoading(true);
  const r = await api('list');
  if (r.ok) {
    items = (r.items || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
    if (USE_GROUPS) {
      groups = (r.groups || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
      // 그룹 목록에 없는 항목은 '미분류'로 모음
      items.forEach(it => {
        if (!groups.some(g => g.id === it.group)) {
          const gid = it.group || '_none';
          it.group = gid;
          if (!groups.some(g => g.id === gid)) groups.push({ id: gid, name: '미분류', order: 9999 });
        }
      });
    }
    state = {};
    (r.executions || []).forEach(e => {
      if (!state[e.item_id]) state[e.item_id] = [];
      state[e.item_id].push({ id: e.exec_id, date: normDate(e.date), desc: e.desc, amount: e.amount, author: e.author || '' });
    });
    // 각 항목의 집행 내역 날짜순 정렬
    Object.keys(state).forEach(k => state[k].sort((a,b) => a.date.localeCompare(b.date)));
    render();
    updateSyncStatus(true);
  } else {
    updateSyncStatus(false, r.error);
    alert('데이터를 불러올 수 없습니다.\n\n' + r.error + '\n\n새로고침 버튼을 다시 눌러보세요.');
  }
  showLoading(false);
}

/* ============== 작성자 ============== */
function initAuthor() {
  try { author = localStorage.getItem(KEY_AUTHOR) || ''; } catch(e) {}
  if (!author) changeAuthor(true);
  else document.getElementById('author-display').textContent = author;
}
function changeAuthor(isInitial) {
  const name = prompt(
    isInitial ? '본인 이름을 입력해 주세요.\n(집행 내역을 입력할 때 작성자로 기록됩니다)' : '작성자 이름을 변경합니다. 새 이름:',
    author || ''
  );
  if (name && name.trim()) {
    author = name.trim();
    try { localStorage.setItem(KEY_AUTHOR, author); } catch(e) {}
  } else if (isInitial) {
    author = '익명';
  }
  document.getElementById('author-display').textContent = author;
}

/* ============== 집행 내역 추가·수정·삭제 ============== */
async function addExec(id, ev){
  ev.stopPropagation();
  const dEl=document.getElementById('d_'+id), descEl=document.getElementById('desc_'+id), aEl=document.getElementById('amt_'+id);
  const date=dEl.value, desc=descEl.value.trim(), amount=parseInt(aEl.value);
  if(!date||!desc||!amount||amount<=0){ alert('날짜, 내용, 금액을 모두 입력하세요.'); return; }
  showLoading(true);
  const r = await api('add_exec', { item_id: id, date, desc, amount, author });
  if (r.ok) { descEl.value=''; aEl.value=''; await fetchData(); }
  else { showLoading(false); updateSyncStatus(false, r.error); alert('저장 실패: ' + r.error); }
}
async function delExec(itemId, execId, ev){
  ev.stopPropagation();
  if(!confirm('이 집행 내역을 삭제하시겠습니까?\n모든 부서원 화면에서 사라집니다.')) return;
  showLoading(true);
  const r = await api('delete_exec', { exec_id: execId });
  if (r.ok) await fetchData();
  else { showLoading(false); updateSyncStatus(false, r.error); alert('삭제 실패: ' + r.error); }
}
function startEdit(itemId, execId, ev){ ev.stopPropagation(); editing[itemId]=execId; render(); }
function cancelEdit(itemId, ev){ ev.stopPropagation(); delete editing[itemId]; render(); }
async function saveEdit(itemId, execId, ev){
  ev.stopPropagation();
  const dEl=document.getElementById('ed_'+execId), descEl=document.getElementById('edesc_'+execId), aEl=document.getElementById('eamt_'+execId);
  const date=dEl.value, desc=descEl.value.trim(), amount=parseInt(aEl.value);
  if(!date||!desc||!amount||amount<=0){ alert('날짜, 내용, 금액을 모두 입력하세요.'); return; }
  showLoading(true);
  const r = await api('update_exec', { exec_id: execId, date, desc, amount });
  if (r.ok) { delete editing[itemId]; await fetchData(); }
  else { showLoading(false); updateSyncStatus(false, r.error); alert('수정 실패: ' + r.error); }
}
function toggle(id){ open[id]=!open[id]; render(); }

/* ============== 항목 드래그 (같은 그룹 안에서만, 순서 서버 저장) ============== */
function onItemDragStart(gid, idx, ev){
  drag = { gid, idx };
  ev.dataTransfer.effectAllowed = 'move';
  try{ ev.dataTransfer.setData('text/plain', String(idx)); }catch(e){}
  ev.stopPropagation();
  const card = ev.currentTarget.closest('.item-card');
  if (card) card.classList.add('dragging');
}
function onItemDragEnd(){
  document.querySelectorAll('.item-card.dragging, .item-card.drag-over').forEach(el => el.classList.remove('dragging','drag-over'));
  drag = null;
}
function onItemDragOver(gid, ev){ if (!drag || drag.gid !== gid) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
function onItemDragEnter(gid, idx, ev){ if (!drag || drag.gid !== gid || drag.idx === idx) return; ev.currentTarget.classList.add('drag-over'); }
function onItemDragLeave(ev){ const t = ev.currentTarget, r = ev.relatedTarget; if (!r || !t.contains(r)) t.classList.remove('drag-over'); }
async function onItemDrop(gid, toIdx, ev){
  ev.preventDefault(); ev.stopPropagation();
  ev.currentTarget.classList.remove('drag-over');
  if (!drag || drag.gid !== gid || drag.idx === toIdx) { drag = null; return; }
  const list = groupItems(gid);
  const [moved] = list.splice(drag.idx, 1);
  list.splice(toIdx, 0, moved);
  drag = null;
  items = USE_GROUPS ? groups.flatMap(g => g.id === gid ? list : groupItems(g.id)) : list;
  items.forEach((it, i) => { it.order = i + 1; });
  render();
  showLoading(true);
  const r = await api('reorder', { order: items.map(i => i.id) });
  showLoading(false);
  if (r.ok) updateSyncStatus(true);
  else {
    updateSyncStatus(false, r.error);
    alert('순서 저장 실패: ' + r.error + '\n\n서버의 순서로 되돌립니다.');
    await fetchData();
  }
}

/* ============== 백업 ============== */
function exportBackup(){
  if (!items.length) { alert('아직 데이터가 로드되지 않았습니다.'); return; }
  const totalBudget = items.reduce((s,i)=>s+i.budget,0);
  const totalUsed = items.reduce((s,i)=>s+getUsed(i.id),0);
  const payload = {
    program: PROGRAM_NAME, fiscal_year: 2026,
    exported_at: new Date().toISOString(), exported_by: author, version: 'cloud-1',
    total_budget: totalBudget, total_used: totalUsed, total_remaining: totalBudget - totalUsed,
  };
  if (USE_GROUPS) {
    payload.groups = groups.map(g => ({ id: g.id, name: g.name, budget: groupBudget(g.id), used: groupUsed(g.id), remaining: groupBudget(g.id) - groupUsed(g.id) }));
    payload.items = items.map(i => ({ id: i.id, name: i.name, group_id: i.group,
      group_name: (groups.find(g => g.id === i.group) || {}).name || '',
      budget: i.budget, used: getUsed(i.id), remaining: i.budget - getUsed(i.id) }));
  } else {
    payload.items = items.map(i => ({ id: i.id, name: i.name, budget: i.budget,
      used: getUsed(i.id), remaining: i.budget - getUsed(i.id) }));
  }
  payload.executions = state;
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = BACKUP_PREFIX + '_예산_백업_' + today() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============== 렌더 ============== */
function renderSummary(){
  const totalBudget = items.reduce((s,i)=>s+i.budget,0);
  const totalUsed = items.reduce((s,i)=>s+getUsed(i.id),0);
  const remaining = totalBudget - totalUsed;
  const p = pct(totalUsed, totalBudget);
  document.getElementById('summary').innerHTML = `
    <div class="metric"><div class="metric-label">총 예산</div><div class="metric-value">${fmt(totalBudget)}</div></div>
    <div class="metric"><div class="metric-label">집행액 (${p}%)</div><div class="metric-value ${p>=100?'danger':''}">${fmt(totalUsed)}</div></div>
    <div class="metric"><div class="metric-label">잔액</div><div class="metric-value ${remaining<0?'danger':'success'}">${fmt(remaining)}</div></div>`;
}

// 항목 한 줄(펼치면 집행 내역과 추가 입력칸)을 그림
function renderItemCard(item, idx, gid){
  const execs = getExecs(item.id);
  const used = getUsed(item.id);
  const remaining = item.budget - used;
  const p = pct(used, item.budget);
  const cls = sc(used, item.budget);
  const isOpen = open[item.id];
  const editingId = editing[item.id];

  const execRows = execs.map(e => {
    if (editingId === e.id) {
      return `<div class="edit-full-row">
        <input type="date"   id="ed_${e.id}"    value="${esc(e.date)}"/>
        <input type="text"   id="edesc_${e.id}" value="${esc(e.desc)}"/>
        <input type="number" id="eamt_${e.id}"  value="${e.amount}" min="0"/>
        <div class="ph">${esc(e.author || '')}</div>
        <div class="exec-actions">
          <button class="btn-act btn-save"   onclick="saveEdit('${item.id}',${e.id},event)">저장</button>
          <button class="btn-act btn-cancel" onclick="cancelEdit('${item.id}',event)">취소</button>
        </div>
      </div>`;
    }
    return `<div class="exec-row">
      <div class="exec-date">${esc(showDate(e.date))}</div>
      <div class="exec-desc">${esc(e.desc)}</div>
      <div class="exec-amt">${fmt(e.amount)}</div>
      <div class="exec-author">${esc(e.author || '')}</div>
      <div class="exec-actions">
        <button class="btn-act btn-edit" onclick="startEdit('${item.id}',${e.id},event)">수정</button>
        <button class="btn-act btn-del"  onclick="delExec('${item.id}',${e.id},event)">삭제</button>
      </div>
    </div>`;
  }).join('');

  return `<div class="item-card"
      ondragover="onItemDragOver('${gid}',event)"
      ondragenter="onItemDragEnter('${gid}',${idx},event)"
      ondragleave="onItemDragLeave(event)"
      ondrop="onItemDrop('${gid}',${idx},event)">
    <div class="item-row row-grid" onclick="toggle('${item.id}')">
      <div class="item-drag-handle" draggable="true"
           ondragstart="onItemDragStart('${gid}',${idx},event)"
           ondragend="onItemDragEnd(event)"
           onclick="event.stopPropagation()" title="드래그하여 항목 순서 변경${USE_GROUPS ? ' (같은 그룹 안)' : ''}">⋮⋮</div>
      <div class="cell name" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="cell r">${fmt(item.budget)}</div>
      <div class="cell r">${fmt(used)}</div>
      <div class="cell r ${cls}">${fmt(remaining)}</div>
      <div class="bar-cell">
        <div class="bar-stack"><div class="bar-fill ${cls}" style="width:${Math.min(p,100)}%"></div></div>
        <div class="bar-pct">${p}%</div>
      </div>
      <div class="arrow ${isOpen?'open':''}">▼</div>
    </div>
    ${isOpen ? `<div class="item-body" onclick="event.stopPropagation()">
      ${execs.length === 0 ? `<div class="empty-note">집행 내역이 없습니다.</div>` : `
      <div>
        <div class="exec-list-header">
          <div>날짜</div><div>내용</div><div class="r">금액</div><div class="c">작성자</div><div class="c">관리</div>
        </div>
        ${execRows}
      </div>`}
      <div class="add-form-card">
        <div class="add-form-title">+ 새 집행 내역 추가</div>
        <div class="add-form-grid">
          <div class="field-group"><label class="field-label">날짜</label><input type="date" id="d_${item.id}" value="${today()}" onclick="event.stopPropagation()"/></div>
          <div class="field-group"><label class="field-label">집행 내용</label><input type="text" id="desc_${item.id}" placeholder="${esc(DESC_PLACEHOLDER)}" onclick="event.stopPropagation()"/></div>
          <div class="field-group"><label class="field-label">금액 (원)</label><input type="number" id="amt_${item.id}" placeholder="0" min="0" onclick="event.stopPropagation()"/></div>
        </div>
        <div class="add-form-btn-row"><button class="add-btn" onclick="addExec('${item.id}',event)">+ 추가</button></div>
      </div>
    </div>` : ''}
  </div>`;
}

function render(){ renderSummary(); renderBody(); }

/* ============== 시작 ============== */
function startApp(){
  // 입력 중이거나 편집·드래그 중일 때는 자동 동기화를 건너뜀
  setInterval(() => {
    if (Object.keys(editing).length > 0 || drag) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    fetchData();
  }, AUTO_SYNC_SEC * 1000);
  initAuthor();
  fetchData();
}
