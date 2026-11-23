'use strict';

// IndexedDB serializes read-write transactions across tabs, so the revision
// check and write are atomic even when two tabs save at the same time.
const memoStore = (() => {
  const name = 'pt-reading-desk';
  const records = 'memo';
  const key = 'current';
  const empty = { text: '', revision: 0 };
  let connection;

  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(records);
        request.onblocked = () => reject(new Error('Memo database is blocked'));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            connection = undefined;
          };
          resolve(db);
        };
      }).catch(error => {
        connection = undefined;
        throw error;
      });
    }
    return connection;
  }

  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(records).objectStore(records).get(key);
      request.onsuccess = () => resolve(request.result ?? empty);
      request.onerror = () => reject(request.error);
    });
  }

  async function save(text, expectedRevision) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(records, 'readwrite');
      const store = transaction.objectStore(records);
      let next;
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result ?? empty;
        if (current.revision !== expectedRevision) return;
        next = { text, revision: current.revision + 1 };
        try {
          store.put(next, key);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(next ?? null);
      transaction.onabort = () => reject(transaction.error ?? new Error('Memo save aborted'));
    });
  }

  return { read, save };
})();
