const { app, BrowserWindow } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const APP_PORT = 8000;
const WA_PORT = 8001;

let dbServer = null;
let waServer = null;

async function startDBServer() {
  const mod = await import(pathToFileURL(path.join(__dirname, "../backend/db-server.mjs")).href);
  dbServer = await mod.startDBServer(APP_PORT);
  console.log("[DB] ✓ Servidor iniciado en puerto", APP_PORT);
}

async function startWAService() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, "../backend/whatsapp-server.mjs")).href);
    waServer = await mod.startWAServer(WA_PORT);
    console.log("[WA] ✓ Servicio iniciado en puerto", WA_PORT);
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

  win.loadURL(`http://127.0.0.1:${APP_PORT}`);
  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[Electron] Fallo al cargar ${url}: ${desc} (${code})`);
    setTimeout(() => win.loadURL(`http://127.0.0.1:${APP_PORT}`), 1000);
  });

  win.on("closed", () => { cleanup(); app.quit(); });
}

function cleanup() {
  if (dbServer) { dbServer.close(); dbServer = null; }
  if (waServer) { waServer.close(); waServer = null; }
}

app.whenReady().then(async () => {
  console.log("[Electron] Iniciando MotoFlow Pro...");
  await startDBServer();
  await startWAService();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { cleanup(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", cleanup);
