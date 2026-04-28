# MotoFlow Pro

Sistema de gestión para taller de motos con integración a WhatsApp (Baileys), construido como app de escritorio en Electron + Express + SQLite.

## Características

- Gestión de motos, órdenes de trabajo y kanban de estados.
- Inventario, ventas, facturas, caja, proveedores, compras, empleados, garantías, notas.
- **WhatsApp integrado**: notificaciones automáticas al cliente cuando:
  - Se crea una orden (mensaje de "ingresada").
  - Cambia el estado en el kanban (`esperando_repuestos`, `reparacion`, `lista`).
  - Se finaliza una orden.
- Sesión de WhatsApp persistente (no pide QR cada vez).
- Reconexión automática si se cae.
- Formato automático de números colombianos (+57).

## Requisitos

- **Node.js 18+** ([descargar](https://nodejs.org))
- **Windows / Linux / macOS** (probado en Windows 10/11)
- Conexión a internet (para WhatsApp Web)

> No requiere MongoDB. La base de datos es SQLite y se guarda en `%APPDATA%\MotoFlowPro\taller.db` (Windows) o `~/.motoflowpro/taller.db` (Linux/Mac).

## Instalación (clonar y correr)

```bash
git clone <URL-del-repo> motoflow-pro
cd motoflow-pro
npm install
npm start
```

La app se abre, va creando la base de datos en el primer arranque y arranca el servicio de WhatsApp en segundo plano.

### Login por defecto

- Usuario: `admin`
- Contraseña: `admin`

### Conectar WhatsApp

1. Hacer login.
2. Ir al menú lateral → **WhatsApp**.
3. Esperar 2-3 segundos: aparecerá un código QR.
4. Escanearlo desde tu teléfono (WhatsApp → Dispositivos vinculados).
5. Listo. La sesión queda guardada y se reconecta sola en arranques futuros.

## Generar el .exe instalable (Windows)

```bash
npm run build:exe
```

El ejecutable queda en `dist_electron\win-unpacked\MotoFlow Pro.exe`.

## Estructura

```
motoflow-pro/
├── electron/
│   └── main.cjs              # Bootstrap de Electron (lanza db-server y wa-server)
├── backend/
│   ├── db-server.mjs         # API REST + SQLite (puerto 8000)
│   ├── whatsapp-server.mjs   # API REST WhatsApp (puerto 8001)
│   ├── whatsapp-service.mjs  # Cliente Baileys con auth state sincrono
│   └── uploads/              # Imágenes/evidencias (no versionado)
├── server/www/               # Frontend (HTML/CSS/JS vanilla)
│   ├── index.html
│   ├── script.js             # Lógica principal de UI
│   ├── styles.css
│   ├── js/
│   │   ├── pages-init.js     # Handlers por página
│   │   ├── modals-utils.js
│   │   ├── adapter.js        # Cliente HTTP del backend
│   │   └── router.js         # SPA router
│   └── sql/init.sql          # Schema de la BD
├── public/                   # Iconos
└── package.json
```

## Datos de runtime (no se versionan)

Se guardan fuera del repo, en la carpeta de usuario:

- **Windows:** `C:\Users\<usuario>\AppData\Roaming\MotoFlowPro\`
- **Linux/Mac:** `~/.motoflowpro/`

Incluye:
- `taller.db` — base de datos SQLite
- `wa_auth/` — sesión de WhatsApp (creds y keys)
- `wa.log` — log del servicio de WhatsApp

Para resetear todo (forzar nuevo QR, BD vacía), borra esa carpeta entera.

## Mensajes automáticos de WhatsApp

| Acción | Mensaje al cliente |
|---|---|
| Nueva orden creada | *"Hola {nombre}, su moto ha sido ingresada al taller."* |
| Estado → `esperando_repuestos` | *"Hola {nombre}, su moto está en espera de repuestos."* |
| Estado → `reparacion` / `reparando` | *"Hola {nombre}, su moto está siendo reparada."* |
| Estado → `lista` (o "Finalizar orden") | *"Hola {nombre}, su moto está lista para ser entregada."* |

Los teléfonos se formatean automáticamente con prefijo `+57` (Colombia).

## Resolución de problemas

**El QR no aparece o se queda en "Conectando...":**
1. Verifica conexión a internet.
2. Borra `%APPDATA%\MotoFlowPro\wa_auth\` y reinicia.
3. Revisa `%APPDATA%\MotoFlowPro\wa.log`.

**WhatsApp se desconecta tras un rato:**
- Es normal si el teléfono pierde internet o WhatsApp cierra la sesión vinculada. La app reintenta automáticamente cada pocos segundos.

**Mensaje "Servicio WhatsApp no disponible":**
- El servicio en puerto 8001 no arrancó. Cierra completamente la app (verifica Task Manager que no quede ningún proceso "MotoFlow Pro" o "Electron") y vuelve a abrir.

## Licencia

Privado.
