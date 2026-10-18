// Lịch chọn ngày theo theme vịt — thay hộp chọn ngày mặc định của hệ điều hành (không tô được bằng CSS).
// Ô <input type="date"> vẫn giữ nguyên (ẩn đi) nên mọi chỗ đọc/ghi .value và sự kiện input/change không phải sửa.
import { today, addDays, dayLabel, escapeHtml } from './format.js';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const valueProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const pad = n => String(n).padStart(2, '0');

let dlg = null;
let target = null;
let view = { y: 0, m: 0 }; // tháng đang xem (m: 1–12)

function label(iso) {
  if (!iso) return 'Chọn ngày';
  const [y, m, d] = iso.split('-').map(Number);
  const base = dayLabel(iso);
  const short = `${d}/${m}${y === new Date().getFullYear() ? '' : `/${y}`}`;
  return base === 'Hôm nay' || base === 'Hôm qua' ? `${base} · ${short}` : base.replace(/\d+\/\d+$/, short);
}

function ensureDialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'date-dialog';
  dlg.setAttribute('aria-label', 'Chọn ngày');
  dlg.innerHTML = `
    <div class="dp-head">
      <button type="button" class="icon-btn" data-dp-shift="-1" aria-label="Tháng trước">‹</button>
      <b class="dp-title"></b>
      <button type="button" class="icon-btn" data-dp-shift="1" aria-label="Tháng sau">›</button>
    </div>
    <div class="dp-week" aria-hidden="true">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="dp-grid"></div>
    <div class="dp-quick">
      <button type="button" class="btn" data-dp-day="-2">Hôm kia</button>
      <button type="button" class="btn" data-dp-day="-1">Hôm qua</button>
      <button type="button" class="btn primary" data-dp-day="0">Hôm nay</button>
    </div>`;
  document.body.append(dlg);
  dlg.addEventListener('click', e => {
    if (e.target === dlg) return dlg.close(); // chạm ra ngoài để đóng
    const shift = e.target.closest('[data-dp-shift]');
    if (shift) {
      const d = new Date(view.y, view.m - 1 + Number(shift.dataset.dpShift), 1);
      view = { y: d.getFullYear(), m: d.getMonth() + 1 };
      return render();
    }
    const quick = e.target.closest('[data-dp-day]');
    if (quick) return pick(addDays(today(), Number(quick.dataset.dpDay)));
    const day = e.target.closest('[data-date]');
    if (day) pick(day.dataset.date);
  });
  return dlg;
}

function render() {
  const selected = valueProp.get.call(target);
  const t = today();
  const first = new Date(view.y, view.m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // tuần bắt đầu từ thứ Hai
  const days = new Date(view.y, view.m, 0).getDate();
  dlg.querySelector('.dp-title').textContent = `Tháng ${view.m}/${view.y}`;
  let html = '<span></span>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const iso = `${view.y}-${pad(view.m)}-${pad(d)}`;
    const cls = ['dp-day', iso === selected && 'is-selected', iso === t && 'is-today', iso > t && 'is-future'].filter(Boolean).join(' ');
    html += `<button type="button" class="${cls}" data-date="${iso}" aria-label="${escapeHtml(label(iso))}"${iso === selected ? ' aria-pressed="true"' : ''}>${d}</button>`;
  }
  dlg.querySelector('.dp-grid').innerHTML = html;
}

function pick(iso) {
  target.value = iso;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  dlg.close();
  target.nextElementSibling?.focus();
}

function open(input) {
  target = input;
  const [y, m] = (valueProp.get.call(input) || today()).split('-').map(Number);
  view = { y, m };
  ensureDialog();
  render();
  dlg.showModal();
  (dlg.querySelector('.is-selected') ?? dlg.querySelector('.is-today') ?? dlg.querySelector('.dp-day'))?.focus();
}

/** Thay mọi <input type="date"> bằng nút mở lịch; ô gốc vẫn giữ giá trị. */
export function enhanceDateInputs(root = document) {
  root.querySelectorAll('input[type="date"]:not([data-dp])').forEach(input => {
    input.dataset.dp = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-btn';
    input.after(btn);
    input.classList.add('sr-only');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    const update = () => {
      btn.innerHTML = `<span aria-hidden="true">📅</span><span>${escapeHtml(label(valueProp.get.call(input)))}</span>`;
    };
    // Code khác gán input.value = ... → nút tự cập nhật
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return valueProp.get.call(this); },
      set(v) { valueProp.set.call(this, v); update(); },
    });
    btn.addEventListener('click', () => open(input));
    update();
  });
}
