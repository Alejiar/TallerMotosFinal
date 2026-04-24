/**
 * MotoFlow Pro - Autenticación
 * Gestión de login/logout y sesión
 */

class Auth {
  static currentUser = null;

  static async login(username, password) {
    try {
      // Obtener usuario de la BD
      const usuarios = await API.getAll('usuarios');
      const user = usuarios.find(u => u.username === username);

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // En producción, usar hash. Por ahora, comparación simple
      if (user.password !== password) {
        throw new Error('Contraseña incorrecta');
      }

      if (!user.active) {
        throw new Error('Usuario inactivo');
      }

      this.currentUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      };

      // Guardar sesión en localStorage
      localStorage.setItem('motoflow_user', JSON.stringify(this.currentUser));

      return this.currentUser;
    } catch (error) {
      throw error;
    }
  }

  static logout() {
    this.currentUser = null;
    localStorage.removeItem('motoflow_user');
  }

  static restoreSession() {
    const stored = localStorage.getItem('motoflow_user');
    if (stored) {
      this.currentUser = JSON.parse(stored);
      return true;
    }
    return false;
  }

  static isAuthenticated() {
    return this.currentUser !== null;
  }

  static getUser() {
    return this.currentUser;
  }

  static requireAuth() {
    if (!this.isAuthenticated()) {
      throw new Error('No authenticated');
    }
  }
}

// Exportar para uso global
window.Auth = Auth;
