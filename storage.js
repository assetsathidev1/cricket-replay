const DB_NAME = 'cricket-replay';
const DB_VERSION = 1;
const INCIDENTS_STORE = 'incidents';

class Storage {
  constructor() { this.db = null; }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(INCIDENTS_STORE)) {
          db.createObjectStore(INCIDENTS_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async saveIncident(incident) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(INCIDENTS_STORE, 'readwrite');
      const req = tx.objectStore(INCIDENTS_STORE).add(incident);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllIncidents() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(INCIDENTS_STORE, 'readonly');
      const req = tx.objectStore(INCIDENTS_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteIncident(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(INCIDENTS_STORE, 'readwrite');
      const req = tx.objectStore(INCIDENTS_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
