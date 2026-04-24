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
  startWAStatusPoll();
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
  compras: 'Compras', empleados: 'Empleados', caja: 'Caja', garantias: 'Garantías',
  notas: 'Notas', mensajes: 'Plantillas WhatsApp', whatsapp: 'WhatsApp', buscar: 'Búsqueda',
};

function showPage(page) {
  document.querySelectorAll('.pg').forEach(el => el.classList.remove('active'));
  const pg = document.getElementById(`pg-${page}`);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('#nav a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  const loaders = { dashboard: loadDashboard, motos: loadMotos, ordenes: loadOrdenes,
    inventario: loadInventario, ventas: loadVentas, facturas: loadFacturas,
    proveedores: loadProveedores, compras: loadCompras, empleados: loadEmpleados,
    caja: loadCaja, garantias: loadGarantias, notas: loadNotas,
    mensajes: loadMensajes, whatsapp: loadWhatsApp, buscar: () => {} };
  if (loaders[page]) loaders[page]();
}

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
            <select onchange="cambiarEstadoKanban(${o.id},this.value)">
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

async function cambiarEstadoKanban(id, status) {
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
  const all = document.getElementById('ordenes-todas')?.checked ? '&all=1' : '';
  const rows = await get('ordenes', 'listar', all);
  const tbody = document.getElementById('ordenes-tbody');
  tbody.innerHTML = rows.map(o => `<tr>
    <td><a href="#" class="font-mono" style="color:var(--primary)" onclick="openOrdenDetalle(${o.id})">${o.number}</a></td>
    <td>${o.cliente_name || '-'}</td>
    <td class="font-mono">${o.plate || '-'}</td>
    <td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span></td>
    <td>${dateShort(o.entryDate)}</td>
    <td>${money(o.total)}</td>
    <td><button class="btn btn-outline btn-sm" onclick="openOrdenDetalle(${o.id})">Ver</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Sin órdenes</td></tr>';
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
  const total = d.parts.reduce((a,p) => a + p.qty*p.unitPrice, 0) + d.services.reduce((a,s) => a + s.price, 0);
  document.getElementById('orden-detalle-content').innerHTML = `
    <div class="flex items-center gap-2 mb-4">
      <button class="btn btn-ghost btn-sm" onclick="history.back()">← Atrás</button>
      <h1 style="font-size:20px;font-weight:700">Orden <span class="font-mono">${d.number}</span></h1>
      <span class="badge badge-${d.status}">${STATUS_LABELS[d.status]}</span>
      ${locked ? '<span class="badge" style="background:#e2e8f0;color:#64748b">🔒 Bloqueada</span>' : ''}
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline" onclick="window.print()">🖨 Imprimir</button>
        ${!locked ? `<button class="btn btn-success" onclick="finalizarOrden(${d.id})">Finalizar orden</button>` : ''}
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
            <input type="number" min="1" value="${p.qty}" style="width:60px" ${locked?'disabled':''} onchange="actualizarQtyParte(${d.id},${i},this.value)">
            <span style="width:100px;text-align:right;font-size:13px">${money(p.qty*p.unitPrice)}</span>
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
        ${!locked ? `<label class="btn btn-outline btn-sm" style="cursor:pointer">📷 Agregar fotos<input type="file" accept="image/*" multiple hidden onchange="agregarFotos(${d.id},this)"></label>` : ''}
      </div>
      <div class="evidences-grid" id="od-evidences">
        ${d.evidences.length === 0 ? '<p class="text-muted text-sm">Sin fotos.</p>' :
          d.evidences.map((src,i) => `<div class="evidence-item">
            <img src="${src}" alt="evidencia">
            ${!locked ? `<button class="evidence-remove" onclick="quitarFoto(${d.id},${i})">✕</button>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div style="background:var(--primary);color:#fff;border-radius:var(--radius);padding:20px;display:flex;justify-content:space-between;align-items:center">
      <span style="opacity:.8;text-transform:uppercase;font-size:12px">Total orden</span>
      <span style="font-size:28px;font-weight:700">${money(total)}</span>
    </div>`;
}

async function actualizarEstadoOrden(id, status) {
  const r = await api('ordenes', 'actualizar_estado', { id, status });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Estado actualizado');
  openOrdenDetalle(id);
}

async function actualizarCampoOrden(id, field, value) {
  await api('ordenes', 'actualizar_campo', { id, [field]: value });
}

async function buscarRepuestoOrden(orderId) {
  const q = document.getElementById('od-prod-search')?.value ?? '';
  if (q.length < 1) { document.getElementById('od-prod-results')?.classList.add('hidden'); return; }
  const prods = _ordenActual?._productos?.filter(p => {
    const t = q.toLowerCase();
    return p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t) || (p.shelf||'').toLowerCase().includes(t);
  }).slice(0, 20) ?? [];
  const res = document.getElementById('od-prod-results');
  if (!prods.length) { res.classList.add('hidden'); return; }
  res.classList.remove('hidden');
  res.innerHTML = prods.map(p => `<button onclick="agregarParte(${orderId},${p.id})" style="display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;text-align:left" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'">
    <span>${p.name} <span style="color:var(--text-muted);font-size:11px">· ${p.code}${p.shelf?' · Estante '+p.shelf:''}</span></span>
    <span style="font-size:12px">${money(p.price)} · stock ${p.stock}</span>
  </button>`).join('');
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
  await api('ordenes', 'actualizar_qty', { id: orderId, idx, qty: Number(qty) });
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

async function agregarFotos(orderId, input) {
  const files = Array.from(input.files);
  for (const f of files) {
    const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    await api('ordenes', 'agregar_evidencia', { id: orderId, dataUrl });
  }
  openOrdenDetalle(orderId);
}

async function quitarFoto(orderId, idx) {
  await api('ordenes', 'quitar_evidencia', { id: orderId, idx });
  openOrdenDetalle(orderId);
}

async function finalizarOrden(id) {
  if (!confirm('¿Finalizar orden? Quedará bloqueada y se descontará el inventario.')) return;
  const r = await api('ordenes', 'finalizar', { id });
  if (r.error) { toast(r.error, 'error'); return; }
  toast(`Orden finalizada. Factura ${r.factura} ✓`, 'success');
  openOrdenDetalle(id);
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
  document.getElementById('ventas-tbody').innerHTML = rows.slice(0,20).map(v =>
    `<tr><td class="font-mono">${v.number}</td><td>${dateShort(v.date)}</td><td>${money(v.total)}</td><td>${v.method}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty-state">Sin ventas</td></tr>';
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
  document.getElementById('facturas-tbody').innerHTML = rows.map(f => `<tr>
    <td class="font-mono">${f.number}</td>
    <td>${dateShort(f.date)}</td>
    <td>${f.type === 'orden' ? 'Orden' : 'Mostrador'}</td>
    <td>${f.orden_number || '-'}</td>
    <td>${money(f.total)}</td>
    <td>${f.method}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sin facturas</td></tr>';
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
async function loadEmpleados() {
  empleadosData = await get('empleados', 'listar');
  document.getElementById('emp-tbody').innerHTML = empleadosData.map(e => `<tr>
    <td>${e.name}</td><td>${e.role||'-'}</td><td>${e.phone||'-'}</td>
    <td><button class="btn btn-outline btn-sm btn-icon" onclick="openModalEmpleado(${e.id})">✏️</button></td>
  </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Sin empleados</td></tr>';
  // Selector de empleado para pagos
  const sel = document.getElementById('emp-pago-select');
  sel.innerHTML = '<option value="">-- Seleccionar --</option>' + empleadosData.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  loadPagos();
}

async function loadPagos(empId = '') {
  const rows = await get('empleados', 'pagos_listar', empId ? `&empleado_id=${empId}` : '');
  document.getElementById('pagos-tbody').innerHTML = rows.map(p =>
    `<tr><td>${p.empleado_name}</td><td>${money(p.amount)}</td><td>${dateShort(p.date)}</td><td>${p.note||'-'}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty-state">Sin pagos</td></tr>';
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
  const data = { name: document.getElementById('emp-name').value.trim(), role: document.getElementById('emp-role').value, phone: document.getElementById('emp-phone').value };
  if (!data.name) { toast('Nombre requerido', 'error'); return; }
  const r = id ? await api('empleados', 'actualizar', { id: parseInt(id), ...data }) : await api('empleados', 'crear', data);
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Guardado ✓', 'success');
  closeModal('modal-empleado');
  loadEmpleados();
}

function openModalPago() {
  const empId = document.getElementById('emp-pago-select').value;
  if (!empId) { toast('Selecciona un empleado', 'warning'); return; }
  document.getElementById('pago-amount').value = '';
  document.getElementById('pago-date').value = todayISO();
  document.getElementById('pago-note').value = '';
  openModal('modal-pago');
}

async function savePago() {
  const empId = document.getElementById('emp-pago-select').value;
  const amount = parseFloat(document.getElementById('pago-amount').value);
  const date = document.getElementById('pago-date').value;
  const note = document.getElementById('pago-note').value;
  if (!empId || !amount) { toast('Datos requeridos', 'error'); return; }
  const r = await api('empleados', 'pagos_crear', { employeeId: parseInt(empId), amount, date, note });
  if (r.error) { toast(r.error, 'error'); return; }
  toast('Pago registrado ✓', 'success');
  closeModal('modal-pago');
  loadPagos(empId);
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

// ─── GARANTÍAS ────────────────────────────────
async function loadGarantias() {
  const rows = await get('garantias', 'listar');
  document.getElementById('gar-tbody').innerHTML = rows.map(g => `<tr>
    <td>${g.cliente_name||'-'}</td>
    <td class="font-mono">${g.plate||'-'}</td>
    <td>${g.description}</td>
    <td>${dateShort(g.expiresAt)}</td>
    <td><span class="badge badge-${g.status}">${g.status}</span></td>
    <td><button class="btn btn-outline btn-sm btn-icon" onclick="openModalGarantia(${g.id})">✏️</button></td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sin garantías</td></tr>';
}

function openModalGarantia(id) {
  document.getElementById('gar-id').value = id || '';
  document.getElementById('gar-desc').value = '';
  document.getElementById('gar-expires').value = '';
  document.getElementById('gar-status').value = 'activa';
  openModal('modal-garantia');
}

async function saveGarantia() {
  const id = document.getElementById('gar-id').value;
  const data = {
    description: document.getElementById('gar-desc').value.trim(),
    expiresAt: document.getElementById('gar-expires').value || null,
    status: document.getElementById('gar-status').value,
  };
  if (!data.description) { toast('Descripción requerida', 'error'); return; }
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

  const labels = { disconnected: 'Desconectado', loading: 'Iniciando...', qr: 'Escanea el código QR', connected: 'Conectado ✓' };
  dot.className = `wa-status-dot ${d.state}`;
  text.textContent = labels[d.state] || d.state;

  qrWrap.classList.toggle('hidden', d.state !== 'qr' || !d.qr);
  spinner.classList.toggle('hidden', d.state !== 'loading');
  if (d.state === 'qr' && d.qr) document.getElementById('wa-qr').src = d.qr;

  errEl.textContent = d.error || '';
  errEl.classList.toggle('hidden', !d.error);

  btnConnect.classList.toggle('hidden', d.state !== 'disconnected');
  btnDisconnect.classList.toggle('hidden', d.state === 'disconnected' || d.state === 'loading');
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
