const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const DEV_URL = "http://localhost:5173";
const BACKEND_PORT = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3000;

async function startBackend() {
  try {
    const serverModule = await import(pathToFileURL(path.join(__dirname, "../backend/server.mjs")).href);
    if (typeof serverModule.startServer === "function") {
      await serverModule.startServer(BACKEND_PORT);
    }
  } catch (error) {
    console.error("No se pudo iniciar el backend:", error);
  }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const loadUrl = app.isPackaged
    ? `file://${path.join(__dirname, "../dist/index.html")}`
    : DEV_URL;

  console.log(`[Electron] Loading URL: ${loadUrl}`);
  console.log(`[Electron] Is packaged: ${app.isPackaged}`);
  console.log(`[Electron] __dirname: ${__dirname}`);

  mainWindow.loadURL(loadUrl);

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  mainWindow.webContents.on("crashed", () => {
    console.error("[Electron] Renderer process crashed");
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    app.quit();
  });
}

ipcMain.handle("api-request", async (_event, request) => {
  const { method, path: requestPath, body, headers } = request;
  const targetUrl = `http://localhost:${BACKEND_PORT}${requestPath}`;

  try {
    const response = await fetch(targetUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      return { error: data || `Error ${response.status}` };
    }

    return data;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});

app.whenReady().then(async () => {
  await startBackend();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
