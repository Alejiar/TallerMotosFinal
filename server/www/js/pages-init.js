/**
 * MotoFlow Pro - Inicializadores de Páginas
 * Registra los handlers de cada página del router
 */

// DASHBOARD
Router.register('dashboard', async function loadDashboard() {
  const content = document.getElementById('dashboard-content');
  
  try {
    // Cargar datos del dashboard
    let ordenes = [], clientes = [], ventas = [], inventario = [];
    
    try { ordenes = await API.getAll('ordenes'); } catch(e) { console.error('Error cargando ordenes:', e); }
    try { clientes = await API.getAll('clientes'); } catch(e) { console.error('Error cargando clientes:', e); }
    try { ventas = await API.getAll('ventas'); } catch(e) { console.error('Error cargando ventas:', e); }
    try { inventario = await API.getAll('inventario'); } catch(e) { console.error('Error cargando inventario:', e); }
    
    // Calcular estadísticas
    const totalOrdenes = ordenes.length;
    const ordenesHoy = ordenes.filter(o => {
      try {
        const fecha = new Date(o.entryDate || o.fecha_ingreso || 0);
        const hoy = new Date();
        return fecha.toDateString() === hoy.toDateString();
      } catch(e) { return false; }
    }).length;
    
    const totalClientes = clientes.length;
    const ventasTotal = ventas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
    const productosBajo = inventario.filter(p => parseFloat(p.stock || 0) < parseFloat(p.minStock || p.stock_minimo || 0)).length;
    
    // HTML de dashboard
    content.innerHTML = `
      <div class="dashboard-grid">
        <div class="card stat-card">
          <div class="stat-header">
            <h3>Órdenes activas</h3>
            <span class="stat-badge">${totalOrdenes}</span>
          </div>
          <p class="stat-text">Hoy: ${ordenesHoy}</p>
        </div>
        
        <div class="card stat-card">
          <div class="stat-header">
            <h3>Clientes registrados</h3>
            <span class="stat-badge">${totalClientes}</span>
          </div>
          <p class="stat-text">Activos esta semana</p>
        </div>
        
        <div class="card stat-card">
          <div class="stat-header">
            <h3>Ventas del mes</h3>
            <span class="stat-badge">$${ventasTotal.toLocaleString()}</span>
          </div>
          <p class="stat-text">Mostrador</p>
        </div>
        
        <div class="card stat-card">
          <div class="stat-header">
            <h3>Productos bajos</h3>
            <span class="stat-badge warning">${productosBajo}</span>
          </div>
          <p class="stat-text">Requieren reorden</p>
        </div>
      </div>
      
      <div class="grid-2">
        <div class="card">
          <h3>Acciones rápidas</h3>
          <div class="flex gap-2" style="flex-direction:column">
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('motos')">📋 Ver motos</button>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('ordenes')">📋 Ver órdenes</button>
            <button class="btn btn-primary btn-sm" onclick="openModalNuevaOrden()">➕ Nueva orden</button>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('inventario')">📦 Inventario</button>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('caja')">💰 Caja</button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    content.innerHTML = `<div class="alert alert-danger">Error cargando dashboard: ${error.message}</div>`;
  }
});

// MOTOS EN TALLER (KANBAN)
Router.register('motos', async function loadMotos() {
  try {
    const ordenes = await API.getAll('ordenes');
    const board = document.getElementById('kanban-board');
    
    const estados = ['ingresada', 'en_trabajo', 'en_espera', 'lista', 'entregada'];
    const columnas = {};
    
    // Agrupar por estado
    estados.forEach(estado => {
      columnas[estado] = ordenes.filter(o => {
        const estado_obj = o.status || o.estado;
        return estado_obj === estado || 
               (estado === 'en_trabajo' && estado_obj === 'reparacion') ||
               (estado === 'en_trabajo' && estado_obj === 'esperando_repuestos');
      });
    });
    
    // Renderizar tablero
    board.innerHTML = estados.map(estado => `
      <div class="kanban-column">
        <div class="kanban-header">${estado.replace(/_/g, ' ')}</div>
        <div class="kanban-cards" data-estado="${estado}">
          ${columnas[estado].map(orden => `
            <div class="kanban-card" onclick="loadOrdenDetalle(${orden.id}); Router.navigate('orden-detalle')">
              <div class="kanban-card-header">
                <strong>#${orden.id || orden.number}</strong>
                <small>${orden.status || orden.estado}</small>
              </div>
              <div class="kanban-card-body">
                <p><strong>${orden.cliente_name || orden.customerId}</strong></p>
                <p>${orden.plate || orden.placa || '--'}</p>
                <small>${new Date(orden.entryDate || orden.fecha_ingreso || 0).toLocaleDateString()}</small>
              </div>
              <div class="kanban-card-footer">
                <small>$${parseFloat(orden.total || 0).toLocaleString()}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('[Motos] Error:', error);
    document.getElementById('kanban-board').innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
  }
});

// ÓRDENES (LISTA)
Router.register('ordenes', async function loadOrdenes() {
  try {
    const mostrarEntregadas = document.getElementById('ordenes-todas')?.checked || false;
    let ordenes = await API.getAll('ordenes');
    
    if (!mostrarEntregadas) {
      ordenes = ordenes.filter(o => (o.status !== 'entregada' && o.estado !== 'entregada'));
    }
    
    const tbody = document.getElementById('ordenes-tbody');
    tbody.innerHTML = ordenes.map(o => `
      <tr onclick="loadOrdenDetalle(${o.id}); Router.navigate('orden-detalle')" style="cursor:pointer">
        <td><strong>#${o.id || o.number}</strong></td>
        <td>${o.cliente_name || o.customerId || '--'}</td>
        <td>${o.plate || o.placa || '--'}</td>
        <td><span class="badge">${o.status || o.estado}</span></td>
        <td>${new Date(o.entryDate || o.fecha_ingreso || 0).toLocaleDateString()}</td>
        <td>$${parseFloat(o.total || 0).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); loadOrdenDetalle(${o.id}); Router.navigate('orden-detalle')">Ver</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Órdenes] Error:', error);
  }
});

// ORDEN DETALLE
async function loadOrdenDetalle(ordenId) {
  try {
    const content = document.getElementById('orden-detalle-content');
    const orden = await API.getOne('ordenes', ordenId);
    
    if (!orden) {
      content.innerHTML = '<div class="alert alert-danger">Orden no encontrada</div>';
      return;
    }
    
    content.innerHTML = `
      <div class="pg-header">
        <div><h1>Orden #${orden.id || orden.number}</h1></div>
        <div class="flex gap-2">
          <button class="btn btn-outline" onclick="Router.navigate('ordenes')">← Volver</button>
        </div>
      </div>
      
      <div class="grid-2">
        <div class="card">
          <h3>Información</h3>
          <div class="form-group">
            <label>Cliente</label>
            <input type="text" value="${orden.cliente_name || orden.customerId || ''}" readonly>
          </div>
          <div class="form-group">
            <label>Placa</label>
            <input type="text" value="${orden.plate || orden.placa || ''}" readonly>
          </div>
          <div class="form-group">
            <label>Total</label>
            <input type="text" value="$${parseFloat(orden.total || 0).toLocaleString()}" readonly>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('[Orden Detalle] Error:', error);
  }
}

// INVENTARIO
Router.register('inventario', async function loadInventario() {
  try {
    const inventario = await API.getAll('inventario');
    const tbody = document.getElementById('inv-tbody');
    
    tbody.innerHTML = inventario.map(p => `
      <tr>
        <td>${p.code || p.codigo || ''}</td>
        <td>${p.name || p.nombre || ''}</td>
        <td>${p.estante || '--'}</td>
        <td><strong>${p.stock || 0}</strong></td>
        <td>${p.minStock || p.stock_minimo || 0}</td>
        <td>$${parseFloat(p.sellPrice || p.precio_venta || 0).toLocaleString()}</td>
        <td>$${parseFloat(p.costPrice || p.precio_costo || 0).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openModalProducto(${p.id})">Editar</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Inventario] Error:', error);
  }
});

function filterInventario() {
  const search = document.getElementById('inv-search')?.value?.toLowerCase() || '';
  document.querySelectorAll('#inv-tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

// VENTAS
Router.register('ventas', async function loadVentas() {
  try {
    const ventas = await API.getAll('ventas');
    const tbody = document.getElementById('ventas-tbody');
    
    tbody.innerHTML = ventas.map(v => `
      <tr>
        <td>${v.id}</td>
        <td>${new Date(v.fecha || v.date || 0).toLocaleDateString()}</td>
        <td>$${parseFloat(v.total || 0).toLocaleString()}</td>
        <td>${v.metodo_pago || v.paymentMethod || '--'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Ventas] Error:', error);
  }
});

// FACTURAS
Router.register('facturas', async function loadFacturas() {
  try {
    const facturas = await API.getAll('facturas') || [];
    const tbody = document.getElementById('facturas-tbody');
    
    tbody.innerHTML = facturas.map(f => `
      <tr>
        <td>${f.id}</td>
        <td>${new Date(f.fecha || f.date || 0).toLocaleDateString()}</td>
        <td>${f.tipo || f.type || '--'}</td>
        <td>${f.orden_id || f.orderId || '--'}</td>
        <td>$${parseFloat(f.total || 0).toLocaleString()}</td>
        <td>${f.metodo_pago || f.paymentMethod || '--'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Facturas] Error:', error);
    document.getElementById('facturas-tbody').innerHTML = '<tr><td colspan="6">Sin datos</td></tr>';
  }
});

// PROVEEDORES
Router.register('proveedores', async function loadProveedores() {
  try {
    const proveedores = await API.getAll('proveedores');
    const tbody = document.getElementById('prov-tbody');
    
    tbody.innerHTML = proveedores.map(p => `
      <tr>
        <td><strong>${p.name || p.nombre || ''}</strong></td>
        <td>${p.phone || p.telefono || '--'}</td>
        <td>${p.products || p.productos || '--'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openModalProveedor(${p.id})">Editar</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Proveedores] Error:', error);
  }
});

// COMPRAS
Router.register('compras', async function loadCompras() {
  try {
    const compras = await API.getAll('compras');
    const tbody = document.getElementById('compras-tbody');
    
    tbody.innerHTML = compras.map(c => `
      <tr>
        <td>${new Date(c.fecha || c.date || 0).toLocaleDateString()}</td>
        <td>${c.proveedor_nombre || c.providerName || '--'}</td>
        <td>$${parseFloat(c.total || 0).toLocaleString()}</td>
        <td>${c.cantidad_productos || c.itemCount || 0}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Compras] Error:', error);
  }
});

// EMPLEADOS
Router.register('empleados', async function loadEmpleados() {
  try {
    const empleados = await API.getAll('empleados');
    const tbody = document.getElementById('emp-tbody');
    const select = document.getElementById('emp-pago-select');
    
    tbody.innerHTML = empleados.map(e => `
      <tr>
        <td><strong>${e.name || e.nombre || ''}</strong></td>
        <td>${e.role || e.cargo || ''}</td>
        <td>${e.phone || e.telefono || '--'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openModalEmpleado(${e.id})">Editar</button>
        </td>
      </tr>
    `).join('');
    
    if (select) {
      select.innerHTML = '<option value="">-- Seleccionar empleado --</option>' + 
        empleados.map(e => `<option value="${e.id}">${e.name || e.nombre}</option>`).join('');
    }
  } catch (error) {
    console.error('[Empleados] Error:', error);
  }
});

// CAJA
Router.register('caja', async function loadCaja() {
  try {
    const fechaInput = document.getElementById('caja-fecha');
    const fecha = fechaInput?.value ? new Date(fechaInput.value) : new Date();
    const fechaStr = fecha.toISOString().split('T')[0];
    
    const movimientos = await API.getAll('caja');
    const filtrados = movimientos.filter(m => (m.fecha || m.date || '').startsWith(fechaStr));
    
    const ingresos = filtrados.filter(m => (m.tipo || m.type) === 'ingreso').reduce((sum, m) => sum + parseFloat(m.monto || m.amount || 0), 0);
    const egresos = filtrados.filter(m => (m.tipo || m.type) === 'egreso').reduce((sum, m) => sum + parseFloat(m.monto || m.amount || 0), 0);
    const balance = ingresos - egresos;
    
    document.getElementById('caja-ing').textContent = '$' + ingresos.toLocaleString();
    document.getElementById('caja-egr').textContent = '$' + egresos.toLocaleString();
    document.getElementById('caja-bal').textContent = '$' + balance.toLocaleString();
    
    const tbody = document.getElementById('caja-tbody');
    tbody.innerHTML = filtrados.map(m => `
      <tr>
        <td>${new Date(m.fecha || m.date || 0).toLocaleDateString()}</td>
        <td><span class="badge">${m.tipo || m.type}</span></td>
        <td>${m.concepto || m.concept || ''}</td>
        <td>$${parseFloat(m.monto || m.amount || 0).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Caja] Error:', error);
  }
});

// GARANTÍAS
Router.register('garantias', async function loadGarantias() {
  try {
    const garantias = await API.getAll('garantias');
    const tbody = document.getElementById('gar-tbody');
    
    tbody.innerHTML = garantias.map(g => `
      <tr>
        <td>${g.cliente_nombre || g.customerName || ''}</td>
        <td>${g.placa || g.plate || ''}</td>
        <td>${g.descripcion || g.description || ''}</td>
        <td>${new Date(g.fecha_vencimiento || g.expiryDate || 0).toLocaleDateString()}</td>
        <td><span class="badge">${g.estado || g.status || ''}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openModalGarantia(${g.id})">Editar</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Garantías] Error:', error);
  }
});

// NOTAS
Router.register('notas', async function loadNotas() {
  try {
    const notas = await API.getAll('notas');
    const list = document.getElementById('notas-list');
    
    list.innerHTML = notas.map(n => `
      <div class="card nota-card">
        <div class="nota-header">
          <h3>${n.titulo || n.title || ''}</h3>
          <small>${new Date(n.fecha_creacion || n.createdAt || 0).toLocaleDateString()}</small>
        </div>
        <p>${n.contenido || n.content || ''}</p>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-outline" onclick="openModalNota(${n.id})">Editar</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('[Notas] Error:', error);
  }
});

// PLANTILLAS DE MENSAJES
Router.register('mensajes', async function loadMensajes() {
  try {
    const mensajes = await API.getAll('mensajes');
    const grid = document.getElementById('mensajes-grid');
    
    grid.innerHTML = mensajes.map(m => `
      <div class="card">
        <h4>${m.nombre || m.name || ''}</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin:8px 0">${m.contenido || m.content || ''}</p>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-outline" onclick="openModalPlantilla(${m.id})">Editar</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('[Mensajes] Error:', error);
  }
});

// WHATSAPP
Router.register('whatsapp', async function loadWhatsApp() {
  try {
    const historial = await API.getAll('whatsapp_mensajes');
    const tbody = document.getElementById('wa-history-tbody');
    
    tbody.innerHTML = historial.slice(0, 10).map(h => `
      <tr>
        <td>${h.tipo || h.type || ''}</td>
        <td>${h.telefono || h.phone || ''}</td>
        <td><span class="badge">${h.status || ''}</span></td>
        <td>${new Date(h.fecha || h.date || 0).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[WhatsApp] Error:', error);
  }
});

// BÚSQUEDA GLOBAL
Router.register('buscar', async function loadBusqueda() {
  // La búsqueda se ejecuta con oninput en el input
});

function doSearch() {
  const query = document.getElementById('buscar-input')?.value?.toLowerCase() || '';
  const resultsDiv = document.getElementById('buscar-results');
  
  if (query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }
  
  // Implementar búsqueda multirecurso
}

// Funciones globales de utilidad
window.filterInventario = filterInventario;
window.doSearch = doSearch;
window.loadOrdenDetalle = loadOrdenDetalle;
