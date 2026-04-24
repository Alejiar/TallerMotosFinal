# 📋 Resumen de Cambios - Migración Fase 1

## 📦 Archivos Creados (24 archivos nuevos)

### Backend PHP (7 archivos)
```
server/www/api/
├── config.php          - Configuración SQLite + recursos
├── db.php              - Schema de BD
├── resource.php        - CRUD genérico  
├── sync.php            - Sincronización completa
├── upload.php          - Upload de archivos
└── whatsapp.php        - Bridge a Express WhatsApp
server/www/
├── router.php          - Router para SPA
└── migrate.php         - Migración manual de BD
```

### Frontend JavaScript (6 archivos)
```
server/www/js/
├── api.js              - Cliente HTTP REST
├── auth.js             - Gestión de autenticación
├── storage.js          - Manager de localStorage
├── router.js           - Enrutador SPA
├── app.js              - Inicializador principal
└── adapter.js          - Compatibilidad con script.js antiguo
```

### Documentación (3 archivos)
```
root/
├── MIGRACION_COMPLETADA.md   - Guía completa de migración
├── TESTING_CHECKLIST.md      - Puntos a verificar
└── server/www/API.md         - Documentación de endpoints
```

### Configuración & Scripts (2 archivos)
```
root/
└── migrate-db.js             - Script Node.js para migrar BD
```

### Directorios Creados (5 directorios)
```
server/www/
├── api/                      - Endpoints PHP
├── js/                       - Módulos JavaScript
├── css/                      - Estilos CSS
├── pages/                    - Páginas HTML (para futuro)
└── uploads/                  - Directorio de uploads
```

---

## 🔄 Archivos Modificados (3 archivos)

### 1. `electron/main.cjs`
**Cambios:**
- Actualizar comando PHP para usar router.php
- Cambiar path de whatsapp-service a whatsapp-server
- Mejorar logging del arranque
- Añadir manejador de stdio

**Antes:**
```javascript
phpProcess = spawn(PHP_EXE, ["-S", `0.0.0.0:${PHP_PORT}`, "-t", PHP_ROOT], {...})
```

**Después:**
```javascript
const routerFile = path.join(PHP_ROOT, "router.php");
phpProcess = spawn(PHP_EXE, ["-S", `0.0.0.0:${PHP_PORT}`, "-t", PHP_ROOT, routerFile], {...})
```

### 2. `server/www/index.html`
**Cambios:**
- Agregar referencias a nuevos archivos JS

**Antes:**
```html
<script src="script.js"></script>
```

**Después:**
```html
<script src="/js/api.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/storage.js"></script>
<script src="/js/router.js"></script>
<script src="/js/app.js"></script>
<script src="/js/adapter.js"></script>
<script src="script.js"></script>
```

### 3. `.htaccess` (Windows → PHP Router)
**Cambios:**
- Crear router.php para manejo de rutas en PHP built-in server

---

## 🗂️ Estructura Base de Datos

### Tablas Creadas Automáticamente (15 tablas)
```sql
usuarios
├── id (int, PK)
├── username (text, UNIQUE)
├── password (text)
├── name (text)
├── role (text)
└── active (int)

clientes
├── id (int, PK)
├── name, phone, notes
├── active, createdAt, imagePath

motos
├── id (int, PK)
├── customerId (FK → clientes)
├── plate, model, year, color
├── createdAt, active, imagePath

ordenes
├── id (int, PK)
├── number (UNIQUE), customerId (FK), bikeId (FK)
├── problem, status, entryDate, estimatedDate
├── parts (JSON), services (JSON), evidences (JSON)
├── locked, total, notes, active

detalle_orden
├── id (int, PK)
├── orderId (FK), itemType, name, qty, unitPrice

productos
├── id, code (UNIQUE), name, stock, minStock
├── shelf, price, cost, supplierId (FK), active, createdAt

proveedores
├── id, name, phone, productsHint, active

compras
├── id, supplierId (FK), date, total
├── items (JSON), active

empleados
├── id, name, role, phone, active

pagos_empleados
├── id, employeeId (FK), amount, date, note

caja
├── id, date, type, amount, concept, refType, refId

ventas
├── id, number (UNIQUE), date, items (JSON)
├── total, method, type, orderId

notas
├── id, title, body, createdAt, done

templates
├── id, key (UNIQUE), label, body

counters
├── id, key (UNIQUE), value

whatsapp_mensajes  ✅ NUEVO
├── id, phone, message, status, createdAt, sentAt, error
```

---

## 🔌 Endpoints Creados

### REST API - CRUD Genérico
```
GET    /api/resource.php?name={recurso}              Obtener todos
GET    /api/resource.php?name={recurso}&id={id}     Obtener uno
POST   /api/resource.php                            Crear
PATCH  /api/resource.php                            Actualizar  
DELETE /api/resource.php?name={recurso}&id={id}    Eliminar
```

### Especiales
```
GET    /api/sync.php                                Todas las tablas
POST   /api/upload.php                              Upload multipart
GET    /api/whatsapp.php?action=status              Estado WhatsApp
POST   /api/whatsapp.php?action=init                Iniciar WhatsApp
POST   /api/whatsapp.php?action=send                Enviar mensaje
POST   /api/whatsapp.php?action=disconnect          Desconectar
GET    /api/whatsapp.php?action=messages            Historial
```

---

## 🔐 Seguridad & Configuración

### Usuario Admin (Por Defecto)
```
Usuario: admin
Contraseña: admin123
Role: admin
```

### CORS
```php
// Habilitado para desarrollo
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Ubicación de BD
```
Windows: %APPDATA%\MotoFlowPro\taller.db
Migración: Automática en primer acceso (copia backend/database.db)
```

---

## 📊 Comparativa Arquitectura

| Aspecto | Antes | Después |
|--------|-------|---------|
| **Frontend** | React 18 + TypeScript | HTML vanilla + JS modules |
| **Backend** | Express.js (Node) | PHP 8 built-in server |
| **BD** | Dexie + sql.js + IndexedDB | SQLite nativo |
| **Build** | Vite dev + webpack | Sin build (vanilla) |
| **Package Manager** | npm (frontend) | npm (node modules only) |
| **Puertos** | 5173 (Vite) + 3000 (Express) | 8000 (PHP) + 8001 (WA) |
| **Shell** | Electron + Vite | Electron + PHP |
| **Bundle Size** | 5MB+ (Node modules) | <1MB (PHP built-in) |

---

## 🚀 Cómo Iniciar

### Desarrollo
```bash
# Terminal 1
cd server/www
php -S 0.0.0.0:8000 router.php

# Terminal 2
cd motoflow-pro
node backend/whatsapp-server.mjs

# Terminal 3 (Electron)
npm run dev
```

### Producción
```bash
npm run build:exe  # Genera .exe
```

---

## ✅ Validación Rápida

**Verificar que todo funciona:**

```bash
# 1. BD creada
sqlite3 "%APPDATA%\MotoFlowPro\taller.db" ".tables"

# 2. PHP responde
curl http://localhost:8000/api/sync.php | head -20

# 3. Frontend carga
curl http://localhost:8000 | head -10

# 4. WhatsApp server
curl http://localhost:8001/health

# 5. Login funciona
curl -X POST http://localhost:8000/api/resource.php \
  -d "{\"name\":\"usuarios\",\"username\":\"admin\",\"password\":\"admin123\"}" \
  -H "Content-Type: application/json"
```

---

## 📚 Documentación Adicional

- **API.md** - Referencia completa de endpoints
- **MIGRACION_COMPLETADA.md** - Guía de migración
- **TESTING_CHECKLIST.md** - Puntos a verificar

---

## 🎯 Siguiente Paso Recomendado

Ejecutar TESTING_CHECKLIST.md punto por punto para validar que todo funciona correctamente antes de continuar con desarrollo.

