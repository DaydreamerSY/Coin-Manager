// Lưu trữ đã mã hoá. Mọi thứ ghi xuống trình duyệt đều là bản mã, trừ:
//   - vault: muối + khoá đã bọc + khoá công khai (không lộ gì nếu không có mật khẩu)
//   - settings: tiếng lóng / tự lưu / thời gian tự khoá (không nhạy cảm)
import { db } from './db.js';
import * as V from './vault.js';

let vault = null;
let keys = null; // { dek, priv } — chỉ nằm trong RAM khi đã mở khoá

const txLabel = id => `tx:${id}`;
const encryptTx = async t => ({ id: t.id, enc: await V.encryptJson(keys.dek, txLabel(t.id), t) });

function requireKeys() {
  if (!keys) throw new Error('Đang khoá');
}

async function decryptRows(k, rows) {
  let failed = 0;
  const out = await Promise.all(rows.map(async r => {
    try {
      return r.enc ? await V.decryptJson(k.dek, txLabel(r.id), r.enc) : await V.openSealed(k.priv, txLabel(r.id), r.sealed);
    } catch {
      failed += 1;
      return null;
    }
  }));
  return { items: out.filter(Boolean), failed };
}

export const store = {
  async init() { vault = await db.get('vault', null); },
  get hasVault() { return !!vault; },
  get unlocked() { return !!keys; },

  async setup(pass) {
    const r = await V.createVault(pass);
    await db.set('vault', r.vault);
    vault = r.vault;
    keys = r.keys;
  },
  async unlock(pass) { keys = await V.unlockVault(vault, pass); },
  lock() { keys = null; },
  async changePassphrase(oldPass, newPass) {
    const next = await V.changePassphrase(vault, oldPass, newPass);
    await db.set('vault', next);
    vault = next;
  },

  async loadTx() {
    requireKeys();
    const { items, failed } = await decryptRows(keys, await db.all('tx'));
    return { txs: items, failed };
  },
  async putTx(list) {
    requireKeys();
    await db.putMany('tx', await Promise.all(list.map(encryptTx)));
  },
  deleteTx: ids => db.deleteMany('tx', ids),

  // Hộp chờ: ghi khi đang khoá, chỉ đọc được bằng khoá riêng
  async addToInbox(list) {
    const rows = await Promise.all(list.map(async t => ({ id: t.id, sealed: await V.sealToPublic(vault.pub, txLabel(t.id), t) })));
    await db.putMany('inbox', rows);
  },
  inboxCount: () => db.count('inbox'),
  async loadInbox() {
    requireKeys();
    return decryptRows(keys, await db.all('inbox'));
  },
  deleteInbox: ids => db.deleteMany('inbox', ids),

  async loadProfile() {
    requireKeys();
    const box = await db.get('profile', null);
    return box ? V.decryptJson(keys.dek, 'profile', box) : null;
  },
  async saveProfile(profile) {
    requireKeys();
    await db.set('profile', await V.encryptJson(keys.dek, 'profile', profile));
  },

  // Bản sao lưu = nguyên bản mã + vault. Mở bằng đúng mật khẩu lúc sao lưu.
  async exportBackup() {
    return {
      app: 'coin-manager', format: 'encrypted-v1', exportedAt: new Date().toISOString(),
      vault, tx: await db.all('tx'), inbox: await db.all('inbox'), profile: await db.get('profile', null),
    };
  },
  isBackup: data => {
    const v = data?.vault;
    return data?.app === 'coin-manager' && data.format === 'encrypted-v1' && Array.isArray(data.tx)
      && typeof v?.id === 'string' && typeof v.pub === 'string' && v.dek?.ct && v.priv?.ct
      && typeof v.kdf?.salt === 'string' && Number.isInteger(v.kdf.iterations) && v.kdf.iterations >= 100_000;
  },
  /** Máy mới chưa có mật khẩu: dùng luôn kho khoá trong file. */
  async restoreFresh(data) {
    await db.putMany('tx', data.tx);
    await db.putMany('inbox', data.inbox ?? []);
    if (data.profile) await db.set('profile', data.profile);
    await db.set('vault', data.vault);
    vault = data.vault;
  },
  needsPassphraseFor: data => data.vault.id !== vault?.id,
  /** Giải mã một bản sao lưu (cùng kho khoá thì không cần mật khẩu). */
  async readBackup(data, pass) {
    const k = this.needsPassphraseFor(data) ? await V.unlockVault(data.vault, pass) : keys;
    const tx = await decryptRows(k, data.tx);
    const inbox = await decryptRows(k, data.inbox ?? []);
    const profile = data.profile ? await V.decryptJson(k.dek, 'profile', data.profile).catch(() => null) : null;
    return { txs: [...tx.items, ...inbox.items], failed: tx.failed + inbox.failed, profile };
  },

  async wipe() {
    await db.wipe();
    vault = null;
    keys = null;
  },
};
