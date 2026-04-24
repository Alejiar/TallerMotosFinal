import qrcode from "qrcode";
import path from "path";
import os from "os";
import express from "express";
import cors from "cors";

let sock = null;
let qrDataUrl = null;
let waStatus = "disconnected";
let lastError = null;
let shouldReconnect = false;
let pollInterval = null;

const SESSION_PATH = process.env.APPDATA
  ? path.join(process.env.APPDATA, "MotoFlowPro", "wa_auth")
  : path.join(os.homedir(), ".motoflowpro", "wa_auth");

const PHP_BASE = "http://127.0.0.1:8000";
const WA_SECRET = "wa_internal_2025";

const logger = {
  level: "silent",
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return this; },
};

async function connect() {
  try {
    const mod = await import("@whiskeysockets/baileys");
    const makeWASocket = mod.default;
    const { useMultiFileAuthState } = mod;

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["MotoFlow Pro", "Desktop", "1.0.0"],
      connectTimeoutMs: 30000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          qrDataUrl = await qrcode.toDataURL(qr);
          waStatus = "qr";
          lastError = null;
          console.log("[WA] QR listo");
        } catch (e) {
          lastError = "Error generando QR: " + e.message;
          console.error("[WA]", lastError);
        }
      }

      if (connection === "open") {
        waStatus = "connected";
        qrDataUrl = null;
        lastError = null;
        console.log("[WA] Conectado");
        startPolling();
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === 401;
        waStatus = "disconnected";
        qrDataUrl = null;
        sock = null;
        stopPolling();
        console.log("[WA] Desconectado, código:", code);
        if (loggedOut) lastError = "Sesión cerrada. Vuelve a conectar.";
        if (!loggedOut && shouldReconnect) setTimeout(connect, 30000);
      }
    });
  } catch (e) {
    console.error("[WA] Error al conectar:", e.message);
    lastError = e.message;
    waStatus = "disconnected";
    if (shouldReconnect) setTimeout(connect, 30000);
  }
}

async function sendWhatsApp(phone, message) {
  if (waStatus !== "connected" || !sock) throw new Error("WhatsApp no conectado");
  const number = "57" + phone.replace(/\D/g, "");
  await sock.sendMessage(number + "@s.whatsapp.net", { text: message });
}

async function pollPending() {
  try {
    const res = await fetch(`${PHP_BASE}/php/whatsapp.php?action=pendientes&secret=${WA_SECRET}`);
    if (!res.ok) return;
    const pending = await res.json();
    if (!Array.isArray(pending)) return;

    for (const msg of pending) {
      try {
        await sendWhatsApp(msg.telefono, msg.mensaje);
        await fetch(`${PHP_BASE}/php/whatsapp.php?action=log_enviado&secret=${WA_SECRET}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: msg.id, estado: "enviado" }),
        });
        console.log("[WA] Enviado a", msg.telefono);
      } catch (e) {
        await fetch(`${PHP_BASE}/php/whatsapp.php?action=log_enviado&secret=${WA_SECRET}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: msg.id, estado: "error", error: e.message }),
        }).catch(() => {});
        console.error("[WA] Error enviando a", msg.telefono, ":", e.message);
      }
    }
  } catch (e) {
    // PHP puede no estar listo aún, ignorar silenciosamente
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(pollPending, 30000);
  // Primer poll inmediato
  pollPending();
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

export async function initWhatsApp() {
  if (sock && waStatus !== "disconnected") return;
  waStatus = "loading";
  lastError = null;
  shouldReconnect = true;
  await connect();
}

export function getStatus() {
  return { state: waStatus, qr: qrDataUrl, error: lastError };
}

export async function disconnect() {
  shouldReconnect = false;
  stopPolling();
  if (sock) {
    try { await sock.logout(); } catch {}
    sock = null;
  }
  waStatus = "disconnected";
  qrDataUrl = null;
}

// Express server en puerto 8001
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/status", (_req, res) => res.json(getStatus()));

app.post("/api/init", async (_req, res) => {
  try {
    await initWhatsApp();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/disconnect", async (_req, res) => {
  try { await disconnect(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/send", async (req, res) => {
  const { phone, message } = req.body ?? {};
  try {
    await sendWhatsApp(phone, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export function startWAServer(port = 8001) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`[WA] Servicio WhatsApp en http://127.0.0.1:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
