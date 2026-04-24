const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const PHP_EXE = path.join(__dirname, "../server/php/php.exe");
const PHP_ROOT = path.join(__dirname, "../server/www");
const PHP_PORT = 8000;
const WA_PORT = 8001;

let phpProcess = null;
let waServer = null;

async function startPHP() {
  return new Promise((resolve) => {
    phpProcess = spawn(PHP_EXE, ["-S", `0.0.0.0:${PHP_PORT}`, "-t", PHP_ROOT], {
      windowsHide: true,
      stdio: "pipe",
    });

    phpProcess.stderr.on("data", (d) => {
      const msg = d.toString();
      if (msg.includes("Development Server") || msg.includes("started")) {
        console.log("[PHP] Servidor iniciado en puerto", PHP_PORT);
        resolve();
      }
    });

    phpProcess.on("error", (e) => {
      console.error("[PHP] Error:", e.message);
      resolve();
    });

    // Resolver después de 1.5s
    setTimeout(resolve, 1500);
  });
}

async function startWAService() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, "../whatsapp-service.mjs")).href);
    waServer = await mod.startWAServer(WA_PORT);
    console.log("[WA] Servicio iniciado en puerto", WA_PORT);
  } catch (e) {
    console.error("[WA] No se pudo iniciar servicio WhatsApp:", e.message);
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

  win.loadURL(`http://localhost:${PHP_PORT}`);
  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[Electron] Fallo al cargar ${url}: ${desc} (${code})`);
    setTimeout(() => win.loadURL(`http://localhost:${PHP_PORT}`), 1000);
  });

  win.on("closed", () => { cleanup(); app.quit(); });
}

function cleanup() {
  if (phpProcess) { phpProcess.kill(); phpProcess = null; }
  if (waServer) { waServer.close(); waServer = null; }
}

app.whenReady().then(async () => {
  console.log("[Electron] Iniciando MotoFlow Pro...");
  await startPHP();
  await startWAService();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { cleanup(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", cleanup);
