// Hộp thoại / bảng nổi cư xử như app điện thoại:
// - Nút Back (Android, nhất là khi mở app từ màn hình chính) đóng lớp trên cùng thay vì thoát app.
// - Bảng trượt từ dưới lên (dialog.sheet) kéo xuống để đóng.

// ---------- Nút Back ----------
// Mỗi lớp đang mở có một mục lịch sử riêng (history.state.layer = 1, 2, …): Back gỡ mục trên cùng → đóng lớp đó.
// Lớp đóng bằng nút trong app thì tự gỡ mục của nó, để lần Back sau không phải bấm thừa.

const layers = [];        // [{ close }] theo thứ tự mở
let traversing = false;   // đang history.go(-n) để gỡ mục của lớp đã đóng
let queued = false;

const depth = () => history.state?.layer ?? 0;

function reconcile() {
  queued = false;
  if (traversing) return; // chờ popstate rồi tính lại
  let d = depth();
  if (d > layers.length) {
    traversing = true;
    history.go(layers.length - d);
    return;
  }
  while (d < layers.length) history.pushState({ ...history.state, layer: ++d }, '');
}

function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(reconcile); // gom nhiều lớp đóng/mở cùng lúc (ví dụ khoá app đóng mọi hộp thoại)
}

addEventListener('popstate', () => {
  if (traversing) traversing = false;
  else {
    const d = depth();
    while (layers.length > d) layers.pop().close(); // Back → đóng lớp trên cùng
  }
  reconcile();
});

/** Mở một lớp (bảng, chế độ chọn…): Back sẽ gọi close(). Trả về hàm cần gọi khi lớp đóng bằng cách khác. */
export function openLayer(close) {
  const layer = { close };
  layers.push(layer);
  schedule();
  return () => {
    const i = layers.indexOf(layer);
    if (i < 0) return; // đã đóng bằng Back
    layers.splice(i, 1);
    schedule();
  };
}

// ---------- Kéo xuống để đóng ----------

const narrow = matchMedia('(max-width: 600px)'); // chỉ trên điện thoại hộp thoại mới là bảng trượt từ dưới lên
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let drag = null;

function setOffset(d, y) {
  d.style.transform = y ? `translateY(${y}px)` : '';
  d.style.setProperty('--drag', y ? Math.min(1, y / d.offsetHeight).toFixed(3) : '0'); // nền mờ nhạt dần
}

function dismiss(d) {
  if (reduceMotion.matches) return d.close();
  d.classList.add('leaving');
  setOffset(d, d.offsetHeight);
  const finish = e => {
    if (e && (e.target !== d || e.propertyName !== 'transform')) return;
    d.removeEventListener('transitionend', finish);
    clearTimeout(timer);
    d.close();
    d.classList.remove('leaving');
    setOffset(d, 0);
  };
  const timer = setTimeout(finish, 320);
  d.addEventListener('transitionend', finish);
}

function onTouchStart(e) {
  const d = e.currentTarget;
  // Kéo được khi nội dung đang ở đầu (đang cuộn giữa chừng thì vuốt xuống là cuộn lên như bình thường)
  if (!narrow.matches || e.touches.length > 1 || d.scrollTop > 0 || d.classList.contains('leaving')) return;
  const t = e.touches[0];
  drag = { d, x0: t.clientX, y0: t.clientY, dy: 0, active: false, v: 0, lastY: t.clientY, lastT: e.timeStamp };
}

function onTouchMove(e) {
  if (!drag || drag.d !== e.currentTarget) return;
  const t = e.touches[0];
  const dx = t.clientX - drag.x0;
  const dy = t.clientY - drag.y0;
  if (!drag.active) {
    if (Math.abs(dx) > 8 || dy < -4 || !e.cancelable) { drag = null; return; } // vuốt ngang / lên → để trình duyệt cuộn
    if (dy < 4 || Math.abs(dx) > dy) return;
    drag.active = true;
    drag.d.classList.add('dragging');
  }
  e.preventDefault();
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = (t.clientY - drag.lastY) / dt;
  drag.lastY = t.clientY;
  drag.lastT = e.timeStamp;
  drag.dy = Math.max(0, dy);
  setOffset(drag.d, drag.dy);
}

function onTouchEnd(e) {
  if (!drag || drag.d !== e.currentTarget) return;
  const { d, dy, v, active } = drag;
  drag = null;
  if (!active) return;
  d.classList.remove('dragging');
  // Kéo quá ~1/4 bảng, hoặc hất nhanh xuống → đóng; không thì bật về chỗ cũ
  if (dy > Math.min(160, d.offsetHeight * 0.25) || (v > 0.5 && dy > 24)) dismiss(d);
  else setOffset(d, 0);
}

const draggable = new WeakSet();

function enableDrag(d) {
  if (draggable.has(d)) return;
  draggable.add(d);
  d.addEventListener('touchstart', onTouchStart, { passive: true });
  d.addEventListener('touchmove', onTouchMove, { passive: false });
  d.addEventListener('touchend', onTouchEnd);
  d.addEventListener('touchcancel', onTouchEnd);
}

// ---------- Mọi <dialog> đều là một lớp ----------

const dialogLayers = new Map();

function onDialogToggle(d) {
  if (d.open && !dialogLayers.has(d)) {
    dialogLayers.set(d, openLayer(() => d.close()));
    if (d.classList.contains('sheet')) enableDrag(d);
  } else if (!d.open && dialogLayers.has(d)) {
    dialogLayers.get(d)();
    dialogLayers.delete(d);
    setOffset(d, 0);
  }
}

/** Theo dõi mọi hộp thoại (kể cả tạo sau, như lịch chọn ngày) mở/đóng. */
export function watchDialogs(root = document.body) {
  new MutationObserver(records => {
    for (const r of records) if (r.target.tagName === 'DIALOG') onDialogToggle(r.target);
  }).observe(root, { subtree: true, attributes: true, attributeFilter: ['open'] });
  root.querySelectorAll('dialog[open]').forEach(onDialogToggle);
  schedule(); // tải lại trang lúc đang mở hộp thoại → gỡ mục lịch sử còn sót
}
