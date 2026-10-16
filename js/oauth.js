// Trang Google chuyển về sau khi đăng nhập (chỉ dùng khi app chạy dạng đã cài trên màn hình chính).
// Khi đó Google mở trong một tab Chrome riêng, không liên lạc trực tiếp được với cửa sổ app,
// nên trang này chuyển quyền truy cập về app qua BroadcastChannel + localStorage (app đọc xong xoá ngay, tự hết hạn sau 5 phút).
import { HANDOFF_KEY } from './gdrive.js';

const p = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname); // xoá quyền truy cập khỏi thanh địa chỉ / lịch sử ngay

const msg = {
  state: p.get('state'), access_token: p.get('access_token'), expires_in: p.get('expires_in'),
  scope: p.get('scope'), error: p.get('error'), at: Date.now(),
};
const title = document.getElementById('title');
const text = document.getElementById('msg');

if (!msg.state) {
  title.textContent = 'Không có thông tin đăng nhập';
  text.textContent = 'Hãy quay lại app Sổ Chi Tiêu và bấm đồng bộ.';
} else {
  try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(msg)); } catch { /* chế độ ẩn danh */ }
  try { new BroadcastChannel(HANDOFF_KEY).postMessage(msg); } catch { /* trình duyệt cũ */ }

  if (matchMedia('(display-mode: standalone)').matches) {
    // Trang này đang mở ngay trong cửa sổ app → quay về app, app tự đồng bộ tiếp
    location.replace('./#settings');
  } else {
    title.textContent = msg.error ? 'Đăng nhập không thành công' : '✓ Đã đăng nhập Google';
    text.textContent = msg.error
      ? 'Quay lại app Sổ Chi Tiêu và thử lại.'
      : 'Quay lại app Sổ Chi Tiêu — việc đồng bộ sẽ tự chạy tiếp. Có thể đóng tab này.';
    setTimeout(() => window.close(), 800);
  }
}
