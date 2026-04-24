/**
 * MotoFlow Pro - Adaptador API (Compatibilidad)
 * Convierte llamadas antiguas a la nueva API PHP
 * Esto debe incluirse ANTES que script.js
 */

// Variables globales
let appData = {};
let cachedResources = {};

// Función que reemplaza a 'api' antiguo
async function api(archivo, accion, datos = {}) {
  try {
    // Mapear llamadas antiguas a nuevos endpoints
    if (archivo === 'auth' && accion === 'login') {
      return await Auth.login(datos.username, datos.password);
    }
    
    if (archivo === 'dashboard') {
      return await loadDashboardData();
    }
    
    // Llamadas genéricas de recurso
    if (accion === 'create') {
      return await API.create(archivo, datos);
    }
    if (accion === 'update') {
      return await API.update(archivo, datos.id, datos);
    }
    if (accion === 'delete') {
      return await API.delete(archivo, datos.id);
    }
    
    throw new Error('Acción no soportada');
  } catch (error) {
    console.error('[API Adapter]', error);
    return { error: error.message };
  }
}

// Función que reemplaza a 'get' antiguo
async function get(archivo, accion, params = '') {
  try {
    if (archivo === 'dashboard') {
      return await loadDashboardData();
    }
    
    // GET genérico de recursos
    if (accion === '') {
      return await API.getAll(archivo);
    }
    
    throw new Error('Acción no soportada');
  } catch (error) {
    console.error('[GET Adapter]', error);
    return { error: error.message };
  }
}

// Funciones de datos agregados
async function loadDashboardData() {
  try {
    const { ordenes, productos, caja } = cachedResources;
    
    // Contar órdenes por estado
    const pendientes = (ordenes || []).filter(o => o.status === 'pending').length;
    const en_proceso = (ordenes || []).filter(o => o.status === 'in_progress').length;
    const listas = (ordenes || []).filter(o => o.status === 'ready').length;
    
    // Stock bajo
    const stock_bajo = (productos || []).filter(p => p.stock < p.minStock).slice(0, 5);
    
    // Órdenes recientes
    const ordenes_recientes = (ordenes || []).slice(-5).reverse();
    
    // Caja
    const cajaMovimientos = (caja || []);
    const ingresos = cajaMovimientos
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0);
    const egresos = cajaMovimientos
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0);
    
    return {
      ordenes: { pendientes, en_proceso, listas },
      stock_bajo,
      ordenes_recientes,
      caja: { balance: ingresos - egresos, ingresos, egresos }
    };
  } catch (error) {
    console.error('[loadDashboardData]', error);
    return { error: error.message };
  }
}

// Sincronizar datos en inicio
async function syncAllData() {
  try {
    console.log('[Adapter] Sincronizando datos...');
    const data = await API.sync();
    
    // Guardar en cache
    cachedResources = data;
    Storage.cacheAll(data);
    
    // Mapear alias para compatibilidad
    const mapping = {
      clientes: 'clientes',
      motos: 'motos',
      ordenes: 'ordenes',
      productos: 'productos',
      proveedores: 'proveedores',
      empleados: 'empleados',
      compras: 'compras',
      ventas: 'ventas',
      notas: 'notas',
      caja: 'caja',
    };
    
    for (const [key, resource] of Object.entries(mapping)) {
      if (data[resource]) {
        window[key + 'Data'] = data[resource];
      }
    }
    
    console.log('[Adapter] Datos sincronizados');
    return data;
  } catch (error) {
    console.error('[syncAllData]', error);
    return {};
  }
}

// Reemplazar Auth.login en script.js para que use el nuevo
Auth.login = async function(username, password) {
  try {
    const usuarios = await API.getAll('usuarios');
    const user = usuarios.find(u => u.username === username);

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (user.password !== password) {
      throw new Error('Contraseña incorrecta');
    }

    if (!user.active) {
      throw new Error('Usuario inactivo');
    }

    this.currentUser = {
      id: user.id,
      username: user.username,
      nombre: user.name,
      nombre_completo: user.name,
      rol: user.role,
      role: user.role,
      name: user.name,
    };

    localStorage.setItem('motoflow_user', JSON.stringify(this.currentUser));
    
    // Sincronizar datos
    await syncAllData();
    
    return this.currentUser;
  } catch (error) {
    throw error;
  }
};

// Hook para inicio de app
const originalInit = window.addEventListener ? window.addEventListener.bind(window) : null;

document.addEventListener('DOMContentLoaded', async () => {
  // Restaurar sesión
  const stored = localStorage.getItem('motoflow_user');
  if (stored) {
    try {
      Auth.currentUser = JSON.parse(stored);
      await syncAllData();
      
      // Mostrar app (simulación de doLogin éxito)
      const loginScreen = document.getElementById('login-screen');
      const appEl = document.getElementById('app');
      if (loginScreen && appEl) {
        loginScreen.classList.add('hidden');
        appEl.classList.remove('hidden');
        const topbarUser = document.getElementById('topbar-user');
        if (topbarUser) {
          topbarUser.textContent = `👤 ${Auth.currentUser.nombre} (${Auth.currentUser.rol})`;
        }
      }
    } catch (error) {
      console.error('[DOMContentLoaded]', error);
      localStorage.removeItem('motoflow_user');
    }
  }
});

console.log('[Adapter] Cargado - Compatibilidad API antigua');
