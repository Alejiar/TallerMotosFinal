import qrcode from "qrcode";
import path from "path";
import os from "os";
import fs from "fs";

const LOG_PATH = path.join(process.env.APPDATA || os.homedir(), "MotoFlowPro", "wa.log");
function logLine(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
  console.log(msg);
}

const SESSION_PATH = process.env.APPDATA
  ? path.join(process.env.APPDATA, "MotoFlowPro", "wa_auth")
  : path.join(os.homedir(), ".motoflowpro", "wa_auth");

const logger = {
  level: "silent",
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return this; },
};

let sock = null;
let qrDataUrl = null;
let waStatus = "disconnected"; // disconnected | loading | qr | connected
let shouldReconnect = false;
let reconnectTimer = null;
let connectGen = 0;       // identifica al socket activo; descartamos eventos de generaciones viejas
let connectInFlight = false;

function scheduleReconnect(delayMs) {
  if (reconnectTimer) return; // ya hay uno programado
  if (!shouldReconnect) return;
  logLine(`[WA] Reconexión programada en ${delayMs}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!shouldReconnect) return;
    connect().catch(e => logLine("[WA] Reconexión falló: " + e.message));
  }, delayMs);
}

function killSocket(s) {
  if (!s) return;
  try { s.ev?.removeAllListeners?.(); } catch {}
  try { s.end?.(undefined); } catch {}
  try { s.ws?.close?.(); } catch {}
}

async function connect() {
  if (connectInFlight) {
    logLine("[WA] connect() ya en progreso, ignorando");
    return;
  }
  connectInFlight = true;
  const myGen = ++connectGen;
  logLine(`[WA] connect() iniciando gen=${myGen}`);

  // matar cualquier socket previo antes de crear uno nuevo
  if (sock) {
    logLine("[WA] Cerrando socket previo antes de reconectar");
    killSocket(sock);
    sock = null;
  }

  try {
    const mod = await import("@whiskeysockets/baileys");
    const makeWASocket = (typeof mod.makeWASocket === 'function')
      ? mod.makeWASocket
      : (typeof mod.default === 'function' ? mod.default : null);
    const { fetchLatestBaileysVersion, initAuthCreds, BufferJSON, WAProto } = mod;
    const proto = WAProto || mod.default?.proto;
    if (typeof makeWASocket !== 'function') throw new Error('makeWASocket no encontrado');

    logLine("[WA] Cargando estado desde: " + SESSION_PATH);
    try {
      const files = fs.existsSync(SESSION_PATH) ? fs.readdirSync(SESSION_PATH) : [];
      logLine(`[WA] Archivos en wa_auth (${files.length}): ${files.slice(0, 20).join(', ')}`);
    } catch (e) { logLine("[WA] Error listando wa_auth: " + e.message); }

    // Auth state SINCRONO (writeFileSync) — sin esto Windows pierde los archivos al matar el proceso
    fs.mkdirSync(SESSION_PATH, { recursive: true });
    const fileFor = (id) => path.join(SESSION_PATH, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    const readData = (id) => {
      try {
        const f = fileFor(id);
        if (!fs.existsSync(f)) return null;
        return JSON.parse(fs.readFileSync(f, 'utf-8'), BufferJSON.reviver);
      } catch (e) { logLine(`[WA] read ${id} err: ${e.message}`); return null; }
    };
    const writeData = (id, data) => {
      try {
        fs.writeFileSync(fileFor(id), JSON.stringify(data, BufferJSON.replacer, 2));
      } catch (e) { logLine(`[WA] write ${id} err: ${e.message}`); }
    };
    const removeData = (id) => { try { const f = fileFor(id); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} };

    const creds = readData('creds') || initAuthCreds();
    const state = {
      creds,
      keys: {
        get: (type, ids) => {
          const out = {};
          for (const id of ids) {
            let v = readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }
          return out;
        },
        set: (data) => {
          for (const cat in data) {
            for (const id in data[cat]) {
              const val = data[cat][id];
              if (val) writeData(`${cat}-${id}`, val);
              else removeData(`${cat}-${id}`);
            }
          }
        },
      },
    };
    const saveCreds = () => writeData('creds', state.creds);
    logLine(`[WA] State: registered=${state?.creds?.registered} me=${state?.creds?.me?.id || 'null'} hasNoiseKey=${!!state?.creds?.noiseKey}`);

    let version;
    try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {
      logLine("[WA] No se pudo obtener versión: " + e.message);
    }

    const mySock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ["Chrome (Linux)", "", ""],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    sock = mySock;
    waStatus = "loading";

    mySock.ev.on("creds.update", async () => {
      if (myGen !== connectGen) return;
      try { await saveCreds(); } catch (e) { logLine("[WA] saveCreds error: " + e.message); }
    });

    mySock.ev.on("connection.update", (update) => {
      // Ignora eventos de sockets viejos
      if (myGen !== connectGen) {
        logLine(`[WA] (gen=${myGen} stale, actual=${connectGen}) descartando evento ${update.connection}`);
        return;
      }
      const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;
      const code = lastDisconnect?.error?.output?.statusCode;
      logLine(`[WA gen=${myGen}] update: conn=${connection} qr=${!!qr} newLogin=${!!isNewLogin} pending=${!!receivedPendingNotifications} code=${code || ''} ${lastDisconnect?.error?.message || ''}`);

      if (qr) {
        qrcode.toDataURL(qr).then(url => {
          if (myGen !== connectGen) return;
          qrDataUrl = url;
          waStatus = "qr";
          logLine("[WA] ✓ QR disponible");
        }).catch(e => logLine("[WA] Error generando QR: " + e.message));
      }

      if (connection === "open") {
        waStatus = "connected";
        qrDataUrl = null;
        logLine("[WA] ✓ Conectado");
      }

      if (connection === "close") {
        const isLoggedOut = code === 401 || code === 403;
        logLine(`[WA gen=${myGen}] CLOSE code=${code} loggedOut=${isLoggedOut}`);
        // invalidar este socket
        connectGen++;
        sock = null;
        waStatus = "disconnected";
        qrDataUrl = null;

        if (isLoggedOut) {
          try {
            fs.rmSync(SESSION_PATH, { recursive: true, force: true });
            logLine("[WA] Sesión borrada por logout");
          } catch (e) { logLine("[WA] Error borrando sesión: " + e.message); }
        }

        if (shouldReconnect) {
          const delay = code === 515 ? 1000 : 3000;
          scheduleReconnect(delay);
        }
      }
    });
  } catch (e) {
    logLine("[WA] connect() falló: " + e.message);
    waStatus = "disconnected";
    if (shouldReconnect) scheduleReconnect(5000);
    throw e;
  } finally {
    connectInFlight = false;
  }
}

export async function initWhatsApp() {
  if (waStatus === "connected" && sock) { logLine("[WA] Ya conectado"); return; }
  if (connectInFlight) { logLine("[WA] init: connect en curso"); return; }
  shouldReconnect = true;
  await connect();
}

export function getStatus() {
  return { status: waStatus, qr: qrDataUrl };
}

export async function sendMessage(phone, message) {
  if (waStatus !== "connected" || !sock) throw new Error("WhatsApp no está conectado");
  const number = phone.replace(/\D/g, "");
  await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
}

export async function disconnect() {
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  connectGen++;
  if (sock) {
    try { await sock.logout(); } catch {}
    killSocket(sock);
    sock = null;
  }
  waStatus = "disconnected";
  qrDataUrl = null;
  logLine("[WA] Desconectado manualmente");
}
