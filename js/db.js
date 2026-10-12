// IndexedDB thô. Lớp mã hoá nằm ở store.js — file này không biết gì về nội dung.
//   tx    : { id, enc }     khoản đã mã hoá bằng khoá dữ liệu
//   inbox : { id, sealed }  khoản ghi lúc app đang khoá (mã hoá bằng khoá công khai)
//   kv    : vault, profile (đã mã hoá), settings (không nhạy cảm)

const DB_NAME = 'coin-manager';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('tx', { keyPath: 'id' });
      db.createObjectStore('inbox', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const db = {
  all: store => run(store, 'readonly', t => t.objectStore(store).getAll()),
  count: store => run(store, 'readonly', t => t.objectStore(store).count()),
  putMany: (store, rows) => run(store, 'readwrite', t => { rows.forEach(r => t.objectStore(store).put(r)); }),
  deleteMany: (store, ids) => run(store, 'readwrite', t => { ids.forEach(id => t.objectStore(store).delete(id)); }),
  get: async (key, fallback) => (await run('kv', 'readonly', t => t.objectStore('kv').get(key))) ?? fallback,
  set: (key, value) => run('kv', 'readwrite', t => t.objectStore('kv').put(value, key)),
  del: key => run('kv', 'readwrite', t => t.objectStore('kv').delete(key)),
  wipe: () => run(['tx', 'inbox', 'kv'], 'readwrite', t => { ['tx', 'inbox', 'kv'].forEach(s => t.objectStore(s).clear()); }),
};
