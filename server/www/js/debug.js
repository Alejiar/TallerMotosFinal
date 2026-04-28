/**
 * MotoFlow Pro - Debug Console
 * Ayuda a diagnosticar problemas en tiempo de ejecución
 */

// Interceptar errores globales
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise]', event.reason);
});

// Verifidfar que los objetos globales estén disponibles
console.log('[Debug] Router disponible:', typeof Router !== 'undefined');
console.log('[Debug] API disponible:', typeof API !== 'undefined');
console.log('[Debug] Auth disponible:', typeof Auth !== 'undefined');
console.log('[Debug] Storage disponible:', typeof Storage !== 'undefined');

// Logear el comienzo de inicialización
console.log('[Debug] Inicializando aplicación...');

// Interceptar llamadas a API para depuración
const originalFetch = API.fetch;
API.fetch = async function(url, options = {}) {
  console.log('[API] GET', url, options);
  try {
    const result = await originalFetch.call(this, url, options);
    console.log('[API] Response OK:', result);
    return result;
  } catch (error) {
    console.error('[API] Error:', error.message);
    throw error;
  }
};

// Interceptar Router.navigate
const originalNavigate = Router.navigate;
Router.navigate = async function(page) {
  console.log('[Router] Navegando a:', page);
  try {
    await originalNavigate.call(this, page);
    console.log('[Router] Navegación exitosa');
  } catch (error) {
    console.error('[Router] Error:', error);
  }
};

// Log cuando se registran handlers
const originalRegister = Router.register;
Router.register = function(page, handler) {
  console.log('[Router] Registrando handler para:', page);
  return originalRegister.call(this, page, handler);
};

console.log('[Debug] Debug console listo');
