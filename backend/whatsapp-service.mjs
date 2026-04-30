/**
 * whatsapp-service.mjs
 * Manejo de conexión WhatsApp via Baileys (multi-device).
 *
 * FIX PRINCIPAL "Esperando el mensaje":
 *  - getMessage devuelve result.message (proto completo), no { conversation: text }
 *  - messages.upsert llena el cache para mensajes recibidos también
 *  - Detección y limpieza automática de sesiones dañadas
 *  - saveCreds síncrono para no perder estado en Windows
 */

import qrcode from "qrcode";
import path from "path";
import os from "os";
import fs from "fs";

// ── Rutas ──────────────────────────────────────────────────────────
const DATA_DIR = process.env.MOTOFLOW_DATA_DIR
  || path.join(process.env.APPDATA || os.homedir(), "MotoFlowPro");
const LOG_PATH    = path.join(DATA_DIR, "wa.log");
const SESSION_PATH = path.join(DATA_DIR, "wa_auth");

// ── Logger ─────────────────────────────────────────────────────────
function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch {}
}

// Logger silencioso para Baileys (evita spam en consola)
const baileysLogger = {
  level: "silent",
  trace: () => {}, debug: () => {}, info: () => {},
  warn:  () => {}, error: () => {}, fatal: () => {},
  child() { return this; },
};

// ── Estado del módulo ──────────────────────────────────────────────
let sock            = null;
let qrDataUrl       = null;
let waStatus        = "disconnected"; // disconnected|loading|qr|connected|logged_out|qr_timeout
let shouldReconnect = false;
let reconnectTimer  = null;
let connectGen      = 0;
let connectInFlight = false;
let qrFailureCount  = 0;
let connectionReadyAt = 0;

// Cache de mensajes para el callback getMessage.
// Clave: "${remoteJid}|${id}"  →  Valor: proto message object (result.message)
const msgStore = new Map();
const MSG_STORE_MAX = 500;

function cacheMsgStore(jid, id, protoMsg) {
  if (!jid || !id || !protoMsg) return;
  msgStore.set(`${jid}|${id}`, protoMsg);
  if (msgStore.size > MSG_STORE_MAX) {
    msgStore.delete(msgStore.keys().next().value);
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function scheduleReconnect(delayMs) {
  if (reconnectTimer || !shouldReconnect) return;
  logLine(`[WA] Reconexión en ${delayMs}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldReconnect) connect().catch(e => logLine("[WA] Reconexión falló: " + e.message));
  }, delayMs);
}

function killSocket(s) {
  if (!s) return;
  try { s.ev?.removeAllListeners?.(); } catch {}
  try { s.end?.(undefined);           } catch {}
  try { s.ws?.close?.();              } catch {}
}

function clearSession(reason = "manual") {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      logLine(`[WA] Sesión eliminada (${reason}) — se pedirá nuevo QR`);
    }
  } catch (e) { logLine("[WA] Error limpiando sesión: " + e.message); }
}

function isCorruptionError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('decrypt') || msg.includes('bad mac') ||
         msg.includes('bad_mac')  || msg.includes('crypto')  ||
         msg.includes('session closed') || msg.includes('closed session') ||
         msg.includes('noise_') || msg.includes('invalid handshake');
}

// ── Auth state con writeFileSync (seguro en Windows) ───────────────
function buildAuthState(mod) {
  const { initAuthCreds, BufferJSON, WAProto } = mod;
  const proto = WAProto || mod.proto;

  fs.mkdirSync(SESSION_PATH, { recursive: true });

  const fileFor = id =>
    path.join(SESSION_PATH, `${id.replace(/[^a-zA-Z0-9_\-]/g, '_')}.json`);

  const readData = id => {
    try {
      const f = fileFor(id);
      if (!fs.existsSync(f)) return null;
      return JSON.parse(fs.readFileSync(f, 'utf-8'), BufferJSON.reviver);
    } catch (e) {
      logLine(`[WA Auth] read ${id} err: ${e.message}`);
      return null;
    }
  };

  const writeData = (id, data) => {
    try {
      fs.writeFileSync(fileFor(id), JSON.stringify(data, BufferJSON.replacer, 2));
    } catch (e) { logLine(`[WA Auth] write ${id} err: ${e.message}`); }
  };

  const removeData = id => {
    try { const f = fileFor(id); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  };

  const creds = readData('creds') || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: (type, ids) => {
        const out = {};
        for (const id of ids) {
          let v = readData(`${type}-${id}`);
          if (type === 'app-state-sync-key' && v && proto?.Message?.AppStateSyncKeyData) {
            try { v = proto.Message.AppStateSyncKeyData.fromObject(v); } catch {}
          }
          out[id] = v;
        }
        return out;
      },
      set: data => {
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

  // saveCreds síncrono — no pierde datos si el proceso muere en Windows
  const saveCreds = () => writeData('creds', state.creds);

  return { state, saveCreds };
}

// ── Conexión principal ─────────────────────────────────────────────
async function connect() {
  if (connectInFlight) { logLine("[WA] connect() ya en progreso"); return; }
  connectInFlight = true;
  const myGen = ++connectGen;
  logLine(`[WA] connect() gen=${myGen}`);

  killSocket(sock);
  sock = null;

  try {
    const mod = await import("@whiskeysockets/baileys");

    const makeWASocket = typeof mod.makeWASocket === 'function'
      ? mod.makeWASocket
      : (typeof mod.default === 'function' ? mod.default : null);

    if (typeof makeWASocket !== 'function') throw new Error('makeWASocket no encontrado en Baileys');

    const { fetchLatestBaileysVersion } = mod;

    // Verificar integridad básica de la sesión antes de cargar
    if (fs.existsSync(SESSION_PATH)) {
      const files = fs.readdirSync(SESSION_PATH);
      logLine(`[WA] Sesión existente: ${files.length} archivos`);
      const hasCreds = files.some(f => f.startsWith('creds'));
      if (!hasCreds && files.length > 0) {
        logLine("[WA] Sesión sin credenciales, limpiando...");
        clearSession("sin creds");
      }
    }

    const { state, saveCreds } = buildAuthState(mod);
    logLine(`[WA] registered=${state.creds.registered} me=${state.creds.me?.id || 'null'}`);

    let version;
    try {
      version = (await fetchLatestBaileysVersion()).version;
      logLine(`[WA] Versión Baileys: ${version?.join?.('.')}`);
    } catch (e) {
      logLine("[WA] No se pudo obtener versión WA: " + e.message);
    }

    const mySock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      browser: ["MotoFlow Pro", "Chrome", "124.0.6367.207"],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      // FIX CLAVE: devuelve el proto message completo para reenvío.
      // Si retorna undefined/vacío → WhatsApp muestra "esperando mensaje".
      getMessage: async key => {
        const k = `${key.remoteJid}|${key.id}`;
        const cached = msgStore.get(k);
        if (cached) return cached;
        // Sin caché: retornar undefined deja que Baileys maneje el retry
        // internamente (mejor que enviar vacío que causa el aviso).
        return undefined;
      },
    });

    sock = mySock;
    waStatus = "loading";

    // ── Guardar credenciales en cada actualización ─────────────────
    mySock.ev.on("creds.update", () => {
      if (myGen !== connectGen) return;
      try { saveCreds(); } catch (e) { logLine("[WA] saveCreds error: " + e.message); }
    });

    // ── Cache de mensajes enviados y recibidos ─────────────────────
    mySock.ev.on("messages.upsert", ({ messages, type }) => {
      if (myGen !== connectGen) return;
      for (const msg of messages) {
        if (!msg.key?.id || !msg.message) continue;
        cacheMsgStore(msg.key.remoteJid, msg.key.id, msg.message);
      }
    });

    // ── Estado de conexión ─────────────────────────────────────────
    mySock.ev.on("connection.update", update => {
      if (myGen !== connectGen) {
        logLine(`[WA] gen=${myGen} stale → descartando`);
        return;
      }

      const { connection, lastDisconnect, qr } = update;
      const code = lastDisconnect?.error?.output?.statusCode;
      const errMsg = lastDisconnect?.error?.message || '';

      logLine(`[WA gen=${myGen}] conn=${connection||'-'} qr=${!!qr} code=${code||''} ${errMsg}`);

      if (qr) {
        qrcode.toDataURL(qr)
          .then(url => {
            if (myGen !== connectGen) return;
            qrDataUrl = url;
            waStatus = "qr";
            logLine("[WA] ✓ QR disponible");
          })
          .catch(e => logLine("[WA] Error generando QR: " + e.message));
      }

      if (connection === "open") {
        waStatus = "connected";
        qrDataUrl = null;
        qrFailureCount = 0;
        connectionReadyAt = Date.now();
        logLine("[WA] ✓ Conectado y listo");
        // Marcar disponible para distribuir pre-keys al teléfono propio
        setTimeout(() => {
          try { mySock.sendPresenceUpdate?.('available'); } catch {}
        }, 1000);
      }

      if (connection === "close") {
        connectGen++;
        sock = null;
        qrDataUrl = null;

        const isLoggedOut  = code === 401 || code === 403;
        const isQrTimeout  = code === 408;
        const isConflict   = code === 440;

        logLine(`[WA] CLOSE code=${code} loggedOut=${isLoggedOut} conflict=${isConflict}`);

        // Sesión inválida / logout remoto
        if (isLoggedOut) {
          clearSession("logout");
          shouldReconnect = false;
          waStatus = "logged_out";
          return;
        }

        // Error de cifrado en el mensaje de cierre
        if (isCorruptionError(lastDisconnect?.error)) {
          logLine("[WA] Error de cifrado en desconexión, limpiando sesión...");
          clearSession("corruption on close");
          waStatus = "disconnected";
          if (shouldReconnect) scheduleReconnect(3000);
          return;
        }

        // Conflicto (otro cliente abrió sesión)
        if (isConflict) {
          logLine("[WA] Conflicto de sesión — esperando antes de reconectar");
          waStatus = "disconnected";
          if (shouldReconnect) scheduleReconnect(8000);
          return;
        }

        // QR caducó sin ser escaneado
        if (isQrTimeout) {
          qrFailureCount++;
          logLine(`[WA] QR caducado ${qrFailureCount}/3`);
          if (qrFailureCount >= 3) {
            shouldReconnect = false;
            waStatus = "qr_timeout";
            return;
          }
        }

        waStatus = "disconnected";
        if (shouldReconnect) {
          scheduleReconnect(code === 515 ? 1000 : 3000);
        }
      }
    });

  } catch (e) {
    logLine("[WA] connect() falló: " + e.message);

    // Auto-reparar sesión si el error es de cifrado
    if (isCorruptionError(e)) {
      logLine("[WA] Error de cifrado al conectar — limpiando sesión automáticamente");
      clearSession("corruption on connect");
    }

    waStatus = "disconnected";
    if (shouldReconnect) scheduleReconnect(5000);
    // No relanzar — el caller no debe crashear por esto
  } finally {
    connectInFlight = false;
  }
}

// ── API pública ────────────────────────────────────────────────────

export async function initWhatsApp() {
  if (waStatus === "connected" && sock) { logLine("[WA] Ya conectado"); return; }
  if (connectInFlight) { logLine("[WA] init: connect ya en curso"); return; }
  shouldReconnect = true;
  qrFailureCount  = 0;
  await connect();
}

export function getStatus() {
  return { status: waStatus, qr: qrDataUrl };
}

export async function sendMessage(phone, message) {
  if (waStatus !== "connected" || !sock) throw new Error("WhatsApp no está conectado");

  const number = String(phone || "").replace(/\D/g, "");
  if (!number) throw new Error("Teléfono inválido");
  if (!message?.trim()) throw new Error("Mensaje vacío");

  // Espera mínima tras reconectar para que las pre-keys se propaguen al teléfono.
  // 2s es suficiente para sesiones establecidas; solo aplica en los primeros 2s.
  const elapsed = Date.now() - connectionReadyAt;
  if (elapsed < 2000) {
    const wait = 2000 - elapsed;
    logLine(`[WA] Esperando ${wait}ms por estabilización de sesión`);
    await new Promise(r => setTimeout(r, wait));
  }

  const jid = `${number}@s.whatsapp.net`;

  // Verificar que el número existe en WhatsApp (opcional, puede fallar en redes lentas)
  try {
    const [info] = await Promise.race([
      sock.onWhatsApp(jid),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (info?.exists === false) {
      throw new Error(`Número no registrado en WhatsApp: +${number}`);
    }
  } catch (e) {
    if (e.message?.includes('registrado')) throw e;
    // Ignorar otros errores de verificación (red lenta, etc.)
    logLine(`[WA] Verificación de número omitida: ${e.message}`);
  }

  // Enviar mensaje de texto plano
  const result = await sock.sendMessage(jid, { text: message });

  // FIX CLAVE: guardar result.message (proto completo) en el cache.
  // Cuando el receptor o el propio teléfono pidan retry, getMessage devolverá
  // el proto correcto y WhatsApp NO mostrará "esperando mensaje".
  if (result?.key?.id && result?.message) {
    cacheMsgStore(jid, result.key.id, result.message);
  }

  logLine(`[WA] ✓ Enviado a +${number} | id=${result?.key?.id}`);
  return result;
}

export async function resetSession() {
  logLine("[WA] Reset de sesión solicitado");
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  connectGen++;
  killSocket(sock);
  sock = null;
  waStatus = "disconnected";
  qrDataUrl = null;
  clearSession("manual reset");
}

export async function disconnect() {
  logLine("[WA] Desconexión manual");
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
}
