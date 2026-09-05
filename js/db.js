/**
 * VitaNova — db.js
 * IndexedDB wrapper for offline data storage
 */
const DB_NAME = 'vitanova-db';
const DB_VERSION = 4;  // Direct extraction - zero placeholders
const STORE_DISEASES = 'diseases';
const STORE_SYMPTOM_MAP = 'symptom_map';
const STORE_CHAPTERS = 'chapters';
const STORE_META = 'meta';
const STORE_DISPENSARY = 'dispensary';

class VitaNovaDB {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_DISEASES)) {
          const store = db.createObjectStore(STORE_DISEASES, { keyPath: 'id' });
          store.createIndex('chapter_num', 'chapter_num', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        } else if (e.oldVersion < 3) {
          // Clear old partial database to load complete 532 guidelines
          try {
            const tx = req.transaction;
            tx.objectStore(STORE_DISEASES).clear();
            if (db.objectStoreNames.contains(STORE_DISPENSARY)) tx.objectStore(STORE_DISPENSARY).clear();
            if (db.objectStoreNames.contains(STORE_SYMPTOM_MAP)) tx.objectStore(STORE_SYMPTOM_MAP).clear();
            if (db.objectStoreNames.contains(STORE_META)) tx.objectStore(STORE_META).clear();
          } catch(err) {
            console.warn('Store clear error during migration:', err);
          }
        }
        if (!db.objectStoreNames.contains(STORE_SYMPTOM_MAP)) {
          db.createObjectStore(STORE_SYMPTOM_MAP, { keyPath: 'keyword' });
        }
        if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
          db.createObjectStore(STORE_CHAPTERS, { keyPath: 'num' });
        }
        if (!db.objectStoreNames.contains(STORE_DISPENSARY)) {
          db.createObjectStore(STORE_DISPENSARY, { keyPath: 'disease_id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        this.ready = true;
        resolve(this.db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async isDataLoaded() {
    const meta = await this.getMeta('data_loaded');
    return meta && meta.value === true;
  }

  async getMeta(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async setMeta(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_META, 'readwrite');
      const req = tx.objectStore(STORE_META).put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async bulkPutDiseases(diseases) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISEASES, 'readwrite');
      const store = tx.objectStore(STORE_DISEASES);
      diseases.forEach(d => store.put(d));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async bulkPutSymptomMap(map) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_SYMPTOM_MAP, 'readwrite');
      const store = tx.objectStore(STORE_SYMPTOM_MAP);
      Object.entries(map).forEach(([keyword, ids]) => {
        store.put({ keyword, ids });
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async bulkPutChapters(chapters) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_CHAPTERS, 'readwrite');
      const store = tx.objectStore(STORE_CHAPTERS);
      Object.entries(chapters).forEach(([num, data]) => {
        store.put({ num, ...data });
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllDiseases() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISEASES, 'readonly');
      const req = tx.objectStore(STORE_DISEASES).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getDiseaseById(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISEASES, 'readonly');
      const req = tx.objectStore(STORE_DISEASES).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getDiseasesByChapter(chapterNum) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISEASES, 'readonly');
      const idx = tx.objectStore(STORE_DISEASES).index('chapter_num');
      const req = idx.getAll(chapterNum);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getDiseasesByPriority(priority) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISEASES, 'readonly');
      const idx = tx.objectStore(STORE_DISEASES).index('priority');
      const req = idx.getAll(priority);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getSymptomDiseases(keyword) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_SYMPTOM_MAP, 'readonly');
      const req = tx.objectStore(STORE_SYMPTOM_MAP).get(keyword);
      req.onsuccess = () => resolve(req.result ? req.result.ids : []);
      req.onerror = () => reject(req.error);
    });
  }

  async bulkPutDispensary(dispensaryData) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISPENSARY, 'readwrite');
      const store = tx.objectStore(STORE_DISPENSARY);
      Object.values(dispensaryData).forEach(entry => store.put(entry));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllDispensary() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_DISPENSARY, 'readonly');
      const req = tx.objectStore(STORE_DISPENSARY).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllChapters() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_CHAPTERS, 'readonly');
      const req = tx.objectStore(STORE_CHAPTERS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

window.vitaDB = new VitaNovaDB();
