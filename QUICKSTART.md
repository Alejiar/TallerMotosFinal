# 🚀 Quick Start - MotoFlow Pro Migración Completada

## En 3 pasos: Usar MotoFlow Pro

### 1️⃣ Iniciar PHP Server
```bash
cd c:\motoflow-pro\server\www
php -S 0.0.0.0:8000 router.php
```
✅ Resultado esperado: 
```
[Thu Apr 24 12:00:00 2026] Development Server (http://0.0.0.0:8000) started
```

### 2️⃣ Iniciar WhatsApp Service (en otra terminal)
```bash
cd c:\motoflow-pro
node backend/whatsapp-server.mjs
```
✅ Resultado esperado:
```
[WA Server] Iniciado en http://0.0.0.0:8001
```

### 3️⃣ Acceder a la Aplicación
- Abrir navegador: **http://localhost:8000**
- Login:
  - Usuario: `admin`
  - Contraseña: `admin123`

---

## 🎯 Usar con Electron (Opcional)

Si quieres que arranque todo automáticamente:

```bash
npm run dev
```

La aplicación abrirá sola con la ventana Electron.

---

## 🛠️ Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| "No se conecta a BD" | `cd server\www && php migrate.php` |
| "Puerto 8000 en uso" | `netstat -an \| find ":8000"` - matar proceso |
| "Puerto 8001 en uso" | `netstat -an \| find ":8001"` - matar proceso |
| "Datos vacíos" | `curl http://localhost:8000/api/sync.php` - verificar JSON |
| "Login no funciona" | Verificar que `%APPDATA%\MotoFlowPro\taller.db` existe |

---

## 📝 Archivos Importantes

```
✅ API.md                    → Documentación de endpoints
✅ MIGRACION_COMPLETADA.md   → Guía completa
✅ TESTING_CHECKLIST.md      → Puntos a verificar  
✅ CAMBIOS_FASE1.md          → Qué se cambió
✅ server/www/API.md         → Referencia técnica
```

---

## 💡 Cheat Sheet

```javascript
// En consola del navegador (después de login)

// Ver datos en cache
Storage.getCachedResource('clientes')

// Crear cliente
await API.create('clientes', {
  name: 'Nuevo Cliente',
  phone: '555555555',
  createdAt: new Date().toISOString()
})

// Obtener uno
await API.getOne('clientes', 1)

// Actualizar
await API.update('clientes', 1, { phone: '666666666' })

// Eliminar
await API.delete('clientes', 1)

// Ver status de WhatsApp
await API.fetch('/whatsapp.php?action=status')
```

---

## 📊 Verificación Rápida

```bash
# 1. BD existe
ls "%APPDATA%\MotoFlowPro\taller.db"

# 2. Tablas creadas
sqlite3 "%APPDATA%\MotoFlowPro\taller.db" ".tables"

# 3. API responde
curl http://localhost:8000/api/sync.php

# 4. Frontend carga
curl http://localhost:8000
```

---

## ✨ ¡Listo!

La migración está completada. Solo ejecuta los servidores y comienza a usar MotoFlow Pro con la nueva arquitectura PHP + SQLite.

**Próximo:** Leer [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) para testing completo.
