// Google Drive: chỉ dùng thư mục ẩn riêng của app (quyền drive.appdata — Google xếp loại "không nhạy cảm").
// Đăng nhập bằng Google Identity Services (mô hình token, không cần máy chủ). Thư viện chỉ được tải khi
// bạn bấm đồng bộ; quyền truy cập (sống ~1 giờ) chỉ giữ trong bộ nhớ, không lưu xuống trình duyệt.
// File trên Drive là bản sao lưu ĐÃ MÃ HOÁ — Google không đọc được nội dung.

const CLIENT_ID = '427368913266-13117203mqq82vf7ov99vlasn4jejgnf.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'coin-manager-sync.json';
const API = 'https://www.googleapis.com';

let gisPromise = null;
let token = null; // { value, expiresAt }

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Thư viện Google lỗi')));
    s.onerror = () => { gisPromise = null; reject(new Error('Không tải được Google (cần có mạng)')); };
    document.head.append(s);
  });
  return gisPromise;
}

/** Tải sẵn thư viện (để khi bấm thì cửa sổ Google mở ngay, không bị trình duyệt chặn). */
export const preload = () => loadGis().catch(() => {});

const POPUP_ERRORS = {
  popup_failed_to_open: 'Trình duyệt chặn cửa sổ Google. Bấm lại lần nữa nhé.',
  popup_closed: 'Bạn đã đóng cửa sổ Google.',
};

/** Phải gọi ngay trong lúc người dùng vừa bấm (Google yêu cầu thao tác người dùng để mở cửa sổ). */
export async function getToken({ hint } = {}) {
  if (token && token.expiresAt - Date.now() > 60_000) return token.value;
  const oauth2 = await loadGis();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      hint,
      prompt: '',
      callback: resp => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        if (!oauth2.hasGrantedAllScopes(resp, SCOPE)) return reject(new Error('Bạn chưa cho phép app lưu vào Google Drive.'));
        token = { value: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000 };
        resolve(token.value);
      },
      error_callback: err => reject(new Error(POPUP_ERRORS[err?.type] ?? `Lỗi đăng nhập Google: ${err?.message || err?.type}`)),
    });
    client.requestAccessToken();
  });
}

export function forgetToken({ revoke = false } = {}) {
  if (revoke && token) window.google?.accounts?.oauth2?.revoke(token.value, () => {});
  token = null;
}

async function api(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token?.value}`, ...headers }, body });
  if (res.status === 401) {
    token = null;
    throw new Error('Phiên Google đã hết hạn, bấm đồng bộ lại.');
  }
  if (res.status === 403) throw new Error('Google Drive từ chối (403) — kiểm tra project đã bật "Google Drive API" chưa.');
  if (!res.ok) throw new Error(`Google Drive báo lỗi ${res.status}.`);
  return res;
}

export async function whoAmI() {
  const res = await api('/drive/v3/about?fields=user(emailAddress)');
  return (await res.json()).user?.emailAddress ?? null;
}

/** File đồng bộ trong thư mục ẩn của app, hoặc null. Không đụng tới file nào khác. */
export async function findSyncFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)`);
  return (await res.json()).files?.[0] ?? null;
}

export async function downloadSyncFile(id) {
  return (await api(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`)).json();
}

export async function uploadSyncFile(data, id) {
  const body = JSON.stringify(data);
  if (id) {
    const res = await api(`/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
    });
    return res.json();
  }
  const boundary = `coin-${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
    + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api('/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  return res.json();
}
