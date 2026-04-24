#!/usr/bin/env node

/**
 * MotoFlow Pro - Migración de BD
 * Convierte database.db (sql.js) a SQLite en AppData
 * 
 * Uso: node migrate-db.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourceDb = path.join(__dirname, 'backend', 'database.db');
const appDataPath = process.env.APPDATA || process.env.HOME;
const motoFlowPath = path.join(appDataPath, 'MotoFlowPro');
const targetDb = path.join(motoFlowPath, 'taller.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('MotoFlow Pro - Migración de Base de Datos');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Crear directorio destino
if (!fs.existsSync(motoFlowPath)) {
  fs.mkdirSync(motoFlowPath, { recursive: true });
  console.log(`✓ Directorio creado: ${motoFlowPath}\n`);
}

// Verificar BD fuente
if (!fs.existsSync(sourceDb)) {
  console.log('ℹ BD fuente no encontrada. Creando BD nueva desde cero...\n');
  
  // Crear BD vacía con schema
  const targetDb3 = new Database(targetDb);
  
  // Crear tablas
  const tables = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      imagePath TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS motos (
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
    )`,
    `CREATE TABLE IF NOT EXISTS ordenes (
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
    )`,
    `CREATE TABLE IF NOT EXISTS detalle_orden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      itemType TEXT NOT NULL,
      name TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      unitPrice REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(orderId) REFERENCES ordenes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
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
    )`,
    `CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      productsHint TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER,
      date TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      items TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(supplierId) REFERENCES proveedores(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS pagos_empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeId INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY(employeeId) REFERENCES empleados(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      concept TEXT,
      refType TEXT,
      refId INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      total REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      type TEXT NOT NULL,
      orderId INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      createdAt TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      body TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      sentAt TEXT,
      error TEXT
    )`
  ];
  
  for (const table of tables) {
    targetDb3.exec(table);
  }
  
  // Insertar usuario admin por defecto
  targetDb3.prepare(`
    INSERT OR IGNORE INTO usuarios (username, password, name, role, active)
    VALUES (?, ?, ?, ?, 1)
  `).run('admin', 'admin123', 'Administrador', 'admin');
  
  targetDb3.close();
  
  console.log(`✓ BD nueva creada: ${targetDb}\n`);
  console.log('✓ Usuario admin creado (usuario: admin, contraseña: admin123)\n');
} else {
  console.log(`ℹ BD fuente encontrada: ${sourceDb}`);
  console.log(`  Tamaño: ${(fs.statSync(sourceDb).size / 1024).toFixed(2)} KB\n`);
  
  try {
    // Leer BD sql.js
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(sourceDb);
    const sqlDb = new SQL.Database(buffer);
    
    // Crear BD SQLite destino
    const targetDb3 = new Database(targetDb);
    
    // Obtener lista de tablas
    const tables = sqlDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    
    if (tables.length === 0 || tables[0].values.length === 0) {
      console.log('⚠ BD fuente está vacía\n');
    } else {
      console.log(`ℹ Migrando ${tables[0].values.length} tabla(s)...\n`);
      
      // Migrar cada tabla
      for (const [tableName] of tables[0].values) {
        console.log(`  • ${tableName}...`);
        
        // Obtener schema
        const schemaResult = sqlDb.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
        const createSql = schemaResult[0]?.values[0]?.[0];
        
        if (createSql) {
          targetDb3.exec(createSql);
          
          // Obtener datos
          const dataResult = sqlDb.exec(`SELECT * FROM "${tableName}"`);
          if (dataResult.length > 0 && dataResult[0].values.length > 0) {
            const { columns, values } = dataResult[0];
            const placeholders = columns.map(() => '?').join(',');
            const insertStmt = targetDb3.prepare(`INSERT INTO "${tableName}" (${columns.join(',')}) VALUES (${placeholders})`);
            
            for (const row of values) {
              insertStmt.run(...row);
            }
            
            console.log(`    ✓ ${values.length} registros migrados`);
          } else {
            console.log('    ✓ (sin datos)');
          }
        }
      }
      
      console.log();
    }
    
    targetDb3.close();
    sqlDb.close();
    
    console.log(`✓ Migración completada: ${targetDb}\n`);
  } catch (error) {
    console.error('✗ Error durante migración:', error.message);
    process.exit(1);
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✓ Listo. La BD está en:', targetDb);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
