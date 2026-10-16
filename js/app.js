import { parseUtterance, parseAmount } from './parser.js';
import { buildCategories, classify, normalize, FALLBACK } from './categories.js';
import { db } from './db.js';
import { store } from './store.js';
import { passphraseIssues, WrongPassphrase } from './vault.js';
import { createRecognizer, VOICE_ERRORS } from './voice.js';
import { renderDailyColumns } from './charts.js';
import {
  fmtVND, fmtNum, fmtCompact, today, addDays, monthOf, shiftMonth, daysInMonth, monthLabel, dayLabel, escapeHtml, capitalize,
} from './format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sum = list => list.reduce((s, t) => s + t.amount, 0);
const esc = escapeHtml;

const DEFAULT_SETTINGS = { slang: true, autoSave: false, lockAfter: 5 };
const emptyCustom = () => ({ extraKeywords: {}, added: [] });

const state = {
  // Dữ liệu nhạy cảm — chỉ có khi đã mở khoá, bị xoá khỏi bộ nhớ khi khoá
  txs: [],
  custom: emptyCustom(),
  learned: {},
  meta: {},
  categories: buildCategories(),
  // Không nhạy cảm
  settings: { ...DEFAULT_SETTINGS },
  month: monthOf(today()),
  view: 'record',
  preview: null,
  histQ: '',
  histCat: '',
  dailyAll: false,
};

// Khoản cố định (tiền nhà, hóa đơn) làm biểu đồ theo ngày khó đọc nên mặc định tách ra
const FIXED_CATEGORIES = new Set(['nha-o', 'hoa-don']);

const catById = id => state.categories.find(c => c.id === id) ?? state.categories.find(c => c.id === 'khac');

/** onlyType: chỉ liệt kê danh mục cùng loại (dùng cho các món trong một hoá đơn). */
function categoryOptions(selected, onlyType) {
  const group = (type, label) => `<optgroup label="${label}">${state.categories.filter(c => c.type === type)
    .map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</optgroup>`;
  if (onlyType) return group(onlyType, onlyType === 'income' ? 'Thu' : 'Chi');
  return group('expense', 'Chi') + group('income', 'Thu');
}

// Một hoá đơn đã chia = các món + phần còn lại (tính vào danh mục của hoá đơn). Thống kê dùng từng phần.
function partsOf(t) {
  const splits = t.splits ?? [];
  const parts = splits.map(s => ({ name: s.name, amount: s.amount, category: s.category }));
  const rest = t.amount - sum(splits);
  if (rest > 0 || !splits.length) parts.push({ name: t.name, amount: splits.length ? rest : t.amount, category: t.category });
  return parts;
}

const timeOf = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ---------- Hồ sơ (danh mục tự thêm, phần đã học...) — lưu dạng mã hoá ----------

function applyProfile(p) {
  state.custom = p?.custom ?? emptyCustom();
  state.learned = p?.learned ?? {};
  state.meta = p?.meta ?? {};
  state.categories = buildCategories(state.custom);
}

const saveProfile = () => store.saveProfile({ custom: state.custom, learned: state.learned, meta: state.meta });

function forgetSensitive() {
  state.txs = [];
  applyProfile(null);
}

// ---------- Khởi động ----------

async function init() {
  // Không cho trang khác nhúng app vào iframe để lừa bấm/gõ (GitHub Pages không đặt được header chống việc này)
  if (window.top !== window.self) {
    document.body.textContent = 'Hãy mở Coin Manager trực tiếp, không qua trang khác.';
    return;
  }
  await store.init();
  state.settings = { ...DEFAULT_SETTINGS, ...(await db.get('settings', {})) };

  setupTabs();
  setupSecurity();
  setupRecord();
  setupHistory();
  setupSettings();
  setupEditDialog();
  document.addEventListener('click', onGlobalClick);
  document.addEventListener('visibilitychange', onVisibilityChange);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => state.view === 'stats' && store.unlocked && renderStats(), 200);
  });
  renderAll();

  // Chạy thử trên máy (localhost) thì không cache để luôn thấy code mới; thêm ?sw vào URL nếu muốn thử offline
  const dev = location.hostname === 'localhost' && !new URLSearchParams(location.search).has('sw');
  if ('serviceWorker' in navigator && !dev) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function onGlobalClick(e) {
  if (e.target.closest('[data-unlock]')) return showView(state.view, { gate: true });
  const tx = e.target.closest('.tx[data-id]');
  if (tx) return openEdit(tx.dataset.id);
  const shift = e.target.closest('[data-shift]');
  if (shift) {
    state.month = shiftMonth(state.month, Number(shift.dataset.shift));
    return renderView(state.view);
  }
  const daily = e.target.closest('[data-daily]');
  if (daily) {
    state.dailyAll = daily.dataset.daily === 'all';
    return renderStats();
  }
  const cat = e.target.closest('[data-goto-cat]');
  if (cat) {
    state.histCat = cat.dataset.gotoCat;
    showView('history');
  }
}

// ---------- Tab ----------

const TABS = ['record', 'history', 'stats', 'settings'];
const TAB_NAMES = { record: 'dữ liệu', history: 'lịch sử', stats: 'thống kê', settings: 'cài đặt' };

function setupTabs() {
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => showView(b.dataset.tab)));
  state.view = location.hash.slice(1) || 'record';
}

/** gate: true → hiện màn mở khoá rồi quay lại đúng tab sau khi mở. */
function showView(name, { gate = false } = {}) {
  if (!TABS.includes(name)) name = 'record';
  state.view = name;
  let shown = name;
  if (!store.hasVault) shown = 'setup';
  else if (!store.unlocked && (name !== 'record' || gate)) shown = 'lock';

  $$('.view').forEach(v => { v.hidden = v.dataset.view !== shown; });
  $('.tabbar').hidden = !store.hasVault;
  $$('[data-tab]').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === name));
  history.replaceState(null, '', `#${name}`);
  renderView(shown);
  window.scrollTo(0, 0);
}

function renderAll() {
  renderTopbar();
  showView(state.view);
}

function renderView(name) {
  if (name === 'record') renderToday();
  else if (name === 'history') renderHistory();
  else if (name === 'stats') renderStats();
  else if (name === 'settings') renderSettings();
  else if (name === 'lock') renderLock();
}

function renderTopbar() {
  const btn = $('#lock-btn');
  btn.hidden = !store.hasVault;
  btn.textContent = store.unlocked ? '🔓 Khoá' : '🔒 Mở khoá';
  btn.setAttribute('aria-label', store.unlocked ? 'Khoá ngay' : 'Mở khoá');
  const ym = monthOf(today());
  const spent = sum(state.txs.filter(t => t.type === 'expense' && monthOf(t.date) === ym));
  $('#month-spent').textContent = spent ? `T${Number(ym.slice(5))}: ${fmtCompact(spent)}` : '';
}

function renderMonthNavs() {
  const isCurrent = state.month >= monthOf(today());
  $$('[data-month-nav]').forEach(el => {
    el.innerHTML = `<button type="button" class="icon-btn" data-shift="-1" aria-label="Tháng trước">‹</button>
      <b>${monthLabel(state.month)}</b>
      <button type="button" class="icon-btn" data-shift="1" aria-label="Tháng sau"${isCurrent ? ' disabled' : ''}>›</button>`;
  });
}

// ---------- Bảo mật: tạo mật khẩu, mở khoá, tự khoá ----------

let hiddenAt = 0;
let keepUnlockedUntil = 0; // chọn file trên Android làm trang bị ẩn — đừng khoá giữa chừng

function setFormError(form, msg) {
  form.querySelector('.form-error').textContent = msg;
}

function setBusy(form, busy, label) {
  const btn = form.querySelector('button[type="submit"], button:not([type])[value="save"], button[value="ok"]');
  if (!btn) return;
  btn.dataset.label ??= btn.textContent;
  btn.disabled = busy;
  btn.textContent = busy ? label : btn.dataset.label;
}

const samePass = (a, b) => a.normalize('NFC') === b.normalize('NFC');

function setupSecurity() {
  $('#lock-btn').addEventListener('click', () => (store.unlocked ? lockNow() : showView(state.view, { gate: true })));

  $('#setup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const pass = f.elements.pass.value;
    const issue = passphraseIssues(pass);
    if (issue) return setFormError(f, issue);
    if (!samePass(pass, f.elements.pass2.value)) return setFormError(f, 'Hai lần nhập không khớp.');
    setFormError(f, '');
    setBusy(f, true, 'Đang tạo khoá…');
    try {
      await store.setup(pass);
      await saveProfile();
      f.reset();
      renderAll();
      toast('Đã bật mã hoá. Hãy nhớ kỹ mật khẩu!');
    } catch (err) {
      setFormError(f, `Không tạo được khoá: ${err.message}`);
    } finally {
      setBusy(f, false);
    }
  });

  $('#unlock-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    setFormError(f, '');
    setBusy(f, true, 'Đang mở khoá…');
    try {
      await store.unlock(f.elements.pass.value);
    } catch (err) {
      setBusy(f, false);
      f.elements.pass.select();
      return setFormError(f, err instanceof WrongPassphrase ? 'Sai mật khẩu.' : `Lỗi: ${err.message}`);
    }
    f.reset();
    try {
      await loadUnlockedData();
    } finally {
      setBusy(f, false);
    }
    renderAll();
  });

  $('#restore-file').addEventListener('click', () => { keepUnlockedUntil = Date.now() + 120_000; });
  $('#restore-file').addEventListener('change', restoreOnNewDevice);
  $('#forgot-wipe').addEventListener('click', () => wipeEverything(
    'Xoá toàn bộ dữ liệu đã mã hoá trên máy này và tạo mật khẩu mới?\nKhông thể hoàn tác.',
  ));

  const dlg = $('#change-pass-dialog');
  const cf = $('#change-pass-form');
  $('#change-pass').addEventListener('click', () => {
    cf.reset();
    setFormError(cf, '');
    dlg.showModal();
  });
  cf.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return dlg.close();
    const { old, pass, pass2 } = cf.elements;
    const issue = passphraseIssues(pass.value);
    if (issue) return setFormError(cf, issue);
    if (!samePass(pass.value, pass2.value)) return setFormError(cf, 'Hai lần nhập mật khẩu mới không khớp.');
    if (samePass(pass.value, old.value)) return setFormError(cf, 'Mật khẩu mới trùng mật khẩu cũ.');
    setBusy(cf, true, 'Đang đổi…');
    try {
      await store.changePassphrase(old.value, pass.value);
      dlg.close();
      toast('Đã đổi mật khẩu. Bản sao lưu cũ vẫn mở bằng mật khẩu cũ.');
    } catch (err) {
      setFormError(cf, err instanceof WrongPassphrase ? 'Mật khẩu hiện tại không đúng.' : `Lỗi: ${err.message}`);
    } finally {
      setBusy(cf, false);
    }
  });
}

function renderLock() {
  const f = $('#unlock-form');
  setFormError(f, '');
  $('#lock-msg').textContent = `Nhập mật khẩu để xem ${TAB_NAMES[state.view]}.`;
  setTimeout(() => f.elements.pass.focus(), 50);
}

async function loadUnlockedData() {
  applyProfile(await store.loadProfile());
  const { txs, failed } = await store.loadTx();
  state.txs = txs;
  const inbox = await ingestInbox();
  if (failed + inbox.failed) toast(`Bỏ qua ${failed + inbox.failed} khoản lỗi hoặc không hợp lệ`);
  else if (inbox.count) toast(`Đã thêm ${inbox.count} khoản ghi lúc đang khoá`);
}

// Khoản ghi lúc đang khoá chưa có danh mục tự thêm / phần đã học → phân loại lại nếu bạn không tự chọn
function finalizeInboxItem({ catAuto, ...t }) {
  if (catAuto) {
    const c = classify(t.name, state.categories, state.learned);
    if (c && catById(c).type === t.type) t.category = c;
  }
  return t;
}

async function ingestInbox() {
  const { items, failed } = await store.loadInbox();
  if (!items.length) return { count: 0, failed };
  // Ai cùng origin cũng ghi được vào hộp chờ (khoá công khai để dạng thường) → chỉ nhận khoản hợp lệ
  const valid = items.filter(isValidTx);
  const txs = valid.map(finalizeInboxItem);
  await store.putTx(txs);                       // ghi trước, xoá hộp chờ sau → không mất nếu bị ngắt giữa chừng
  await store.deleteInbox(items.map(i => i.id));
  mergeTxs(txs);
  await learnFrom(valid.filter(i => !i.catAuto));
  return { count: txs.length, failed: failed + items.length - valid.length };
}

function mergeTxs(list) {
  const byId = new Map(state.txs.map(t => [t.id, t]));
  list.forEach(t => byId.set(t.id, t));
  state.txs = [...byId.values()];
}

function lockNow() {
  if (!store.unlocked) return;
  store.lock();
  forgetSensitive();
  $$('dialog[open]').forEach(d => d.close());
  // Các tab đã xem vẫn còn số liệu trong DOM (chỉ bị ẩn) — xoá hẳn
  for (const sel of ['#hist-list', '#hist-summary', '#stats-body', '#today-list', '#cat-settings', '#learned-list', '#data-info', '#split-list', '#split-rest']) {
    $(sel).replaceChildren();
  }
  editSplits = [];
  $$('form').forEach(f => f.reset());
  state.histQ = '';
  renderAll();
}

function onVisibilityChange() {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (state.settings.lockAfter === 0 && Date.now() > keepUnlockedUntil) lockNow();
  } else if (store.unlocked && hiddenAt && Date.now() > keepUnlockedUntil
    && Date.now() - hiddenAt >= state.settings.lockAfter * 60_000) {
    lockNow();
  }
}

async function wipeEverything(message) {
  if (!confirm(message)) return;
  await store.wipe();
  await db.set('settings', state.settings);
  forgetSensitive();
  clearPreview();
  renderAll();
  toast('Đã xoá toàn bộ dữ liệu');
}

function askPassphrase(message, verify) {
  const dlg = $('#ask-pass-dialog');
  const f = $('#ask-pass-form');
  f.reset();
  setFormError(f, '');
  $('#ask-pass-msg').textContent = message;
  dlg.showModal();
  return new Promise(resolve => {
    const finish = value => {
      f.removeEventListener('submit', onSubmit);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onClose = () => finish(null);
    const onSubmit = async e => {
      e.preventDefault();
      if (e.submitter?.value === 'cancel') return finish(null);
      setBusy(f, true, 'Đang mở…');
      try {
        finish(await verify(f.elements.pass.value));
      } catch (err) {
        setFormError(f, err instanceof WrongPassphrase ? 'Sai mật khẩu.' : `Không mở được: ${err.message}`);
      } finally {
        setBusy(f, false);
      }
    };
    f.addEventListener('submit', onSubmit);
    dlg.addEventListener('close', onClose);
  });
}

// ---------- Ghi bằng giọng nói ----------

let recognizer = null;
let gotResult = false;
let autoSaveTimer = null;
let batchSeq = 0;

const DEFAULT_STATUS = $('#mic-status').innerHTML;

function setMicStatus(html, isError = false) {
  const el = $('#mic-status');
  el.innerHTML = html;
  el.classList.toggle('error', isError);
}

function showTranscript(text, interim) {
  const el = $('#transcript');
  el.hidden = !text;
  el.textContent = text ? `“${text}”` : '';
  el.classList.toggle('interim', interim);
}

function setupRecord() {
  const mic = $('#mic');
  recognizer = createRecognizer({
    onInterim: t => showTranscript(t, true),
    onFinal: alts => { gotResult = true; handleAlternatives(alts, 'voice'); },
    onError: err => { gotResult = true; if (VOICE_ERRORS[err] !== '') setMicStatus(esc(VOICE_ERRORS[err] ?? `Lỗi nhận giọng nói: ${err}`), true); },
    onEnd: () => {
      mic.classList.remove('listening');
      mic.setAttribute('aria-label', 'Bấm để nói');
      if (!gotResult) setMicStatus(DEFAULT_STATUS);
    },
  });

  if (!recognizer) {
    mic.disabled = true;
    setMicStatus('Trình duyệt này không hỗ trợ nhận giọng nói. Hãy mở bằng <b>Chrome trên Android</b>, hoặc gõ tay bên dưới.', true);
  }
  mic.addEventListener('click', () => {
    if (recognizer.listening) return recognizer.stop();
    cancelAutoSave();
    gotResult = false;
    try {
      recognizer.start();
      mic.classList.add('listening');
      mic.setAttribute('aria-label', 'Bấm để dừng');
      setMicStatus('Đang nghe… nói tên khoản rồi số tiền');
      showTranscript('', true);
      $('#alts').hidden = true;
    } catch {
      setMicStatus('Không mở được micro, thử lại nhé.', true);
    }
  });

  $('#text-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#text-input');
    if (!input.value.trim()) return;
    handleAlternatives([input.value.trim()], 'typed');
    input.value = '';
  });

  const pv = $('#preview');
  pv.addEventListener('input', onPreviewEdit);
  pv.addEventListener('change', onPreviewEdit);
  pv.addEventListener('pointerdown', cancelAutoSave);
  pv.addEventListener('focusin', cancelAutoSave);
  $('#preview-items').addEventListener('click', e => {
    const del = e.target.closest('.pv-del');
    if (!del) return;
    state.preview.items.splice(Number(del.dataset.i), 1);
    state.preview.items.length ? renderPreview() : clearPreview();
  });
  $('#pv-cancel').addEventListener('click', clearPreview);
  $('#pv-save').addEventListener('click', savePreview);
}

function toPreviewItems(raw, parsed, batch) {
  return parsed.items.map(it => {
    let category = classify(it.name, state.categories, state.learned);
    const type = parsed.type ?? (category ? catById(category).type : 'expense');
    if (!category || catById(category).type !== type) category = FALLBACK[type];
    return { name: capitalize(it.name), amount: it.amount, category, suggested: category, raw, batch };
  });
}

function handleAlternatives(alts, source) {
  const opts = { slang: state.settings.slang };
  const seen = new Set();
  const parsed = alts.filter(t => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .map(t => ({ t, r: parseUtterance(t, opts) }));
  const best = parsed.find(p => p.r.items.length) ?? parsed[0];
  showTranscript(best.t, false);

  if (!best.r.items.length) {
    setMicStatus('Chưa nghe ra số tiền. Thử nói kèm đơn vị, ví dụ <q>mười lăm nghìn</q>.', true);
    return;
  }
  setMicStatus(source === 'voice' ? 'Kiểm tra lại rồi bấm <b>Lưu</b>' : DEFAULT_STATUS);

  // Câu mới được thêm vào phần đang chờ lưu, không ghi đè
  const batch = ++batchSeq;
  if (!state.preview) state.preview = { items: [], date: today() };
  state.preview.items.push(...toPreviewItems(best.t, best.r, batch));
  if (best.r.dateOffset) state.preview.date = addDays(today(), best.r.dateOffset);
  renderPreview();
  renderAlts(parsed.filter(p => p !== best && p.r.items.length).slice(0, 3), batch);

  if (source === 'voice' && state.settings.autoSave && state.preview.items.every(it => it.amount > 0 && it.name)) {
    startAutoSave();
  }
}

// Các phương án khác mà bộ nhận giọng nói đưa ra — chạm để thay
function renderAlts(options, batch) {
  const el = $('#alts');
  el.hidden = !options.length;
  el.innerHTML = options.length ? `<span class="muted">Hay ý bạn là:</span>${options.map((o, i) =>
    `<button type="button" class="chip" data-alt="${i}">${esc(o.t)}</button>`).join('')}` : '';
  el.onclick = e => {
    const b = e.target.closest('[data-alt]');
    if (!b || !state.preview) return;
    const o = options[Number(b.dataset.alt)];
    state.preview.items = state.preview.items.filter(it => it.batch !== batch).concat(toPreviewItems(o.t, o.r, batch));
    showTranscript(o.t, false);
    el.hidden = true;
    renderPreview();
  };
}

function renderPreview() {
  const p = state.preview;
  $('#preview').hidden = false;
  $('#pv-date').value = p.date;
  $('#preview-items').innerHTML = p.items.map((it, i) => `
    <div class="pv-item${it.amount > 0 ? '' : ' warn'}" data-i="${i}">
      <input class="pv-name" data-f="name" value="${esc(it.name)}" placeholder="Tên khoản" aria-label="Tên khoản">
      <div class="pv-row">
        <span class="amount-field"><input data-f="amount" value="${it.amount ? fmtNum(it.amount) : ''}" placeholder="Số tiền" aria-label="Số tiền"><span>đ</span></span>
        <select data-f="category" aria-label="Danh mục">${categoryOptions(it.category)}</select>
        <button class="icon-btn pv-del" type="button" data-i="${i}" aria-label="Bỏ khoản này">✕</button>
      </div>
    </div>`).join('');
  updateSaveButton();
}

function onPreviewEdit(e) {
  const p = state.preview;
  if (!p) return;
  if (e.target.id === 'pv-date') { p.date = e.target.value || today(); return; }
  const row = e.target.closest('.pv-item');
  const f = e.target.dataset.f;
  if (!row || !f) return;
  const it = p.items[Number(row.dataset.i)];
  if (f === 'amount') {
    it.amount = parseAmount(e.target.value, { slang: state.settings.slang }) ?? 0;
    if (e.type === 'change' && it.amount) e.target.value = fmtNum(it.amount);
    row.classList.toggle('warn', !(it.amount > 0));
  } else {
    it[f] = e.target.value;
  }
  updateSaveButton();
}

function updateSaveButton(countdown) {
  const items = state.preview?.items ?? [];
  const ok = items.length && items.every(it => it.amount > 0);
  const btn = $('#pv-save');
  btn.disabled = !ok;
  const total = sum(items.filter(it => it.amount > 0));
  btn.textContent = `Lưu${items.length > 1 ? ` ${items.length} khoản` : ''} · ${fmtVND(total)}${countdown ? ` (${countdown})` : ''}`;
}

function startAutoSave() {
  cancelAutoSave();
  let n = 3;
  updateSaveButton(n);
  autoSaveTimer = setInterval(() => {
    n -= 1;
    if (n > 0) return updateSaveButton(n);
    cancelAutoSave();
    savePreview();
  }, 1000);
}

function cancelAutoSave() {
  if (!autoSaveTimer) return;
  clearInterval(autoSaveTimer);
  autoSaveTimer = null;
  updateSaveButton();
}

function clearPreview() {
  cancelAutoSave();
  state.preview = null;
  $('#preview').hidden = true;
  $('#alts').hidden = true;
  showTranscript('', false);
}

async function savePreview() {
  cancelAutoSave();
  const p = state.preview;
  if (!p || !p.items.length || p.items.some(it => !(it.amount > 0))) return;
  const now = new Date().toISOString();
  const txs = p.items.map(it => {
    const cat = catById(it.category);
    return {
      id: crypto.randomUUID(), date: p.date, name: capitalize(it.name.trim()) || cat.name, amount: it.amount,
      category: cat.id, type: cat.type, raw: it.raw, createdAt: now, updatedAt: now,
    };
  });
  // Dọn khung chờ ngay (trước khi await) để câu nói kế tiếp không bị cuốn theo
  clearPreview();
  setMicStatus(DEFAULT_STATUS);
  const unlocked = store.unlocked;
  try {
    if (unlocked) await store.putTx(txs);
    // Đang khoá: mã hoá một chiều vào hộp chờ, mở khoá xong mới đọc được
    else await store.addToInbox(txs.map((t, i) => ({ ...t, catAuto: p.items[i].category === p.items[i].suggested })));
  } catch {
    state.preview = state.preview ? { ...state.preview, items: [...p.items, ...state.preview.items] } : p;
    renderPreview();
    toast('Không lưu được, thử lại nhé');
    return;
  }
  if (unlocked) {
    state.txs.push(...txs);
    await learnFrom(txs);
    renderTopbar();
  }
  renderToday();
  navigator.storage?.persist?.();
  const ids = txs.map(t => t.id);
  toast(`Đã lưu ${txs.length > 1 ? `${txs.length} khoản · ` : ''}${fmtVND(sum(txs))}${unlocked ? '' : ' (đã mã hoá)'}`, {
    action: 'Hoàn tác', onAction: () => (unlocked ? removeTx(ids) : store.deleteInbox(ids).then(renderToday)),
  });
}

// Ghi nhớ khi bạn chọn danh mục khác với gợi ý từ khoá
async function learnFrom(txs) {
  let changed = false;
  for (const t of txs) {
    const key = normalize(t.name);
    if (!key) continue;
    const suggested = classify(t.name, state.categories, {}) ?? FALLBACK[t.type];
    if (t.category !== suggested && state.learned[key] !== t.category) {
      state.learned[key] = t.category;
      changed = true;
    } else if (t.category === suggested && key in state.learned) {
      delete state.learned[key];
      changed = true;
    }
  }
  if (changed && store.unlocked) await saveProfile();
}

async function removeTx(ids) {
  await store.deleteTx(ids);
  const set = new Set(ids);
  state.txs = state.txs.filter(t => !set.has(t.id));
  renderTopbar();
  renderView(state.view);
  toast(`Đã xoá ${ids.length} khoản`);
}

function txItem(t, { showDate = false, timeline = false } = {}) {
  const c = catById(t.category);
  const sign = t.type === 'income' ? '+' : '−';
  const sub = showDate ? `${dayLabel(t.date)} · ${c.name}` : c.name;
  const splits = t.splits?.length
    ? `<span class="tx-splits">${t.splits.map(s => `${esc(s.name)} ${fmtCompact(s.amount)}`).join(' · ')}</span>` : '';
  const btn = `<button type="button" class="tx tint-${c.tint}" data-id="${esc(t.id)}">
    <span class="tx-icon" aria-hidden="true">${esc(c.icon)}</span>
    <span class="tx-main"><span class="tx-name">${esc(t.name)}</span><span class="tx-sub">${esc(sub)}</span>${splits}</span>
    <span class="tx-amt ${t.type === 'income' ? 'income' : 'expense'}">${sign}${fmtVND(t.amount)}</span>
  </button>`;
  return timeline ? `<li class="tl"><span class="tl-time">${timeOf(t.createdAt)}</span>${btn}</li>` : `<li>${btn}</li>`;
}

function renderSummary() {
  const ym = monthOf(today());
  const label = `tháng ${Number(ym.slice(5))}`;
  $('#sum-exp-label').textContent = `Chi ${label}`;
  $('#sum-inc-label').textContent = `Thu ${label}`;
  if (!store.unlocked) {
    $('#sum-exp').textContent = '🔒';
    $('#sum-inc').textContent = '🔒';
    return;
  }
  const month = state.txs.filter(t => monthOf(t.date) === ym);
  $('#sum-exp').textContent = fmtVND(sum(month.filter(t => t.type === 'expense')));
  $('#sum-inc').textContent = fmtVND(sum(month.filter(t => t.type === 'income')));
}

async function renderToday() {
  renderSummary();
  if (!store.unlocked) {
    $('#today-total').textContent = '';
    const n = store.hasVault ? await store.inboxCount() : 0;
    $('#today-list').innerHTML = `<li class="locked-note">
      <span>🔒 Dữ liệu đang khoá — bạn vẫn ghi được, nhưng cần mật khẩu để xem.${n ? ` Có <b>${n}</b> khoản mới ghi đang chờ.` : ''}</span>
      <button type="button" class="btn primary" data-unlock>Mở khoá</button></li>`;
    return;
  }
  const t = today();
  const list = state.txs.filter(x => x.date === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const spent = sum(list.filter(x => x.type === 'expense'));
  $('#today-total').textContent = list.length ? `đã chi ${fmtVND(spent)}` : '';
  $('#today-list').innerHTML = list.length
    ? list.map(x => txItem(x, { timeline: true })).join('')
    : '<li class="empty">🦆 Chưa có khoản nào hôm nay. Bấm micro và nói thử nhé!</li>';
}

// ---------- Lịch sử ----------

function setupHistory() {
  $('#hist-q').addEventListener('input', e => { state.histQ = e.target.value; renderHistory(); });
  $('#hist-cat').addEventListener('change', e => { state.histCat = e.target.value; renderHistory(); });
}

function renderHistory() {
  renderMonthNavs();
  $('#hist-cat').innerHTML = `<option value="">Tất cả danh mục</option>${categoryOptions(state.histCat)}`;
  $('#hist-cat').value = state.histCat;
  const q = normalize(state.histQ);
  const cat = state.histCat;
  const names = t => [t.name, ...(t.splits ?? []).map(s => s.name)];
  const list = state.txs
    .filter(t => monthOf(t.date) === state.month
      && (!cat || partsOf(t).some(p => p.category === cat))
      && (!q || names(t).some(n => normalize(n).includes(q))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  if (cat) {
    // Lọc theo danh mục: chỉ cộng phần thuộc danh mục đó (một hoá đơn có thể chia cho nhiều danh mục)
    const inCat = sum(list.flatMap(partsOf).filter(p => p.category === cat));
    $('#hist-summary').textContent = list.length ? `${list.length} khoản · ${fmtVND(inCat)} thuộc ${catById(cat).name}` : '';
  } else {
    const spent = sum(list.filter(t => t.type === 'expense'));
    const earned = sum(list.filter(t => t.type === 'income'));
    $('#hist-summary').textContent = list.length
      ? `${list.length} khoản · chi ${fmtVND(spent)}${earned ? ` · thu ${fmtVND(earned)}` : ''}`
      : '';
  }

  const groups = new Map();
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  $('#hist-list').innerHTML = list.length ? [...groups].map(([date, items]) => {
    const daySpent = sum(items.filter(t => t.type === 'expense'));
    return `<section class="card day-group">
      <h3 class="card-title"><span>${dayLabel(date)}</span><span class="muted">${daySpent ? `−${fmtVND(daySpent)}` : ''}</span></h3>
      <ul class="tx-list timeline">${items.map(t => txItem(t, { timeline: true })).join('')}</ul>
    </section>`;
  }).join('') : '<p class="empty card">🦆 Không có khoản nào.</p>';
}

// ---------- Thống kê ----------

function renderStats() {
  renderMonthNavs();
  const ym = state.month;
  const t = today();
  const isCurrent = ym === monthOf(t);
  const monthTx = state.txs.filter(x => monthOf(x.date) === ym);
  const exp = monthTx.filter(x => x.type === 'expense');
  const spent = sum(exp);
  const earned = sum(monthTx.filter(x => x.type === 'income'));
  const body = $('#stats-body');

  if (!monthTx.length) {
    body.innerHTML = `<p class="empty card">Chưa có khoản nào trong ${monthLabel(ym).toLowerCase()}.</p>`;
    return;
  }

  const nDays = isCurrent ? Number(t.slice(8)) : daysInMonth(ym);
  // So với cùng kỳ tháng trước (tháng hiện tại chỉ so tới cùng ngày)
  const prevYm = shiftMonth(ym, -1);
  const prevSpent = sum(state.txs.filter(x => x.type === 'expense' && monthOf(x.date) === prevYm
    && (!isCurrent || Number(x.date.slice(8)) <= nDays)));
  let delta = '';
  if (prevSpent > 0) {
    const pct = Math.round(((spent - prevSpent) / prevSpent) * 100);
    const up = pct > 0;
    delta = `<span class="kpi-delta ${pct === 0 ? '' : up ? 'bad' : 'good'}">${pct === 0 ? '＝' : up ? '▲' : '▼'} ${Math.abs(pct)}%
      ${up ? 'nhiều hơn' : pct < 0 ? 'ít hơn' : 'bằng'} ${isCurrent ? 'cùng kỳ tháng trước' : 'tháng trước'} (${fmtCompact(prevSpent)})</span>`;
  }

  // Hoá đơn đã chia: mỗi món tính vào danh mục riêng, phần còn lại vào danh mục của hoá đơn
  const parts = exp.flatMap(partsOf);
  const byCat = new Map();
  for (const x of parts) {
    const e = byCat.get(x.category) ?? { sum: 0, count: 0 };
    e.sum += x.amount; e.count += 1;
    byCat.set(x.category, e);
  }
  const cats = [...byCat].sort((a, b) => b[1].sum - a[1].sum);
  const maxCat = cats[0]?.[1].sum || 1;

  const freq = new Map();
  for (const x of parts) {
    const k = normalize(x.name);
    const e = freq.get(k) ?? { name: x.name, sum: 0, count: 0 };
    e.sum += x.amount; e.count += 1;
    freq.set(k, e);
  }
  const frequent = [...freq.values()].filter(e => e.count > 1).sort((a, b) => b.count - a.count || b.sum - a.sum).slice(0, 5);
  const biggest = [...exp].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const balance = earned - spent;

  body.innerHTML = `
    <div class="kpis">
      <div class="kpi hero">
        <img class="duck-peek" src="icons/duck-peek.svg" alt="" width="96" height="67">
        <span class="kpi-label">Đã chi ${isCurrent ? 'tháng này' : monthLabel(ym).toLowerCase()}</span>
        <span class="kpi-value">${fmtVND(spent)}</span>
        ${delta}
        <span class="kpi-sub">Trung bình ${fmtVND(spent / nDays)}/ngày · ${exp.length} khoản</span>
      </div>
      <div class="kpi"><span class="kpi-label">Thu nhập</span><span class="kpi-value">${earned ? fmtVND(earned) : '—'}</span></div>
      <div class="kpi"><span class="kpi-label">Còn lại</span><span class="kpi-value">${earned ? `${balance < 0 ? '−' : ''}${fmtVND(Math.abs(balance))}` : '—'}</span></div>
    </div>

    <section class="card">
      <h2 class="card-title">Chi theo danh mục</h2>
      ${cats.length ? `<ul class="cat-bars">${cats.map(([id, e]) => {
        const c = catById(id);
        return `<li><button type="button" class="cat-bar-row tint-${c.tint}" data-goto-cat="${esc(id)}" title="Xem ${e.count} khoản">
          <span class="cat-tile" aria-hidden="true">${esc(c.icon)}</span>
          <span class="cb-label">${esc(c.name)}</span>
          <span class="cb-value">${fmtVND(e.sum)} <small>${Math.round((e.sum / spent) * 100)}%</small></span>
          <span class="cb-track"><span class="cb-fill" data-w="${Math.max(1, (e.sum / maxCat) * 100)}"></span></span>
        </button></li>`;
      }).join('')}</ul>` : '<p class="muted">Chưa có khoản chi.</p>'}
    </section>

    <section class="card">
      <h2 class="card-title"><span>Chi theo ngày</span>
        <span class="seg" role="group" aria-label="Phạm vi">
          <button type="button" data-daily="daily" aria-pressed="${!state.dailyAll}">Hằng ngày</button>
          <button type="button" data-daily="all" aria-pressed="${state.dailyAll}">Tất cả</button>
        </span></h2>
      ${state.dailyAll ? '' : '<p class="muted chart-note">Không tính nhà ở &amp; hóa đơn</p>'}
      <div id="daily-chart" class="chart"></div>
    </section>

    <div class="grid-2">
      <section class="card">
        <h2 class="card-title">Khoản chi lớn nhất</h2>
        <ul class="tx-list">${biggest.map(x => txItem(x, { showDate: true })).join('') || '<li class="empty">—</li>'}</ul>
      </section>
      <section class="card">
        <h2 class="card-title">Mua thường xuyên</h2>
        ${frequent.length ? `<ol class="rank-list">${frequent.map(e => `<li>
          <span class="tx-name">${esc(e.name)}</span>
          <span class="muted">${e.count} lần</span>
          <b>${fmtVND(e.sum)}</b></li>`).join('')}</ol>` : '<p class="muted">Chưa có khoản nào lặp lại.</p>'}
      </section>
    </div>`;
  // Đặt độ rộng qua CSSOM (CSP chặn thuộc tính style viết trong HTML)
  $$('.cb-fill', body).forEach(el => { el.style.width = `${el.dataset.w}%`; });

  const dim = daysInMonth(ym);
  const dailyParts = exp.flatMap(x => partsOf(x).map(p => ({ ...p, date: x.date, id: x.id })))
    .filter(p => state.dailyAll || !FIXED_CATEGORIES.has(p.category));
  const daily = Array.from({ length: dim }, (_, i) => {
    const iso = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const items = dailyParts.filter(x => x.date === iso);
    return { label: String(i + 1), title: dayLabel(iso), value: sum(items), count: new Set(items.map(x => x.id)).size, isToday: iso === t };
  });
  renderDailyColumns($('#daily-chart'), daily);
}

// ---------- Sửa / xoá ----------

// Các món của hoá đơn đang sửa — chỉ ghi xuống khi bấm Lưu
let editSplits = [];
let splitRec = null;

const editForm = () => $('#edit-form');
const editTotal = () => parseAmount(editForm().elements.amount.value, { slang: state.settings.slang }) ?? 0;
const editParent = () => catById(editForm().elements.category.value);

function renderSplits() {
  const type = editParent().type;
  $('#split-list').innerHTML = editSplits.map((s, i) => {
    const c = catById(s.category);
    return `<li class="split-item tint-${c.tint}" data-i="${i}">
      <span class="tx-icon" aria-hidden="true">${esc(c.icon)}</span>
      <input data-sf="name" value="${esc(s.name)}" placeholder="Tên món" aria-label="Tên món">
      <span class="amount-field"><input data-sf="amount" value="${s.amount ? fmtNum(s.amount) : ''}" placeholder="Giá" aria-label="Giá món"><span>đ</span></span>
      <select data-sf="category" aria-label="Danh mục của món">${categoryOptions(s.category, type)}</select>
      <button type="button" class="icon-btn split-del" data-i="${i}" aria-label="Bỏ món này">✕</button>
    </li>`;
  }).join('');
  renderSplitRest();
}

function renderSplitRest() {
  const el = $('#split-rest');
  el.className = 'split-rest';
  if (!editSplits.length) {
    el.innerHTML = '<span class="muted">Chưa chia. Ví dụ hoá đơn siêu thị 100k → nói <q>bánh 25 nước ngọt 25 rau 25</q>.</span>';
    return;
  }
  const used = sum(editSplits.filter(s => s.amount > 0));
  const rest = editTotal() - used;
  if (rest > 0) {
    el.innerHTML = `Còn lại <b>${fmtVND(rest)}</b> → tính vào ${esc(editParent().icon)} ${esc(editParent().name)}`;
  } else if (rest === 0) {
    el.classList.add('done');
    el.textContent = '✓ Đã chia hết';
  } else {
    el.classList.add('over');
    el.innerHTML = `Các món vượt tổng ${fmtVND(-rest)} <button type="button" class="btn" data-fix-total="${used}">Đặt tổng = ${fmtVND(used)}</button>`;
  }
}

/** Thêm món từ câu nói/gõ, ví dụ "bánh 25 nước ngọt 25 rau 25". */
function addSplits(alts) {
  const status = $('#split-status');
  const parsed = alts.map(t => parseUtterance(t, { slang: state.settings.slang })).find(r => r.items.length);
  if (!parsed) {
    status.hidden = false;
    status.textContent = 'Chưa nghe ra giá. Đọc kiểu: bánh 25 nước ngọt 25.';
    return false;
  }
  const parent = editParent();
  for (const it of parsed.items) {
    // Món không đoán được danh mục thì để chung danh mục với hoá đơn
    let c = classify(it.name, state.categories, state.learned);
    if (!c || catById(c).type !== parent.type) c = parent.id;
    editSplits.push({ id: crypto.randomUUID(), name: capitalize(it.name) || `Món ${editSplits.length + 1}`, amount: it.amount, category: c });
  }
  status.hidden = true;
  renderSplits();
  return true;
}

function setupEditDialog() {
  const dlg = $('#edit-dialog');
  const f = editForm();
  f.addEventListener('submit', async e => {
    if (e.submitter?.value !== 'save') return;
    const amount = editTotal();
    if (!amount) {
      e.preventDefault();
      f.elements.amount.setCustomValidity('Số tiền chưa hợp lệ');
      f.elements.amount.reportValidity();
      return;
    }
    const splits = editSplits.filter(s => s.name.trim() || s.amount > 0);
    if (splits.some(s => !(s.amount > 0))) {
      e.preventDefault();
      return toast('Có món chưa có giá');
    }
    if (sum(splits) > amount) {
      e.preventDefault();
      renderSplitRest();
      return toast('Các món cộng lại vượt tổng tiền');
    }
    const t = state.txs.find(x => x.id === f.dataset.id);
    if (!t || !store.unlocked) return;
    const cat = editParent();
    const clean = splits.map(s => ({
      id: s.id, name: capitalize(s.name.trim()) || 'Món', amount: s.amount,
      category: catById(s.category).type === cat.type ? catById(s.category).id : cat.id,
    }));
    Object.assign(t, {
      name: capitalize(f.elements.name.value.trim()), amount, category: cat.id, type: cat.type,
      date: f.elements.date.value, updatedAt: new Date().toISOString(),
    });
    if (clean.length) t.splits = clean;
    else delete t.splits;
    await store.putTx([t]);
    await learnFrom([t, ...clean.map(s => ({ name: s.name, category: s.category, type: cat.type }))]);
    renderTopbar();
    renderView(state.view);
    toast(clean.length ? `Đã lưu, chia ${clean.length} món` : 'Đã cập nhật');
  });
  f.elements.amount.addEventListener('input', () => {
    f.elements.amount.setCustomValidity('');
    renderSplitRest();
  });
  f.elements.category.addEventListener('change', () => {
    // Đổi giữa Chi/Thu: món khác loại chuyển theo danh mục của hoá đơn
    const parent = editParent();
    editSplits.forEach(s => { if (catById(s.category).type !== parent.type) s.category = parent.id; });
    renderSplits();
  });
  $('#edit-delete').addEventListener('click', async () => {
    if (!confirm('Xoá khoản này?')) return;
    dlg.close();
    await removeTx([f.dataset.id]);
  });

  // ----- Chia nhỏ hoá đơn -----
  const input = $('#split-input');
  const status = $('#split-status');
  const addFromInput = () => { if (input.value.trim() && addSplits([input.value.trim()])) input.value = ''; };
  $('#split-add-btn').addEventListener('click', addFromInput);
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter trong form sẽ bấm "Lưu"
    addFromInput();
  });

  const list = $('#split-list');
  const onSplitEdit = e => {
    const row = e.target.closest('.split-item');
    const field = e.target.dataset.sf;
    if (!row || !field) return;
    const s = editSplits[Number(row.dataset.i)];
    if (field === 'amount') {
      s.amount = parseAmount(e.target.value, { slang: state.settings.slang }) ?? 0;
      if (e.type === 'change' && s.amount) e.target.value = fmtNum(s.amount);
      renderSplitRest();
    } else if (field === 'category') {
      s.category = e.target.value;
      if (e.type === 'change') renderSplits();
    } else {
      s.name = e.target.value;
    }
  };
  list.addEventListener('input', onSplitEdit);
  list.addEventListener('change', onSplitEdit);
  list.addEventListener('click', e => {
    const del = e.target.closest('.split-del');
    if (!del) return;
    editSplits.splice(Number(del.dataset.i), 1);
    renderSplits();
  });
  $('#split-rest').addEventListener('click', e => {
    const fix = e.target.closest('[data-fix-total]');
    if (!fix) return;
    f.elements.amount.value = fmtNum(Number(fix.dataset.fixTotal));
    renderSplitRest();
  });

  const mic = $('#split-mic');
  splitRec = createRecognizer({
    onInterim: t => { status.hidden = false; status.textContent = `“${t}”`; },
    onFinal: alts => addSplits(alts),
    onError: err => {
      if (VOICE_ERRORS[err] === '') return;
      status.hidden = false;
      status.textContent = VOICE_ERRORS[err] ?? `Lỗi nhận giọng nói: ${err}`;
    },
    onEnd: () => mic.classList.remove('listening'),
  });
  if (!splitRec) mic.hidden = true;
  mic.addEventListener('click', () => {
    if (splitRec.listening) return splitRec.stop();
    try {
      splitRec.start();
      mic.classList.add('listening');
      status.hidden = false;
      status.textContent = 'Đang nghe… đọc các món kèm giá';
    } catch {
      status.textContent = 'Không mở được micro, thử lại nhé.';
    }
  });
  dlg.addEventListener('close', () => { if (splitRec?.listening) splitRec.stop(); });
}

function openEdit(id) {
  const t = state.txs.find(x => x.id === id);
  if (!t) return;
  const f = editForm();
  f.dataset.id = id;
  f.elements.name.value = t.name;
  f.elements.amount.value = fmtNum(t.amount);
  f.elements.category.innerHTML = categoryOptions(t.category);
  f.elements.date.value = t.date;
  $('#edit-raw').textContent = t.raw ? `Câu gốc: “${t.raw}”` : '';
  editSplits = (t.splits ?? []).map(s => ({ ...s }));
  $('#split-input').value = '';
  $('#split-status').hidden = true;
  renderSplits();
  $('#edit-dialog').showModal();
}

// ---------- Cài đặt ----------

async function saveCustom() {
  state.categories = buildCategories(state.custom);
  await saveProfile();
}

const saveSettings = () => db.set('settings', state.settings);

function setupSettings() {
  for (const [id, key] of [['#set-slang', 'slang'], ['#set-autosave', 'autoSave']]) {
    $(id).addEventListener('change', async e => {
      state.settings[key] = e.target.checked;
      await saveSettings();
    });
  }
  $('#set-lockafter').addEventListener('change', async e => {
    state.settings.lockAfter = Number(e.target.value);
    await saveSettings();
  });
  $('#lock-now').addEventListener('click', lockNow);

  $('#cat-settings').addEventListener('change', async e => {
    const ta = e.target.closest('textarea[data-cat]');
    if (!ta) return;
    const words = ta.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    state.custom.extraKeywords = { ...state.custom.extraKeywords, [ta.dataset.cat]: words };
    await saveCustom();
    toast('Đã lưu từ khoá');
  });

  $('#cat-add').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.name.value.trim();
    if (!name) return;
    state.custom.added = [...(state.custom.added ?? []), {
      id: `c-${Date.now().toString(36)}`, name, icon: f.elements.icon.value.trim() || '🏷️', type: f.elements.type.value, keywords: [name],
    }];
    await saveCustom();
    f.reset();
    renderSettings();
    toast(`Đã thêm danh mục “${name}”`);
  });

  $('#learned-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-unlearn]');
    if (!b) return;
    delete state.learned[b.dataset.unlearn];
    await saveProfile();
    renderSettings();
  });

  $('#export-json').addEventListener('click', exportBackup);
  $('#export-csv').addEventListener('click', exportCsv);
  $('#import-json').addEventListener('click', () => { keepUnlockedUntil = Date.now() + 120_000; });
  $('#import-json').addEventListener('change', importBackup);
  $('#wipe').addEventListener('click', () => wipeEverything(
    `Xoá toàn bộ ${state.txs.length} khoản, danh mục tự thêm, phần đã học và mật khẩu?\nKhông thể hoàn tác — nên bấm “Sao lưu” trước.`,
  ));
}

async function renderSettings() {
  $('#set-slang').checked = state.settings.slang;
  $('#set-autosave').checked = state.settings.autoSave;
  $('#set-lockafter').value = String(state.settings.lockAfter);

  const extra = state.custom.extraKeywords ?? {};
  $('#cat-settings').innerHTML = state.categories.map(c => `
    <details class="cat-set">
      <summary><span aria-hidden="true">${esc(c.icon)}</span> ${esc(c.name)} <span class="muted">· ${c.type === 'income' ? 'thu' : 'chi'} · ${c.kw.length} từ khoá</span></summary>
      ${c.keywords?.length ? `<p class="muted kw-default">${esc(c.keywords.join(', '))}</p>` : ''}
      <textarea data-cat="${esc(c.id)}" rows="2" placeholder="Từ khoá của bạn, cách nhau bằng dấu phẩy">${esc((extra[c.id] ?? []).join(', '))}</textarea>
    </details>`).join('');

  const learned = Object.entries(state.learned).sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  $('#learned-list').innerHTML = learned.length ? learned.map(([k, id]) => {
    const c = catById(id);
    return `<li><span>${esc(k)}</span><span class="muted">→ ${esc(c.icon)} ${esc(c.name)}</span>
      <button type="button" class="icon-btn" data-unlearn="${esc(k)}" aria-label="Quên">✕</button></li>`;
  }).join('') : '<li class="empty">Chưa có. Khi bạn đổi danh mục của một khoản, app sẽ nhớ ở đây.</li>';

  const persisted = await navigator.storage?.persisted?.();
  const last = state.meta.lastBackup;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  $('#data-info').innerHTML = `${state.txs.length} khoản, mã hoá và lưu ngay trên máy này${persisted ? ' (đã khoá chống tự xoá)' : ''}.<br>
    Sao lưu gần nhất: ${last ? (days === 0 ? 'hôm nay' : `${days} ngày trước`) : '<b>chưa sao lưu</b>'}.`;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBackup() {
  state.meta.lastBackup = new Date().toISOString();
  await saveProfile();
  download(`coin-manager-${today()}.json`, JSON.stringify(await store.exportBackup()), 'application/json');
  renderSettings();
}

function exportCsv() {
  if (!confirm('File CSV KHÔNG được mã hoá — ai có file cũng đọc được. Vẫn xuất?')) return;
  // Chặn công thức Excel trong tên (=, +, -, @)
  const q = v => `"${String(v ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  // Mỗi món của hoá đơn đã chia là một dòng, cột "Hoá đơn" cho biết thuộc khoản nào
  const rows = [...state.txs].sort((a, b) => a.date.localeCompare(b.date)).flatMap(t => partsOf(t).map(p => [
    t.date, q(t.name), q(p.name), t.type === 'income' ? p.amount : -p.amount, t.type === 'income' ? 'Thu' : 'Chi',
    q(catById(p.category).name), q(t.raw),
  ].join(',')));
  download(`coin-manager-${today()}.csv`, `﻿Ngày,Hoá đơn,Món,Số tiền,Loại,Danh mục,Câu nói\n${rows.join('\n')}`, 'text/csv');
}

const isValidSplit = s => s && typeof s.name === 'string' && Number.isFinite(s.amount) && s.amount > 0 && typeof s.category === 'string';
const isValidTx = t => t && typeof t.id === 'string' && typeof t.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
  && Number.isFinite(t.amount) && t.amount > 0 && (t.type === 'income' || t.type === 'expense') && typeof t.category === 'string'
  && (t.splits === undefined || (Array.isArray(t.splits) && t.splits.every(isValidSplit) && sum(t.splits) <= t.amount));

async function readFileJson(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return null;
  try {
    return JSON.parse(await file.text());
  } catch {
    toast('File không đọc được');
    return null;
  }
}

// Máy mới (chưa có mật khẩu): dùng luôn kho khoá trong bản sao lưu
async function restoreOnNewDevice(e) {
  const data = await readFileJson(e.target);
  if (!data) return;
  if (!store.isBackup(data)) return toast('Không phải bản sao lưu đã mã hoá của Coin Manager');
  const n = data.tx.length + (data.inbox?.length ?? 0);
  if (!confirm(`Khôi phục ${n} khoản? Sau đó mở khoá bằng mật khẩu bạn dùng lúc sao lưu.`)) return;
  await store.restoreFresh(data);
  renderTopbar();
  showView('record', { gate: true });
}

async function importBackup(e) {
  const data = await readFileJson(e.target);
  if (!data || !store.unlocked) return;
  let result;
  if (store.isBackup(data)) {
    result = store.needsPassphraseFor(data)
      ? await askPassphrase('File này được tạo với mật khẩu khác. Nhập mật khẩu lúc sao lưu để mở.', pass => store.readBackup(data, pass))
      : await store.readBackup(data).catch(() => null);
    if (!result) return;
  } else if (Array.isArray(data?.transactions)) {
    // Bản sao lưu cũ chưa mã hoá
    result = { txs: data.transactions, failed: 0, profile: { learned: data.learned, custom: data.custom } };
  } else {
    return toast('File không phải bản sao lưu của Coin Manager');
  }

  const txs = result.txs.filter(isValidTx).map(finalizeInboxItem);
  if (!confirm(`Khôi phục ${txs.length} khoản từ file? Khoản trùng sẽ được ghi đè, khoản khác giữ nguyên.`)) return;
  await store.putTx(txs);
  mergeTxs(txs);
  const p = result.profile ?? {};
  state.learned = { ...(p.learned ?? {}), ...state.learned };
  const added = new Map([...(p.custom?.added ?? []), ...(state.custom.added ?? [])].map(c => [c.id, c]));
  state.custom = {
    extraKeywords: { ...(p.custom?.extraKeywords ?? {}), ...state.custom.extraKeywords },
    added: [...added.values()],
  };
  await saveCustom();
  renderAll();
  toast(`Đã khôi phục ${txs.length} khoản${result.failed ? ` (${result.failed} khoản lỗi)` : ''}`);
}

// ---------- Thông báo ----------

let toastTimer;
function toast(msg, { action, onAction } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.querySelector('.toast-action')?.addEventListener('click', () => { el.hidden = true; onAction(); }, { once: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3500);
}

init();
