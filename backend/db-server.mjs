import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
import { sendMessage as waSend, getStatus as waGetStatus } from './whatsapp-service.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auto-notificaciones WhatsApp (Colombia +57) ───────────────────
const COUNTRY_CODE = '57';
const STATUS_MESSAGES = {
  ingresada:           (n) => `Hola ${n}, su moto ha sido ingresada al taller.`,
  esperando_repuestos: (n) => `Hola ${n}, su moto está en espera de repuestos.`,
  reparacion:          (n) => `Hola ${n}, su moto está siendo reparada.`,
  reparando:           (n) => `Hola ${n}, su moto está siendo reparada.`,
  lista:               (n) => `Hola ${n}, su moto está lista para ser entregada.`,
};
function formatPhoneCO(phone) {
  let limpio = String(phone || '').replace(/\D/g, '');
  if (!limpio) return null;
  if (!limpio.startsWith(COUNTRY_CODE)) limpio = COUNTRY_CODE + limpio;
  return limpio;
}
async function notifyOrden(ordenId, estado) {
  try {
    const builder = STATUS_MESSAGES[estado];
    if (!builder) return;
    const row = query('SELECT c.name, c.phone FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId WHERE o.id=?', [ordenId])[0];
    if (!row?.phone) { console.log('[WA Notify] orden', ordenId, 'sin teléfono'); return; }
    const phone = formatPhoneCO(row.phone);
    const text = builder(row.name || 'cliente');
    if (waGetStatus().status !== 'connected') {
      console.warn('[WA Notify] WhatsApp no conectado, mensaje no enviado a', phone);
      return;
    }
    await waSend(phone, text);
    console.log(`[WA Notify] enviado a ${phone}: "${text}"`);
  } catch (e) {
    console.error('[WA Notify] error:', e.message);
  }
}

const DB_DIR = path.join(process.env.APPDATA || process.env.HOME || '', 'MotoFlowPro');
const DB_PATH = path.join(DB_DIR, 'taller.db');
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
  'notas','garantias','templates','counters','configuracion','whatsapp_mensajes'
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
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(fs.readFileSync(INIT_SQL, 'utf8'));
    saveDB();
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

export async function startDBServer(port) {
  await initDB();

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '20mb' }));

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
        const rows = query(`SELECT o.*, c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model, m.year, o.problem as problem FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId LEFT JOIN motos m ON m.id=o.bikeId WHERE o.active=1 AND o.status != 'entregada' ORDER BY o.id DESC`);
        return res.json(rows.map(r => parseRow('ordenes', r)));
      }
      // ─── Cambio de estado desde el kanban: redirige al update de ordenes ───
      if (rawResource === 'motos' && action === 'cambiar_estado') {
        const id = data.id;
        const status = data.status || data.estado;
        if (!id || !status) return res.status(400).json({ error: 'id y status requeridos' });
        exec('UPDATE ordenes SET status=? WHERE id=?', [status, id]);
        notifyOrden(id, status);
        return res.json({ ok: true });
      }

      if (action === '' || action === 'listar') {
        // Ordenes: include joined cliente_name and plate
        if (resource === 'ordenes') {
          const all = data.all === '1' || data.all === 1;
          const where = all ? '' : "WHERE o.active=1 AND o.status != 'entregada'";
          return res.json(
            query(`SELECT o.*, c.name as cliente_name, m.plate, m.model, m.year, m.color FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId LEFT JOIN motos m ON m.id=o.bikeId ${where} ORDER BY o.id DESC`)
              .map(r => parseRow('ordenes', r))
          );
        }
        return res.json(query(`SELECT * FROM ${resource}`).map(r => parseRow(resource, r)));
      }
      if (action === 'get') {
        const row = query(`SELECT o.*, c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model, m.year, m.color, m.year FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId LEFT JOIN motos m ON m.id=o.bikeId WHERE o.id=?`, [data.id])[0];
        if (!row) return res.status(404).json({ error: 'Orden no encontrada' });
        return res.json(parseRow('ordenes', row));
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
      if (action === 'crear' && resource !== 'ordenes') {
        const { cols, vals, placeholders } = buildInsert(resource, data);
        exec(`INSERT INTO ${resource} (${cols.join(',')}) VALUES (${placeholders})`, vals);
        const id = lastId();
        const row = query(`SELECT * FROM ${resource} WHERE id=?`, [id]);
        return res.status(201).json(parseRow(resource, row[0]));
      }
      if (action === 'actualizar' || action === 'cambiar_estado' || action.startsWith('actualizar_')) {
        const { id, ...rest } = data;
        if (!id) return res.status(400).json({ error: 'ID requerido' });
        const { setClause, vals } = buildUpdate(resource, rest, id);
        if (setClause) exec(`UPDATE ${resource} SET ${setClause} WHERE id=?`, vals);
        const row = query(`SELECT * FROM ${resource} WHERE id=?`, [id]);
        if (resource === 'ordenes' && (rest.status || rest.estado)) {
          notifyOrden(id, rest.status || rest.estado);
        }
        return res.json(parseRow(resource, row[0] || {}));
      }
      if (action === 'eliminar') {
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
          // Find or create cliente
          const now = new Date().toISOString();
          let cliente = query('SELECT * FROM clientes WHERE LOWER(phone)=LOWER(?)', [telefono])[0]
            || query('SELECT * FROM clientes WHERE LOWER(name)=LOWER(?)', [nombre])[0];
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
          const parts = JSON.parse(orden.parts || '[]');
          parts.push({ productId: prod.id, name: prod.name, price: prod.price, qty: 1 });
          exec('UPDATE ordenes SET parts=? WHERE id=?', [JSON.stringify(parts), data.id]);
          exec('UPDATE productos SET stock=stock-1 WHERE id=?', [data.productId]);
          return res.json({ ok: true });
        }
        if (action === 'quitar_parte') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          const parts = JSON.parse(orden.parts || '[]');
          const removed = parts.splice(data.idx, 1)[0];
          exec('UPDATE ordenes SET parts=? WHERE id=?', [JSON.stringify(parts), data.id]);
          if (removed) exec('UPDATE productos SET stock=stock+? WHERE id=?', [removed.qty || 1, removed.productId]);
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
        if (action === 'finalizar') {
          const orden = query('SELECT * FROM ordenes WHERE id=?', [data.id])[0];
          if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
          const parts = JSON.parse(orden.parts || '[]');
          const services = JSON.parse(orden.services || '[]');
          const total = parts.reduce((s, p) => s + (p.price * (p.qty || 1)), 0) + services.reduce((s, sv) => s + sv.price, 0);
          exec("UPDATE ordenes SET status='lista', total=? WHERE id=?", [total, data.id]);
          notifyOrden(data.id, 'lista');
          return res.json({ ok: true, total });
        }
      }

      // Ventas
      if (resource === 'ventas' && action === 'crear') {
        const n = query("SELECT value FROM counters WHERE key='sale'")[0]?.value || 0;
        exec("INSERT OR IGNORE INTO counters(key,value) VALUES('sale',0)");
        exec("UPDATE counters SET value=value+1 WHERE key='sale'");
        const num = (parseInt(n) + 1);
        const number = 'FAC-' + String(num).padStart(4, '0');
        exec(`INSERT INTO ventas (number, items, method, date, total) VALUES (?,?,?,?,?)`,
          [number, JSON.stringify(data.items || []), data.method || 'efectivo', todayISO(), data.total || 0]);
        const id = lastId();
        for (const item of (data.items || [])) {
          if (item.productId) exec('UPDATE productos SET stock=stock-? WHERE id=?', [item.qty || 1, item.productId]);
        }
        return res.status(201).json({ ok: true, id, number });
      }

      // Empleados - pagos
      if (resource === 'empleados' && action === 'pagos_crear') {
        exec('INSERT INTO pagos_empleados (employeeId, amount, date, note) VALUES (?,?,?,?)',
          [data.employeeId, data.amount, data.date || todayISO(), data.note || '']);
        return res.json({ ok: true, id: lastId() });
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
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`[DB Server] ✓ Iniciado en puerto ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
