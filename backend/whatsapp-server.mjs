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
app.get('/api/whatsapp/status', (req, res) => {
  const status = waGetStatus();
  res.json(status);
});

// POST inicializar
app.post('/api/whatsapp/init', async (req, res) => {
  try {
    console.log('[WA API] POST /init');
    await initWhatsApp();
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA API] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST enviar mensaje
app.post('/api/whatsapp/send', async (req, res) => {
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
});

// POST desconectar
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    console.log('[WA API] POST /disconnect');
    await waDisconnect();
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA API] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp', port: PORT });
});

export async function startWAServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[WA Server] Iniciado en http://0.0.0.0:${port}`);
      resolve(server);
    });
    server.on('error', (error) => {
      console.error('[WA Server] Error:', error.message);
      reject(error);
    });
  });
}

// Si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  startWAServer().catch(console.error);
}

export default startWAServer;
