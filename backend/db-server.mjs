import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
import { sendMessage as waSend, getStatus as waGetStatus } from './whatsapp-service.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auto-notificaciones WhatsApp ──────────────────────────────────
const STATUS_LABELS = {
  ingresada: 'Ingresada',
  diagnostico: 'En diagnóstico',
  esperando_repuestos: 'Esperando repuestos',
  reparacion: 'En reparación',
  reparando: 'En reparación',
  lista: 'Lista para entregar',
  entregada: 'Entregada',
};
// Mapa de status → key de plantilla en tabla `templates`. La key coincide con el estado.
const STATUS_TEMPLATE = {
  ingresada: 'ingresada',
  diagnostico: 'diagnostico',
  esperando_repuestos: 'esperando_repuestos',
  reparacion: 'reparacion',
  reparando: 'reparacion',
  lista: 'lista',
  entregada: 'entregada',
};
function getCountryCode() {
  try {
    const r = query("SELECT valor FROM configuracion WHERE clave='prefijo_pais'")[0];
    return (r?.valor || '57').replace(/\D/g, '') || '57';
  } catch { return '57'; }
}
function formatPhone(phone) {
  let limpio = String(phone || '').replace(/\D/g, '');
  if (!limpio) return null;
  const cc = getCountryCode();
  if (!limpio.startsWith(cc)) limpio = cc + limpio;
  return limpio;
}
function renderTemplate(body, vars) {
  return String(body || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
async function notifyOrden(ordenId, estado, fromStatus = null) {
  try {
    if (fromStatus !== null) {
      try {
        exec("INSERT INTO historial_ordenes (orderId, fromStatus, toStatus, createdAt) VALUES (?,?,?,?)",
          [ordenId, fromStatus, estado, new Date().toISOString()]);
      } catch (e) { console.warn('[Historial] no se pudo registrar:', e.message); }
    }

    const tplKey = STATUS_TEMPLATE[estado];
    if (!tplKey) return;
    const row = query(
      `SELECT o.number, c.name as cliente, c.phone, m.plate, m.model, m.year
         FROM ordenes o
         LEFT JOIN clientes c ON c.id=o.customerId
         LEFT JOIN motos m ON m.id=o.bikeId
         WHERE o.id=?`, [ordenId])[0];
    if (!row?.phone) { console.log('[WA Notify] orden', ordenId, 'sin teléfono'); return; }
    const tpl = query("SELECT body FROM templates WHERE key=?", [tplKey])[0];
    if (!tpl?.body) { console.log('[WA Notify] sin plantilla', tplKey); return; }
    const text = renderTemplate(tpl.body, {
      cliente: row.cliente || 'cliente',
      placa: row.plate || '',
      moto: [row.model, row.year].filter(Boolean).join(' ') || '',
      orden: row.number || '',
      estado: STATUS_LABELS[estado] || estado,
    });

    // Modo prueba: redirige a número de prueba
    let target = row.phone;
    try {
      const cfg = Object.fromEntries(query("SELECT clave, valor FROM configuracion WHERE clave IN ('modo_prueba','numero_prueba')").map(r => [r.clave, r.valor]));
      if (cfg.modo_prueba === '1' && cfg.numero_prueba) target = cfg.numero_prueba;
    } catch {}
    const phone = formatPhone(target);
    if (!phone) return;

    if (waGetStatus().status !== 'connected') {
      console.warn('[WA Notify] WhatsApp no conectado, mensaje no enviado a', phone);
      try {
        exec("INSERT INTO whatsapp_mensajes (entidad_id, tipo, telefono, mensaje, estado) VALUES (?,?,?,?,?)",
          [ordenId, tplKey, phone, text, 'pendiente']);
      } catch {}
      return;
    }
    await waSend(phone, text);
    try {
      exec("INSERT INTO whatsapp_mensajes (entidad_id, tipo, telefono, mensaje, estado, fecha_envio) VALUES (?,?,?,?,?,?)",
        [ordenId, tplKey, phone, text, 'enviado', new Date().toISOString()]);
    } catch {}
    console.log(`[WA Notify] enviado a ${phone}: "${text}"`);
  } catch (e) {
    console.error('[WA Notify] error:', e.message);
  }
}
// alias de compatibilidad
const formatPhoneCO = formatPhone;

// Crea factura + movimiento de caja al entregar una orden (idempotente).
function billOrderOnDelivery(ordenId, method = 'efectivo') {
  try {
    const orden = query('SELECT * FROM ordenes WHERE id=?', [ordenId])[0];
    if (!orden) return;
    const existing = query('SELECT id FROM ventas WHERE orderId=?', [ordenId])[0];
    if (existing) return; // ya facturada
    const parts = JSON.parse(orden.parts || '[]');
    const services = JSON.parse(orden.services || '[]');
    const total = orden.total
      || parts.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 1), 0)
       + services.reduce((s, sv) => s + (Number(sv.price) || 0), 0);
    const n = query("SELECT value FROM counters WHERE key='sale'")[0]?.value || 0;
    exec("INSERT OR IGNORE INTO counters(key,value) VALUES('sale',0)");
    exec("UPDATE counters SET value=value+1 WHERE key='sale'");
    const number = 'FAC-' + String(parseInt(n) + 1).padStart(4, '0');
    const items = [
      ...parts,
      ...services.map(s => ({ name: s.description, price: s.price, qty: 1 })),
    ];
    exec(`INSERT INTO ventas (number, items, method, date, total, type, orderId)
          VALUES (?,?,?,?,?,?,?)`,
      [number, JSON.stringify(items), method, todayISO(), total, 'orden', ordenId]);
    const ventaId = lastId();
    exec(`INSERT INTO caja (date, type, amount, concept, refType, refId)
          VALUES (?,?,?,?,?,?)`,
      [todayISO(), 'ingreso', total, `Venta ${number} (orden ${orden.number})`, 'venta', ventaId]);
  } catch (e) {
    console.warn('[billOrderOnDelivery]', e.message);
  }
}

const DB_DIR = process.env.MOTOFLOW_DATA_DIR
  || path.join(process.env.APPDATA || process.env.HOME || '', 'MotoFlowPro');
const DB_PATH = path.join(DB_DIR, 'taller.db');
const UPLOADS_DIR = path.join(DB_DIR, 'uploads');
const WWW_ROOT = path.join(__dirname, '../server/www');
const INIT_SQL = path.join(WWW_ROOT, 'sql/init.sql');

const JSON_COLS = {
  ordenes: ['parts', 'services', 'evidences'],
  compras: ['items'],
  ventas: ['items'],
};

// Script.js uses these aliases; map them to actual table names
const ALIAS = {
  inventario: 'productos',
  mensajes: 'templates',
  facturas: 'ventas',  // facturas reusa la tabla ventas
};

const TABLES = [
  'usuarios','clientes','motos','ordenes','detalle_orden','productos',
  'proveedores','compras','empleados','pagos_empleados','caja','ventas',
  'notas','garantias','templates','counters','configuracion','whatsapp_mensajes',
  'historial_ordenes'
];

// Resolved resource name (applies alias if needed)
function resolveTable(name) {
  return ALIAS[name] || name;
}

let db;

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({
    locateFile: f => path.join(__dirname, '../node_modules/sql.js/dist', f)
  });
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('[DB] Carpeta de datos:', DB_DIR);
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(fs.readFileSync(INIT_SQL, 'utf8'));
    saveDB();
  }
  ensureSchema();
  ensureAdminUser();
}

// Aplica CREATE TABLE IF NOT EXISTS de tablas que pueden faltar en DBs viejos
// y siembra plantillas WA si no existen.
function ensureSchema() {
  try {
    db.run(`CREATE TABLE IF NOT EXISTS historial_ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      fromStatus TEXT,
      toStatus TEXT,
      note TEXT,
      changedBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    const tpls = [
      ['ingresada', 'Ingresada al taller', 'Hola {cliente}, tu moto *{placa}* ({moto}) fue recibida en nuestro taller. Orden: *{orden}*. Te avisaremos cuando esté lista. ¡Gracias por tu confianza!'],
      ['diagnostico', 'En diagnóstico', 'Hola {cliente}, estamos haciendo el diagnóstico de tu moto *{placa}* (orden {orden}). Te confirmamos pronto el detalle de la reparación.'],
      ['esperando_repuestos', 'Esperando repuestos', 'Hola {cliente}, tu moto *{placa}* está en espera de repuestos para continuar. Orden: *{orden}*. Te avisamos cuando lleguen.'],
      ['reparacion', 'En reparación', 'Hola {cliente}, tu moto *{placa}* ({moto}) está en reparación. Orden: *{orden}*. Te informamos cuando esté lista.'],
      ['lista', 'Lista para entregar', '¡Hola {cliente}! Tu moto *{placa}* ({moto}) ya está lista para recoger. Orden: *{orden}*. ¡Te esperamos!'],
      ['entregada', 'Entrega completada', 'Gracias {cliente} por confiar en nosotros. Tu moto *{placa}* fue entregada. Factura asociada a la orden *{orden}*. ¡Hasta la próxima!'],
    ];
    for (const [key, label, body] of tpls) {
      db.run("INSERT OR IGNORE INTO templates(key,label,body) VALUES(?,?,?)", [key, label, body]);
    }
    const configSeeds = [
      ['nit', ''],
      ['telefono', ''],
      ['direccion', ''],
      ['pie_recibo_orden', 'Gracias por su visita'],
      ['pie_recibo_venta', 'Gracias por su compra'],
      ['encabezado_orden', ''],
      ['encabezado_venta', ''],
      ['pie_recibo_custom', 'Gracias por su preferencia'],
    ];
    for (const [k, v] of configSeeds) {
      db.run("INSERT OR IGNORE INTO configuracion(clave,valor) VALUES(?,?)", [k, v]);
    }
    // Tabla de recibos personalizados
    db.run(`CREATE TABLE IF NOT EXISTS recibos_custom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      cliente TEXT,
      descripcion TEXT,
      valor REAL NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    db.run("INSERT OR IGNORE INTO counters(key,value) VALUES('receipt',0)");
    // Columnas legacy (pueden existir o no)
    try { db.run("ALTER TABLE empleados ADD COLUMN documento TEXT"); } catch {}
    try { db.run("ALTER TABLE empleados ADD COLUMN porcentaje REAL NOT NULL DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE pagos_empleados ADD COLUMN orderId INTEGER"); } catch {}
    try { db.run("ALTER TABLE pagos_empleados ADD COLUMN total_orden REAL"); } catch {}
    try { db.run("ALTER TABLE pagos_empleados ADD COLUMN porcentaje REAL"); } catch {}
    try { db.run("ALTER TABLE pagos_empleados ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'"); } catch {}
    // Tabla de liquidaciones (pago final acumulado)
    db.run(`CREATE TABLE IF NOT EXISTS liquidaciones_empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeId INTEGER NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      note TEXT,
      items TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(employeeId) REFERENCES empleados(id) ON DELETE CASCADE
    )`);
    try { db.run("ALTER TABLE pagos_empleados ADD COLUMN liquidacion_id INTEGER"); } catch {}
    try { db.run("ALTER TABLE ordenes ADD COLUMN asignadoId INTEGER"); } catch {}
    saveDB();
  } catch (e) { console.error('[DB] ensureSchema:', e.message); }
}

// Garantiza que exista el usuario admin/admin. Si MOTOFLOW_RESET_ADMIN=1 fuerza la
// contraseña a 'admin'. Sin esa env, no pisa contraseñas que el usuario haya cambiado.
function ensureAdminUser() {
  try {
    const rows = query("SELECT id, password FROM usuarios WHERE LOWER(username)='admin'");
    if (!rows.length) {
      exec("INSERT INTO usuarios(username,password,name,role,active) VALUES('admin','admin','Administrador','admin',1)");
      console.log('[DB] Usuario admin creado (password: admin)');
    } else if (process.env.MOTOFLOW_RESET_ADMIN === '1') {
      exec("UPDATE usuarios SET password='admin', active=1 WHERE LOWER(username)='admin'");
      console.log('[DB] Contraseña de admin restablecida a "admin"');
    }
  } catch (e) {
    console.error('[DB] ensureAdminUser error:', e.message);
  }
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// IMPORTANTE: db.export() (dentro de saveDB) resetea last_insert_rowid() en sql.js.
// Por eso capturamos el ID ANTES de guardar y lastId() devuelve ese cache.
let _lastInsertId = null;
function exec(sql, params = []) {
  db.run(sql, params);
  // Capturar antes de saveDB() porque export() resetea last_insert_rowid
  try {
    const r = db.exec('SELECT last_insert_rowid() as id');
    _lastInsertId = r[0]?.values?.[0]?.[0] ?? null;
  } catch { _lastInsertId = null; }
  saveDB();
}

function lastId() {
  return _lastInsertId;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function parseRow(resource, row) {
  const result = { ...row };
  for (const col of (JSON_COLS[resource] || [])) {
    if (result[col] && typeof result[col] === 'string') {
      try { result[col] = JSON.parse(result[col]); } catch { result[col] = []; }
    } else if (result[col] == null) {
      result[col] = [];
    }
  }
  return result;
}

function serializeRow(resource, row) {
  const result = { ...row };
  for (const col of (JSON_COLS[resource] || [])) {
    if (result[col] !== undefined && typeof result[col] !== 'string') {
      result[col] = JSON.stringify(result[col] ?? []);
    }
  }
  return result;
}

// Tablas con createdAt NOT NULL — autocompletar si no se envía
const TABLES_WITH_CREATEDAT = ['clientes', 'motos', 'productos', 'notas', 'garantias'];
function buildInsert(table, data) {
  const row = serializeRow(table, data);
  delete row.id; delete row.name_table;
  if (TABLES_WITH_CREATEDAT.includes(table) && !row.createdAt) {
    row.createdAt = new Date().toISOString();
  }
  const cols = Object.keys(row).filter(k => k && row[k] !== undefined);
  const vals = cols.map(c => row[c]);
  return { cols, vals, placeholders: cols.map(() => '?').join(',') };
}

function buildUpdate(table, data, id) {
  const row = serializeRow(table, data);
  delete row.id; delete row.name_table;
  const cols = Object.keys(row).filter(k => k && row[k] !== undefined);
  const vals = [...cols.map(c => row[c]), id];
  return { setClause: cols.map(c => `${c}=?`).join(','), vals };
}

// ── Auto-cleanup: elimina registros con más de 60 días ────────────
function runCleanup() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // Órdenes entregadas con más de 60 días desde su entryDate
    const oldOrders = query(
      `SELECT id, evidences FROM ordenes
       WHERE status='entregada' AND entryDate <= ?`, [cutoffStr]);

    for (const ord of oldOrders) {
      // Eliminar archivos de imágenes de disco
      let evs = [];
      try { evs = JSON.parse(ord.evidences || '[]'); } catch {}
      for (const ev of evs) {
        if (ev && !ev.startsWith('data:') && ev.startsWith('/uploads/')) {
          try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(ev))); } catch {}
        }
      }
      // Eliminar venta/factura asociada y su movimiento de caja
      const venta = query('SELECT id FROM ventas WHERE orderId=?', [ord.id])[0];
      if (venta) {
        exec('DELETE FROM caja WHERE refType=? AND refId=?', ['venta', venta.id]);
        exec('DELETE FROM ventas WHERE id=?', [venta.id]);
      }
      exec('DELETE FROM ordenes WHERE id=?', [ord.id]);
    }

    // Pagos de empleados ya liquidados con más de 60 días
    exec(`DELETE FROM pagos_empleados WHERE estado='pagado' AND date <= ?`, [cutoffStr]);

    // Imágenes huérfanas en disco (no referenciadas por ninguna orden activa)
    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      const allEvs = new Set(
        query('SELECT evidences FROM ordenes WHERE evidences IS NOT NULL AND evidences != ?', ['[]'])
          .flatMap(r => { try { return JSON.parse(r.evidences); } catch { return []; } })
          .filter(e => e && e.startsWith('/uploads/'))
          .map(e => path.basename(e))
      );
      for (const f of files) {
        if (!allEvs.has(f)) {
          try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch {}
        }
      }
    } catch {}

    if (oldOrders.length > 0) {
      console.log(`[Cleanup] ${oldOrders.length} órdenes antiguas eliminadas (>${cutoffStr})`);
    }
  } catch (e) {
    console.error('[Cleanup] Error:', e.message);
  }
}

function getLocalIPs() {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const iface of Object.values(nets)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
      }
    }
    return ips;
  } catch { return []; }
}

export async function startDBServer(port) {
  await initDB();

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '30mb' }));

  // Servir imágenes subidas desde disco
  app.use('/uploads', express.static(UPLOADS_DIR));

  // ── /php/upload_imagen ────────────────────────────────────────
  app.post('/php/upload_imagen', (req, res) => {
    try {
      const { id, dataUrl } = req.body;
      if (!id || !dataUrl) return res.status(400).json({ error: 'id y dataUrl requeridos' });
      const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!match) return res.status(400).json({ error: 'Formato de imagen inválido' });
      const ext = match[1] === 'jpeg' ? 'jpg' : (match[1] || 'jpg');
      const buffer = Buffer.from(match[2], 'base64');
      const fname = `ord${id}_${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, fname), buffer);
      res.json({ ok: true, url: `/uploads/${fname}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/sync ─────────────────────────────────────────────────
  app.get(['/api/sync.php', '/api/sync'], (req, res) => {
    try {
      const data = {};
      for (const t of TABLES) {
        try { data[t] = query(`SELECT * FROM ${t}`).map(r => parseRow(t, r)); }
        catch { data[t] = []; }
      }
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/resource CRUD ────────────────────────────────────────
  app.get(['/api/resource.php', '/api/resource'], (req, res) => {
    try {
      const { name, id } = req.query;
      if (!name || !TABLES.includes(name)) return res.status(404).json({ error: 'Recurso inválido' });
      if (id) {
        const rows = query(`SELECT * FROM ${name} WHERE id=?`, [id]);
        return rows.length ? res.json(parseRow(name, rows[0])) : res.status(404).json({ error: 'No encontrado' });
      }
      res.json(query(`SELECT * FROM ${name}`).map(r => parseRow(name, r)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(['/api/resource.php', '/api/resource'], (req, res) => {
    try {
      const { name, ...data } = req.body;
      if (!name || !TABLES.includes(name)) return res.status(404).json({ error: 'Recurso inválido' });
      const { cols, vals, placeholders } = buildInsert(name, data);
      exec(`INSERT INTO ${name} (${cols.join(',')}) VALUES (${placeholders})`, vals);
      const id = lastId();
      const row = query(`SELECT * FROM ${name} WHERE id=?`, [id]);
      res.status(201).json(parseRow(name, row[0]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch(['/api/resource.php', '/api/resource'], (req, res) => {
    try {
      const { name, id, ...data } = req.body;
      if (!name || !TABLES.includes(name)) return res.status(404).json({ error: 'Recurso inválido' });
      const { setClause, vals } = buildUpdate(name, data, id);
      if (setClause) exec(`UPDATE ${name} SET ${setClause} WHERE id=?`, vals);
      const row = query(`SELECT * FROM ${name} WHERE id=?`, [id]);
      res.json(parseRow(name, row[0] || {}));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete(['/api/resource.php', '/api/resource'], (req, res) => {
    try {
      const { name, id } = req.query;
      if (!name || !TABLES.includes(name)) return res.status(404).json({ error: 'Recurso inválido' });
      exec(`DELETE FROM ${name} WHERE id=?`, [id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/auth ─────────────────────────────────────────────────
  app.all('/php/auth', (req, res) => {
    try {
      const action = req.query.action || req.body?.action;
      if (action === 'login') {
        const { username, password } = req.body;
        const rows = query('SELECT * FROM usuarios WHERE LOWER(username)=LOWER(?) AND active=1', [username]);
        if (!rows.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        const u = rows[0];
        if (u.password !== password) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        return res.json({ ok: true, uid: u.id, nombre: u.name, rol: u.role });
      }
      if (action === 'logout') return res.json({ ok: true });
      res.json({ uid: null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/dashboard ────────────────────────────────────────────
  app.all('/php/dashboard', (req, res) => {
    try {
      const pendientes = query("SELECT COUNT(*) as c FROM ordenes WHERE status IN ('ingresada','diagnostico') AND active=1")[0]?.c || 0;
      const en_proceso = query("SELECT COUNT(*) as c FROM ordenes WHERE status IN ('esperando_repuestos','reparacion') AND active=1")[0]?.c || 0;
      const listas = query("SELECT COUNT(*) as c FROM ordenes WHERE status='lista' AND active=1")[0]?.c || 0;
      const today = todayISO();
      const cajaRows = query("SELECT type, SUM(amount) as total FROM caja WHERE date=? GROUP BY type", [today]);
      const caja = { ingreso: 0, egreso: 0 };
      cajaRows.forEach(r => { caja[r.type] = parseFloat(r.total) || 0; });
      const stock_bajo = query("SELECT id,code,name,stock,minStock FROM productos WHERE active=1 AND stock<=minStock ORDER BY name");
      const ordenes_recientes = query(`SELECT o.id, o.number, o.status, o.entryDate, o.total, c.name as cliente, m.plate FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId LEFT JOIN motos m ON m.id=o.bikeId WHERE o.active=1 AND o.status != 'entregada' ORDER BY o.id DESC LIMIT 5`);
      res.json({ ordenes: { pendientes, en_proceso, listas }, caja: { ingresos: caja.ingreso, egresos: caja.egreso, balance: caja.ingreso - caja.egreso }, stock_bajo, ordenes_recientes, top_productos: [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── whatsapp config/history (special endpoints) ──────────────
  app.all('/php/whatsapp', (req, res) => {
    try {
      const action = req.query.action || req.body?.action || '';
      const data = { ...(req.body || {}), ...(req.query || {}) };
      if (action === 'config_get') {
        const rows = query("SELECT clave, valor FROM configuracion WHERE clave IN ('modo_prueba','numero_prueba')");
        const cfg = {};
        rows.forEach(r => { cfg[r.clave] = r.valor; });
        return res.json(cfg);
      }
      if (action === 'config_set') {
        for (const [k, v] of Object.entries(data)) {
          if (k === 'action') continue;
          exec("INSERT OR REPLACE INTO configuracion(clave,valor) VALUES(?,?)", [k, v]);
        }
        return res.json({ ok: true });
      }
      if (action === 'history') {
        return res.json(query("SELECT * FROM whatsapp_mensajes ORDER BY id DESC LIMIT 50"));
      }
      if (action === 'send_test') {
        const tel = data.telefono || data.numero || data.phone;
        if (!tel) return res.status(400).json({ error: 'Teléfono requerido' });
        const msg = data.mensaje || '✅ Mensaje de prueba desde MotoFlow Pro. El sistema de WhatsApp funciona correctamente.';
        const phone = formatPhoneCO(tel);
        if (waGetStatus().status !== 'connected') {
          return res.status(400).json({ error: 'WhatsApp no está conectado' });
        }
        waSend(phone, msg)
          .then(() => exec("INSERT INTO whatsapp_mensajes (tipo, telefono, mensaje, estado, fecha_envio) VALUES (?,?,?,?,?)", ['prueba', phone, msg, 'enviado', new Date().toISOString()]))
          .catch(err => {
            console.error('[send_test]', err.message);
            exec("INSERT INTO whatsapp_mensajes (tipo, telefono, mensaje, estado, fecha_envio) VALUES (?,?,?,?,?)", ['prueba', phone, msg, 'error', new Date().toISOString()]);
          });
        return res.json({ ok: true, telefono: phone });
      }
      res.status(400).json({ error: 'Acción whatsapp no soportada: ' + action });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/buscar?action=global ────────────────────────────────
  app.all('/php/buscar', (req, res) => {
    try {
      const action = req.query.action || req.body?.action || '';
      if (action !== 'global') return res.status(400).json({ error: 'Acción no soportada' });
      const q = String(req.query.q || req.body?.q || '').trim();
      if (q.length < 2) return res.json({ ordenes: [], clientes: [], productos: [] });
      const like = `%${q.toLowerCase()}%`;
      const ordenes = query(
        `SELECT o.id, o.number, o.status, o.total, c.name as cliente_name, m.plate
           FROM ordenes o
           LEFT JOIN clientes c ON c.id=o.customerId
           LEFT JOIN motos m ON m.id=o.bikeId
           WHERE o.active=1 AND (
             LOWER(o.number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(m.plate) LIKE ? OR LOWER(o.problem) LIKE ?
           ) LIMIT 20`, [like, like, like, like]);
      const clientes = query(
        `SELECT c.id, c.name, c.phone, (SELECT COUNT(*) FROM motos m WHERE m.customerId=c.id) as motos_count
           FROM clientes c
           WHERE c.active=1 AND (LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ?)
           LIMIT 20`, [like, like]);
      const productos = query(
        `SELECT id, code, name, shelf, stock, price FROM productos
           WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(COALESCE(shelf,'')) LIKE ?)
           LIMIT 20`, [like, like, like]);
      res.json({ ordenes, clientes, productos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/ajustes ──────────────────────────────────────────────
  app.all('/php/ajustes', (req, res) => {
    try {
      const action = req.query.action || req.body?.action || '';
      const data = { ...(req.body || {}), ...(req.query || {}) };
      if (action === 'config_get') {
        const rows = query('SELECT clave, valor FROM configuracion');
        const cfg = {};
        rows.forEach(r => { cfg[r.clave] = r.valor; });
        return res.json(cfg);
      }
      if (action === 'config_set') {
        for (const [k, v] of Object.entries(data)) {
          if (k === 'action') continue;
          exec('INSERT OR REPLACE INTO configuracion(clave,valor) VALUES(?,?)', [k, String(v)]);
        }
        return res.json({ ok: true });
      }
      res.status(400).json({ error: 'Acción no soportada' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/recibos (recibos personalizados CRUD) ────────────────
  app.all('/php/recibos', (req, res) => {
    try {
      const action = req.query.action || req.body?.action || '';
      const data = { ...(req.body || {}), ...(req.query || {}) };
      delete data.action;
      if (action === 'listar') {
        return res.json(query('SELECT * FROM recibos_custom ORDER BY id DESC'));
      }
      if (action === 'crear') {
        if (!data.descripcion || !data.valor) return res.status(400).json({ error: 'Descripción y valor requeridos' });
        const n = query("SELECT value FROM counters WHERE key='receipt'")[0]?.value || 0;
        exec("INSERT OR IGNORE INTO counters(key,value) VALUES('receipt',0)");
        exec("UPDATE counters SET value=value+1 WHERE key='receipt'");
        const number = 'REC-' + String(parseInt(n) + 1).padStart(4, '0');
        exec(`INSERT INTO recibos_custom (number, cliente, descripcion, valor, fecha) VALUES (?,?,?,?,?)`,
          [number, data.cliente || '', data.descripcion, Number(data.valor), data.fecha || todayISO()]);
        const row = query('SELECT * FROM recibos_custom WHERE id=?', [lastId()])[0];
        return res.status(201).json(row);
      }
      if (action === 'eliminar') {
        exec('DELETE FROM recibos_custom WHERE id=?', [data.id]);
        return res.json({ ok: true });
      }
      res.status(400).json({ error: 'Acción no soportada' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── /php/recibo ───────────────────────────────────────────────
  app.get('/php/recibo', (req, res) => {
    try {
      const { tipo, id } = req.query;
      if (!tipo || !id) return res.status(400).send('<p>Parámetros requeridos: tipo, id</p>');

      const cfgRows = query('SELECT clave, valor FROM configuracion');
      const cfg = {};
      cfgRows.forEach(r => { cfg[r.clave] = r.valor || ''; });

      const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const fmt = n => '$' + Number(n || 0).toLocaleString('es-CO');
      const fmtDate = d => { if (!d) return '-'; const p = String(d).split('T')[0].split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };

      const css = `<style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{width:58mm;font-family:monospace;font-size:11px;padding:3mm}
        .center{text-align:center}
        .bold{font-weight:bold}
        .sep{border-top:1px dashed #000;margin:5px 0}
        .row{display:flex;justify-content:space-between;gap:4px;margin:2px 0}
        .total-row{display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin:4px 0}
        .header{text-align:center;margin-bottom:6px}
        .header h2{font-size:13px}
        .footer{text-align:center;margin-top:6px;font-size:10px}
        .item-name{flex:1}
        @media print{body{margin:0}}
      </style>`;

      const header = (extra = '') => `
        <div class="header">
          <h2 class="bold">${esc(cfg.nombre_taller || 'TALLER')}</h2>
          ${cfg.nit ? `<div>NIT: ${esc(cfg.nit)}</div>` : ''}
          ${cfg.telefono ? `<div>TEL: ${esc(cfg.telefono)}</div>` : ''}
          ${cfg.direccion ? `<div>${esc(cfg.direccion)}</div>` : ''}
        </div>
        ${extra}
      `;

      if (tipo === 'venta') {
        const v = query(
          `SELECT v.*, o.number as orden_number FROM ventas v
           LEFT JOIN ordenes o ON o.id=v.orderId WHERE v.id=?`, [id])[0];
        if (!v) return res.status(404).send('<p>Venta no encontrada</p>');
        const items = (() => { try { return JSON.parse(v.items || '[]'); } catch { return []; } })();
        const metodoPago = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[v.method] || v.method;
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">${css}</head><body>
          ${header(`<div>Fecha: ${fmtDate(v.date)}</div><div class="bold">Factura #: ${esc(v.number)}</div>`)}
          <div class="sep"></div>
          ${items.map(it => `
            <div class="row"><span class="item-name">${esc(it.name || it.description || '')}</span></div>
            <div class="row"><span>${Number(it.qty||1)} x ${fmt(it.unitPrice || it.price || 0)}</span><span>${fmt((it.qty||1)*(it.unitPrice||it.price||0))}</span></div>
          `).join('')}
          <div class="sep"></div>
          <div class="total-row"><span>TOTAL:</span><span>${fmt(v.total)}</span></div>
          <div class="row"><span>Pago: ${esc(metodoPago)}</span></div>
          <div class="sep"></div>
          <div class="footer">${esc(cfg.pie_recibo_venta || 'Gracias por su compra')}</div>
          <script>window.onload=function(){window.print();}<\/script>
        </body></html>`;
        return res.send(html);
      }

      if (tipo === 'orden') {
        const o = query(
          `SELECT o.*, c.name as cliente_name, m.plate, m.model, m.year
           FROM ordenes o
           LEFT JOIN clientes c ON c.id=o.customerId
           LEFT JOIN motos m ON m.id=o.bikeId WHERE o.id=?`, [id])[0];
        if (!o) return res.status(404).send('<p>Orden no encontrada</p>');
        const parts = (() => { try { return JSON.parse(o.parts || '[]'); } catch { return []; } })();
        const services = (() => { try { return JSON.parse(o.services || '[]'); } catch { return []; } })();
        const totalPartes = parts.reduce((s, p) => s + (Number(p.price||0) * Number(p.qty||1)), 0);
        const totalServicios = services.reduce((s, sv) => s + Number(sv.price||0), 0);
        const total = Number(o.total) || totalPartes + totalServicios;
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">${css}</head><body>
          ${header(`<div>Fecha: ${fmtDate(o.entryDate)}</div><div class="bold">Orden #: ${esc(o.number)}</div>`)}
          <div class="sep"></div>
          <div class="row"><span>Placa:</span><span class="bold">${esc(o.plate)}</span></div>
          <div class="row"><span>Cliente:</span><span>${esc(o.cliente_name)}</span></div>
          <div class="sep"></div>
          ${parts.length ? `<div class="bold">Repuestos</div>
            ${parts.map(p => `<div class="row"><span class="item-name">${esc(p.name)}</span><span>${fmt(Number(p.price||0)*Number(p.qty||1))}</span></div>`).join('')}` : ''}
          ${services.length ? `<div class="bold" style="margin-top:4px">Mano de obra</div>
            ${services.map(s => `<div class="row"><span class="item-name">${esc(s.description)}</span><span>${fmt(s.price)}</span></div>`).join('')}` : ''}
          <div class="sep"></div>
          <div class="total-row"><span>TOTAL:</span><span>${fmt(total)}</span></div>
          <div class="sep"></div>
          <div class="footer">${esc(cfg.pie_recibo_orden || 'Gracias por su visita')}</div>
          <script>window.onload=function(){window.print();}<\/script>
        </body></html>`;
        return res.send(html);
      }

      if (tipo === 'custom') {
        const r = query('SELECT * FROM recibos_custom WHERE id=?', [id])[0];
        if (!r) return res.status(404).send('<p>Recibo no encontrado</p>');
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">${css}</head><body>
          ${header(`<div>Fecha: ${fmtDate(r.fecha)}</div><div class="bold">Recibo #: ${esc(r.number)}</div>`)}
          <div class="sep"></div>
          ${r.cliente ? `<div class="row"><span>A nombre de:</span><span class="bold">${esc(r.cliente)}</span></div><div class="sep"></div>` : ''}
          <div class="bold" style="margin-bottom:4px">Descripción:</div>
          <div style="font-size:11px;margin-bottom:6px">${esc(r.descripcion)}</div>
          <div class="sep"></div>
          <div class="total-row"><span>TOTAL:</span><span>${fmt(r.valor)}</span></div>
          <div class="sep"></div>
          <div class="footer">${esc(cfg.pie_recibo_custom || 'Gracias por su preferencia')}</div>
          <script>window.onload=function(){window.print();}<\/script>
        </body></html>`;
        return res.send(html);
      }

      res.status(400).send('<p>tipo debe ser "venta", "orden" o "custom"</p>');
    } catch (e) { res.status(500).send(`<p>Error: ${e.message}</p>`); }
  });

  // ── Generic /php/:resource handler ───────────────────────────
  app.all('/php/:resource', (req, res) => {
    try {
      const rawResource = req.params.resource;
      const resource = resolveTable(rawResource); // apply alias (inventario→productos, etc.)
      const action = req.query.action || req.body?.action || '';
      const data = { ...(req.body || {}), ...(req.query || {}) };
      delete data.action;

      if (!TABLES.includes(resource)) return res.status(404).json({ error: 'Recurso no existe: ' + rawResource });

      // ─── Vista Kanban (frontend usa /php/motos?action=kanban; en realidad son ordenes) ───
      if (rawResource === 'motos' && action === 'kanban') {
        const rows = query(
          `SELECT o.*, c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model, m.year,
                  e.name as asignado_name
           FROM ordenes o
           LEFT JOIN clientes c ON c.id=o.customerId
           LEFT JOIN motos m ON m.id=o.bikeId
           LEFT JOIN empleados e ON e.id=o.asignadoId
           WHERE o.active=1 AND o.status != 'entregada' ORDER BY o.id DESC`);
        return res.json(rows.map(r => parseRow('ordenes', r)));
      }
      // ─── Cambio de estado desde el kanban: redirige al update de ordenes ───
      if (rawResource === 'motos' && action === 'cambiar_estado') {
        const id = data.id;
        const status = data.status || data.estado;
        if (!id || !status) return res.status(400).json({ error: 'id y status requeridos' });
        const prev = query('SELECT status FROM ordenes WHERE id=?', [id])[0];
        exec('UPDATE ordenes SET status=? WHERE id=?', [status, id]);
        if (status === 'entregada') billOrderOnDelivery(id);
        notifyOrden(id, status, prev?.status || null);
        return res.json({ ok: true });
      }

      const SPECIALIZED_LIST = ['ventas','compras','garantias','caja'];
      if ((action === '' || action === 'listar') && !SPECIALIZED_LIST.includes(resource)) {
        // Ordenes: include joined cliente_name and plate
        if (resource === 'ordenes') {
          const all = data.all === '1' || data.all === 1;
          const where = all ? '' : "WHERE o.active=1 AND o.status != 'entregada'";
          return res.json(
            query(`SELECT o.*, c.name as cliente_name, m.plate, m.model, m.year, m.color,
                          e.name as asignado_name, e.role as asignado_role
                   FROM ordenes o
                   LEFT JOIN clientes c ON c.id=o.customerId
                   LEFT JOIN motos m ON m.id=o.bikeId
                   LEFT JOIN empleados e ON e.id=o.asignadoId
                   ${where} ORDER BY o.id DESC`)
              .map(r => parseRow('ordenes', r))
          );
        }
        return res.json(query(`SELECT * FROM ${resource}`).map(r => parseRow(resource, r)));
      }
      if (action === 'get' && resource === 'ordenes') {
        const row = query(
          `SELECT o.*, c.name as cliente_name, c.phone as cliente_phone,
                  m.plate, m.model, m.year, m.color,
                  e.name as asignado_name, e.role as asignado_role
           FROM ordenes o
           LEFT JOIN clientes c ON c.id=o.customerId
           LEFT JOIN motos m ON m.id=o.bikeId
           LEFT JOIN empleados e ON e.id=o.asignadoId
           WHERE o.id=?`, [data.id])[0];
        if (!row) return res.status(404).json({ error: 'Orden no encontrada' });
        return res.json(parseRow('ordenes', row));
      }
      // Stock bajo — productos activos cuyo stock está en o bajo el mínimo
      if (resource === 'productos' && action === 'stock_bajo') {
        const rows = query(
          `SELECT id, code, name, stock, minStock, shelf FROM productos
           WHERE active=1 AND minStock > 0 AND stock <= minStock
           ORDER BY (stock - minStock) ASC, name`);
        return res.json(rows);
      }
      // Búsqueda especializada de productos/inventario (filtra active=1, incluye stock)
      if (resource === 'productos' && action === 'buscar') {
        const q = `%${(data.q || '').toLowerCase()}%`;
        const rows = query(
          `SELECT id, code, name, price, cost, stock, minStock, shelf FROM productos
           WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ?)
           ORDER BY name LIMIT 20`, [q, q]);
        return res.json(rows);
      }
      if (action === 'buscar') {
        const q = `%${(data.q || '').toLowerCase()}%`;
        // Construir WHERE dinámicamente según columnas que existan en cada tabla
        const colsRow = query(`PRAGMA table_info(${resource})`);
        const colNames = colsRow.map(c => c.name);
        const searchableCols = ['name', 'code', 'description', 'problem', 'plate', 'phone'].filter(c => colNames.includes(c));
        if (!searchableCols.length) return res.json([]);
        const where = searchableCols.map(c => `LOWER(${c}) LIKE ?`).join(' OR ');
        const rows = query(`SELECT * FROM ${resource} WHERE ${where} LIMIT 20`, searchableCols.map(() => q));
        return res.json(rows.map(r => parseRow(resource, r)));
      }
      // Handler genérico de "crear". Las tablas con lógica especial
      // (ventas, compras, ordenes) se manejan más abajo y caen primero.
      if (action === 'crear' && !['ordenes','ventas','compras'].includes(resource)) {
        const { cols, vals, placeholders } = buildInsert(resource, data);
        exec(`INSERT INTO ${resource} (${cols.join(',')}) VALUES (${placeholders})`, vals);
        const id = lastId();
        const row = query(`SELECT * FROM ${resource} WHERE id=?`, [id]);
        return res.status(201).json(parseRow(resource, row[0]));
      }
      if (action === 'actualizar' || action === 'cambiar_estado' || action.startsWith('actualizar_')) {
        const { id, ...rest } = data;
        if (!id) return res.status(400).json({ error: 'ID requerido' });
        let prev = null;
        if (resource === 'ordenes') {
          prev = query('SELECT status FROM ordenes WHERE id=?', [id])[0];
        }
        const { setClause, vals } = buildUpdate(resource, rest, id);
        if (setClause) exec(`UPDATE ${resource} SET ${setClause} WHERE id=?`, vals);
        const row = query(`SELECT * FROM ${resource} WHERE id=?`, [id]);
        if (resource === 'ordenes' && (rest.status || rest.estado)) {
          const nuevo = rest.status || rest.estado;
          if (nuevo === 'entregada') billOrderOnDelivery(id);
          notifyOrden(id, nuevo, prev?.status || null);
        }
        return res.json(parseRow(resource, row[0] || {}));
      }
      if (action === 'eliminar') {
        // Al eliminar una orden, borrar imágenes del disco
        if (resource === 'ordenes') {
          const ord = query('SELECT evidences FROM ordenes WHERE id=?', [data.id])[0];
          if (ord) {
            let evs = [];
            try { evs = JSON.parse(ord.evidences || '[]'); } catch {}
            for (const ev of evs) {
              if (ev && !ev.startsWith('data:') && ev.startsWith('/uploads/')) {
                try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(ev))); } catch {}
              }
            }
          }
        }
        exec(`DELETE FROM ${resource} WHERE id=?`, [data.id]);
        return res.json({ ok: true });
      }
      if (action === 'toggle') {
        const row = query(`SELECT * FROM ${resource} WHERE id=?`, [data.id])[0];
        if (row) exec(`UPDATE ${resource} SET done=? WHERE id=?`, [row.done ? 0 : 1, data.id]);
        return res.json({ ok: true });
      }

      // Ordenes - operaciones complejas
      if (resource === 'ordenes') {
        if (action === 'crear') {
          // Composite: cliente + moto + orden from quick-create form
          const { nombre, telefono, placa, problema } = data;
          // Find or create cliente — busca coincidencia exacta nombre+teléfono para no mezclar clientes
          const now = new Date().toISOString();
          let cliente = query('SELECT * FROM clientes WHERE LOWER(name)=LOWER(?) AND phone=?', [nombre, telefono])[0];
          if (!cliente) {
            exec('INSERT INTO clientes (name, phone, active, createdAt) VALUES (?,?,1,?)', [nombre, telefono, now]);
            cliente = query('SELECT * FROM clientes WHERE id=?', [lastId()])[0];
          }
          // Find or create moto
          let moto = query('SELECT * FROM motos WHERE LOWER(plate)=LOWER(?)', [placa])[0];
          if (!moto) {
            exec('INSERT INTO motos (customerId, plate, active, createdAt) VALUES (?,?,1,?)', [cliente.id, placa, now]);
            moto = query('SELECT * FROM motos WHERE id=?', [lastId()])[0];
          }
          // Counter
          const n = query("SELECT value FROM counters WHERE key='order'")[0]?.value || 0;
          exec("INSERT OR IGNORE INTO counters(key,value) VALUES('order',0)");
          exec("UPDATE counters SET value=value+1 WHERE key='order'");
          const number = 'ORD-' + String(parseInt(n) + 1).padStart(4, '0');
          exec(`INSERT INTO ordenes (number, customerId, bikeId, problem, status, entryDate, parts, services, evidences, active) VALUES (?,?,?,?,?,?,?,?,?,1)`,
            [number, cliente.id, moto.id, problema, 'ingresada', todayISO(), '[]', '[]', '[]']);
          const id = lastId();
          notifyOrden(id, 'ingresada');
          return res.status(201).json({ ok: true, id, number });
        }
        if (action === 'agregar_parte') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const prod = query('SELECT * FROM productos WHERE id=?', [data.productId])[0];
          if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
          if (prod.stock <= 0) return res.status(400).json({ error: `Sin stock: ${prod.name}` });
          const parts = JSON.parse(orden.parts || '[]');
          parts.push({ productId: prod.id, name: prod.name, price: prod.price, qty: 1 });
          exec('UPDATE ordenes SET parts=? WHERE id=?', [JSON.stringify(parts), data.id]);
          // Stock se descuenta al FINALIZAR, no al agregar
          return res.json({ ok: true, stock: prod.stock });
        }
        if (action === 'quitar_parte') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          const parts = JSON.parse(orden.parts || '[]');
          parts.splice(data.idx, 1);
          exec('UPDATE ordenes SET parts=? WHERE id=?', [JSON.stringify(parts), data.id]);
          // No restaurar stock (no se descontó al agregar)
          return res.json({ ok: true });
        }
        if (action === 'actualizar_qty') {
          const orden = query('SELECT parts FROM ordenes WHERE id=?', [data.id])[0];
          const parts = JSON.parse(orden?.parts || '[]');
          const idx = parseInt(data.idx);
          if (parts[idx] !== undefined) {
            const newQty = Number(data.qty) || 1;
            if (parts[idx].productId) {
              const prod = query('SELECT stock FROM productos WHERE id=?', [parts[idx].productId])[0];
              if (prod && newQty > prod.stock) {
                return res.status(400).json({ error: `Stock insuficiente. Disponible: ${prod.stock}` });
              }
            }
            parts[idx].qty = newQty;
          }
          exec('UPDATE ordenes SET parts=? WHERE id=?', [JSON.stringify(parts), data.id]);
          return res.json({ ok: true });
        }
        if (action === 'agregar_servicio') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          const services = JSON.parse(orden.services || '[]');
          services.push({ description: data.description, price: parseFloat(data.price) || 0 });
          exec('UPDATE ordenes SET services=? WHERE id=?', [JSON.stringify(services), data.id]);
          return res.json({ ok: true });
        }
        if (action === 'quitar_servicio') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          const services = JSON.parse(orden.services || '[]');
          services.splice(data.idx, 1);
          exec('UPDATE ordenes SET services=? WHERE id=?', [JSON.stringify(services), data.id]);
          return res.json({ ok: true });
        }
        if (action === 'agregar_evidencia') {
          const orden = query('SELECT evidences FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const evidences = JSON.parse(orden.evidences || '[]');
          let url = data.url;
          if (!url && data.dataUrl) {
            const match = data.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
            if (match) {
              const ext = match[1] === 'jpeg' ? 'jpg' : (match[1] || 'jpg');
              const buffer = Buffer.from(match[2], 'base64');
              const fname = `ord${data.id}_${Date.now()}.${ext}`;
              fs.writeFileSync(path.join(UPLOADS_DIR, fname), buffer);
              url = `/uploads/${fname}`;
            }
          }
          if (!url) return res.status(400).json({ error: 'Imagen requerida' });
          evidences.push(url);
          exec('UPDATE ordenes SET evidences=? WHERE id=?', [JSON.stringify(evidences), data.id]);
          return res.json({ ok: true, url });
        }
        if (action === 'quitar_evidencia') {
          const orden = query('SELECT evidences FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const evidences = JSON.parse(orden.evidences || '[]');
          const idx = parseInt(data.idx);
          const ev = evidences[idx];
          if (ev && !ev.startsWith('data:') && ev.startsWith('/uploads/')) {
            try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(ev))); } catch {}
          }
          evidences.splice(idx, 1);
          exec('UPDATE ordenes SET evidences=? WHERE id=?', [JSON.stringify(evidences), data.id]);
          return res.json({ ok: true });
        }
        if (action === 'finalizar') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const parts = JSON.parse(orden.parts || '[]');
          const services = JSON.parse(orden.services || '[]');
          const total = parts.reduce((s, p) => s + (p.price * (p.qty || 1)), 0) + services.reduce((s, sv) => s + sv.price, 0);
          const fromStatus = orden.status;
          // Descontar stock del inventario al finalizar
          for (const p of parts) {
            if (p.productId) {
              exec('UPDATE productos SET stock=MAX(0, stock-?) WHERE id=?', [Number(p.qty) || 1, p.productId]);
            }
          }
          exec("UPDATE ordenes SET status='lista', total=? WHERE id=?", [total, data.id]);
          notifyOrden(data.id, 'lista', fromStatus);
          return res.json({ ok: true, total });
        }
        if (action === 'historial') {
          const id = data.id;
          if (!id) return res.status(400).json({ error: 'ID requerido' });
          const rows = query(
            'SELECT * FROM historial_ordenes WHERE orderId=? ORDER BY id DESC', [id]);
          return res.json(rows);
        }
        if (action === 'entregar') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const parts = JSON.parse(orden.parts || '[]');
          const services = JSON.parse(orden.services || '[]');
          const total = orden.total || (parts.reduce((s,p) => s + (p.price * (p.qty || 1)), 0) + services.reduce((s, sv) => s + sv.price, 0));
          const fromStatus = orden.status;
          exec("UPDATE ordenes SET status='entregada', total=? WHERE id=?", [total, data.id]);
          // Crear factura/venta vinculada
          const n = query("SELECT value FROM counters WHERE key='sale'")[0]?.value || 0;
          exec("INSERT OR IGNORE INTO counters(key,value) VALUES('sale',0)");
          exec("UPDATE counters SET value=value+1 WHERE key='sale'");
          const number = 'FAC-' + String(parseInt(n) + 1).padStart(4, '0');
          const items = [...parts, ...services.map(s => ({ name: s.description, price: s.price, qty: 1 }))];
          exec(`INSERT INTO ventas (number, items, method, date, total, type, orderId) VALUES (?,?,?,?,?,?,?)`,
            [number, JSON.stringify(items), data.method || 'efectivo', todayISO(), total, 'orden', data.id]);
          const ventaId = lastId();
          // Movimiento de caja
          exec(`INSERT INTO caja (date, type, amount, concept, refType, refId) VALUES (?,?,?,?,?,?)`,
            [todayISO(), 'ingreso', total, `Venta ${number} (orden ${orden.number})`, 'venta', ventaId]);
          // Acumular pago al empleado (sin caja inmediata — se liquida después)
          if (data.empleadoId) {
            const pct = Number(data.porcentaje) || 0;
            const valorEmp = pct > 0 ? Math.round(total * pct / 100) : 0;
            exec(`INSERT INTO pagos_empleados (employeeId, amount, date, note, orderId, total_orden, porcentaje, estado)
                  VALUES (?,?,?,?,?,?,?,?)`,
              [parseInt(data.empleadoId), valorEmp, todayISO(),
               `Orden ${orden.number}`, data.id, total, pct, 'pendiente']);
          }
          notifyOrden(data.id, 'entregada', fromStatus);
          return res.json({ ok: true, total, ventaNumber: number });
        }
      }

      // ── Ventas (mostrador) ─────────────────────────────────────
      if (resource === 'ventas' && action === 'get') {
        const v = query(
          `SELECT v.*, o.number as orden_number, c.name as cliente_name, m.plate
           FROM ventas v
           LEFT JOIN ordenes o ON o.id=v.orderId
           LEFT JOIN clientes c ON c.id=o.customerId
           LEFT JOIN motos m ON m.id=o.bikeId
           WHERE v.id=?`, [data.id])[0];
        if (!v) return res.status(404).json({ error: 'Venta no encontrada' });
        return res.json({ ...v, items: (() => { try { return JSON.parse(v.items || '[]'); } catch { return []; } })() });
      }
      if (resource === 'ventas' && action === 'crear') {
        const items = data.items || [];
        const total = Number(data.total) || items.reduce((s, it) => s + Number(it.unitPrice || it.price || 0) * Number(it.qty || 1), 0);
        const n = query("SELECT value FROM counters WHERE key='sale'")[0]?.value || 0;
        exec("INSERT OR IGNORE INTO counters(key,value) VALUES('sale',0)");
        exec("UPDATE counters SET value=value+1 WHERE key='sale'");
        const number = 'FAC-' + String(parseInt(n) + 1).padStart(4, '0');
        exec(`INSERT INTO ventas (number, items, method, date, total, type, orderId) VALUES (?,?,?,?,?,?,?)`,
          [number, JSON.stringify(items), data.method || 'efectivo', data.date || todayISO(), total, 'mostrador', null]);
        const id = lastId();
        for (const item of items) {
          if (item.productId) exec('UPDATE productos SET stock=stock-? WHERE id=?', [item.qty || 1, item.productId]);
        }
        // Movimiento de caja por venta de mostrador
        exec(`INSERT INTO caja (date, type, amount, concept, refType, refId) VALUES (?,?,?,?,?,?)`,
          [data.date || todayISO(), 'ingreso', total, `Venta ${number}`, 'venta', id]);
        return res.status(201).json({ ok: true, id, number, total });
      }
      if (resource === 'ventas' && action === 'listar') {
        const rows = query(
          `SELECT v.*, o.number as orden_number FROM ventas v
            LEFT JOIN ordenes o ON o.id=v.orderId
            ORDER BY v.id DESC`);
        return res.json(rows.map(r => ({ ...r, items: (() => { try { return JSON.parse(r.items || '[]'); } catch { return []; } })() })));
      }

      // ── Compras ────────────────────────────────────────────────
      if (resource === 'compras' && action === 'crear') {
        const items = data.items || [];
        const total = Number(data.total) || items.reduce((s, it) => s + Number(it.cost || 0) * Number(it.qty || 1), 0);
        const supplierId = data.supplierId || null;
        const date = data.date || todayISO();
        exec(`INSERT INTO compras (supplierId, date, total, items, active) VALUES (?,?,?,?,1)`,
          [supplierId, date, total, JSON.stringify(items)]);
        const id = lastId();
        // Subir stock y costo de productos
        for (const it of items) {
          if (it.productId) {
            exec('UPDATE productos SET stock=stock+?, cost=? WHERE id=?',
              [Number(it.qty) || 1, Number(it.cost) || 0, it.productId]);
          }
        }
        // Movimiento de caja por compra (egreso)
        if (total > 0) {
          exec(`INSERT INTO caja (date, type, amount, concept, refType, refId) VALUES (?,?,?,?,?,?)`,
            [date, 'egreso', total, `Compra a proveedor`, 'compra', id]);
        }
        return res.status(201).json({ ok: true, id, total });
      }
      if (resource === 'compras' && action === 'listar') {
        const rows = query(
          `SELECT c.*, p.name as proveedor_name FROM compras c
            LEFT JOIN proveedores p ON p.id=c.supplierId
            ORDER BY c.id DESC`);
        return res.json(rows.map(r => ({ ...r, items: (() => { try { return JSON.parse(r.items || '[]'); } catch { return []; } })() })));
      }

      // ── Caja ───────────────────────────────────────────────────
      if (resource === 'caja' && action === 'crear') {
        const date = data.date || todayISO();
        exec(`INSERT INTO caja (date, type, amount, concept, refType, refId) VALUES (?,?,?,?,?,?)`,
          [date, data.type, Number(data.amount) || 0, data.concept || '', data.refType || 'manual', data.refId || null]);
        return res.status(201).json({ ok: true, id: lastId() });
      }
      if (resource === 'caja' && action === 'listar') {
        const fecha = data.fecha || todayISO();
        return res.json(query("SELECT * FROM caja WHERE date=? ORDER BY id DESC", [fecha]));
      }
      if (resource === 'caja' && action === 'resumen') {
        const fecha = data.fecha || todayISO();
        const rows = query("SELECT type, SUM(amount) as total FROM caja WHERE date=? GROUP BY type", [fecha]);
        const r = { ingresos: 0, egresos: 0 };
        rows.forEach(x => { if (x.type === 'ingreso') r.ingresos = x.total; if (x.type === 'egreso') r.egresos = x.total; });
        r.balance = (r.ingresos || 0) - (r.egresos || 0);
        return res.json(r);
      }

      // ── Empleados pagos ────────────────────────────────────────
      if (resource === 'empleados' && action === 'pagos_crear') {
        const date = data.date || todayISO();
        const valorBase = Number(data.total_orden) || 0;
        const pct = Number(data.porcentaje) || 0;
        const amount = Math.round(valorBase * pct / 100);
        const orderId = data.orderId ? parseInt(data.orderId) : null;
        if (!data.employeeId) return res.status(400).json({ error: 'Empleado requerido' });
        if (!valorBase) return res.status(400).json({ error: 'Valor base requerido' });
        exec(`INSERT INTO pagos_empleados (employeeId, amount, date, note, orderId, total_orden, porcentaje, estado)
              VALUES (?,?,?,?,?,?,?,?)`,
          [parseInt(data.employeeId), amount, date, data.note || '', orderId, valorBase, pct, 'pendiente']);
        const id = lastId();
        // Sin caja inmediata — el egreso se registra al liquidar
        return res.json({ ok: true, id, amount });
      }
      if (resource === 'empleados' && action === 'acumulados') {
        const rows = query(`
          SELECT e.id, e.name, e.role, e.phone,
                 COALESCE(SUM(CASE WHEN p.estado='pendiente' THEN p.amount ELSE 0 END), 0) as acumulado,
                 COUNT(CASE WHEN p.estado='pendiente' THEN 1 END) as trabajos_pendientes
          FROM empleados e
          LEFT JOIN pagos_empleados p ON p.employeeId=e.id
          WHERE e.active=1
          GROUP BY e.id
          ORDER BY e.name`);
        return res.json(rows);
      }
      if (resource === 'empleados' && action === 'pendientes') {
        const empId = parseInt(data.employeeId || data.id);
        if (!empId) return res.status(400).json({ error: 'Empleado requerido' });
        const rows = query(`
          SELECT p.*, o.number as orden_number
          FROM pagos_empleados p
          LEFT JOIN ordenes o ON o.id=p.orderId
          WHERE p.employeeId=? AND p.estado='pendiente'
          ORDER BY p.id DESC`, [empId]);
        return res.json(rows);
      }
      if (resource === 'empleados' && action === 'liquidar') {
        const empId = parseInt(data.employeeId);
        if (!empId) return res.status(400).json({ error: 'Empleado requerido' });
        const pendientes = query(`
          SELECT p.*, o.number as orden_number
          FROM pagos_empleados p LEFT JOIN ordenes o ON o.id=p.orderId
          WHERE p.employeeId=? AND p.estado='pendiente'`, [empId]);
        if (!pendientes.length) return res.status(400).json({ error: 'No hay trabajos pendientes para liquidar' });
        const total = pendientes.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const date = data.date || todayISO();
        const items = JSON.stringify(pendientes.map(p => ({
          id: p.id, orden_number: p.orden_number || null,
          total_orden: p.total_orden, porcentaje: p.porcentaje, amount: p.amount, date: p.date, note: p.note
        })));
        exec(`INSERT INTO liquidaciones_empleados (employeeId, total, date, items) VALUES (?,?,?,?)`,
          [empId, total, date, items]);
        const liqId = lastId();
        for (const p of pendientes) {
          exec(`UPDATE pagos_empleados SET estado='pagado', liquidacion_id=? WHERE id=?`, [liqId, p.id]);
        }
        if (total > 0) {
          const emp = query('SELECT name FROM empleados WHERE id=?', [empId])[0];
          exec(`INSERT INTO caja (date, type, amount, concept, refType, refId) VALUES (?,?,?,?,?,?)`,
            [date, 'egreso', total,
             `Liquidación ${emp?.name || 'empleado'} (${pendientes.length} trabajo${pendientes.length !== 1 ? 's' : ''})`,
             'liquidacion', liqId]);
        }
        return res.json({ ok: true, id: liqId, total, count: pendientes.length });
      }
      if (resource === 'empleados' && action === 'liquidaciones_listar') {
        const empId = data.employeeId ? parseInt(data.employeeId) : null;
        const where = empId ? 'WHERE l.employeeId=?' : '';
        const params = empId ? [empId] : [];
        const rows = query(`
          SELECT l.*, e.name as empleado_name
          FROM liquidaciones_empleados l
          LEFT JOIN empleados e ON e.id=l.employeeId
          ${where} ORDER BY l.id DESC`, params);
        return res.json(rows.map(r => ({ ...r, items: (() => { try { return JSON.parse(r.items || '[]'); } catch { return []; } })() })));
      }
      if (resource === 'empleados' && action === 'liquidacion_detalle') {
        const liqId = parseInt(data.id);
        const rows = query(`
          SELECT p.*, o.number as orden_number
          FROM pagos_empleados p LEFT JOIN ordenes o ON o.id=p.orderId
          WHERE p.liquidacion_id=?
          ORDER BY p.id`, [liqId]);
        return res.json(rows);
      }
      if (resource === 'empleados' && action === 'pagos_listar') {
        const empId = data.empleado_id || data.employeeId;
        const where = empId ? 'WHERE p.employeeId=?' : '';
        const params = empId ? [empId] : [];
        return res.json(query(
          `SELECT p.*, e.name as empleado_name, o.number as orden_number
             FROM pagos_empleados p
             LEFT JOIN empleados e ON e.id=p.employeeId
             LEFT JOIN ordenes o ON o.id=p.orderId
             ${where} ORDER BY p.id DESC`, params));
      }
      if (resource === 'empleados' && action === 'marcar_pagado') {
        exec("UPDATE pagos_empleados SET estado='pagado' WHERE id=?", [data.id]);
        return res.json({ ok: true });
      }

      // ── Garantías ──────────────────────────────────────────────
      if (resource === 'garantias' && action === 'listar') {
        const rows = query(
          `SELECT g.*, c.name as cliente_name, m.plate, m.model, o.number as orden_number
             FROM garantias g
             LEFT JOIN clientes c ON c.id=g.customerId
             LEFT JOIN motos m ON m.id=g.bikeId
             LEFT JOIN ordenes o ON o.id=g.orderId
             ORDER BY g.id DESC`);
        return res.json(rows);
      }
      if (resource === 'garantias' && action === 'motos_entregadas') {
        const rows = query(
          `SELECT o.id as orderId, o.number, o.entryDate, c.id as customerId, c.name as cliente_name,
                  m.id as bikeId, m.plate, m.model, m.year
             FROM ordenes o
             LEFT JOIN clientes c ON c.id=o.customerId
             LEFT JOIN motos m ON m.id=o.bikeId
             WHERE o.status='entregada' AND o.active=1
             ORDER BY o.id DESC LIMIT 200`);
        return res.json(rows);
      }
      if (resource === 'garantias' && action === 'crear') {
        const now = new Date().toISOString();
        exec(`INSERT INTO garantias (orderId, customerId, bikeId, description, expiresAt, status, createdAt)
              VALUES (?,?,?,?,?,?,?)`,
          [data.orderId || null, data.customerId || null, data.bikeId || null,
           data.description || '', data.expiresAt || null, data.status || 'activa', now]);
        return res.status(201).json({ ok: true, id: lastId() });
      }

      res.status(400).json({ error: `Acción no soportada: ${action}` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Static files (después de rutas API) ───────────────────────
  app.use(express.static(WWW_ROOT));

  // ── SPA fallback ──────────────────────────────────────────────
  app.get('*', (req, res) => {
    res.sendFile(path.join(WWW_ROOT, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`[DB Server] ✓ Iniciado en puerto ${port}`);
      const ips = getLocalIPs();
      if (ips.length) {
        console.log('[DB Server] Acceso desde red local:');
        ips.forEach(ip => console.log(`  → http://${ip}:${port}`));
      }
      // Limpiar registros antiguos al arrancar y luego cada 24h
      setTimeout(() => {
        runCleanup();
        setInterval(runCleanup, 24 * 60 * 60 * 1000);
      }, 5000);
      resolve(server);
    });
    server.on('error', reject);
  });
}
