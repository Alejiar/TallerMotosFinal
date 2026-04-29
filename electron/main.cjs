const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// ── Aislamiento de datos por instancia ───────────────────────────
// Cada copia clonada del proyecto tiene su propio data/ a menos que
// MOTOFLOW_DATA_DIR esté seteado explícitamente.
const DATA_DIR = process.env.MOTOFLOW_DATA_DIR
  || path.join(__dirname, "..", "data");
process.env.MOTOFLOW_DATA_DIR = DATA_DIR;
fs.mkdirSync(DATA_DIR, { recursive: true });

// userData de Electron también dentro de DATA_DIR para que dos copias
// no compartan caché/cookies.
app.setPath("userData", path.join(DATA_DIR, "electron-userdata"));

// Solo una instancia de esta copia. (Otra carpeta con su propio
// DATA_DIR sí puede correr en paralelo.)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log("[Electron] Ya hay otra instancia corriendo en", DATA_DIR);
  app.quit();
  process.exit(0);
}

const DEFAULT_DB_PORT = Number(process.env.MOTOFLOW_DB_PORT) || 8000;
const DEFAULT_WA_PORT = Number(process.env.MOTOFLOW_WA_PORT) || 8001;

let dbServer = null;
let waServer = null;
let resolvedAppPort = DEFAULT_DB_PORT;

// Intenta arrancar un servidor; si el puerto está ocupado, prueba +1, +2... hasta 10 intentos.
async function startWithPortRetry(name, startFn, basePort) {
  let lastErr = null;
  for (let i = 0; i < 10; i++) {
    const port = basePort + i;
    try {
      const server = await startFn(port);
      if (i > 0) console.log(`[${name}] Puerto ${basePort} ocupado, usando ${port}`);
      return { server, port };
    } catch (e) {
      lastErr = e;
      if (e && e.code === "EADDRINUSE") continue;
      throw e;
    }
  }
  throw lastErr || new Error(`${name}: no se encontró puerto libre`);
}

async function startDBServer() {
  const mod = await import(pathToFileURL(path.join(__dirname, "../backend/db-server.mjs")).href);
  const { server, port } = await startWithPortRetry("DB", mod.startDBServer, DEFAULT_DB_PORT);
  dbServer = server;
  resolvedAppPort = port;
  console.log("[DB] ✓ Servidor iniciado en puerto", port);
}

async function startWAService() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, "../backend/whatsapp-server.mjs")).href);
    const { server, port } = await startWithPortRetry("WA", mod.startWAServer, DEFAULT_WA_PORT);
    waServer = server;
    console.log("[WA] ✓ Servicio iniciado en puerto", port);
  } catch (e) {
    console.error("[WA] ✗ No se pudo iniciar servicio WhatsApp:", e.message);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "MotoFlow Pro",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.loadURL(`http://127.0.0.1:${resolvedAppPort}`);
  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[Electron] Fallo al cargar ${url}: ${desc} (${code})`);
    setTimeout(() => win.loadURL(`http://127.0.0.1:${resolvedAppPort}`), 1000);
  });

  win.on("closed", () => { cleanup(); app.quit(); });
}

function cleanup() {
  if (dbServer) { dbServer.close(); dbServer = null; }
  if (waServer) { waServer.close(); waServer = null; }
}

app.on("second-instance", () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins[0]) { if (wins[0].isMinimized()) wins[0].restore(); wins[0].focus(); }
});

app.whenReady().then(async () => {
  console.log("[Electron] Iniciando MotoFlow Pro...");
  console.log("[Electron] DATA_DIR:", DATA_DIR);
  await startDBServer();
  await startWAService();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { cleanup(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", cleanup);
