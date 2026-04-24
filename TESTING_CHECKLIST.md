# MotoFlow Pro - Checklist de Testing

## 🧪 Testing de Fase 1 (Migración)

Antes de continuar con desarrollo, verificar que todos estos puntos funcionen:

---

## ✅ Backend PHP

### Conexión a BD
- [ ] Archivo BD se crea en `%APPDATA%\MotoFlowPro\taller.db`
- [ ] Tablas se crean automáticamente en primer acceso
- [ ] Se pueden leer registros sin errores

**Test:**
```bash
php server/www/migrate.php
# Debe mostrar: "✓ Listo. La BD está en: ..."
```

### CRUD Genérico
- [ ] `GET /api/resource.php?name=usuarios` - retorna JSON array
- [ ] `GET /api/resource.php?name=usuarios&id=1` - retorna objeto
- [ ] `POST /api/resource.php` con body JSON - crea registro
- [ ] `PATCH /api/resource.php` con id - actualiza registro  
- [ ] `DELETE /api/resource.php?name=usuarios&id=X` - elimina sin error

**Test desde navegador o curl:**
```bash
# GET todos
curl http://localhost:8000/api/resource.php?name=usuarios

# POST crear
curl -X POST http://localhost:8000/api/resource.php \
  -H "Content-Type: application/json" \
  -d '{"name":"usuarios","username":"test","password":"pass","name":"Test","role":"user"}'

# PATCH actualizar
curl -X PATCH http://localhost:8000/api/resource.php \
  -H "Content-Type: application/json" \
  -d '{"name":"usuarios","id":1,"username":"updated"}'

# DELETE
curl -X DELETE http://localhost:8000/api/resource.php?name=usuarios&id=1
```

### Sync Completo
- [ ] `GET /api/sync.php` - retorna todas las tablas
- [ ] Cada tabla es un array válido
- [ ] Campos JSON se parsean correctamente

**Test:**
```bash
curl http://localhost:8000/api/sync.php | jq .
# Debe mostrar todas las tablas como objetos
```

### Uploads
- [ ] `POST /api/upload.php` con multipart file - guarda archivo
- [ ] Retorna path relativo `/uploads/...`
- [ ] Archivo existe en `server/www/uploads/`

### WhatsApp API
- [ ] `GET /api/whatsapp.php?action=status` - responde con estado
- [ ] `POST /api/whatsapp.php?action=init` - sin error
- [ ] `POST /api/whatsapp.php?action=send` - acepta phone + message
- [ ] `GET /api/whatsapp.php?action=messages` - retorna historial

---

## ✅ Frontend HTML/JS

### Carga de Página
- [ ] `http://localhost:8000` carga index.html
- [ ] Login screen visible
- [ ] No hay errores en consola

### Login
- [ ] Usuario admin / contraseña admin123 funciona
- [ ] Redirige a app principal
- [ ] Muestra "👤 Administrador (admin)" en topbar

**Test:**
```javascript
// En consola browser
await Auth.login('admin', 'admin123')
// Debe retornar objeto de usuario
```

### Sincronización de Datos
- [ ] Datos cargan después de login
- [ ] `Storage.getCachedResource('clientes')` retorna array
- [ ] Variables globales `clientesData`, `motosData`, etc. existen

**Test:**
```javascript
// En consola
API.sync().then(data => console.log(data))
// Debe mostrar todas las tablas
```

### Navegación (Router)
- [ ] Links de nav funcionan
- [ ] Cambia página activa
- [ ] Título en topbar actualiza
- [ ] Cada página carga sin errores

**Test:**
```javascript
// En consola
Router.navigate('ordenes')
// Debe mostrar página de Órdenes
```

### API Client
- [ ] `API.getAll('clientes')` retorna array
- [ ] `API.getOne('clientes', 1)` retorna objeto
- [ ] `API.create('clientes', {...})` crea registro
- [ ] `API.update('clientes', 1, {...})` actualiza
- [ ] `API.delete('clientes', 1)` elimina sin error

---

## ✅ WhatsApp Service

### Iniciar Servidor
- [ ] `node backend/whatsapp-server.mjs` inicia sin error
- [ ] Muestra: "[WA Server] Iniciado en http://0.0.0.0:8001"
- [ ] Health check: `curl http://localhost:8001/health`

### Endpoints
- [ ] `GET /api/whatsapp/status` - retorna status
- [ ] `POST /api/whatsapp/init` - inicia sin error
- [ ] `POST /api/whatsapp/send` - acepta phone y message

**Test:**
```bash
curl http://localhost:8001/api/whatsapp/status | jq .
# Debe retornar: {"status":"disconnected|loading|qr|ready",...}
```

### Integración PHP
- [ ] `GET /api/whatsapp.php?action=status` hace proxy a Express
- [ ] `POST /api/whatsapp.php?action=send` guarda en `whatsapp_mensajes`
- [ ] Historial se puede consultar

---

## ✅ Electron

### Iniciar Aplicación
- [ ] `npm run dev` inicia sin error
- [ ] PHP server inicia automáticamente
- [ ] WhatsApp service inicia automáticamente
- [ ] Electron window abre cargando localhost:8000

### Ventana
- [ ] Window es 1300x840px
- [ ] Load page principal (login)
- [ ] Acceso a DevTools con F12

### Cierre
- [ ] Cerrar ventana termina procesos (PHP, WA)
- [ ] No quedan procesos huérfanos

---

## 🔍 Browser Console Checks

Ejecutar en consola del navegador después de login:

```javascript
// 1. Verificar Auth
Auth.isAuthenticated()  // true
Auth.getUser()          // objeto usuario

// 2. Verificar Storage
Storage.getCachedResource('clientes')    // array
Storage.get('motoflow_user')             // objeto usuario

// 3. Verificar API
await API.getAll('usuarios')             // array usuarios
await API.sync()                         // todas las tablas

// 4. Verificar Adapter
typeof window.api === 'function'         // true
typeof window.get === 'function'         // true

// 5. Verificar Datos
window.clientesData                      // array (si existe)
window.motosData                         // array (si existe)

// 6. Verificar Router
Router.currentPage                       // 'dashboard' o página actual
typeof Router.navigate === 'function'    // true
```

---

## 📊 BD Queries

Verificar datos directamente en SQLite:

```bash
# Acceder a BD
sqlite3 "%APPDATA%\MotoFlowPro\taller.db"

# Verificar tablas
.tables

# Ver esquema
.schema usuarios

# Contar registros
SELECT COUNT(*) FROM usuarios;
SELECT COUNT(*) FROM clientes;

# Ver datos
SELECT * FROM usuarios LIMIT 5;
```

---

## ⚠️ Common Issues

| Problema | Solución |
|----------|----------|
| BD no encontrada | Ejecutar `php server/www/migrate.php` |
| Puerto 8000 en uso | `netstat -an \| find ":8000"` y matar proceso |
| Puerto 8001 en uso | `netstat -an \| find ":8001"` y matar proceso |
| CORS error | En desarrollo está abierto, normal en localhost |
| "No se conecta a Express" | Verificar que `npm install better-sqlite3` completó |
| Script.js error | Verificar que adapter.js carga antes que script.js |
| Datos vacíos | Verificar que `/api/sync.php` retorna datos |

---

## 🎯 Checkpoints Críticos

**DEBE cumplir estos 3 para considerar exitosa la migración:**

1. ✅ **API funciona:**
   ```bash
   curl http://localhost:8000/api/sync.php | jq . | head -20
   ```
   Resultado: JSON con todos los recursos

2. ✅ **Frontend carga:**
   ```bash
   curl http://localhost:8000 | head -20
   ```
   Resultado: HTML válido con formulario login

3. ✅ **Login funciona:**
   - Usuario: admin
   - Contraseña: admin123
   - App principal visible
   - No hay errores console

---

## 📝 Reporte de Errores

Si algo falla, recopilar:

```javascript
// 1. Console errors
// 2. Network tab (ver requests fallidas)
// 3. Logs del servidor:
//    - Terminal PHP: php -S 0.0.0.0:8000 router.php
//    - Terminal WA: node backend/whatsapp-server.mjs
//    - Electron: npm run dev

// 4. Estado de BD
sqlite3 "%APPDATA%\MotoFlowPro\taller.db" ".tables"

// 5. Salida de:
php server/www/migrate.php
```

---

## ✨ Siguiente Fase

Una vez completados todos los checkpoints:
- [ ] Continuar con desarrollo de nuevas features
- [ ] Implementar validaciones adicionales
- [ ] Agregar tests
- [ ] Optimizar performance
- [ ] Preparar para producción

