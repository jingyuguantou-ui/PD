/**
 * library-db.js — IndexedDB 本地图纸缓存
 * 双轨策略：服务端(主) + IndexedDB(备份)，离线时自动降级到本地
 */
const LibraryDB = (() => {
  const DB_NAME = "pindou-library";
  const DB_VER = 1;
  const STORE = "drawings";
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function tx(mode) {
    const db = await open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async function put(drawing) {
    const store = await tx("readwrite");
    return new Promise((res, rej) => {
      const req = store.put(drawing);
      req.onsuccess = () => res();
      req.onerror = (e) => rej(e.target.error);
    });
  }

  async function get(id) {
    const store = await tx("readonly");
    return new Promise((res, rej) => {
      const req = store.get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = (e) => rej(e.target.error);
    });
  }

  async function del(id) {
    const store = await tx("readwrite");
    return new Promise((res, rej) => {
      const req = store.delete(id);
      req.onsuccess = () => res();
      req.onerror = (e) => rej(e.target.error);
    });
  }

  async function list() {
    const store = await tx("readonly");
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).map(({ grid, p, gcols, grows, w, h, ...meta }) => meta);
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res(items);
      };
      req.onerror = (e) => rej(e.target.error);
    });
  }

  async function clear() {
    const store = await tx("readwrite");
    return new Promise((res, rej) => {
      const req = store.clear();
      req.onsuccess = () => res();
      req.onerror = (e) => rej(e.target.error);
    });
  }

  return { open, put, get, del, list, clear };
})();
