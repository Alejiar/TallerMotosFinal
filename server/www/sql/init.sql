PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  imagePath TEXT
);

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

CREATE TABLE IF NOT EXISTS ordenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customerId INTEGER NOT NULL,
  bikeId INTEGER NOT NULL,
  problem TEXT,
  status TEXT NOT NULL DEFAULT 'ingresada',
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

CREATE TABLE IF NOT EXISTS detalle_orden (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  itemType TEXT NOT NULL,
  name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  unitPrice REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(orderId) REFERENCES ordenes(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  productsHint TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplierId INTEGER,
  date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(supplierId) REFERENCES proveedores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pagos_empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employeeId INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY(employeeId) REFERENCES empleados(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  concept TEXT,
  refType TEXT,
  refId INTEGER
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  total REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'efectivo',
  type TEXT NOT NULL DEFAULT 'mostrador',
  orderId INTEGER
);

CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  createdAt TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER,
  customerId INTEGER,
  bikeId INTEGER,
  description TEXT NOT NULL,
  expiresAt TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  createdAt TEXT NOT NULL,
  FOREIGN KEY(orderId) REFERENCES ordenes(id) ON DELETE SET NULL,
  FOREIGN KEY(customerId) REFERENCES clientes(id) ON DELETE SET NULL,
  FOREIGN KEY(bikeId) REFERENCES motos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad_id INTEGER,
  tipo TEXT NOT NULL,
  telefono TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  error_msg TEXT,
  fecha_envio TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ordenes_status ON ordenes(status);
CREATE INDEX IF NOT EXISTS idx_ordenes_customerId ON ordenes(customerId);
CREATE INDEX IF NOT EXISTS idx_motos_customerId ON motos(customerId);
CREATE INDEX IF NOT EXISTS idx_productos_code ON productos(code);
CREATE INDEX IF NOT EXISTS idx_caja_date ON caja(date);
CREATE INDEX IF NOT EXISTS idx_wa_mensajes_estado ON whatsapp_mensajes(estado);

-- Seeds
INSERT OR IGNORE INTO usuarios(id,username,password,name,role,active)
VALUES(1,'admin','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','Administrador','admin',1);

INSERT OR IGNORE INTO counters(key,value) VALUES('order',0),('sale',0);

INSERT OR IGNORE INTO templates(key,label,body) VALUES
  ('ingreso','Ingreso de moto','Hola {cliente}, tu moto *{placa}* ({moto}) fue recibida en nuestro taller. Orden: *{orden}*. Te avisaremos cuando esté lista. ¡Gracias por tu confianza!'),
  ('proceso','En proceso','Hola {cliente}, tu moto *{placa}* continúa en reparación. Estado actual: *{estado}*. Si tienes dudas, escríbenos.'),
  ('finalizacion','Lista para entregar','¡Hola {cliente}! Tu moto *{placa}* ({moto}) ya está lista para recoger. Orden: *{orden}*. ¡Gracias por preferirnos!');

INSERT OR IGNORE INTO configuracion(clave,valor) VALUES
  ('modo_prueba','0'),
  ('numero_prueba',''),
  ('nombre_taller','Taller MotoFlow'),
  ('prefijo_pais','57');
