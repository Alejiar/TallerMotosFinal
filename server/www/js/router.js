/**
 * MotoFlow Pro - Router SPA
 * Gestión de navegación entre páginas
 */

class Router {
  static currentPage = null;
  static routes = {};

  static register(page, handler) {
    this.routes[page] = handler;
  }

  static async navigate(page) {
    console.log('[Router] Navegando a:', page);

    // Ocultar todas las páginas
    document.querySelectorAll('.pg').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('a[data-page]').forEach(el => el.classList.remove('active'));

    // Buscar elemento de página
    const pageEl = document.getElementById(`pg-${page}`);
    if (!pageEl) {
      console.error('[Router] Página no encontrada:', page);
      return;
    }

    // Marcar como activa
    pageEl.classList.add('active');
    document.querySelector(`a[data-page="${page}"]`)?.classList.add('active');

    // Actualizar título
    const title = document.querySelector(`a[data-page="${page}"]`)?.textContent || page;
    document.getElementById('topbar-title').textContent = title.trim();

    // Ejecutar handler si existe
    if (this.routes[page]) {
      try {
        await this.routes[page]();
      } catch (error) {
        console.error('[Router] Error en handler de', page, ':', error);
      }
    }

    this.currentPage = page;
  }

  static init() {
    // Agregar listeners a links de navegación
    document.querySelectorAll('a[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigate(page);
      });
    });

    // Navegar a página inicial
    this.navigate('dashboard');
  }
}

// Exportar para uso global
window.Router = Router;
