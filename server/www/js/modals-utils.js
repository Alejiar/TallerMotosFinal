/**
 * MotoFlow Pro - Funciones Globales de Modales y Utilidades
 */

// FUNCIONES DE MODALES
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function openModalNuevaOrden() {
  openModal('modal-nueva-orden');
}

function openModalProducto(productoId = null) {
  // Implementar apertura de modal de producto
  if (productoId) {
    console.log('Editando producto:', productoId);
  } else {
    console.log('Creando nuevo producto');
  }
}

function openModalProveedor(proveedorId = null) {
  if (proveedorId) {
    console.log('Editando proveedor:', proveedorId);
  } else {
    console.log('Creando nuevo proveedor');
  }
}

function openModalCompra() {
  console.log('Abriendo modal de compra');
}

function openModalEmpleado(empleadoId = null) {
  if (empleadoId) {
    console.log('Editando empleado:', empleadoId);
  } else {
    console.log('Creando nuevo empleado');
  }
}

function openModalPago() {
  console.log('Abriendo modal de pago');
}

function openModalMovimiento() {
  console.log('Abriendo modal de movimiento de caja');
}

function openModalGarantia(garantiaId = null) {
  if (garantiaId) {
    console.log('Editando garantía:', garantiaId);
  } else {
    console.log('Creando nueva garantía');
  }
}

function openModalNota(notaId = null) {
  if (notaId) {
    console.log('Editando nota:', notaId);
  } else {
    console.log('Creando nueva nota');
  }
}

function openModalPlantilla(plantillaId = null) {
  if (plantillaId) {
    console.log('Editando plantilla:', plantillaId);
  } else {
    console.log('Creando nueva plantilla');
  }
}

function openModalDetalleOrden(ordenId) {
  console.log('Abriendo modal de detalle de orden:', ordenId);
}

// FUNCIONES DE ELIMINACIÓN
async function deleteProducto(productoId) {
  if (confirm('¿Eliminar este producto?')) {
    try {
      await API.delete('inventario', productoId);
      Router.navigate('inventario');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

async function deleteProveedor(proveedorId) {
  if (confirm('¿Eliminar este proveedor?')) {
    try {
      await API.delete('proveedores', proveedorId);
      Router.navigate('proveedores');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

async function deleteEmpleado(empleadoId) {
  if (confirm('¿Eliminar este empleado?')) {
    try {
      await API.delete('empleados', empleadoId);
      Router.navigate('empleados');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

async function deleteGarantia(garantiaId) {
  if (confirm('¿Eliminar esta garantía?')) {
    try {
      await API.delete('garantias', garantiaId);
      Router.navigate('garantias');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

async function deleteNota(notaId) {
  if (confirm('¿Eliminar esta nota?')) {
    try {
      await API.delete('notas', notaId);
      Router.navigate('notas');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

async function deletePlantilla(plantillaId) {
  if (confirm('¿Eliminar esta plantilla?')) {
    try {
      await API.delete('plantillas', plantillaId);
      Router.navigate('mensajes');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    }
  }
}

// FUNCIONES DE VENTAS
async function crearVenta() {
  console.log('Creando venta');
}

// FUNCIONES DE WHATSAPP
async function waConnect() {
  console.log('Conectando WhatsApp');
}

async function waDisconnect() {
  console.log('Desconectando WhatsApp');
}

async function waConfigSave() {
  console.log('Guardando configuración de WhatsApp');
}

async function waSendTest() {
  console.log('Enviando mensaje de prueba');
}

// FUNCIONES DE ACTUALIZACIÓN
async function updateOrdenEstado(ordenId) {
  try {
    const select = document.getElementById('orden-estado');
    const nuevoEstado = select.value;
    
    await API.update('ordenes', ordenId, { estado: nuevoEstado });
    console.log('Orden actualizada');
  } catch (error) {
    console.error('Error al actualizar orden:', error);
  }
}

// Exportar globalmente
window.openModal = openModal;
window.closeModal = closeModal;
window.openModalNuevaOrden = openModalNuevaOrden;
window.openModalProducto = openModalProducto;
window.openModalProveedor = openModalProveedor;
window.openModalCompra = openModalCompra;
window.openModalEmpleado = openModalEmpleado;
window.openModalPago = openModalPago;
window.openModalMovimiento = openModalMovimiento;
window.openModalGarantia = openModalGarantia;
window.openModalNota = openModalNota;
window.openModalPlantilla = openModalPlantilla;
window.openModalDetalleOrden = openModalDetalleOrden;
window.deleteProducto = deleteProducto;
window.deleteProveedor = deleteProveedor;
window.deleteEmpleado = deleteEmpleado;
window.deleteGarantia = deleteGarantia;
window.deleteNota = deleteNota;
window.deletePlantilla = deletePlantilla;
window.crearVenta = crearVenta;
window.waConnect = waConnect;
window.waDisconnect = waDisconnect;
window.waConfigSave = waConfigSave;
window.waSendTest = waSendTest;
window.updateOrdenEstado = updateOrdenEstado;
