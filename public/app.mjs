import { apiRequest } from '/api.mjs';
import { MEDAL_IMG, PRIVILEGES, SERIES } from '/catalog.mjs';

let CLASS_LIST = {};
const cache = { records:[], rewards:[] };
let curClass = '701';
let curTab = 'register';
let curFlag = 'miss';
let pendingDraw = null;
let ready = false;
let refreshing = null;
const busy = new Set();

const records = () => cache.records;
const boxes = () => cache.rewards;
const giftBox = document.getElementById('gift-box');
const giftWrap = document.getElementById('gift-wrap');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char]);
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setStatus(message = '', type = '') {
  const element = document.getElementById('app-status');
  element.textContent = message;
  element.className = `notice${type ? ` ${type}` : ''}${message ? '' : ' hidden'}`;
}

function showError(error) {
  setStatus(error.message || '操作失败，请稍后重试。', 'error');
}

function assignName() {
  return document.getElementById('reg-assign').value.trim() || '(未命名作业)';
}

function getRec(date, assign, cls, name) {
  return records().find(record => record.date === date && record.assign === assign && record.cls === cls && record.name === name) || null;
}

function operationKey(parts) {
  return JSON.stringify(parts);
}

function replaceRecord(saved) {
  const index = cache.records.findIndex(record => record.id === saved.id || (
    record.date === saved.date && record.assign === saved.assign && record.cls === saved.cls && record.name === saved.name
  ));
  if (index >= 0) cache.records[index] = saved;
  else cache.records.push(saved);
}

function rewardTheme(reward) {
  if (reward.kind === 'priv') return 'priv';
  return SERIES.find(series => series.name === reward.series)?.theme || 'cute';
}

async function refreshBootstrap({ silent = false } = {}) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (!silent) setStatus('正在加载服务端数据…');
      const data = await apiRequest('/api/bootstrap');
      CLASS_LIST = data.classList;
      cache.records = data.records;
      cache.rewards = data.rewards;
      if (!Object.hasOwn(CLASS_LIST, curClass)) curClass = Object.keys(CLASS_LIST)[0];
      ready = true;
      document.getElementById('app-main').classList.remove('hidden');
      renderCurrentTab();
      setStatus();
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function renderCurrentTab() {
  if (!ready) return;
  if (curTab === 'register') renderRegister();
  else if (curTab === 'points') renderPoints();
  else if (curTab === 'follow') renderFollow();
  else if (curTab === 'report') renderReport();
}

function assignOfDate(date, cls) {
  const assignments = records().filter(record => record.date === date && record.cls === cls);
  const unique = [...new Set(assignments.map(record => record.assign))];
  return unique.length ? unique[0] : null;
}

function applyDateAssign() {
  const date = document.getElementById('reg-date').value || today();
  const assignment = assignOfDate(date, curClass);
  document.getElementById('reg-assign').value = assignment ?? '';
}

function onDateChange() {
  applyDateAssign();
  renderRegister();
}

function switchTab(tab) {
  curTab = tab;
  ['register', 'points', 'follow', 'report'].forEach(name => {
    document.getElementById(`view-${name}`).classList.toggle('hidden', name !== tab);
    document.getElementById(`tab-${name}`).classList.toggle('active', name === tab);
  });
  renderCurrentTab();
}

function switchClass(cls) {
  curClass = cls;
  Object.keys(CLASS_LIST).forEach(name => document.getElementById(`cls-${name}`).classList.toggle('active', name === cls));
  if (curTab === 'register') applyDateAssign();
  renderCurrentTab();
}

function setCur(flag) {
  curFlag = flag;
  ['miss', 'redo', 'star'].forEach(name => document.getElementById(`btn-${name}`).classList.toggle('active', name === flag));
}

function renderRegister() {
  const date = document.getElementById('reg-date').value || today();
  const assign = assignName();
  const grid = document.getElementById('reg-grid');
  grid.innerHTML = '';
  const counts = { miss:0, redo:0, star:0 };
  (CLASS_LIST[curClass] || []).forEach((name, index) => {
    const record = getRec(date, assign, curClass, name);
    const status = record?.status || 'pass';
    if (counts[status] !== undefined) counts[status]++;
    const labels = { pass:'合格', miss:'未交', redo:'二次批改', star:'特别好' };
    const key = operationKey(['record', date, assign, curClass, name]);
    const card = document.createElement('div');
    card.className = `stu ${status === 'pass' ? '' : status}${record?.note ? ' has-note' : ''}${busy.has(key) ? ' busy' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-disabled', String(busy.has(key)));
    card.innerHTML = `<button class="pen" title="备注" ${busy.has(key) ? 'disabled' : ''}>注</button><div class="nm">${index + 1}. ${escapeHtml(name)}</div><div class="mk">${labels[status]}</div>`;
    card.onclick = () => { if (!busy.has(key)) toggle(name); };
    card.onkeydown = event => {
      if ((event.key === 'Enter' || event.key === ' ') && !busy.has(key)) {
        event.preventDefault();
        toggle(name);
      }
    };
    card.querySelector('.pen').onclick = event => {
      event.stopPropagation();
      if (!busy.has(key)) editNote(name);
    };
    grid.appendChild(card);
  });
  const total = (CLASS_LIST[curClass] || []).length;
  document.getElementById('reg-tip').textContent = `合格 ${total - counts.miss - counts.redo} ｜ 二次批改 ${counts.redo} ｜ 未交 ${counts.miss} ｜ 特别好 ${counts.star}`;
}

async function saveRecord(input, key) {
  busy.add(key);
  renderRegister();
  try {
    const data = await apiRequest('/api/records', { method:'PUT', body:JSON.stringify(input) });
    replaceRecord(data.record);
    setStatus('已保存到服务端。', 'success');
  } catch (error) {
    showError(error);
  } finally {
    busy.delete(key);
    renderRegister();
  }
}

function toggle(name) {
  const date = document.getElementById('reg-date').value || today();
  const assign = assignName();
  const record = getRec(date, assign, curClass, name);
  const status = record?.status === curFlag ? 'pass' : curFlag;
  const key = operationKey(['record', date, assign, curClass, name]);
  return saveRecord({ date, assign, cls:curClass, name, status, note:record?.note || '' }, key);
}

function editNote(name) {
  const date = document.getElementById('reg-date').value || today();
  const assign = assignName();
  const record = getRec(date, assign, curClass, name);
  if (!record) {
    alert('请先标记该生状态，再写备注。');
    return;
  }
  const value = prompt('备注（找过谁 / 面谈情况）：', record.note || '');
  if (value === null) return;
  const key = operationKey(['record', date, assign, curClass, name]);
  return saveRecord({ date, assign, cls:curClass, name, status:record.status, note:value }, key);
}

async function saveRegister() {
  const key = 'finalize';
  if (busy.has(key)) return;
  const input = {
    date:document.getElementById('reg-date').value || today(),
    assign:assignName(), cls:curClass,
  };
  busy.add(key);
  document.getElementById('save-register').disabled = true;
  try {
    const data = await apiRequest('/api/registrations/finalize', { method:'POST', body:JSON.stringify(input) });
    cache.records = cache.records.filter(record => !(record.date === input.date && record.assign === input.assign && record.cls === input.cls));
    cache.records.push(...data.records);
    renderRegister();
    document.getElementById('reg-tip').textContent = `已保存（共 ${CLASS_LIST[input.cls].length} 名，未标记记合格 +1 分）`;
    setStatus('本次登记已保存到服务端。', 'success');
  } catch (error) {
    showError(error);
  } finally {
    busy.delete(key);
    document.getElementById('save-register').disabled = false;
  }
}

function studentPoints(cls, name) {
  const result = { ok:0, miss:0, redo:0, star:0, earned:0, redeemed:0, left:0 };
  records().filter(record => record.cls === cls && record.name === name).forEach(record => {
    if (record.status === 'miss') { result.miss++; return; }
    if (record.status === 'redo') { result.redo++; return; }
    result.ok++;
    result.earned += record.status === 'star' ? 3 : 1;
    if (record.status === 'star') result.star++;
  });
  result.redeemed = boxes().filter(reward => reward.cls === cls && reward.name === name).length;
  result.left = result.earned - result.redeemed * 10;
  return result;
}

function renderPoints() {
  document.getElementById('series-list').innerHTML = SERIES.map(series =>
    `<span class="series-chip" style="border-color:${series.hue};color:${series.hue}">${escapeHtml(series.name)}（${series.cards.length} 款）</span>`
  ).join('') + `<span class="series-chip" style="border-color:#e879a6;color:#e879a6">体验特权（${PRIVILEGES.length} 项）</span>`;
  const list = (CLASS_LIST[curClass] || []).map(name => ({ name, points:studentPoints(curClass, name) }));
  list.sort((a, b) => b.points.left - a.points.left);
  const container = document.getElementById('rank-list');
  container.innerHTML = '';
  list.forEach((item, index) => {
    const rewards = boxes().filter(reward => reward.cls === curClass && reward.name === item.name);
    const lootHtml = rewards.length ? `<div class="loot">${rewards.map(reward => {
      const title = `${reward.kind === 'priv' ? '特权：' : '收藏卡：'}${reward.card}（${reward.date}）`;
      return `<div class="chip" title="${escapeHtml(title)}"><img src="${escapeHtml(reward.img || MEDAL_IMG)}" alt="${escapeHtml(reward.card)}"></div>`;
    }).join('')}</div>` : '';
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `<div class="idx">${index + 1}</div><div class="who"><b>${escapeHtml(item.name)}</b> <span class="muted">合格 ${item.points.ok} ｜ 未交 ${item.points.miss} ｜ 二次批改 ${item.points.redo} ｜ 特别好 ${item.points.star} ｜ 已得 ${item.points.redeemed} 件</span>${lootHtml}</div><div class="pts">可用 ${item.points.left} 分</div>`;
    const button = document.createElement('button');
    button.className = `btn${item.points.left >= 10 ? ' gold' : ''}`;
    button.textContent = item.points.left >= 10 ? '抽卡' : '未满10分';
    button.disabled = item.points.left < 10 || Boolean(pendingDraw?.inFlight);
    if (item.points.left >= 10) button.onclick = () => draw(curClass, item.name);
    row.appendChild(button);
    container.appendChild(row);
  });
}

function draw(cls, name) {
  if (studentPoints(cls, name).left < 10) {
    alert('积分未满 10 分，暂不能抽卡。');
    return;
  }
  pendingDraw = { cls, name, requestId:crypto.randomUUID(), inFlight:null };
  document.getElementById('modal-student').textContent = `${name} 的奖励卡片`;
  document.getElementById('draw-status').textContent = '点击盒子，服务端将验分并抽取奖励。';
  const stage = document.getElementById('card-stage');
  giftWrap.style.display = 'flex';
  giftBox.classList.remove('open');
  giftBox.dataset.busy = '';
  stage.className = 'card-stage';
  stage.style.display = 'none';
  stage.querySelector('.card-back').style.display = 'flex';
  document.getElementById('modal-close').classList.add('hidden');
  document.getElementById('modal-mask').classList.remove('hidden');
  renderPoints();
}

function fireOpen() {
  if (!pendingDraw || giftBox.dataset.busy) return;
  giftBox.dataset.busy = '1';
  openBox();
}

function showCard(card) {
  giftBox.classList.add('open');
  const burst = document.getElementById('burst');
  burst.classList.remove('on');
  void burst.offsetWidth;
  burst.classList.add('on');
  setTimeout(() => {
    giftWrap.style.display = 'none';
    const stage = document.getElementById('card-stage');
    const front = document.getElementById('card-front');
    const glow = card.rar === 'UR' ? 'glow-UR' : (card.rar === 'SSR' || card.rar === 'PS') ? 'glow-SSR' : '';
    const rarityLabel = card.kind === 'priv' ? (card.rar === 'PS' ? '稀有特权' : '特权券') : `${card.rar} 卡`;
    const subtitle = card.kind === 'priv' ? '课堂体验特权' : `${card.series} 系列`;
    front.className = `card-front theme-${rewardTheme(card)} r-${card.rar}${glow ? ` ${glow}` : ''}`;
    front.innerHTML = `<div class="frame"></div><span class="rarity r-${card.rar}">${escapeHtml(rarityLabel)}</span><div class="art"><img src="${escapeHtml(card.img)}" alt="${escapeHtml(card.card)}"></div><div class="card-name">${escapeHtml(card.card)}</div><div class="card-series">${escapeHtml(subtitle)}</div><div class="cno">No.${escapeHtml(card.no)}</div><div class="shine"></div>`;
    stage.querySelector('.card-back').style.display = 'none';
    stage.style.display = 'block';
    stage.classList.add('deal');
    document.getElementById('draw-status').textContent = '奖励已保存到服务端。';
    document.getElementById('modal-close').classList.remove('hidden');
    setTimeout(() => { stage.classList.remove('deal'); stage.classList.add('sway'); }, 620);
  }, 460);
}

function openBox() {
  const info = pendingDraw;
  if (!info || info.inFlight) return info?.inFlight;
  info.inFlight = (async () => {
    try {
      const data = await apiRequest('/api/draws', {
        method:'POST',
        body:JSON.stringify({ cls:info.cls, name:info.name, clientRequestId:info.requestId }),
      });
      if (!cache.rewards.some(reward => reward.id === data.reward.id)) cache.rewards.push(data.reward);
      renderPoints();
      showCard(data.reward);
      setStatus('抽卡结果已保存到服务端。', 'success');
    } catch (error) {
      document.getElementById('draw-status').textContent = `${error.message} 可再次点击重试，本次请求标识不变。`;
      giftBox.dataset.busy = '';
      showError(error);
    } finally {
      info.inFlight = null;
    }
  })();
  return info.inFlight;
}

function closeModal() {
  document.getElementById('modal-mask').classList.add('hidden');
  pendingDraw = null;
  renderPoints();
}

function createFollowItem(record, type) {
  const element = document.createElement('div');
  element.className = 'list-item';
  const title = type === 'redo' ? '二次批改' : '未交';
  element.innerHTML = `<div class="info"><b>${escapeHtml(record.name)}</b> <span class="tag ${type === 'redo' ? 't-bad' : 't-miss'}">${title}</span><br><span class="muted">${escapeHtml(record.date)} ｜ ${escapeHtml(record.assign)}</span>${record.note ? `<br><span class="small">备注：${escapeHtml(record.note)}</span>` : ''}</div>`;
  const doneButton = document.createElement('button');
  doneButton.className = 'btn blue';
  doneButton.textContent = type === 'redo' ? '已补交 / 二次完成' : '当日已补交';
  doneButton.disabled = busy.has(record.id);
  doneButton.onclick = () => doneRec(record.id);
  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn';
  deleteButton.textContent = '删除';
  deleteButton.disabled = busy.has(record.id);
  deleteButton.onclick = () => delRec(record.id);
  element.append(doneButton, deleteButton);
  return element;
}

function renderFollow() {
  const classRecords = records().filter(record => record.cls === curClass);
  ['redo', 'miss'].forEach(type => {
    const items = classRecords.filter(record => record.status === type).sort((a, b) => b.date.localeCompare(a.date));
    const container = document.getElementById(`follow-${type}`);
    container.innerHTML = '';
    if (!items.length) container.innerHTML = `<p class="muted">${type === 'redo' ? '暂无待二次批改。' : '暂无未交记录。'}</p>`;
    items.forEach(record => container.appendChild(createFollowItem(record, type)));
  });
}

async function doneRec(id) {
  if (busy.has(id)) return;
  busy.add(id);
  renderFollow();
  try {
    const data = await apiRequest(`/api/records/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ status:'pass' }) });
    replaceRecord(data.record);
    setStatus('待跟进事项已完成并保存。', 'success');
  } catch (error) {
    showError(error);
  } finally {
    busy.delete(id);
    renderFollow();
  }
}

async function delRec(id) {
  if (busy.has(id) || !confirm('确认删除这条记录？')) return;
  busy.add(id);
  renderFollow();
  try {
    await apiRequest(`/api/records/${encodeURIComponent(id)}`, { method:'DELETE' });
    cache.records = cache.records.filter(record => record.id !== id);
    setStatus('记录已删除，积分已重新计算。', 'success');
  } catch (error) {
    showError(error);
  } finally {
    busy.delete(id);
    renderFollow();
  }
}

function inRange(record) {
  const from = document.getElementById('rep-from').value;
  const to = document.getElementById('rep-to').value;
  return (!from || record.date >= from) && (!to || record.date <= to) && record.cls === curClass;
}

function renderReport() {
  const classRecords = records().filter(inRange);
  const counts = {
    miss:classRecords.filter(record => record.status === 'miss').length,
    redo:classRecords.filter(record => record.status === 'redo').length,
    star:classRecords.filter(record => record.status === 'star').length,
  };
  const sessions = {};
  classRecords.forEach(record => {
    const key = JSON.stringify([record.date, record.assign, record.cls]);
    (sessions[key] ||= []).push(record);
  });
  document.getElementById('rep-stats').innerHTML = `<div class="stat"><b>${Object.keys(sessions).length}</b><span>作业场次</span></div><div class="stat"><b>${counts.miss}</b><span>未交人次</span></div><div class="stat"><b>${counts.redo}</b><span>二次批改人次</span></div><div class="stat"><b>${counts.star}</b><span>特别好人次</span></div>`;

  const students = {};
  Object.entries(CLASS_LIST).forEach(([cls, names]) => names.forEach(name => {
    students[`${cls}|${name}`] = { cls, name, sessions:0, ok:0, miss:0, redo:0, star:0, points:0, redeem:0, notes:[] };
  }));
  classRecords.forEach(record => {
    const student = students[`${record.cls}|${record.name}`];
    if (!student) return;
    student.sessions++;
    if (record.status === 'miss') { student.miss++; return; }
    if (record.status === 'redo') { student.redo++; return; }
    student.ok++;
    student.points += record.status === 'star' ? 3 : 1;
    if (record.status === 'star') student.star++;
    if (record.note) student.notes.push(`${record.date} ${record.note}`);
  });
  boxes().forEach(reward => {
    const student = students[`${reward.cls}|${reward.name}`];
    if (student) student.redeem++;
  });

  const body = document.getElementById('rep-body');
  body.innerHTML = '';
  Object.values(students).filter(student => student.sessions > 0).forEach(student => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${escapeHtml(student.cls)}</td><td class="name">${escapeHtml(student.name)}</td><td>${student.sessions}</td><td>${student.ok}</td><td>${student.miss}</td><td>${student.redo}</td><td>${student.star}</td><td>${student.points}</td><td>${student.redeem}</td><td class="small">${escapeHtml(student.notes.join('；') || '—')}</td>`;
    body.appendChild(row);
  });

  const assignmentsBody = document.getElementById('rep-assign');
  assignmentsBody.innerHTML = '';
  Object.keys(sessions).sort().reverse().forEach(key => {
    const group = sessions[key];
    const [date, assign, cls] = JSON.parse(key);
    const total = CLASS_LIST[cls].length;
    const missing = group.filter(record => record.status === 'miss');
    const redo = group.filter(record => record.status === 'redo');
    const star = group.filter(record => record.status === 'star');
    const follow = [...missing, ...redo].map(record => record.name);
    const rate = total ? Math.round((total - missing.length) / total * 100) : 0;
    const row = document.createElement('tr');
    row.innerHTML = `<td>${escapeHtml(date)}</td><td>${escapeHtml(assign)}</td><td>${escapeHtml(cls)}</td><td>${total}</td><td>${total - missing.length}</td><td>${missing.length}</td><td>${redo.length}</td><td>${star.length}</td><td>${rate}%</td><td class="small">${escapeHtml(follow.join('、') || '—')}</td>`;
    assignmentsBody.appendChild(row);
  });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCSV() {
  renderReport();
  const rows = [['学生个人汇总'], ['班级','姓名','作业场次','合格','未交','二次批改','特别好','积分','已抽卡','备注']];
  document.querySelectorAll('#rep-body tr').forEach(row => rows.push([...row.querySelectorAll('td')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim())));
  rows.push([], ['收藏与特权记录'], ['班级','姓名','日期','类型','分类','名称','稀有度']);
  boxes().forEach(reward => rows.push([reward.cls, reward.name, reward.date, reward.kind === 'priv' ? '特权券' : '收藏卡', reward.series, reward.card, reward.rar]));
  rows.push([], ['按作业明细'], ['日期','作业内容','班级','应交','已交','未交','二次批改','特别好','提交率','待跟进名单']);
  document.querySelectorAll('#rep-assign tr').forEach(row => rows.push([...row.querySelectorAll('td')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim())));
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  link.download = `作业积分汇总_${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function logout() {
  await apiRequest('/api/logout', { method:'POST' });
  window.location.assign('/login.html');
}

document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
document.getElementById('tab-points').addEventListener('click', () => switchTab('points'));
document.getElementById('tab-follow').addEventListener('click', () => switchTab('follow'));
document.getElementById('tab-report').addEventListener('click', () => switchTab('report'));
document.getElementById('cls-701').addEventListener('click', () => switchClass('701'));
document.getElementById('cls-702').addEventListener('click', () => switchClass('702'));
document.getElementById('btn-miss').addEventListener('click', () => setCur('miss'));
document.getElementById('btn-redo').addEventListener('click', () => setCur('redo'));
document.getElementById('btn-star').addEventListener('click', () => setCur('star'));
document.getElementById('save-register').addEventListener('click', saveRegister);
document.getElementById('generate-report').addEventListener('click', renderReport);
document.getElementById('export-csv').addEventListener('click', exportCSV);
document.getElementById('modal-close').addEventListener('click', closeModal);
giftWrap.addEventListener('click', fireOpen);
giftWrap.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fireOpen();
  }
});
giftWrap.addEventListener('touchend', event => { event.preventDefault(); fireOpen(); }, { passive:false });
document.getElementById('reg-date').addEventListener('change', onDateChange);
document.getElementById('reg-assign').addEventListener('input', renderRegister);
document.getElementById('logout-button').addEventListener('click', logout);
window.addEventListener('focus', () => {
  if (ready && !busy.size && !pendingDraw) refreshBootstrap({ silent:true }).catch(() => {});
});

document.getElementById('reg-date').value = today();
setCur('miss');
refreshBootstrap().catch(() => {});
