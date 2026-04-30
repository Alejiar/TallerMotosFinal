import qrcode from "qrcode";
import path from "path";
import os from "os";
import fs from "fs";

const DATA_DIR = process.env.MOTOFLOW_DATA_DIR
  || path.join(process.env.APPDATA || os.homedir(), "MotoFlowPro");
const LOG_PATH = path.join(DATA_DIR, "wa.log");
function logLine(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
  console.log(msg);
}

const SESSION_PATH = path.join(DATA_DIR, "wa_auth");
const MAX_QR_FAILURES = 3;

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
let qrFailureCount = 0;   // QRs caducados consecutivos (408)
let connectionReadyAt = 0; // timestamp en ms cuando la conexión quedó lista para enviar
const sentMessageStore = new Map(); // jid|id → contenido (para retry de Baileys)

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
      browser: ["MotoFlow Pro", "Chrome", "124"],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      // Retorna el mensaje cacheado para que el receptor pueda re-descifrar.
      // Sin esto los mensajes quedan en "esperando mensaje".
      getMessage: async (key) => {
        const cacheKey = `${key.remoteJid}|${key.id}`;
        const cached = sentMessageStore.get(cacheKey);
        if (cached) return cached;
        // Fallback: texto vacío (mejor que undefined)
        return { conversation: '' };
      },
      // Permite que el socket parchee mensajes antes de enviarlos
      // para mejorar la compatibilidad con sesiones nuevas.
      patchMessageBeforeSending: (msg) => {
        const hasButton = !!(
          msg.buttonsMessage ||
          msg.templateMessage ||
          msg.listMessage
        );
        if (hasButton) {
          msg = {
            viewOnceMessage: {
              message: { messageContextInfo: { deviceListMetadataVersion: 2 }, ...msg },
            },
          };
        }
        return msg;
      },
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
        qrFailureCount = 0;
        connectionReadyAt = Date.now();
        logLine("[WA] ✓ Conectado");
        // Marcar disponible para que las pre-keys se sincronicen y los receptores puedan descifrar.
        try { mySock.sendPresenceUpdate?.('available'); } catch {}
      }

      if (connection === "close") {
        const isLoggedOut = code === 401 || code === 403;
        const isQrTimeout = code === 408;
        logLine(`[WA gen=${myGen}] CLOSE code=${code} loggedOut=${isLoggedOut}`);
        // invalidar este socket
        connectGen++;
        sock = null;
        qrDataUrl = null;

        if (isLoggedOut) {
          try {
            fs.rmSync(SESSION_PATH, { recursive: true, force: true });
            logLine("[WA] Sesión borrada por logout");
          } catch (e) { logLine("[WA] Error borrando sesión: " + e.message); }
          shouldReconnect = false;
          waStatus = "logged_out";
          qrFailureCount = 0;
          logLine("[WA] Reconexión deshabilitada tras logout. Llama initWhatsApp() para reintentar.");
          return;
        }

        if (isQrTimeout) {
          qrFailureCount++;
          logLine(`[WA] QR caducado (${qrFailureCount}/${MAX_QR_FAILURES})`);
          if (qrFailureCount >= MAX_QR_FAILURES) {
            shouldReconnect = false;
            waStatus = "qr_timeout";
            logLine("[WA] Demasiados QR caducados. Reconexión deshabilitada hasta initWhatsApp().");
            return;
          }
        }

        waStatus = "disconnected";
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
  qrFailureCount = 0;
  await connect();
}

export function getStatus() {
  return { status: waStatus, qr: qrDataUrl };
}

export async function sendMessage(phone, message) {
  if (waStatus !== "connected" || !sock) throw new Error("WhatsApp no está conectado");
  const number = String(phone || "").replace(/\D/g, "");
  if (!number) throw new Error("Teléfono inválido");

  // Esperar al menos 3s tras conectar para que las pre-keys se propaguen.
  // Esto evita el aviso "este mensaje puede tardar un momento" en sesiones nuevas.
  const waitMs = Math.max(0, 3000 - (Date.now() - connectionReadyAt));
  if (waitMs > 0) {
    logLine(`[WA] Esperando ${waitMs}ms para estabilizar sesión...`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  const jid = `${number}@s.whatsapp.net`;

  // Verificar que el número exista en WhatsApp
  try {
    const checked = await sock.onWhatsApp(jid);
    if (Array.isArray(checked) && checked.length && checked[0].exists === false) {
      throw new Error(`Número no registrado en WhatsApp: +${number}`);
    }
  } catch (e) {
    if (e.message?.startsWith('Número no registrado')) throw e;
  }

  // Forzar handshake de sesión: suscribirse al presence del receptor
  try { await sock.presenceSubscribe(jid); } catch {}
  await new Promise(r => setTimeout(r, 300));
  try { await sock.sendPresenceUpdate('available'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}
  await new Promise(r => setTimeout(r, 500));
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  // Enviar como mensaje de texto plano para máxima compatibilidad
  const result = await sock.sendMessage(jid, { text: message });

  // Cachear para que getMessage pueda reenviar si el receptor pide retry
  if (result?.key?.id) {
    const cacheKey = `${jid}|${result.key.id}`;
    sentMessageStore.set(cacheKey, { conversation: message });
    if (sentMessageStore.size > 300) {
      const firstKey = sentMessageStore.keys().next().value;
      sentMessageStore.delete(firstKey);
    }
  }

  logLine(`[WA] ✓ Mensaje enviado a ${jid}`);
  return result;
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
