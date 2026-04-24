/**
 * MotoFlow Pro - Inicializador Principal
 * Punto de entrada de la aplicación
 */

async function initializeApp() {
  console.log('[App] Inicializando MotoFlow Pro...');

  const loginScreen = document.getElementById('login-screen');
  const appScreen = document.getElementById('app');
  const topbarUser = document.getElementById('topbar-user');

  // Intentar restaurar sesión
  if (Auth.restoreSession()) {
    console.log('[App] Sesión restaurada');
    const user = Auth.getUser();

    // Mostrar app
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');

    // Mostrar nombre de usuario
    topbarUser.innerHTML = `
      <div class="user-badge">
        <span>${user.name}</span>
        <small>${user.role}</small>
      </div>
    `;

    // Cargar datos
    await syncData();

    // Inicializar router
    Router.init();
  } else {
    console.log('[App] No hay sesión activa');
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
}

// Login
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const errorDiv = document.getElementById('login-error');

  if (!username || !password) {
    errorDiv.textContent = 'Usuario y contraseña requeridos';
    errorDiv.classList.remove('hidden');
    return;
  }

  try {
    errorDiv.classList.add('hidden');
    await Auth.login(username, password);
    console.log('[App] Login exitoso');

    // Recargar página para inicializar todo
    window.location.reload();
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
  }
}

// Logout
function doLogout() {
  Auth.logout();
  window.location.reload();
}

// Sincronizar datos
async function syncData() {
  try {
    console.log('[App] Sincronizando datos...');
    const data = await API.sync();
    Storage.cacheAll(data);
    console.log('[App] Sincronización completada');
  } catch (error) {
    console.error('[App] Error al sincronizar:', error);
  }
}

// Iniciar app cuando DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Exportar funciones globales
window.doLogin = doLogin;
window.doLogout = doLogout;
