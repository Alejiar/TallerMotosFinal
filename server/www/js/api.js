/**
 * MotoFlow Pro - Cliente API
 * Abstracción para comunicarse con endpoints PHP
 */

class API {
  static baseURL = '/api';

  static async fetch(url, options = {}) {
    const response = await fetch(this.baseURL + url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) return null; // No content

    const data = await response.json();
    return data;
  }

  // Sincronización completa
  static sync() {
    return this.fetch('/sync.php');
  }

  // GET todos los registros de un recurso
  static getAll(resource) {
    return this.fetch(`/resource.php?name=${resource}`);
  }

  // GET un registro específico
  static getOne(resource, id) {
    return this.fetch(`/resource.php?name=${resource}&id=${id}`);
  }

  // POST crear registro
  static create(resource, data) {
    return this.fetch('/resource.php', {
      method: 'POST',
      body: JSON.stringify({ name: resource, ...data }),
    });
  }

  // PATCH actualizar registro
  static update(resource, id, data) {
    return this.fetch('/resource.php', {
      method: 'PATCH',
      body: JSON.stringify({ name: resource, id, ...data }),
    });
  }

  // DELETE eliminar registro
  static delete(resource, id) {
    return this.fetch(`/resource.php?name=${resource}&id=${id}`, {
      method: 'DELETE',
    });
  }

  // Upload archivo
  static async upload(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(this.baseURL + '/upload.php', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }
}

// Exportar para uso global
window.API = API;
