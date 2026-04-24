import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFolder = path.join(__dirname);
const dbPath = path.join(dbFolder, "database.db");
fs.mkdirSync(dbFolder, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.join(__dirname, "../node_modules/sql.js/dist", file),
});

const sqlite = fs.existsSync(dbPath)
  ? new SQL.Database(fs.readFileSync(dbPath))
  : new SQL.Database();

sqlite.run("PRAGMA foreign_keys = ON;");

function persist() {
  const data = sqlite.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function createTable(sql) {
  sqlite.run(sql);
}

createTable(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  imagePath TEXT
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS motos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customerId INTEGER NOT NULL,
  plate TEXT NOT NULL,
  model TEXT,
  year TEXT,
  color TEXT,
  createdAt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  imagePath TEXT,
  FOREIGN KEY(customerId) REFERENCES clientes(id) ON DELETE CASCADE
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS ordenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customerId INTEGER NOT NULL,
  bikeId INTEGER NOT NULL,
  problem TEXT,
  status TEXT NOT NULL,
  entryDate TEXT NOT NULL,
  estimatedDate TEXT,
  parts TEXT NOT NULL DEFAULT '[]',
  services TEXT NOT NULL DEFAULT '[]',
  evidences TEXT NOT NULL DEFAULT '[]',
  locked INTEGER NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(customerId) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY(bikeId) REFERENCES motos(id) ON DELETE CASCADE
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS detalle_orden (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  itemType TEXT NOT NULL,
  name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  unitPrice REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(orderId) REFERENCES ordenes(id) ON DELETE CASCADE
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  minStock INTEGER NOT NULL DEFAULT 0,
  shelf TEXT,
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  supplierId INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  imagePath TEXT,
  FOREIGN KEY(supplierId) REFERENCES proveedores(id) ON DELETE SET NULL
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  productsHint TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplierId INTEGER,
  date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(supplierId) REFERENCES proveedores(id) ON DELETE SET NULL
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS pagos_empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employeeId INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY(employeeId) REFERENCES empleados(id) ON DELETE CASCADE
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  concept TEXT,
  refType TEXT,
  refId INTEGER
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  total REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  type TEXT NOT NULL,
  orderId INTEGER
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  createdAt TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  body TEXT NOT NULL
);
`);

createTable(`
CREATE TABLE IF NOT EXISTS counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value INTEGER NOT NULL DEFAULT 0
);
`);

const resourceConfig = {
  usuarios: { jsonColumns: [] },
  clientes: { jsonColumns: [] },
  motos: { jsonColumns: [] },
  ordenes: { jsonColumns: ["parts", "services", "evidences"] },
  detalle_orden: { jsonColumns: [] },
  productos: { jsonColumns: [] },
  proveedores: { jsonColumns: [] },
  compras: { jsonColumns: ["items"] },
  empleados: { jsonColumns: [] },
  pagos_empleados: { jsonColumns: [] },
  caja: { jsonColumns: [] },
  ventas: { jsonColumns: ["items"] },
  notas: { jsonColumns: [] },
  templates: { jsonColumns: [] },
  counters: { jsonColumns: [] },
};

function parseRow(resource, row) {
  const config = resourceConfig[resource];
  if (!config) return row;
  const parsed = { ...row };
  config.jsonColumns.forEach((field) => {
    try {
      parsed[field] = row[field] ? JSON.parse(row[field]) : [];
    } catch {
      parsed[field] = [];
    }
  });
  return parsed;
}

function serializeRow(resource, row) {
  const config = resourceConfig[resource];
  if (!config) return row;
  const normalized = { ...row };
  config.jsonColumns.forEach((field) => {
    if (field in normalized) {
      normalized[field] = JSON.stringify(normalized[field] ?? []);
    }
  });
  return normalized;
}

function getAllRows(resource) {
  if (!resourceConfig[resource]) throw new Error(`Recurso desconocido: ${resource}`);
  const stmt = sqlite.prepare(`SELECT * FROM ${resource}`);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => parseRow(resource, row));
}

function getRowById(resource, id) {
  if (!resourceConfig[resource]) throw new Error(`Recurso desconocido: ${resource}`);
  const stmt = sqlite.prepare(`SELECT * FROM ${resource} WHERE id = ?`);
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row ? parseRow(resource, row) : null;
}

function insertRow(resource, payload) {
  if (!resourceConfig[resource]) throw new Error(`Recurso desconocido: ${resource}`);
  const normalized = serializeRow(resource, payload);
  const columns = Object.keys(normalized).filter((key) => key !== "id");
  const placeholders = columns.map(() => "?").join(", ");
  const stmt = sqlite.prepare(`INSERT INTO ${resource} (${columns.join(", ")}) VALUES (${placeholders})`);
  stmt.run(columns.map((key) => normalized[key]));
  stmt.free();
  persist();
  const result = sqlite.exec("SELECT last_insert_rowid() AS id");
  const insertedId = result[0].values[0][0];
  if (resource === "ordenes") {
    syncDetalleOrden(insertedId, payload.parts, payload.services);
  }
  return getRowById(resource, insertedId);
}

function updateRow(resource, id, payload) {
  if (!resourceConfig[resource]) throw new Error(`Recurso desconocido: ${resource}`);
  const normalized = serializeRow(resource, payload);
  const columns = Object.keys(normalized).filter((key) => key !== "id");
  const assignments = columns.map((key) => `${key} = ?`).join(", ");
  const stmt = sqlite.prepare(`UPDATE ${resource} SET ${assignments} WHERE id = ?`);
  stmt.run([...columns.map((key) => normalized[key]), id]);
  stmt.free();
  persist();
  if (resource === "ordenes") {
    syncDetalleOrden(id, payload.parts, payload.services);
  }
  return getRowById(resource, id);
}

function deleteRow(resource, id) {
  if (!resourceConfig[resource]) throw new Error(`Recurso desconocido: ${resource}`);
  const stmt = sqlite.prepare(`DELETE FROM ${resource} WHERE id = ?`);
  stmt.run([id]);
  stmt.free();
  persist();
  return { success: true };
}

function syncDetalleOrden(orderId, parts = [], services = []) {
  const deleteStmt = sqlite.prepare(`DELETE FROM detalle_orden WHERE orderId = ?`);
  deleteStmt.run([orderId]);
  deleteStmt.free();

  const stmt = sqlite.prepare(
    `INSERT INTO detalle_orden (orderId, itemType, name, qty, unitPrice) VALUES (?, ?, ?, ?, ?)`,
  );
  parts = Array.isArray(parts) ? parts : [];
  services = Array.isArray(services) ? services : [];
  for (const part of parts) {
    stmt.run([orderId, "part", part.name ?? "Part", part.qty ?? 0, part.unitPrice ?? 0]);
  }
  for (const service of services) {
    stmt.run([orderId, "service", service.description ?? service.name ?? "Service", service.qty ?? 1, service.price ?? 0]);
  }
  stmt.free();
  persist();
}

export { sqlite, resourceConfig, getAllRows, getRowById, insertRow, updateRow, deleteRow };
