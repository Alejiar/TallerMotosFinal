/**
 * MotoFlow Pro - Storage Local
 * Gestión de datos en localStorage (para cache y estado)
 */

class Storage {
  static PREFIX = 'motoflow_';

  static set(key, value) {
    localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
  }

  static get(key, defaultValue = null) {
    const stored = localStorage.getItem(this.PREFIX + key);
    if (stored === null) return defaultValue;
    try {
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  }

  static remove(key) {
    localStorage.removeItem(this.PREFIX + key);
  }

  static clear() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  // Cache de datos de recursos
  static cacheAll(data) {
    for (const [resource, records] of Object.entries(data)) {
      this.set(`resource_${resource}`, records);
    }
  }

  static getCachedResource(resource) {
    return this.get(`resource_${resource}`, []);
  }

  static updateCachedResource(resource, record) {
    const records = this.getCachedResource(resource);
    const index = records.findIndex(r => r.id === record.id);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    this.set(`resource_${resource}`, records);
  }

  static removeCachedResource(resource, id) {
    const records = this.getCachedResource(resource);
    const filtered = records.filter(r => r.id !== id);
    this.set(`resource_${resource}`, filtered);
  }
}

// Exportar para uso global
window.Storage = Storage;
