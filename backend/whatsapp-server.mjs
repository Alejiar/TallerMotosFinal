/**
 * MotoFlow Pro - WhatsApp Server (Express)
 * Ejecuta en puerto 8001 independientemente
 * Usa Baileys + Cola de mensajes en SQLite
 */

import express from 'express';
import cors from 'cors';
import { initWhatsApp, getStatus as waGetStatus, sendMessage as waSend, disconnect as waDisconnect } from './whatsapp-service.mjs';

const app = express();
const PORT = 8001;

app.use(cors());
app.use(express.json());

// GET estado
const handleStatus = (req, res) => {
  const s = waGetStatus();
  // Mantener compatibilidad: el frontend espera "state"
  res.json({ state: s.status, qr: s.qr, status: s.status });
};
app.get('/api/whatsapp/status', handleStatus);
app.get('/api/status', handleStatus);

// POST inicializar
const handleInit = async (req, res) => {
  try {
    console.log('[WA API] POST /init');
    await initWhatsApp();
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA API] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
app.post('/api/whatsapp/init', handleInit);
app.post('/api/init', handleInit);

// POST enviar mensaje
const handleSend = async (req, res) => {
  const { phone, message } = req.body;
  try {
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone y message requeridos' });
    }
    console.log('[WA API] POST /send ->', phone);
    await waSend(phone, message);
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA API] Error:', e.message);
    res.status(400).json({ error: e.message });
  }
};
app.post('/api/whatsapp/send', handleSend);
app.post('/api/send', handleSend);

// POST desconectar
const handleDisconnect = async (req, res) => {
  try {
    console.log('[WA API] POST /disconnect');
    await waDisconnect();
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA API] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
app.post('/api/whatsapp/disconnect', handleDisconnect);
app.post('/api/disconnect', handleDisconnect);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp', port: PORT });
});

export async function startWAServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[WA Server] Iniciado en http://0.0.0.0:${port}`);
      // Auto-iniciar WhatsApp al arrancar el servicio.
      // El reintento de reconexión vive dentro del close handler de whatsapp-service.mjs
      // para evitar carreras de dos sockets simultáneos.
      initWhatsApp().catch(e => console.error('[WA Server] Auto-init falló:', e.message));
      resolve(server);
    });
    server.on('error', (error) => {
      if (error.code !== 'EADDRINUSE') console.error('[WA Server] Error:', error.message);
      reject(error);
    });
  });
}

// Si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  startWAServer().catch(console.error);
}

export default startWAServer;
