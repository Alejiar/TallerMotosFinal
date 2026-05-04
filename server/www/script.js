/* ═══════════════════════════════════════════════
   MotoFlow Pro — script.js (SPA vanilla JS)
═══════════════════════════════════════════════ */

// ─── Estado global ───────────────────────────
let SES = null;
let inventarioData = [];
let ventaItems = [];
let compraItems = [];
let proveedoresData = [];
let empleadosData = [];
let waStatusInterval = null;

// ─── API helpers ─────────────────────────────
async function api(archivo, accion, datos = {}) {
  const r = await fetch(`php/${archivo}?action=${accion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: accion, ...datos }),
  });
  return r.json();
}
async function get(archivo, accion, params = '') {
  const r = await fetch(`php/${archivo}?action=${accion}${params}`);
  return r.json();
}

// ─── Sidebar mobile toggle ───────────────────
function toggleSidebar() {
  document.getElementById('app').classList.toggle('sidebar-open');
}
function closeSidebar() {
  document.getElementById('app').classList.remove('sidebar-open');
}

// ─── Toast ───────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Formato ─────────────────────────────────
function money(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }
function dateShort(d) { if (!d) return '-'; const p = d.split('T')[0].split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
function todayISO() { return new Date().toISOString().split('T')[0]; }

// ─── Modal ───────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ─── Auth ────────────────────────────────────
async function loadTallerNombre() {
  try {
    const cfg = await api('ajustes', 'config_get');
    if (cfg.nombre_taller) {
      const logo = document.getElementById('sidebar-logo');
      if (logo) logo.innerHTML = `🏍️ ${cfg.nombre_taller} <span>Pro</span>`;
      document.title = cfg.nombre_taller + ' – MotoFlow Pro';
    }
  } catch {}
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (!u || !p) return;
  const res = await api('auth', 'login', { username: u, password: p });
  if (res.error) {
    const el = document.getElementById('login-error');
    el.textContent = res.error;
    el.classList.remove('hidden');
    return;
  }
  SES = res;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('topbar-user').textContent = `👤 ${res.nombre} (${res.rol})`;
  loadTallerNombre();
  loadMobileUrl();
  startWAStatusPoll();
  loadStockAlertas();
  setInterval(loadStockAlertas, 5 * 60 * 1000);
  showPage('dashboard');
}

async function doLogout() {
  await api('auth', 'logout');
  SES = null;
  stopWAStatusPoll();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ─── Navegación ──────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard', motos: 'Motos en taller', ordenes: 'Órdenes',
  'orden-detalle': 'Detalle de orden', inventario: 'Inventario',
  ventas: 'Ventas', facturas: 'Facturas', proveedores: 'Proveedores',
  compras: 'Compras', empleados: 'Empleados', caja: 'Caja', garantias: 'Historial de entregas',
  notas: 'Notas', mensajes: 'Plantillas WhatsApp', whatsapp: 'WhatsApp', buscar: 'Búsqueda',
  recibos: 'Crear Recibos', ajustes: 'Ajustes',
};

function showPage(page) {
  // Cerrar overlays/modales abiertos para evitar bloqueos de UI
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  const fotoVisor = document.getElementById('foto-visor-overlay');
  if (fotoVisor) fotoVisor.style.display = 'none';
  closeStockAlert();

  document.querySelectorAll('.pg').forEach(el => el.classList.remove('active'));
  const pg = document.getElementById(`pg-${page}`);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('#nav a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  closeSidebar(); // cierra sidebar en móvil tras navegar
  const loaders = { dashboard: loadDashboard, motos: loadMotos, ordenes: loadOrdenes,
    inventario: loadInventario, ventas: loadVentas, facturas: loadFacturas,
    proveedores: loadProveedores, compras: loadCompras, empleados: loadEmpleados,
    caja: loadCaja, garantias: loadGarantias, notas: loadNotas,
    mensajes: loadMensajes, whatsapp: loadWhatsApp, buscar: () => {},
    recibos: loadRecibos, ajustes: loadAjustes };
  if (loaders[page]) loaders[page]();
}

// ─── Alertas de inventario ────────────────────
async function loadStockAlertas() {
  const prods = await fetch('/php/inventario?action=stock_bajo').then(r => r.json()).catch(() => []);
  const count = (prods || []).length;
  const badge = document.getElementById('stock-alert-count');
  const list = document.getElementById('stock-alert-list');
  if (!badge || !list) return;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }
  list.innerHTML = count === 0
    ? '<div class="alert-drop-empty">Sin alertas de inventario</div>'
    : prods.map(p => `<div class="alert-drop-item" onclick="showPage('inventario');closeStockAlert()">
        <div><div class="alert-drop-name">${p.name}</div><div style="font-size:11px;color:var(--text-muted)">${p.code || ''}</div></div>
        <div class="alert-drop-stock">Stock: ${p.stock} / Mín: ${p.minStock}</div>
      </div>`).join('');
}
function toggleStockAlert() {
  const dd = document.getElementById('stock-alert-dropdown');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  if (isHidden) loadStockAlertas();
}
function closeStockAlert() { document.getElementById('stock-alert-dropdown')?.classList.add('hidden'); }
document.addEventListener('click', e => {
  if (!document.getElementById('stock-alert-bell')?.contains(e.target)) closeStockAlert();
});

// ─── Badge WhatsApp ───────────────────────────
function startWAStatusPoll() {
  updateWABadge();
  waStatusInterval = setInterval(updateWABadge, 5000);
}
function stopWAStatusPoll() { if (waStatusInterval) clearInterval(waStatusInterval); }
async function updateWABadge() {
  try {
    const r = await fetch('http://127.0.0.1:8001/api/status');
    const d = await r.json();
    const badge = document.getElementById('wa-badge');
    if (d.state === 'disconnected') { badge.textContent = '!'; badge.className = 'badge red'; badge.classList.remove('hidden'); }
    else if (d.state === 'qr') { badge.textContent = 'QR'; badge.className = 'badge yellow'; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
    // Si la página WA está activa, actualizar también
    if (document.getElementById('pg-whatsapp').classList.contains('active')) updateWAPage(d);
  } catch {}
}

// ─── AJUSTES ──────────────────────────────────
async function loadAjustes() {
  const cfg = await api('ajustes', 'config_get');
  document.getElementById('ajuste-nombre').value = cfg.nombre_taller || '';
  document.getElementById('ajuste-nit').value = cfg.nit || '';
  document.getElementById('ajuste-telefono').value = cfg.telefono || '';
  document.getElementById('ajuste-direccion').value = cfg.direccion || '';
  document.getElementById('ajuste-pie-orden').value = cfg.pie_recibo_orden || 'Gracias por su visita';
  document.getElementById('ajuste-pie-venta').value = cfg.pie_recibo_venta || 'Gracias por su compra';
  const pcEl = document.getElementById('ajuste-pie-custom');
  if (pcEl) pcEl.value = cfg.pie_recibo_custom || 'Gracias por su preferencia';
}

async function saveAjustes() {
  const data = {
    nombre_taller: document.getElementById('ajuste-nombre').value.trim(),
    nit: document.getElementById('ajuste-nit').value.trim(),
    telefono: document.getElementById('ajuste-telefono').value.trim(),
    direccion: document.getElementById('ajuste-direccion').value.trim(),
    pie_recibo_orden: document.getElementById('ajuste-pie-orden').value,
    pie_recibo_venta: document.getElementById('ajuste-pie-venta').value,
    pie_recibo_custom: document.getElementById('ajuste-pie-custom')?.value || '',
  };
  const r = await api('ajustes', 'config_set', data);
  if (r.error) { toast(r.error, 'error'); return; }
  loadTallerNombre();
  toast('Ajustes guardados ✓', 'success');
}

// ─── RECIBOS PERSONALIZADOS ───────────────────
async function loadRecibos() {
  document.getElementById('rec-fecha').value = todayISO();
  const rows = await fetch('/php/recibos?action=listar').then(r => r.json()).catch(() => []);
  document.getElementById('recibos-tbody').innerHTML = (rows || []).map(r => `<tr>
    <td class="font-mono" style="color:var(--primary)">${r.number}</td>
    <td>${r.cliente || '-'}</td>
    <td style="max-width:160px;font-size:12px">${r.descripcion || '-'}</td>
    <td>${money(r.valor)}</td>
    <td>${dateShort(r.fecha)}</td>
    <td class="flex gap-2">
      <button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboCustom(${r.id})" title="Imprimir">🖨</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="eliminarRecibo(${r.id})" title="Eliminar">🗑</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sin recibos generados</td></tr>';
}

async function saveRecibo() {
  const descripcion = document.getElementById('rec-descripcion').value.trim();
  const valor = parseFloat(document.getElementById('rec-valor').value);
  const cliente = document.getElementById('rec-cliente').value.trim();
  const fecha = document.getElementById('rec-fecha').value || todayISO();
  if (!descripcion) { toast('La descripción es requerida', 'error'); return; }
  if (!valor) { toast('El valor es requerido', 'error'); return; }
  const r = await fetch('/php/recibos?action=crear', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion, valor, cliente, fecha }),
  }).then(r => r.json()).catch(() => ({ error: 'Error de red' }));
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Recibo ${r.number} generado ✓`, 'success');
  document.getElementById('rec-descripcion').value = '';
  document.getElementById('rec-valor').value = '';
  document.getElementById('rec-cliente').value = '';
  imprimirReciboCustom(r.id);
  loadRecibos();
}

function imprimirReciboCustom(id) {
  const w = window.open(`/php/recibo?tipo=custom&id=${id}`, '_blank', 'width=420,height=700,menubar=yes');
  if (w) w.addEventListener('load', () => setTimeout(() => w.print(), 400));
}

async function eliminarRecibo(id) {
  if (!confirm('¿Eliminar este recibo?')) return;
  await fetch('/php/recibos?action=eliminar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  loadRecibos();
}

// ─── IMPRESIÓN DE RECIBOS ─────────────────────
function imprimirReciboVenta(id) {
  const w = window.open(`/php/recibo?tipo=venta&id=${id}`, '_blank', 'width=420,height=700,menubar=yes');
  if (w) w.addEventListener('load', () => setTimeout(() => w.print(), 400));
}

function imprimirReciboOrden(id) {
  const w = window.open(`/php/recibo?tipo=orden&id=${id}`, '_blank', 'width=420,height=700,menubar=yes');
  if (w) w.addEventListener('load', () => setTimeout(() => w.print(), 400));
}

// ─── DASHBOARD ────────────────────────────────
async function loadDashboard() {
  const d = await get('dashboard', '');
  if (d.error) return;
  document.getElementById('dashboard-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">🔴 Pendientes</div><div class="stat-value">${d.ordenes.pendientes}</div></div>
      <div class="stat-card"><div class="stat-label">🔧 En proceso</div><div class="stat-value">${d.ordenes.en_proceso}</div></div>
      <div class="stat-card"><div class="stat-label">✅ Listas</div><div class="stat-value">${d.ordenes.listas}</div></div>
      <div class="stat-card"><div class="stat-label">💰 Caja hoy</div><div class="stat-value">${money(d.caja.balance)}</div><div class="stat-hint">Ingresos ${money(d.caja.ingresos)} · Egresos ${money(d.caja.egresos)}</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>📦 Stock bajo</h3>
        ${d.stock_bajo.length === 0 ? '<div class="empty-state">✓ Todo el inventario tiene stock saludable</div>' :
          `<table><thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead><tbody>
          ${d.stock_bajo.map(p => `<tr><td>${p.name}</td><td class="text-danger font-bold">${p.stock}</td><td>${p.minStock}</td></tr>`).join('')}
          </tbody></table>`}
      </div>
      <div class="card">
        <h3>🏍️ Órdenes recientes</h3>
        <table><thead><tr><th>N°</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>
          ${d.ordenes_recientes.map(o => `<tr>
            <td><a href="#" class="font-mono" style="color:var(--primary)" onclick="openOrdenDetalle(${o.id})">${o.number}</a></td>
            <td>${o.cliente || '-'}</td>
            <td><span class="badge badge-${o.status}">${o.status}</span></td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}

// ─── MOTOS / KANBAN ───────────────────────────
const STATUS_LABELS = {
  ingresada: 'Ingresada', diagnostico: 'En diagnóstico',
  esperando_repuestos: 'Esperando repuestos', reparacion: 'En reparación',
  lista: 'Lista para entregar', entregada: 'Entregada',
};
const KANBAN_COLS = [
  { keys: ['ingresada','diagnostico'], title: 'Pendientes', cls: 'kanban-header-pending' },
  { keys: ['esperando_repuestos','reparacion'], title: 'En reparación', cls: 'kanban-header-progress' },
  { keys: ['lista'], title: 'Listas para entregar', cls: 'kanban-header-ready' },
];

async function loadMotos() {
  const rows = await get('motos', 'kanban');
  const board = document.getElementById('kanban-board');
  board.innerHTML = KANBAN_COLS.map(col => {
    const cards = rows.filter(o => col.keys.includes(o.status));
    return `<div class="kanban-col">
      <div class="kanban-col-header ${col.cls}">
        <h3>${col.title}</h3><span class="count">${cards.length}</span>
      </div>
      ${cards.length === 0 ? '<div class="empty-state">Sin motos</div>' :
        cards.map(o => `<div class="kanban-card">
          <div class="flex justify-between items-center mb-2">
            <span class="kanban-order">${o.number}</span>
            <span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span>
          </div>
          <div class="kanban-cliente">${o.cliente_name || '-'}</div>
          <div class="kanban-moto">${o.moto_model || ''} · <span class="font-mono">${o.plate || ''}</span></div>
          <div class="kanban-problem">${o.problem || 'Sin descripción'}</div>
          <div class="kanban-date">📅 ${dateShort(o.entryDate)}${o.estimatedDate ? ' · Entrega: '+dateShort(o.estimatedDate) : ''}</div>
          <div class="kanban-actions">
            <select onchange="cambiarEstadoKanban(${o.id},this.value,'${o.status}',${o.asignadoId||0})">
              ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}"${k===o.status?' selected':''}>${v}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm btn-icon" onclick="openOrdenDetalle(${o.id})" title="Ver detalle">👁</button>
            ${o.cliente_phone ? `<a class="btn btn-outline btn-sm btn-icon" href="https://wa.me/57${o.cliente_phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>
            <a class="btn btn-outline btn-sm btn-icon" href="tel:${o.cliente_phone}" title="Llamar">📞</a>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
  }).join('');
}

async function cambiarEstadoKanban(id, status, currentStatus, asignadoId) {
  if (currentStatus === 'ingresada' && status !== 'ingresada' && !asignadoId) {
    _pendingStatusChange = { id, status, fromKanban: true };
    if (!empleadosData.length) await loadEmpleados();
    const sel = document.getElementById('asignar-empleado');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar trabajador...</option>' +
        empleadosData.map(e =>
          `<option value="${e.id}">${e.name}${e.role ? ' – ' + e.role : ''}</option>`
        ).join('');
    }
    openModal('modal-asignar-trabajador');
    return;
  }
  // Siempre mostrar modal de pago al entregar, sin importar el estado anterior
  if (status === 'entregada') {
    entregarOrden(id);
    return;
  }
  const r = await api('motos', 'cambiar_estado', { id, status });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Estado actualizado');
  loadMotos();
}

function openModalNuevaOrden() {
  document.getElementById('mo-nombre').value = '';
  document.getElementById('mo-telefono').value = '';
  document.getElementById('mo-placa').value = '';
  document.getElementById('mo-problema').value = '';
  openModal('modal-nueva-orden');
}

async function crearOrden() {
  const nombre = document.getElementById('mo-nombre').value.trim();
  const telefono = document.getElementById('mo-telefono').value.trim();
  const placa = document.getElementById('mo-placa').value.trim();
  const problema = document.getElementById('mo-problema').value.trim();
  if (!nombre || !telefono || !placa || !problema) { toast('Completa todos los campos', 'error'); return; }
  const r = await api('ordenes', 'crear', { nombre, telefono, placa, problema });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Orden ${r.number} creada ✓`, 'success');
  closeModal('modal-nueva-orden');
  if (document.getElementById('pg-motos').classList.contains('active')) loadMotos();
  if (document.getElementById('pg-ordenes').classList.contains('active')) loadOrdenes();
}

// ─── ORDENES LISTA ────────────────────────────
async function loadOrdenes() {
  const mostrarTodas = document.getElementById('ordenes-todas')?.checked;
  const all = mostrarTodas ? '&all=1' : '';
  const rows = await get('ordenes', 'listar', all);

  const grupos = [
    { label: '🔴 Pendientes', keys: ['ingresada', 'diagnostico'] },
    { label: '🔧 En proceso', keys: ['esperando_repuestos', 'reparacion', 'reparando'] },
    { label: '✅ Listas para entregar', keys: ['lista'] },
  ];
  if (mostrarTodas) grupos.push({ label: '📦 Entregadas', keys: ['entregada'] });

  const colsHeader = `<tr><th>N°</th><th>Cliente</th><th>Placa</th><th>Estado</th><th>Ingreso</th><th>Total</th><th>Acciones</th></tr>`;
  const rowFn = o => `<tr>
    <td><a href="#" class="font-mono" style="color:var(--primary)" onclick="openOrdenDetalle(${o.id})">${o.number}</a></td>
    <td>${o.cliente_name || '-'}</td>
    <td class="font-mono">${o.plate || '-'}</td>
    <td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status] || o.status}</span></td>
    <td>${dateShort(o.entryDate)}</td>
    <td>${money(o.total)}</td>
    <td class="flex gap-2">
      <button class="btn btn-outline btn-sm" onclick="openOrdenDetalle(${o.id})">Ver</button>
      <button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboOrden(${o.id})" title="Imprimir recibo">🖨</button>
    </td>
  </tr>`;

  const pg = document.getElementById('pg-ordenes');
  let html = '';
  let totalMostradas = 0;
  for (const g of grupos) {
    const sub = rows.filter(o => g.keys.includes(o.status));
    totalMostradas += sub.length;
    html += `<div class="card mb-4">
      <h3 style="margin-bottom:12px">${g.label} <span class="badge" style="font-size:11px">${sub.length}</span></h3>
      ${sub.length ? `<div class="table-wrap"><table><thead>${colsHeader}</thead><tbody>${sub.map(rowFn).join('')}</tbody></table></div>`
        : `<div class="empty-state" style="padding:16px">Sin órdenes en esta categoría</div>`}
    </div>`;
  }
  if (!totalMostradas) html = '<div class="empty-state">Sin órdenes registradas</div>';

  // Reemplazar contenido debajo del pg-header
  let container = pg.querySelector('#ordenes-content');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ordenes-content';
    pg.appendChild(container);
  }
  // Ocultar tabla original si existe
  const oldCard = pg.querySelector('.card');
  if (oldCard) oldCard.style.display = 'none';
  container.innerHTML = html;
}

// ─── ORDEN DETALLE ────────────────────────────
let _ordenActual = null;

async function openOrdenDetalle(id) {
  showPage('orden-detalle');
  document.getElementById('orden-detalle-content').innerHTML = '<div class="spinner"></div>';
  const d = await get('ordenes', 'get', `&id=${id}`);
  if (d.error) { document.getElementById('orden-detalle-content').innerHTML = `<p class="text-danger">${d.error}</p>`; return; }
  _ordenActual = d;
  renderOrdenDetalle(d);
}

function renderOrdenDetalle(d) {
  const locked = d.locked;
  const total = d.parts.reduce((a,p) => a + (p.qty||1)*(p.price||p.unitPrice||0), 0) + d.services.reduce((a,s) => a + (s.price||0), 0);
  document.getElementById('orden-detalle-content').innerHTML = `
    <div class="flex items-center gap-2 mb-4">
      <button class="btn btn-ghost btn-sm" onclick="showPage('ordenes')">← Atrás</button>
      <h1 style="font-size:20px;font-weight:700">Orden <span class="font-mono">${d.number}</span></h1>
      <span class="badge badge-${d.status}">${STATUS_LABELS[d.status]}</span>
      ${locked ? '<span class="badge" style="background:#e2e8f0;color:#64748b">🔒 Bloqueada</span>' : ''}
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline" onclick="imprimirReciboOrden(${d.id})">🖨 Imprimir recibo</button>
        <button class="btn btn-ghost" onclick="verHistorialOrden(${d.id})">📜 Historial</button>
        ${!locked && d.status !== 'entregada' ? `<button class="btn btn-primary" onclick="entregarOrden(${d.id})">Entregar y facturar</button>` : ''}
        ${!locked && d.status !== 'lista' && d.status !== 'entregada' ? `<button class="btn btn-success" onclick="finalizarOrden(${d.id})">Finalizar orden</button>` : ''}
      </div>
    </div>
    <div class="order-grid mb-4">
      <div class="card">
        <h3>Cliente y moto</h3>
        <div style="font-weight:600">${d.cliente_name}</div>
        <div class="text-muted text-sm">${d.cliente_phone}</div>
        <div style="background:var(--bg);border-radius:6px;padding:10px;margin-top:10px">
          <div class="text-sm text-muted">Moto</div>
          <div class="font-mono font-bold">${d.plate}</div>
          <div class="text-sm">${d.moto_model || ''}</div>
        </div>
        ${d.cliente_phone ? `<a class="btn btn-outline w-full mt-3" href="https://wa.me/57${d.cliente_phone.replace(/\D/g,'')}" target="_blank">💬 WhatsApp</a>` : ''}
      </div>
      <div class="card">
        <h3>Datos de la orden</h3>
        <div class="grid-2">
          <div class="form-group">
            <label>Estado</label>
            <select ${locked?'disabled':''} onchange="actualizarEstadoOrden(${d.id},this.value)">
              ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}"${k===d.status?' selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Fecha estimada</label>
            <input type="date" ${locked?'disabled':''} value="${d.estimatedDate?.split('T')[0]||''}" onchange="actualizarCampoOrden(${d.id},'estimatedDate',this.value)">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Problema reportado</label>
            <textarea rows="2" ${locked?'disabled':''} onblur="actualizarCampoOrden(${d.id},'problem',this.value)">${d.problem||''}</textarea>
          </div>
          <div class="text-muted text-sm" style="grid-column:1/-1">Ingreso: ${dateShort(d.entryDate)}</div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Trabajador asignado</label>
            ${d.asignado_name
              ? `<div style="padding:9px 12px;background:var(--bg);border-radius:var(--radius-sm);font-weight:600;display:flex;align-items:center;gap:8px">
                  <span>👷</span>
                  <span>${d.asignado_name}${d.asignado_role ? ` <span style="color:var(--text-muted);font-weight:400;font-size:12px">· ${d.asignado_role}</span>` : ''}</span>
                </div>`
              : `<span class="text-muted text-sm">Sin asignar</span>`}
          </div>
        </div>
      </div>
    </div>
    <div class="grid-2 mb-4">
      <div class="card">
        <h3>Repuestos</h3>
        ${!locked ? `
          <div class="form-group search-box mb-3">
            <input type="text" id="od-prod-search" placeholder="Buscar repuesto..." oninput="buscarRepuestoOrden(${d.id})">
          </div>
          <div id="od-prod-results" class="hidden" style="border:1px solid var(--border);border-radius:6px;max-height:160px;overflow-y:auto;margin-bottom:10px;"></div>
        ` : ''}
        <div id="od-parts">
          ${d.parts.map((p,i) => `<div class="part-row">
            <div style="flex:1;font-size:13px">${p.name}</div>
            <input type="number" min="1" value="${p.qty||1}" style="width:60px" ${locked?'disabled':''} onchange="actualizarQtyParte(${d.id},${i},this.value)">
            <span style="width:100px;text-align:right;font-size:13px">${money((p.qty||1)*(p.price||p.unitPrice||0))}</span>
            ${!locked ? `<button class="btn btn-ghost btn-icon" onclick="quitarParte(${d.id},${i})">🗑</button>` : ''}
          </div>`).join('') || '<p class="text-muted text-sm">Sin repuestos.</p>'}
        </div>
      </div>
      <div class="card">
        <h3>Servicios (mano de obra)</h3>
        ${!locked ? `
          <div class="flex gap-2 mb-3">
            <input type="text" id="od-svc-desc" placeholder="Descripción" style="flex:1">
            <input type="number" id="od-svc-price" placeholder="Precio" style="width:100px" min="0">
            <button class="btn btn-primary btn-sm" onclick="agregarServicio(${d.id})">+</button>
          </div>
        ` : ''}
        <div id="od-services">
          ${d.services.map((s,i) => `<div class="service-row">
            <div style="flex:1;font-size:13px">${s.description}</div>
            <span style="width:100px;text-align:right;font-size:13px">${money(s.price)}</span>
            ${!locked ? `<button class="btn btn-ghost btn-icon" onclick="quitarServicio(${d.id},${i})">🗑</button>` : ''}
          </div>`).join('') || '<p class="text-muted text-sm">Sin servicios.</p>'}
        </div>
      </div>
    </div>
    <div class="card mb-4">
      <div class="flex justify-between items-center mb-3">
        <h3>Evidencias</h3>
        ${!locked ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <label class="btn btn-outline btn-sm" style="cursor:pointer">📷 Galería<input type="file" accept="image/*" multiple hidden onchange="agregarFotos(${d.id},this)"></label>
          <label class="btn btn-outline btn-sm" style="cursor:pointer">📸 Cámara<input type="file" accept="image/*" capture="environment" hidden onchange="agregarFotos(${d.id},this)"></label>
        </div>` : ''}
      </div>
      <div class="evidences-grid" id="od-evidences">
        ${d.evidences.length === 0 ? '<p class="text-muted text-sm">Sin fotos.</p>' :
          d.evidences.map((src,i) => {
            const canDel = !locked && d.status !== 'lista' && d.status !== 'entregada';
            return `<div class="evidence-item">
              <img src="${src}" alt="evidencia" style="cursor:zoom-in" onclick="verFoto('${src.replace(/'/g,"\\'")}')">
              ${canDel ? `<button class="evidence-remove" onclick="quitarFoto(${d.id},${i})">✕</button>` : ''}
            </div>`;
          }).join('')}
      </div>
    </div>
    <div style="background:var(--primary);color:#fff;border-radius:var(--radius);padding:20px;display:flex;justify-content:space-between;align-items:center">
      <span style="opacity:.8;text-transform:uppercase;font-size:12px">Total orden</span>
      <span style="font-size:28px;font-weight:700">${money(total)}</span>
    </div>`;
}

let _pendingStatusChange = null;

async function actualizarEstadoOrden(id, status) {
  const oldStatus = _ordenActual?.status;
  // Primera transición desde ingresada: exigir trabajador si aún no tiene uno
  if (oldStatus === 'ingresada' && status !== 'ingresada' && !_ordenActual?.asignadoId) {
    _pendingStatusChange = { id, status };
    if (!empleadosData.length) await loadEmpleados();
    const sel = document.getElementById('asignar-empleado');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar trabajador...</option>' +
        empleadosData.map(e =>
          `<option value="${e.id}">${e.name}${e.role ? ' – ' + e.role : ''}</option>`
        ).join('');
    }
    openModal('modal-asignar-trabajador');
    return;
  }
  // Siempre mostrar modal de pago al entregar, sin importar el estado anterior
  if (status === 'entregada') {
    entregarOrden(id);
    return;
  }
  const r = await api('ordenes', 'actualizar_estado', { id, status });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Estado actualizado');
  openOrdenDetalle(id);
}

async function confirmarAsignacion() {
  if (!_pendingStatusChange) return;
  const empId = document.getElementById('asignar-empleado')?.value;
  if (!empId) { toast('Debes seleccionar un trabajador', 'warning'); return; }
  const { id, status, fromKanban } = _pendingStatusChange;
  const r = await api('ordenes', 'actualizar_estado', { id, status, asignadoId: parseInt(empId) });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Trabajador asignado y estado actualizado ✓', 'success');
  closeModal('modal-asignar-trabajador');
  _pendingStatusChange = null;
  if (fromKanban) loadMotos(); else openOrdenDetalle(id);
}

function cancelarAsignacion() {
  const pending = _pendingStatusChange;
  _pendingStatusChange = null;
  closeModal('modal-asignar-trabajador');
  if (pending) openOrdenDetalle(pending.id); // recarga para resetear el select
}

async function actualizarCampoOrden(id, field, value) {
  await api('ordenes', 'actualizar_campo', { id, [field]: value });
}

async function buscarRepuestoOrden(orderId) {
  const q = document.getElementById('od-prod-search')?.value?.trim() ?? '';
  const res = document.getElementById('od-prod-results');
  if (q.length < 2) { res?.classList.add('hidden'); return; }
  const prods = await fetch(`/php/inventario?action=buscar&q=${encodeURIComponent(q)}`)
    .then(r => r.json()).catch(() => []);
  if (!prods.length) { res.classList.add('hidden'); return; }
  res.classList.remove('hidden');
  res.innerHTML = prods.map(p => {
    const sinStock = p.stock <= 0;
    return `<button onclick="${sinStock ? '' : `agregarParte(${orderId},${p.id})`}"
      style="display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px 12px;border:none;background:none;cursor:${sinStock?'not-allowed':'pointer'};font-size:13px;text-align:left;opacity:${sinStock?'0.5':'1'}"
      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'"
      ${sinStock ? 'disabled title="Sin stock disponible"' : ''}>
      <span>${p.name} <span style="color:var(--text-muted);font-size:11px">· ${p.code||''}${p.shelf?' · '+p.shelf:''}</span></span>
      <span style="font-size:12px;color:${sinStock?'var(--danger)':'inherit'}">${money(p.price)} · stock: ${p.stock}</span>
    </button>`;
  }).join('');
}

async function agregarParte(orderId, productId) {
  const r = await api('ordenes', 'agregar_parte', { id: orderId, productId });
  if (r.error) { toast(r.error, 'error'); return; }
  _ordenActual.parts = r.parts;
  document.getElementById('od-prod-search').value = '';
  document.getElementById('od-prod-results').classList.add('hidden');
  openOrdenDetalle(orderId);
}

async function quitarParte(orderId, idx) {
  const r = await api('ordenes', 'quitar_parte', { id: orderId, idx });
  if (r.error) { toast(r.error, 'error'); return; }
  openOrdenDetalle(orderId);
}

async function actualizarQtyParte(orderId, idx, qty) {
  const r = await api('ordenes', 'actualizar_qty', { id: orderId, idx, qty: Number(qty) });
  if (r.error) { toast(r.error, 'error'); }
  openOrdenDetalle(orderId);
}

async function agregarServicio(orderId) {
  const desc = document.getElementById('od-svc-desc').value.trim();
  const price = parseFloat(document.getElementById('od-svc-price').value) || 0;
  if (!desc) return;
  const r = await api('ordenes', 'agregar_servicio', { id: orderId, description: desc, price });
  if (r.error) { toast(r.error, 'error'); return; }
  openOrdenDetalle(orderId);
}

async function quitarServicio(orderId, idx) {
  await api('ordenes', 'quitar_servicio', { id: orderId, idx });
  openOrdenDetalle(orderId);
}

async function compressImage(file, maxWidth = 1280, quality = 0.78) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function agregarFotos(orderId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  toast('Subiendo ' + files.length + ' imagen(es)…');
  for (const f of files) {
    const dataUrl = await compressImage(f);
    const r = await api('ordenes', 'agregar_evidencia', { id: orderId, dataUrl });
    if (r.error) { toast(r.error, 'error'); }
  }
  openOrdenDetalle(orderId);
}

function verFoto(src) {
  let overlay = document.getElementById('foto-visor-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'foto-visor-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:600;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    overlay.innerHTML = `
      <img id="foto-visor-img" src="" alt="foto" style="max-width:95vw;max-height:92vh;border-radius:10px;box-shadow:0 24px 80px rgba(0,0,0,.7);object-fit:contain">
      <button onclick="cerrarFotoVisor()" style="position:fixed;top:18px;right:18px;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:22px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrarFotoVisor(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarFotoVisor(); });
    document.body.appendChild(overlay);
  }
  document.getElementById('foto-visor-img').src = src;
  overlay.style.display = 'flex';
}
function cerrarFotoVisor() {
  const ov = document.getElementById('foto-visor-overlay');
  if (ov) ov.style.display = 'none';
}

async function quitarFoto(orderId, idx) {
  await api('ordenes', 'quitar_evidencia', { id: orderId, idx });
  openOrdenDetalle(orderId);
}

async function finalizarOrden(id) {
  if (!confirm('¿Finalizar orden? Pasará a "lista para entregar".')) return;
  const r = await api('ordenes', 'finalizar', { id });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Orden lista. Total ${money(r.total)} ✓`, 'success');
  openOrdenDetalle(id);
}

async function entregarOrden(id) {
  if (empleadosData.length === 0) await loadEmpleados();
  document.getElementById('entregar-orden-id').value = id;
  const metEl = document.getElementById('entregar-metodo');
  if (metEl) metEl.value = 'efectivo';
  const pctEl = document.getElementById('entregar-porcentaje');
  if (pctEl) pctEl.value = '';
  updateEntregarPct();
  openModal('modal-entregar-orden');
}

function updateEntregarPct() {
  const empId = document.getElementById('entregar-empleado')?.value;
  const pctGroup = document.getElementById('entregar-pct-group');
  const pctInput = document.getElementById('entregar-porcentaje');
  const pctPreview = document.getElementById('entregar-pct-preview');
  if (!pctGroup) return;
  pctGroup.style.display = empId ? 'block' : 'none';
  if (!empId || !pctPreview) return;
  const pct = parseFloat(pctInput?.value) || 0;
  pctPreview.textContent = pct > 0
    ? `Se acumulará ${pct}% del total como pago pendiente al empleado`
    : 'Sin comisión — puedes registrarlo manualmente en Empleados';
}

async function confirmarEntrega() {
  const id = document.getElementById('entregar-orden-id').value;
  const method = document.getElementById('entregar-metodo')?.value || 'efectivo';
  const empleadoId = document.getElementById('entregar-empleado')?.value || '';
  const porcentaje = parseFloat(document.getElementById('entregar-porcentaje')?.value) || 0;
  const r = await api('ordenes', 'entregar', {
    id: parseInt(id), method,
    empleadoId: empleadoId ? parseInt(empleadoId) : undefined,
    porcentaje,
  });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Entregada. Factura ${r.ventaNumber} · ${money(r.total)} ✓`, 'success');
  closeModal('modal-entregar-orden');
  openOrdenDetalle(parseInt(id));
}

async function verHistorialOrden(id) {
  const rows = await api('ordenes', 'historial', { id });
  const list = (rows || []).map(h =>
    `<tr><td>${dateShort(h.createdAt)}</td><td>${h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : '—'}</td><td>→</td><td><span class="badge badge-${h.toStatus}">${STATUS_LABELS[h.toStatus] || h.toStatus}</span></td><td>${h.note || ''}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty-state">Sin cambios registrados</td></tr>';
  const html = `<table><thead><tr><th>Fecha</th><th>Desde</th><th></th><th>A</th><th>Nota</th></tr></thead><tbody>${list}</tbody></table>`;
  // Modal simple inline
  let modal = document.getElementById('modal-historial');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-historial';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:640px"><button class="modal-close" onclick="document.getElementById('modal-historial').classList.add('hidden')">✕</button><h2>Historial de la orden</h2><div id="modal-historial-body"></div></div>`;
    document.body.appendChild(modal);
  }
  modal.querySelector('#modal-historial-body').innerHTML = html;
  modal.classList.remove('hidden');
}

// ─── INVENTARIO ───────────────────────────────
async function loadInventario() {
  inventarioData = await get('inventario', 'listar');
  renderInventario(inventarioData);
}

function renderInventario(rows) {
  document.getElementById('inv-tbody').innerHTML = rows.map(p => `<tr>
    <td class="font-mono">${p.code}</td>
    <td>${p.name}</td>
    <td>${p.shelf||'-'}</td>
    <td class="${p.stock<=p.minStock?'text-danger font-bold':''}">${p.stock}</td>
    <td>${p.minStock}</td>
    <td>${money(p.price)}</td>
    <td>${money(p.cost)}</td>
    <td class="flex gap-2">
      <button class="btn btn-outline btn-sm btn-icon" onclick="openModalProducto(${p.id})">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto(${p.id})">🗑</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" class="empty-state">Sin productos</td></tr>';
}

function filterInventario() {
  const q = document.getElementById('inv-search').value.toLowerCase();
  if (!q) { renderInventario(inventarioData); return; }
  renderInventario(inventarioData.filter(p =>
    p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.shelf||'').toLowerCase().includes(q)
  ));
}

function openModalProducto(id) {
  const p = id ? inventarioData.find(x => x.id == id) : null;
  document.getElementById('modal-producto-title').textContent = p ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('prod-id').value = p?.id || '';
  document.getElementById('prod-code').value = p?.code || '';
  document.getElementById('prod-name').value = p?.name || '';
  document.getElementById('prod-stock').value = p?.stock || 0;
  document.getElementById('prod-minstock').value = p?.minStock || 0;
  document.getElementById('prod-shelf').value = p?.shelf || '';
  document.getElementById('prod-price').value = p?.price || 0;
  document.getElementById('prod-cost').value = p?.cost || 0;
  openModal('modal-producto');
}

async function saveProducto() {
  const id = document.getElementById('prod-id').value;
  const data = {
    code: document.getElementById('prod-code').value.trim(),
    name: document.getElementById('prod-name').value.trim(),
    stock: parseInt(document.getElementById('prod-stock').value) || 0,
    minStock: parseInt(document.getElementById('prod-minstock').value) || 0,
    shelf: document.getElementById('prod-shelf').value.trim(),
    price: parseFloat(document.getElementById('prod-price').value) || 0,
    cost: parseFloat(document.getElementById('prod-cost').value) || 0,
  };
  if (!data.code || !data.name) { toast('Código y nombre requeridos', 'error'); return; }
  const r = id ? await api('inventario', 'actualizar', { id: parseInt(id), ...data }) : await api('inventario', 'crear', data);
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Producto guardado ✓', 'success');
  closeModal('modal-producto');
  loadInventario();
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminar producto?')) return;
  const r = await api('inventario', 'eliminar', { id });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Eliminado');
  loadInventario();
}

// ─── VENTAS ───────────────────────────────────
async function loadVentas() {
  const rows = await get('ventas', 'listar');
  const mostrador = rows.filter(v => v.type === 'mostrador' || !v.type);
  const metodoPago = m => ({ efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[m] || m || '-');
  document.getElementById('ventas-tbody').innerHTML = mostrador.slice(0, 30).map(v =>
    `<tr>
      <td class="font-mono">${v.number}</td>
      <td>${dateShort(v.date)}</td>
      <td>${money(v.total)}</td>
      <td>${metodoPago(v.method)}</td>
      <td><button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboVenta(${v.id})" title="Imprimir recibo">🖨</button></td>
    </tr>`
  ).join('') || '<tr><td colspan="5" class="empty-state">Sin ventas</td></tr>';
  ventaItems = [];
  renderVentaItems();
}

async function buscarProductoVenta() {
  const q = document.getElementById('venta-search').value;
  if (q.length < 1) { document.getElementById('venta-resultados').classList.add('hidden'); return; }
  const prods = await get('inventario', 'buscar', `&q=${encodeURIComponent(q)}`);
  const res = document.getElementById('venta-resultados');
  if (!prods.length) { res.classList.add('hidden'); return; }
  res.classList.remove('hidden');
  res.innerHTML = prods.map(p => `<button onclick="addVentaItem(${p.id},'${p.name.replace(/'/g,"\\'")}',${p.price},${p.stock})" style="display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;text-align:left" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'">
    <span>${p.name}${p.shelf?' <small>('+p.shelf+')</small>':''}</span>
    <span>${money(p.price)} · stock ${p.stock}</span>
  </button>`).join('');
}

function addVentaItem(id, name, price, stock) {
  if (stock <= 0) { toast('Sin stock', 'error'); return; }
  const existing = ventaItems.find(x => x.productId === id);
  if (existing) { existing.qty++; }
  else { ventaItems.push({ productId: id, name, qty: 1, unitPrice: price }); }
  document.getElementById('venta-search').value = '';
  document.getElementById('venta-resultados').classList.add('hidden');
  renderVentaItems();
}

function renderVentaItems() {
  const total = ventaItems.reduce((a,x) => a + x.qty * x.unitPrice, 0);
  document.getElementById('venta-items').innerHTML = ventaItems.map((it,i) => `<div class="part-row">
    <div style="flex:1;font-size:13px">${it.name}</div>
    <input type="number" min="1" value="${it.qty}" style="width:60px" onchange="ventaItems[${i}].qty=Number(this.value);renderVentaItems()">
    <span style="width:100px;text-align:right">${money(it.qty*it.unitPrice)}</span>
    <button class="btn btn-ghost btn-icon" onclick="ventaItems.splice(${i},1);renderVentaItems()">🗑</button>
  </div>`).join('');
  document.getElementById('venta-total').textContent = money(total);
}

async function crearVenta() {
  if (!ventaItems.length) { toast('Agrega al menos un producto', 'error'); return; }
  const method = document.getElementById('venta-metodo').value;
  const r = await api('ventas', 'crear', { items: ventaItems, method });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Venta ${r.number} registrada ✓`, 'success');
  ventaItems = [];
  loadVentas();
}

// ─── FACTURAS ─────────────────────────────────
async function loadFacturas() {
  const rows = await get('facturas', 'listar');
  const metodoPago = m => ({ efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[m] || m || '-');
  document.getElementById('facturas-tbody').innerHTML = rows.map(f => {
    const esOrden = f.type === 'orden';
    const btnImprimir = esOrden && f.orderId
      ? `<button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboOrden(${f.orderId})" title="Imprimir recibo de orden">🖨 Orden</button>`
      : `<button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboVenta(${f.id})" title="Reimprimir recibo">🖨</button>`;
    return `<tr>
      <td class="font-mono">${f.number}</td>
      <td>${dateShort(f.date)}</td>
      <td>${esOrden ? 'Orden' : 'Mostrador'}</td>
      <td>${f.orden_number ? `<span class="font-mono">${f.orden_number}</span>` : '-'}</td>
      <td>${money(f.total)}</td>
      <td>${metodoPago(f.method)}</td>
      <td>${btnImprimir}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty-state">Sin facturas</td></tr>';
}

// ─── PROVEEDORES ──────────────────────────────
async function loadProveedores() {
  proveedoresData = await get('proveedores', 'listar');
  document.getElementById('prov-tbody').innerHTML = proveedoresData.map(p => `<tr>
    <td>${p.name}</td><td>${p.phone||'-'}</td><td>${p.productsHint||'-'}</td>
    <td class="flex gap-2">
      <button class="btn btn-outline btn-sm btn-icon" onclick="openModalProveedor(${p.id})">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProveedor(${p.id})">🗑</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Sin proveedores</td></tr>';
}

function openModalProveedor(id) {
  const p = id ? proveedoresData.find(x => x.id == id) : null;
  document.getElementById('prov-id').value = p?.id || '';
  document.getElementById('prov-name').value = p?.name || '';
  document.getElementById('prov-phone').value = p?.phone || '';
  document.getElementById('prov-hint').value = p?.productsHint || '';
  openModal('modal-proveedor');
}

async function saveProveedor() {
  const id = document.getElementById('prov-id').value;
  const data = { name: document.getElementById('prov-name').value.trim(), phone: document.getElementById('prov-phone').value, productsHint: document.getElementById('prov-hint').value };
  if (!data.name) { toast('Nombre requerido', 'error'); return; }
  const r = id ? await api('proveedores', 'actualizar', { id: parseInt(id), ...data }) : await api('proveedores', 'crear', data);
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Guardado ✓', 'success');
  closeModal('modal-proveedor');
  loadProveedores();
}

async function eliminarProveedor(id) {
  if (!confirm('¿Eliminar proveedor?')) return;
  await api('proveedores', 'eliminar', { id });
  toast('Eliminado');
  loadProveedores();
}

// ─── COMPRAS ──────────────────────────────────
async function loadCompras() {
  const rows = await get('compras', 'listar');
  document.getElementById('compras-tbody').innerHTML = rows.map(c => `<tr>
    <td>${dateShort(c.date)}</td>
    <td>${c.proveedor_name||'-'}</td>
    <td>${money(c.total)}</td>
    <td>${(c.items||[]).length} productos</td>
  </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Sin compras</td></tr>';
}

function openModalCompra() {
  compraItems = [];
  renderCompraItems();
  document.getElementById('compra-search').value = '';
  document.getElementById('compra-fecha').value = todayISO();
  // Poblar proveedores
  const sel = document.getElementById('compra-prov');
  sel.innerHTML = '<option value="">Sin proveedor</option>' + proveedoresData.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  openModal('modal-compra');
}

async function buscarProductoCompra() {
  const q = document.getElementById('compra-search').value;
  if (q.length < 1) { document.getElementById('compra-resultados').classList.add('hidden'); return; }
  const prods = await get('inventario', 'buscar', `&q=${encodeURIComponent(q)}`);
  const res = document.getElementById('compra-resultados');
  if (!prods.length) { res.classList.add('hidden'); return; }
  res.classList.remove('hidden');
  res.innerHTML = prods.map(p => `<button onclick="addCompraItem(${p.id},'${p.name.replace(/'/g,"\\'")}',${p.cost||0})" style="display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'">
    <span>${p.name}</span><span>Costo: ${money(p.cost)}</span>
  </button>`).join('');
}

function addCompraItem(id, name, cost) {
  const existing = compraItems.find(x => x.productId === id);
  if (existing) { existing.qty++; }
  else { compraItems.push({ productId: id, name, qty: 1, cost }); }
  document.getElementById('compra-search').value = '';
  document.getElementById('compra-resultados').classList.add('hidden');
  renderCompraItems();
}

function renderCompraItems() {
  document.getElementById('compra-items').innerHTML = compraItems.map((it,i) => `<div class="part-row">
    <div style="flex:1;font-size:13px">${it.name}</div>
    <input type="number" min="1" value="${it.qty}" style="width:60px" onchange="compraItems[${i}].qty=Number(this.value);renderCompraItems()">
    <input type="number" min="0" step="0.01" value="${it.cost}" style="width:100px" placeholder="Costo" onchange="compraItems[${i}].cost=Number(this.value)">
    <button class="btn btn-ghost btn-icon" onclick="compraItems.splice(${i},1);renderCompraItems()">🗑</button>
  </div>`).join('') || '<p class="text-muted text-sm">Sin productos agregados.</p>';
}

async function saveCompra() {
  if (!compraItems.length) { toast('Agrega al menos un producto', 'error'); return; }
  const supplierId = document.getElementById('compra-prov').value || null;
  const date = document.getElementById('compra-fecha').value || todayISO();
  const r = await api('compras', 'crear', { supplierId, date, items: compraItems });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Compra registrada. Total: ${money(r.total)} ✓`, 'success');
  closeModal('modal-compra');
  loadCompras();
  loadInventario();
}

// ─── EMPLEADOS ────────────────────────────────
let _empDetalleId = null;

async function loadEmpleados() {
  const [acumulados, listar] = await Promise.all([
    fetch('/php/empleados?action=acumulados').then(r => r.json()).catch(() => []),
    get('empleados', 'listar'),
  ]);
  empleadosData = listar || [];
  const rows = acumulados || [];
  document.getElementById('emp-tbody').innerHTML = rows.map(e => `<tr>
    <td><strong>${e.name}</strong></td>
    <td>${e.role || '-'}</td>
    <td>${e.phone || '-'}</td>
    <td class="${e.acumulado > 0 ? 'text-primary font-bold' : 'text-muted'}">${money(e.acumulado)}</td>
    <td><span class="badge badge-${e.trabajos_pendientes > 0 ? 'reparacion' : 'entregada'}">${e.trabajos_pendientes || 0} pendiente${e.trabajos_pendientes !== 1 ? 's' : ''}</span></td>
    <td class="flex gap-2">
      <button class="btn btn-outline btn-sm" onclick="openEmpleadoDetalle(${e.id},'${e.name.replace(/'/g,"\\'")}')">Ver detalle</button>
      <button class="btn btn-primary btn-sm" onclick="openEmpleadoDetalle(${e.id},'${e.name.replace(/'/g,"\\'")}',true)" ${e.acumulado <= 0 ? 'disabled' : ''}>Pagar</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="openModalEmpleado(${e.id})">✏️</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sin empleados registrados</td></tr>';
  // Actualizar selector de entrega de orden
  const empOpts = empleadosData.map(e => `<option value="${e.id}">${e.name}${e.role ? ' · ' + e.role : ''}</option>`).join('');
  const selEntregar = document.getElementById('entregar-empleado');
  if (selEntregar) selEntregar.innerHTML = '<option value="">-- Sin asignar --</option>' + empOpts;
  loadLiquidaciones();
}

async function openEmpleadoDetalle(empId, empName, autoLiquidar = false) {
  _empDetalleId = empId;
  document.getElementById('emp-detalle-title').textContent = `Trabajos pendientes — ${empName}`;
  const rows = await fetch(`/php/empleados?action=pendientes&employeeId=${empId}`)
    .then(r => r.json()).catch(() => []);
  const total = (rows || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  document.getElementById('emp-detalle-resumen').innerHTML =
    `<span>Total acumulado: <strong style="color:var(--primary);font-size:16px">${money(total)}</strong></span>
     <span style="margin-left:16px;color:var(--text-muted)">${rows.length} trabajo${rows.length !== 1 ? 's' : ''} pendiente${rows.length !== 1 ? 's' : ''}</span>`;
  document.getElementById('emp-detalle-tbody').innerHTML = (rows || []).map(p => `<tr>
    <td class="font-mono">${p.orden_number || '-'}</td>
    <td>${money(p.total_orden || 0)}</td>
    <td>${p.porcentaje != null ? p.porcentaje + '%' : '-'}</td>
    <td class="font-bold">${money(p.amount)}</td>
    <td>${dateShort(p.date)}</td>
    <td style="font-size:12px;color:var(--text-muted)">${p.note || '-'}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sin trabajos pendientes</td></tr>';
  document.getElementById('btn-liquidar-emp').disabled = rows.length === 0;
  openModal('modal-emp-detalle');
  if (autoLiquidar && rows.length > 0) liquidarEmpleado();
}

async function liquidarEmpleado() {
  if (!_empDetalleId) return;
  if (!confirm('¿Confirmar liquidación? Se pagará el total acumulado y se registrará en caja.')) return;
  const r = await api('empleados', 'liquidar', { employeeId: _empDetalleId });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Liquidación registrada: ${money(r.total)} (${r.count} trabajos) ✓`, 'success');
  closeModal('modal-emp-detalle');
  loadEmpleados();
}

async function loadLiquidaciones(empId = '') {
  const url = `/php/empleados?action=liquidaciones_listar${empId ? '&employeeId=' + empId : ''}`;
  const rows = await fetch(url).then(r => r.json()).catch(() => []);
  document.getElementById('liquidaciones-tbody').innerHTML = (rows || []).map(l => `<tr>
    <td><strong>${l.empleado_name || '-'}</strong></td>
    <td class="font-bold text-primary">${money(l.total)}</td>
    <td>${(l.items || []).length} trabajos</td>
    <td>${dateShort(l.date)}</td>
    <td><button class="btn btn-outline btn-sm" onclick="openLiquidacionDetalle(${l.id},'${(l.empleado_name || '').replace(/'/g,"\\'")}',${l.total})">Ver detalle</button></td>
  </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Sin liquidaciones registradas</td></tr>';
}

async function openLiquidacionDetalle(liqId, empName, total) {
  document.getElementById('liq-detalle-title').textContent = `Liquidación — ${empName}`;
  document.getElementById('liq-detalle-resumen').innerHTML =
    `Total pagado: <strong style="color:var(--primary);font-size:16px">${money(total)}</strong>`;
  const rows = await fetch(`/php/empleados?action=liquidacion_detalle&id=${liqId}`)
    .then(r => r.json()).catch(() => []);
  document.getElementById('liq-detalle-tbody').innerHTML = (rows || []).map(p => `<tr>
    <td class="font-mono">${p.orden_number || '-'}</td>
    <td>${money(p.total_orden || 0)}</td>
    <td>${p.porcentaje != null ? p.porcentaje + '%' : '-'}</td>
    <td class="font-bold">${money(p.amount)}</td>
    <td>${dateShort(p.date)}</td>
  </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Sin detalle</td></tr>';
  openModal('modal-liquidacion-detalle');
}

function openModalEmpleado(id) {
  const e = id ? empleadosData.find(x => x.id == id) : null;
  document.getElementById('emp-id').value = e?.id || '';
  document.getElementById('emp-name').value = e?.name || '';
  document.getElementById('emp-role').value = e?.role || '';
  document.getElementById('emp-phone').value = e?.phone || '';
  openModal('modal-empleado');
}

async function saveEmpleado() {
  const id = document.getElementById('emp-id').value;
  const data = {
    name: document.getElementById('emp-name').value.trim(),
    role: document.getElementById('emp-role').value,
    phone: document.getElementById('emp-phone').value,
  };
  if (!data.name) { toast('Nombre requerido', 'error'); return; }
  const r = id ? await api('empleados', 'actualizar', { id: parseInt(id), ...data }) : await api('empleados', 'crear', data);
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Guardado ✓', 'success');
  closeModal('modal-empleado');
  loadEmpleados();
}

async function openModalPago() {
  if (empleadosData.length === 0) await loadEmpleados();
  const selEmp = document.getElementById('pago-emp-id');
  selEmp.innerHTML = '<option value="">-- Seleccionar empleado --</option>' +
    empleadosData.map(e => `<option value="${e.id}">${e.name}${e.role ? ' · ' + e.role : ''}</option>`).join('');
  const ordenes = await fetch('/php/ordenes?action=listar').then(r => r.json()).catch(() => []);
  const selOrden = document.getElementById('pago-orden-id');
  selOrden.innerHTML = '<option value="">-- Sin orden --</option>' +
    (ordenes || []).map(o => `<option value="${o.id}">${o.number} · ${o.cliente_name || ''} · ${o.plate || ''}</option>`).join('');
  document.getElementById('pago-base').value = '';
  document.getElementById('pago-porcentaje').value = '100';
  document.getElementById('pago-date').value = todayISO();
  document.getElementById('pago-note').value = '';
  document.getElementById('pago-preview').innerHTML = '';
  openModal('modal-pago');
}

function calcPagoPreview() {
  const base = parseFloat(document.getElementById('pago-base').value) || 0;
  const pct = parseFloat(document.getElementById('pago-porcentaje').value) || 0;
  const valorPago = Math.round(base * pct / 100);
  const ganancia = base - valorPago;
  const el = document.getElementById('pago-preview');
  if (!base) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">
    <span>Base: <strong>${money(base)}</strong></span>
    <span style="color:var(--primary)">Pago empleado (<strong>${pct}%</strong>): <strong>${money(valorPago)}</strong></span>
    <span style="color:var(--success)">Ganancia taller: <strong>${money(ganancia)}</strong></span>
  </div>`;
}

async function savePago() {
  const empId = document.getElementById('pago-emp-id').value;
  const ordenId = document.getElementById('pago-orden-id').value;
  const base = parseFloat(document.getElementById('pago-base').value);
  const pct = parseFloat(document.getElementById('pago-porcentaje').value) || 0;
  const date = document.getElementById('pago-date').value;
  const note = document.getElementById('pago-note').value;
  if (!empId) { toast('Selecciona un empleado', 'error'); return; }
  if (!base) { toast('Ingresa el valor base', 'error'); return; }
  const r = await api('empleados', 'pagos_crear', {
    employeeId: parseInt(empId),
    orderId: ordenId ? parseInt(ordenId) : null,
    total_orden: base,
    porcentaje: pct,
    date,
    note,
  });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Trabajo registrado: ${money(r.amount)} acumulado ✓`, 'success');
  closeModal('modal-pago');
  loadEmpleados();
}

// ─── CAJA ─────────────────────────────────────
async function loadCaja() {
  const fecha = document.getElementById('caja-fecha')?.value || todayISO();
  const [rows, resumen] = await Promise.all([
    get('caja', 'listar', `&fecha=${fecha}`),
    get('caja', 'resumen', `&fecha=${fecha}`),
  ]);
  document.getElementById('caja-ing').textContent = money(resumen.ingresos);
  document.getElementById('caja-egr').textContent = money(resumen.egresos);
  document.getElementById('caja-bal').textContent = money(resumen.balance);
  document.getElementById('caja-tbody').innerHTML = rows.map(r =>
    `<tr><td>${dateShort(r.date)}</td><td><span class="badge badge-${r.type==='ingreso'?'lista':'ingresada'}">${r.type}</span></td><td>${r.concept||'-'}</td><td class="${r.type==='egreso'?'text-danger':'text-success'}">${money(r.amount)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty-state">Sin movimientos</td></tr>';
}

function openModalMovimiento() {
  document.getElementById('mov-amount').value = '';
  document.getElementById('mov-concept').value = '';
  document.getElementById('mov-date').value = todayISO();
  openModal('modal-movimiento');
}

async function saveMovimiento() {
  const r = await api('caja', 'crear', {
    type: document.getElementById('mov-tipo').value,
    amount: parseFloat(document.getElementById('mov-amount').value),
    concept: document.getElementById('mov-concept').value.trim(),
    date: document.getElementById('mov-date').value,
  });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Movimiento registrado ✓', 'success');
  closeModal('modal-movimiento');
  loadCaja();
}

// ─── HISTORIAL DE ENTREGAS (antes Garantías) ──
async function loadGarantias() {
  // Usamos fetch directo para evitar el bug del adapter.js que ignora params en listar
  const rows = await fetch('/php/ordenes?action=listar&all=1').then(r => r.json()).catch(() => []);
  const entregadas = (rows || []).filter(o => o.status === 'entregada');
  document.getElementById('gar-tbody').innerHTML = entregadas.map(o => {
    let parts = [], services = [];
    try { parts = JSON.parse(o.parts || '[]'); } catch {}
    try { services = JSON.parse(o.services || '[]'); } catch {}
    const partsStr = parts.length ? parts.map(p => `${p.name} x${p.qty||1}`).join(', ') : '-';
    const svcStr = services.length ? services.map(s => s.description || s.name || '').filter(Boolean).join(', ') : '-';
    return `<tr>
      <td><span class="font-mono" style="color:var(--primary)">${o.number || '#' + o.id}</span></td>
      <td>${o.cliente_name || '-'}</td>
      <td class="font-mono">${o.plate || '-'}</td>
      <td>${[o.model, o.year].filter(Boolean).join(' ') || '-'}</td>
      <td>${dateShort(o.entryDate)}</td>
      <td style="max-width:160px;font-size:0.82em">${svcStr}</td>
      <td style="max-width:160px;font-size:0.82em">${partsStr}</td>
      <td>${o.problem || '-'}</td>
      <td>${money(o.total)}</td>
      <td class="flex gap-2">
        <button class="btn btn-outline btn-sm" onclick="openOrdenDetalle(${o.id})">Ver</button>
        <button class="btn btn-outline btn-sm btn-icon" onclick="imprimirReciboOrden(${o.id})" title="Imprimir recibo">🖨</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="empty-state">Sin órdenes entregadas registradas</td></tr>';
}

async function eliminarGarantia(id) {
  if (!confirm('¿Eliminar garantía?')) return;
  await api('garantias', 'eliminar', { id });
  toast('Eliminada');
  loadGarantias();
}

async function openModalGarantia(id) {
  document.getElementById('gar-id').value = id || '';
  document.getElementById('gar-desc').value = '';
  document.getElementById('gar-expires').value = '';
  document.getElementById('gar-status').value = 'activa';
  // Cargar motos entregadas
  const sel = document.getElementById('gar-orden');
  sel.innerHTML = '<option value="">-- Selecciona una moto entregada --</option>';
  try {
    const motos = await get('garantias', 'motos_entregadas');
    sel.innerHTML += motos.map(m =>
      `<option value="${m.orderId}" data-customer="${m.customerId}" data-bike="${m.bikeId}">${m.plate || '-'} · ${m.cliente_name || '-'} · ${m.number}</option>`
    ).join('');
  } catch (e) { console.warn('motos_entregadas:', e); }
  openModal('modal-garantia');
}

async function saveGarantia() {
  const id = document.getElementById('gar-id').value;
  const sel = document.getElementById('gar-orden');
  const opt = sel.options[sel.selectedIndex];
  const data = {
    orderId: opt && sel.value ? parseInt(sel.value) : null,
    customerId: opt && opt.dataset.customer ? parseInt(opt.dataset.customer) : null,
    bikeId: opt && opt.dataset.bike ? parseInt(opt.dataset.bike) : null,
    description: document.getElementById('gar-desc').value.trim(),
    expiresAt: document.getElementById('gar-expires').value || null,
    status: document.getElementById('gar-status').value,
  };
  if (!data.description) { toast('Descripción requerida', 'error'); return; }
  if (!id && !data.orderId) { toast('Selecciona una moto entregada', 'error'); return; }
  const r = id ? await api('garantias', 'actualizar', { id: parseInt(id), ...data }) : await api('garantias', 'crear', data);
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Guardado ✓', 'success');
  closeModal('modal-garantia');
  loadGarantias();
}

// ─── NOTAS ────────────────────────────────────
async function loadNotas() {
  const rows = await get('notas', 'listar');
  document.getElementById('notas-list').innerHTML = rows.length ? rows.map(n => `
    <div class="card mb-3 flex items-center gap-3" style="padding:14px 18px;opacity:${n.done?'.6':'1'}">
      <input type="checkbox" ${n.done?'checked':''} style="width:18px;height:18px" onchange="toggleNota(${n.id})">
      <div style="flex:1">
        <div style="font-weight:600;text-decoration:${n.done?'line-through':'none'}">${n.title}</div>
        ${n.body ? `<div class="text-muted text-sm">${n.body}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-icon" onclick="eliminarNota(${n.id})">🗑</button>
    </div>
  `).join('') : '<div class="empty-state">Sin notas. ¡Agrega una!</div>';
}

function openModalNota() {
  document.getElementById('nota-title').value = '';
  document.getElementById('nota-body').value = '';
  openModal('modal-nota');
}

async function saveNota() {
  const title = document.getElementById('nota-title').value.trim();
  const body = document.getElementById('nota-body').value;
  if (!title) { toast('Título requerido', 'error'); return; }
  await api('notas', 'crear', { title, body });
  toast('Nota guardada ✓', 'success');
  closeModal('modal-nota');
  loadNotas();
}

async function toggleNota(id) {
  await api('notas', 'toggle', { id });
  loadNotas();
}

async function eliminarNota(id) {
  await api('notas', 'eliminar', { id });
  loadNotas();
}

// ─── MENSAJES / PLANTILLAS ────────────────────
async function loadMensajes() {
  const tpls = await get('mensajes', 'listar');
  document.getElementById('mensajes-grid').innerHTML = tpls.map(t => `
    <div class="card">
      <div class="form-group"><label>${t.label}</label></div>
      <textarea rows="7" id="tpl-${t.id}" style="resize:vertical">${t.body}</textarea>
      <button class="btn btn-primary w-full mt-3 btn-sm" onclick="savePlantilla(${t.id})">Guardar</button>
    </div>
  `).join('');
}

async function savePlantilla(id) {
  const body = document.getElementById(`tpl-${id}`).value;
  await api('mensajes', 'actualizar', { id, body });
  toast('Plantilla guardada ✓', 'success');
}

// ─── WHATSAPP ─────────────────────────────────
let _waState = 'disconnected';

async function loadWhatsApp() {
  // Cargar config
  const cfg = await api('whatsapp', 'config_get');
  document.getElementById('wa-modo-prueba').checked = cfg.modo_prueba === '1';
  document.getElementById('wa-num-prueba').value = cfg.numero_prueba || '';
  // Cargar historial
  const hist = await api('whatsapp', 'history');
  document.getElementById('wa-history-tbody').innerHTML = (hist || []).map(m =>
    `<tr><td>${m.tipo}</td><td>${m.telefono}</td><td><span class="badge badge-${m.estado==='enviado'?'lista':m.estado==='error'?'ingresada':'diagnostico'}">${m.estado}</span></td><td>${dateShort(m.fecha_envio)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty-state">Sin mensajes</td></tr>';
  // Estado actual
  try {
    const r = await fetch('http://127.0.0.1:8001/api/status');
    const d = await r.json();
    updateWAPage(d);
  } catch { updateWAPage({ state: 'disconnected', qr: null, error: 'Servicio WhatsApp no disponible' }); }
}

function updateWAPage(d) {
  _waState = d.state;
  const dot = document.getElementById('wa-dot');
  const text = document.getElementById('wa-status-text');
  const qrWrap = document.getElementById('wa-qr-wrap');
  const spinner = document.getElementById('wa-spinner');
  const errEl = document.getElementById('wa-error');
  const btnConnect = document.getElementById('wa-btn-connect');
  const btnDisconnect = document.getElementById('wa-btn-disconnect');
  if (!dot) return;

  const labels = { disconnected: 'Conectando...', loading: 'Iniciando...', qr: 'Escanea el código QR', connected: 'Conectado ✓' };
  dot.className = `wa-status-dot ${d.state}`;
  text.textContent = labels[d.state] || d.state;

  qrWrap.classList.toggle('hidden', d.state !== 'qr' || !d.qr);
  spinner.classList.toggle('hidden', d.state === 'connected' || (d.state === 'qr' && d.qr));
  if (d.state === 'qr' && d.qr) document.getElementById('wa-qr').src = d.qr;

  errEl.textContent = d.error || '';
  errEl.classList.toggle('hidden', !d.error);

  // Sin botones: el backend gestiona conexión automáticamente
  if (btnConnect) btnConnect.classList.add('hidden');
  if (btnDisconnect) btnDisconnect.classList.add('hidden');
}

async function waConnect() {
  updateWAPage({ state: 'loading', qr: null, error: null });
  try {
    await fetch('http://127.0.0.1:8001/api/init', { method: 'POST' });
  } catch { updateWAPage({ state: 'disconnected', qr: null, error: 'No se pudo iniciar el servicio WhatsApp' }); }
}

async function waDisconnect() {
  await fetch('http://127.0.0.1:8001/api/disconnect', { method: 'POST' }).catch(() => {});
  updateWAPage({ state: 'disconnected', qr: null, error: null });
}

async function waResetSession() {
  if (!confirm('¿Limpiar sesión de WhatsApp? Se pedirá escanear el QR nuevamente.')) return;
  try {
    const r = await api('whatsapp', 'reset_session');
    if (r.error) { toast(r.error, 'error'); return; }
    toast('Sesión eliminada. Conecta de nuevo para generar el QR.', 'success');
    updateWAPage({ state: 'disconnected', qr: null, error: null });
  } catch (e) { toast('Error al limpiar sesión', 'error'); }
}

async function waConfigSave() {
  const modo = document.getElementById('wa-modo-prueba').checked;
  const num = document.getElementById('wa-num-prueba').value.trim();
  const r = await api('whatsapp', 'config_set', { modo_prueba: modo, numero_prueba: num });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Configuración guardada ✓', 'success');
}

async function waSendTest() {
  const r = await api('whatsapp', 'send_test', { telefono: document.getElementById('wa-num-prueba').value });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Mensaje de prueba en cola ✓', 'success');
  setTimeout(() => loadWhatsApp(), 3000);
}

// ─── BÚSQUEDA ─────────────────────────────────
let searchTimeout = null;
async function doSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const q = document.getElementById('buscar-input').value.trim();
    if (q.length < 2) { document.getElementById('buscar-results').innerHTML = ''; return; }
    const d = await get('buscar', 'global', `&q=${encodeURIComponent(q)}`);
    let html = '';
    if (d.ordenes?.length) html += `<div class="card mb-4"><h3>Órdenes</h3><table><thead><tr><th>N°</th><th>Cliente</th><th>Placa</th><th>Estado</th><th>Total</th></tr></thead><tbody>
      ${d.ordenes.map(o => `<tr><td><a href="#" style="color:var(--primary)" onclick="openOrdenDetalle(${o.id})">${o.number}</a></td><td>${o.cliente_name||'-'}</td><td>${o.plate||'-'}</td><td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span></td><td>${money(o.total)}</td></tr>`).join('')}
    </tbody></table></div>`;
    if (d.clientes?.length) html += `<div class="card mb-4"><h3>Clientes</h3><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Motos</th></tr></thead><tbody>
      ${d.clientes.map(c => `<tr><td>${c.name}</td><td>${c.phone||'-'}</td><td>${c.motos_count}</td></tr>`).join('')}
    </tbody></table></div>`;
    if (d.productos?.length) html += `<div class="card"><h3>Productos</h3><table><thead><tr><th>Código</th><th>Nombre</th><th>Estante</th><th>Stock</th><th>Precio</th></tr></thead><tbody>
      ${d.productos.map(p => `<tr><td class="font-mono">${p.code}</td><td>${p.name}</td><td>${p.shelf||'-'}</td><td>${p.stock}</td><td>${money(p.price)}</td></tr>`).join('')}
    </tbody></table></div>`;
    if (!html) html = '<div class="empty-state">Sin resultados para "' + q + '"</div>';
    document.getElementById('buscar-results').innerHTML = html;
  }, 350);
}

// ─── URL acceso móvil ─────────────────────────
async function loadMobileUrl() {
  try {
    const data = await fetch('/api/local-ips').then(r => r.json()).catch(() => null);
    const urlEl = document.getElementById('topbar-mobile-url');
    if (!urlEl) return;
    if (data?.urls?.length) {
      urlEl.textContent = `📱 ${data.urls[0]}`;
      urlEl.style.display = '';
      urlEl.title = `Ingresa desde el celular: ${data.urls.join(' / ')}`;
    }
  } catch {}
}

// ─── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar fecha caja
  const fechaInput = document.getElementById('caja-fecha');
  if (fechaInput) fechaInput.value = todayISO();

  // Nav links
  document.querySelectorAll('#nav a[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });

  // Enter en login
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-user').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Verificar sesión existente
  const r = await get('auth', 'status');
  if (r.uid) {
    SES = r;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('topbar-user').textContent = `👤 ${r.nombre} (${r.rol})`;
    loadTallerNombre();
    loadMobileUrl();
    startWAStatusPoll();
    showPage('dashboard');
  }

  // Poll WA status cada 3s cuando la página WA está activa
  setInterval(async () => {
    if (document.getElementById('pg-whatsapp')?.classList.contains('active')) {
      try {
        const r = await fetch('http://127.0.0.1:8001/api/status');
        const d = await r.json();
        updateWAPage(d);
      } catch {}
    }
  }, 3000);
});
