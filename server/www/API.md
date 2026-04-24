# MotoFlow Pro - API PHP (Fase 1)

## Endpoints Disponibles

### CRUD Genérico

Todos los recursos usan el mismo endpoint de forma genérica:

#### GET - Obtener todos los registros
```http
GET /api/resource.php?name=clientes
```

**Respuesta:**
```json
[
  { "id": 1, "name": "Cliente 1", "phone": "123456789", "active": 1, "createdAt": "2024-01-01T00:00:00", "imagePath": null },
  { "id": 2, "name": "Cliente 2", "phone": "987654321", "active": 1, "createdAt": "2024-01-02T00:00:00", "imagePath": null }
]
```

#### GET - Obtener un registro específico
```http
GET /api/resource.php?name=clientes&id=1
```

**Respuesta:**
```json
{ "id": 1, "name": "Cliente 1", "phone": "123456789", "active": 1, "createdAt": "2024-01-01T00:00:00", "imagePath": null }
```

#### POST - Crear registro
```http
POST /api/resource.php
Content-Type: application/json

{
  "name": "clientes",
  "name": "Nuevo Cliente",
  "phone": "555555555",
  "notes": "Observaciones",
  "createdAt": "2024-01-03T00:00:00"
}
```

**Respuesta:** (201 Created)
```json
{ "id": 3, "name": "Nuevo Cliente", "phone": "555555555", "notes": "Observaciones", "active": 1, "createdAt": "2024-01-03T00:00:00", "imagePath": null }
```

#### PATCH - Actualizar registro
```http
PATCH /api/resource.php
Content-Type: application/json

{
  "name": "clientes",
  "id": 1,
  "phone": "666666666",
  "notes": "Notas actualizadas"
}
```

**Respuesta:** (200 OK)
```json
{ "id": 1, "name": "Cliente 1", "phone": "666666666", "notes": "Notas actualizadas", "active": 1, "createdAt": "2024-01-01T00:00:00", "imagePath": null }
```

#### DELETE - Eliminar registro
```http
DELETE /api/resource.php?name=clientes&id=1
```

**Respuesta:** (204 No Content)

---

### Sincronización Completa

#### GET - Obtener todos los recursos
```http
GET /api/sync.php
```

**Respuesta:** Objeto con todas las tablas
```json
{
  "usuarios": [...],
  "clientes": [...],
  "motos": [...],
  "ordenes": [...],
  "productos": [...],
  "empleados": [...],
  ...
}
```

---

### Uploads

#### POST - Subir archivo
```http
POST /api/upload.php
Content-Type: multipart/form-data

file: [binary data]
```

**Respuesta:** (201 Created)
```json
{
  "path": "/uploads/upload_60a1f2c3d4e5f.jpg",
  "filename": "upload_60a1f2c3d4e5f.jpg",
  "size": 102400
}
```

---

### WhatsApp

#### GET - Estado de WhatsApp
```http
GET /api/whatsapp.php?action=status
```

**Respuesta:**
```json
{
  "status": "disconnected|loading|qr|ready",
  "qr": "data:image/png;base64,...",
  "message": "Opcional"
}
```

#### POST - Inicializar WhatsApp
```http
POST /api/whatsapp.php?action=init
```

**Respuesta:**
```json
{ "ok": true }
```

#### POST - Enviar mensaje
```http
POST /api/whatsapp.php?action=send
Content-Type: application/json

{
  "phone": "+34612345678",
  "message": "Hola, este es un mensaje de prueba"
}
```

**Respuesta:**
```json
{ "ok": true }
```

#### POST - Desconectar WhatsApp
```http
POST /api/whatsapp.php?action=disconnect
```

**Respuesta:**
```json
{ "ok": true }
```

#### GET - Historial de mensajes
```http
GET /api/whatsapp.php?action=messages
```

**Respuesta:**
```json
[
  {
    "id": 1,
    "phone": "+34612345678",
    "message": "Hola",
    "status": "sent",
    "createdAt": "2024-01-01T10:30:00",
    "sentAt": "2024-01-01T10:30:05",
    "error": null
  }
]
```

---

## Recursos Disponibles

Los siguientes recursos están configurados en `resourceConfig`:

| Recurso | Descripción | JSON Columns |
|---------|-------------|--------------|
| usuarios | Cuentas de usuario | - |
| clientes | Clientes del taller | - |
| motos | Motos en el taller | - |
| ordenes | Órdenes de trabajo | parts, services, evidences |
| detalle_orden | Items de una orden | - |
| productos | Inventario de partes | - |
| proveedores | Proveedores | - |
| compras | Compras a proveedores | items |
| empleados | Personal del taller | - |
| pagos_empleados | Pagos a empleados | - |
| caja | Movimientos de caja | - |
| ventas | Ventas realizadas | items |
| notas | Notas y tareas | - |
| templates | Plantillas de mensajes | - |
| counters | Contadores (números de orden, etc) | - |
| whatsapp_mensajes | Historial de mensajes WhatsApp | - |

---

## Cliente JavaScript (api.js)

```javascript
// Sincronización
const data = await API.sync();

// GET todos
const clientes = await API.getAll('clientes');

// GET uno
const cliente = await API.getOne('clientes', 1);

// Crear
const nuevoCliente = await API.create('clientes', {
  name: 'Nuevo Cliente',
  phone: '555555555',
  createdAt: new Date().toISOString()
});

// Actualizar
const clienteActualizado = await API.update('clientes', 1, {
  phone: '666666666'
});

// Eliminar
await API.delete('clientes', 1);

// Upload
const result = await API.upload(fileElement.files[0]);
// result.path = '/uploads/...'

// WhatsApp
await API.fetch('/whatsapp.php?action=init');
const status = await API.fetch('/whatsapp.php?action=status');
await API.fetch('/whatsapp.php?action=send', {
  method: 'POST',
  body: JSON.stringify({ phone: '+34...', message: 'Hola' })
});
```

---

## Base de Datos

**Ubicación:** `%APPDATA%\MotoFlowPro\taller.db`

**Migración Automática:**
- En el primer acceso, PHP verifica si la BD existe
- Si existe `backend/database.db`, lo copia a la nueva ubicación
- Si no existe, crea una BD nueva con el schema

**Para inicializar BD manualmente:**
```bash
php server/www/migrate.php
```

---

## Desarrollo

### Estructura de directorios
```
server/www/
├── api/
│   ├── config.php           # Configuración y recursos
│   ├── db.php               # Inicialización de schema
│   ├── resource.php         # CRUD genérico
│   ├── sync.php             # Sincronización completa
│   ├── upload.php           # Manejo de uploads
│   └── whatsapp.php         # Bridge a Express
├── js/
│   ├── api.js               # Cliente HTTP
│   ├── auth.js              # Autenticación
│   ├── storage.js           # localStorage
│   ├── router.js            # Enrutador SPA
│   └── app.js               # Inicializador
├── css/
│   └── styles.css
├── pages/                   # Páginas HTML (a migrar de React)
├── uploads/                 # Archivos subidos
├── index.html               # Shell de la app
└── router.php               # Router para PHP built-in server
```

### Iniciar servidor PHP

El servidor PHP se inicia automáticamente desde `electron/main.cjs`:

```javascript
php -S 0.0.0.0:8000 -t server/www router.php
```

Para desarrollo manual:
```bash
cd server/www
php -S 0.0.0.0:8000 router.php
# Luego acceder a http://localhost:8000
```

---

## Notas

- CORS está habilitado (`Access-Control-Allow-Origin: *`)
- Las columnas JSON se auto-parsean/serializan
- Transacciones de órdenes sincronizan automáticamente con `detalle_orden`
- Los uploads se guardan en `server/www/uploads/` con nombres únicos
- WhatsApp usa servicio Express separado en puerto 8001
