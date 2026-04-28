/**
 * MotoFlow Pro - Adaptador API (Compatibilidad)
 * Convierte llamadas antiguas script.js al backend Node.js/Express
 */

let cachedResources = {};

// ─── api() ────────────────────────────────────────────────────────────────────
// Reemplaza la función global api() de script.js.
// auth/login y auth/logout se manejan localmente; todo lo demás se proxea al servidor.
async function api(archivo, accion, datos = {}) {
  try {
    if (archivo === 'auth' && accion === 'login') {
      // Login contra el servidor Node.js
      const r = await fetch('/php/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: datos.username, password: datos.password }),
      });
      const res = await r.json();
      if (res.ok) {
        const user = { id: res.uid, nombre: res.nombre, rol: res.rol, name: res.nombre, role: res.rol, username: datos.username };
        Auth.currentUser = user;
        localStorage.setItem('motoflow_user', JSON.stringify(user));
        await syncAllData();
      }
      return res;
    }

    if (archivo === 'auth' && accion === 'logout') {
      Auth.currentUser = null;
      localStorage.removeItem('motoflow_user');
      return { ok: true };
    }

    // Proxy al servidor /php/:resource
    const r = await fetch(`/php/${archivo}?action=${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: accion, ...datos }),
    });
    return r.json();
  } catch (error) {
    console.error('[API Adapter]', archivo, accion, error);
    return { error: error.message };
  }
}

// ─── get() ────────────────────────────────────────────────────────────────────
// Reemplaza la función global get() de script.js.
async function get(archivo, accion, params = '') {
  try {
    // Estado de sesión desde localStorage (script.js lo llama en DOMContentLoaded)
    if (archivo === 'auth') {
      const stored = localStorage.getItem('motoflow_user');
      if (stored) {
        const u = JSON.parse(stored);
        return { uid: u.id, nombre: u.nombre || u.name, rol: u.rol || u.role };
      }
      return { uid: null };
    }

    // Dashboard directo al servidor
    if (archivo === 'dashboard') {
      return await fetch('/php/dashboard').then(r => r.json());
    }

    // GET genérico — listar recursos
    if (accion === '' || accion === 'listar') {
      const r = await fetch(`/php/${archivo}?action=listar`);
      return r.json();
    }

    // Fallback: proxear al servidor
    const r = await fetch(`/php/${archivo}?action=${accion}${params}`);
    return r.json();
  } catch (error) {
    console.error('[GET Adapter]', archivo, accion, error);
    return { error: error.message };
  }
}

// ─── syncAllData() ───────────────────────────────────────────────────────────
async function syncAllData() {
  try {
    const data = await fetch('/api/sync').then(r => r.json());
    cachedResources = data;
    if (typeof Storage !== 'undefined' && Storage.cacheAll) Storage.cacheAll(data);
    // Exponer en window para compatibilidad con script.js
    const keys = ['clientes','motos','ordenes','productos','proveedores','empleados','compras','ventas','notas','caja'];
    for (const k of keys) {
      if (data[k]) window[k + 'Data'] = data[k];
    }
    return data;
  } catch (e) {
    console.error('[syncAllData]', e);
    return {};
  }
}

// ─── Router.init() override ──────────────────────────────────────────────────
// Router.navigate() de router.js no tiene rutas registradas; lo redirigimos a
// showPage() de script.js que sí sabe renderizar cada sección.
Router.init = function () {
  document.querySelectorAll('a[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof showPage === 'function') showPage(link.dataset.page);
    });
  });
  if (typeof showPage === 'function') showPage('dashboard');
};

// ─── Sesión persistente ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const stored = localStorage.getItem('motoflow_user');
  if (!stored) return;

  try {
    Auth.currentUser = JSON.parse(stored);
    const loginScreen = document.getElementById('login-screen');
    const appEl = document.getElementById('app');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appEl) appEl.classList.remove('hidden');
    const topbarUser = document.getElementById('topbar-user');
    if (topbarUser) {
      topbarUser.textContent = `👤 ${Auth.currentUser.nombre || Auth.currentUser.name} (${Auth.currentUser.rol || Auth.currentUser.role})`;
    }
    await syncAllData();
    if (typeof showPage === 'function') showPage('dashboard');
  } catch (e) {
    console.error('[Adapter DOMContentLoaded]', e);
    localStorage.removeItem('motoflow_user');
  }
});

console.log('[Adapter] Cargado');
