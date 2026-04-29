# Quick Start - MotoFlow Pro

App Electron de gestión de taller de motos. Backend Express + sql.js, integración WhatsApp con Baileys.

## Requisitos

- Node.js >= 18.18 (LTS recomendado)
- Windows / macOS / Linux

## Instalación

```bash
git clone <repo-url> motoflow-pro
cd motoflow-pro
npm install
npm start
```

La ventana de Electron abre sola. Backend (puerto 8000) y servicio WhatsApp (puerto 8001) arrancan automáticamente.

## Login por defecto

- Usuario: `admin`
- Contraseña: `admin`

Si olvidaste la contraseña, restablécela con:

```bash
npm run reset-admin
```

## Datos de la aplicación

Por defecto cada copia clonada del proyecto guarda sus datos en `./data/`:

- `data/taller.db` — base de datos SQLite
- `data/wa_auth/` — sesión de WhatsApp
- `data/wa.log` — log de WhatsApp
- `data/electron-userdata/` — caché y cookies de Electron

La carpeta `data/` está en `.gitignore` y nunca se sube al repo.

## Aislar dos copias en el mismo PC

Cada carpeta clonada ya tiene su `data/` propio. Si además quieres correr **las dos a la vez**, asigna puertos distintos a la segunda copia:

```bash
# Terminal 1 (copia A) — usa puertos por defecto 8000/8001
cd C:\TallerMotosFinal
npm start

# Terminal 2 (copia B)
cd C:\TallerMotosFinal2
set MOTOFLOW_DB_PORT=8010
set MOTOFLOW_WA_PORT=8011
npm start
```

Variables disponibles:

| Variable | Default | Uso |
|---|---|---|
| `MOTOFLOW_DATA_DIR` | `<repo>/data` | Carpeta donde se guarda DB, sesión WA, logs |
| `MOTOFLOW_DB_PORT` | `8000` | Puerto del servidor backend |
| `MOTOFLOW_WA_PORT` | `8001` | Puerto del servicio WhatsApp |
| `MOTOFLOW_RESET_ADMIN` | (no set) | Si vale `1`, restablece admin/admin al arrancar |

Si el puerto está ocupado al arrancar, la app prueba automáticamente `puerto+1`, `+2`, … hasta encontrar uno libre.

## Empaquetar instalador (.exe)

```bash
npm run build:exe
```

Salida en `dist_electron/`.

## Solución de problemas

| Problema | Solución |
|---|---|
| Login `admin/admin` no entra | `npm run reset-admin` |
| WhatsApp en bucle de QR | Tras 3 QR caducados se detiene; pulsa "Conectar" en la UI o reinicia con `npm start` |
| "Puerto en uso" | La app retrocede a `puerto+N`; o exporta `MOTOFLOW_DB_PORT` / `MOTOFLOW_WA_PORT` |
| Reset total | Borra la carpeta `data/` y vuelve a iniciar |
