// Mã hoá trong trình duyệt bằng Web Crypto — không thư viện ngoài, không gửi gì ra mạng.
//
//   mật khẩu ──PBKDF2-SHA256, 600.000 vòng──► KEK (không bao giờ lưu)
//   KEK bọc (AES-GCM) ──► DEK: khoá AES-256 ngẫu nhiên, mã hoá từng khoản chi + hồ sơ
//   KEK bọc (AES-GCM) ──► khoá riêng ECDH P-256
//   khoá công khai ECDH để dạng thường → GHI được khi đang khoá (ECIES vào hộp chờ),
//   nhưng chỉ ĐỌC được sau khi nhập mật khẩu.
//
// Mỗi bản mã gắn "nhãn" (AAD) — ví dụ "tx:<id>" — nên không thể tráo bản mã giữa các khoản.

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = crypto.subtle;

export const DEFAULT_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;
const DEK_ALG = { name: 'AES-GCM', length: 256 };
const EC_ALG = { name: 'ECDH', namedCurve: 'P-256' };
const INBOX_INFO = te.encode('coin-manager/inbox/v1');

export class WrongPassphrase extends Error {
  constructor() { super('Sai mật khẩu'); }
}

export function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

// Bàn phím tiếng Việt có thể gõ "ư" dạng dựng sẵn hoặc tổ hợp — chuẩn hoá để cùng một mật khẩu luôn ra cùng một khoá
const passBytes = p => te.encode(String(p).normalize('NFC'));

async function deriveKek(pass, salt, iterations) {
  const base = await subtle.importKey('raw', passBytes(pass), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, DEK_ALG, false, ['wrapKey', 'unwrapKey'],
  );
}

async function wrap(format, key, kek, label) {
  const iv = rand(12);
  const ct = await subtle.wrapKey(format, key, kek, { name: 'AES-GCM', iv, additionalData: te.encode(label) });
  return { iv: toB64(iv), ct: toB64(ct) };
}

function unwrap(format, box, kek, label, alg, extractable, usages) {
  return subtle.unwrapKey(
    format, fromB64(box.ct), kek, { name: 'AES-GCM', iv: fromB64(box.iv), additionalData: te.encode(label) },
    alg, extractable, usages,
  );
}

async function wrapAll(dek, priv, pass, iterations) {
  const salt = rand(16);
  const kek = await deriveKek(pass, salt, iterations);
  return {
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toB64(salt) },
    dek: await wrap('raw', dek, kek, 'dek'),
    priv: await wrap('pkcs8', priv, kek, 'priv'),
  };
}

/** Tạo kho khoá mới. Trả về { vault (để lưu), keys (dùng trong phiên, không xuất được) }. */
export async function createVault(pass, { iterations = DEFAULT_ITERATIONS } = {}) {
  const dek = await subtle.generateKey(DEK_ALG, true, ['encrypt', 'decrypt']);
  const pair = await subtle.generateKey(EC_ALG, true, ['deriveBits']);
  const vault = {
    v: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...(await wrapAll(dek, pair.privateKey, pass, iterations)),
    pub: toB64(await subtle.exportKey('raw', pair.publicKey)),
  };
  // Bản dùng trong phiên được nhập lại ở dạng không xuất được
  const keys = {
    dek: await subtle.importKey('raw', await subtle.exportKey('raw', dek), DEK_ALG, false, ['encrypt', 'decrypt']),
    priv: await subtle.importKey('pkcs8', await subtle.exportKey('pkcs8', pair.privateKey), EC_ALG, false, ['deriveBits']),
  };
  return { vault, keys };
}

/** Mở khoá. Sai mật khẩu → WrongPassphrase (AES-GCM từ chối vì sai thẻ xác thực). */
export async function unlockVault(vault, pass, { extractable = false } = {}) {
  const kek = await deriveKek(pass, fromB64(vault.kdf.salt), vault.kdf.iterations);
  try {
    return {
      dek: await unwrap('raw', vault.dek, kek, 'dek', DEK_ALG, extractable, ['encrypt', 'decrypt']),
      priv: await unwrap('pkcs8', vault.priv, kek, 'priv', EC_ALG, extractable, ['deriveBits']),
    };
  } catch {
    throw new WrongPassphrase();
  }
}

/** Đổi mật khẩu: chỉ bọc lại khoá, không cần mã hoá lại dữ liệu. */
export async function changePassphrase(vault, oldPass, newPass, { iterations = DEFAULT_ITERATIONS } = {}) {
  const { dek, priv } = await unlockVault(vault, oldPass, { extractable: true });
  return { ...vault, ...(await wrapAll(dek, priv, newPass, iterations)), changedAt: new Date().toISOString() };
}

export async function encryptJson(key, label, obj) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(label) }, key, te.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson(key, label, box) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: te.encode(label) }, key, fromB64(box.ct));
  return JSON.parse(td.decode(pt));
}

async function inboxKey(privateKey, publicKey, epkBytes, usage) {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: epkBytes, info: INBOX_INFO }, hkdf, DEK_ALG, false, [usage]);
}

/** Mã hoá một chiều bằng khoá công khai (dùng khi app đang khoá). */
export async function sealToPublic(pubB64, label, obj) {
  const pub = await subtle.importKey('raw', fromB64(pubB64), EC_ALG, false, []);
  const eph = await subtle.generateKey(EC_ALG, false, ['deriveBits']);
  const epk = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  const key = await inboxKey(eph.privateKey, pub, epk, 'encrypt');
  return { epk: toB64(epk), ...(await encryptJson(key, label, obj)) };
}

export async function openSealed(priv, label, sealed) {
  const epkBytes = fromB64(sealed.epk);
  const epk = await subtle.importKey('raw', epkBytes, EC_ALG, false, []);
  const key = await inboxKey(priv, epk, epkBytes, 'decrypt');
  return decryptJson(key, label, sealed);
}

/** Trả về lý do mật khẩu quá yếu, hoặc '' nếu dùng được. */
export function passphraseIssues(p) {
  const s = String(p ?? '');
  if (s.length < MIN_PASSPHRASE) return `Cần ít nhất ${MIN_PASSPHRASE} ký tự.`;
  if (/^\d+$/.test(s) && s.length < 12) return 'Chỉ toàn số thì dễ bị dò. Nên dùng một câu ngắn có chữ.';
  if (new Set(s).size < 4) return 'Mật khẩu quá đơn giản.';
  return '';
}
