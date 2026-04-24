import qrcode from "qrcode";
import path from "path";
import os from "os";

let sock = null;
let qrDataUrl = null;
let waStatus = "disconnected"; // disconnected | loading | qr | connected
let shouldReconnect = false;
let connectionTimeout = null;
let qrWaitTimeout = null;

const SESSION_PATH = process.env.APPDATA
  ? path.join(process.env.APPDATA, "MotoFlowPro", "wa_auth")
  : path.join(os.homedir(), ".motoflowpro", "wa_auth");

const logger = {
  level: "silent",
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return this; },
};

async function connect() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("[WA] Importando Baileys...");
      const mod = await import("@whiskeysockets/baileys");
      const makeWASocket = mod.default;
      const { useMultiFileAuthState } = mod;

      console.log("[WA] Cargando estado de autenticación desde:", SESSION_PATH);
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

      console.log("[WA] Creando socket de WhatsApp...");
      sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ["MotoFlow Pro", "Desktop", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
      });

      let connectionEstablished = false;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        console.log("[WA] Actualización de conexión:", {
          connection,
          qrPresent: !!qr,
          isNewLogin,
          status: waStatus
        });

        // Evento QR
        if (qr) {
          try {
            console.log("[WA] Generando Data URL del QR...");
            qrDataUrl = await qrcode.toDataURL(qr);
            waStatus = "qr";
            connectionEstablished = true;
            clearTimeout(qrWaitTimeout);
            console.log("[WA] ✓ QR generado y listo para escanear");
            resolve();
          } catch (e) {
            console.error("[WA] ✗ Error al generar QR:", e.message);
            reject(new Error("No se pudo generar el código QR: " + e.message));
          }
        }

        // Conexión establecida
        if (connection === "open") {
          connectionEstablished = true;
          waStatus = "connected";
          qrDataUrl = null;
          clearTimeout(qrWaitTimeout);
          clearTimeout(connectionTimeout);
          console.log("[WA] ✓ Conectado exitosamente a WhatsApp");
          resolve();
        }

        // Desconexión
        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = code === 401;
          
          console.log("[WA] Desconexión detectada:", { code, isLoggedOut });
          
          waStatus = "disconnected";
          qrDataUrl = null;
          sock = null;
          
          clearTimeout(qrWaitTimeout);
          clearTimeout(connectionTimeout);

          if (!isLoggedOut && shouldReconnect) {
            console.log("[WA] Reintentando conexión en 3 segundos...");
            setTimeout(() => {
              if (shouldReconnect) {
                connect().catch(e => console.error("[WA] Reconexión falló:", e));
              }
            }, 3000);
          }
        }
      });

      // Timeout: Si no recibe QR en 45 segundos
      qrWaitTimeout = setTimeout(() => {
        if (waStatus === "loading" || (waStatus === "qr" && !qrDataUrl)) {
          console.warn("[WA] ✗ Timeout: No se generó QR en 45 segundos");
          clearTimeout(connectionTimeout);
          if (sock) {
            try { sock.end(); } catch {}
            sock = null;
          }
          reject(new Error("Timeout al generar QR (45s). Verifica tu conexión a internet."));
        }
      }, 45000);

    } catch (e) {
      console.error("[WA] ✗ Error fatal en connect():", e.message);
      clearTimeout(qrWaitTimeout);
      reject(e);
    }
  });
}

export async function initWhatsApp() {
  // Si ya está en proceso de conexión, no reintentar
  if (waStatus === "loading") {
    console.log("[WA] Ya hay una conexión en progreso");
    return;
  }
  
  // Si ya está conectado, no reconectar
  if (sock && waStatus === "connected") {
    console.log("[WA] Ya está conectado");
    return;
  }

  waStatus = "loading";
  shouldReconnect = true; // SIEMPRE mantener conexión activa
  
  try {
    console.log("[WA] Iniciando WhatsApp con Baileys...");
    await connect();
    console.log("[WA] Iniciación completada");
  } catch (e) {
    waStatus = "disconnected";
    qrDataUrl = null;
    // NO desactivar shouldReconnect - mantener intentando reconectar
    console.error("[WA] ✗ Error en initWhatsApp:", e.message);
    throw new Error("No se pudo iniciar WhatsApp: " + e.message);
  }
}

export function getStatus() {
  const status = { status: waStatus, qr: qrDataUrl };
  console.log("[WA] Status solicitado:", status.status, "QR:", !!status.qr);
  return status;
}

export async function sendMessage(phone, message) {
  if (waStatus !== "connected" || !sock) {
    throw new Error("WhatsApp no está conectado");
  }
  const number = phone.replace(/\D/g, "");
  await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
}

export async function disconnect() {
  console.log("[WA] Desconectando...");
  shouldReconnect = false;
  clearTimeout(connectionTimeout);
  clearTimeout(qrWaitTimeout);
  
  if (sock) {
    try { 
      await sock.logout();
      console.log("[WA] Logout exitoso");
    } catch (e) {
      console.error("[WA] Error en logout:", e.message);
    }
    sock = null;
  }
  
  waStatus = "disconnected";
  qrDataUrl = null;
  console.log("[WA] Desconectado");
}
