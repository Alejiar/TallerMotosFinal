import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { deleteRow, getAllRows, getRowById, insertRow, updateRow, resourceConfig } from "./db.mjs";
import { initWhatsApp, getStatus as waGetStatus, sendMessage as waSend, disconnect as waDisconnect } from "./whatsapp-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDirectory = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({ dest: uploadDirectory });
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadDirectory));

const allowedResources = Object.keys(resourceConfig);

app.get("/api/sync/all", (req, res) => {
  const data = {};
  for (const resource of allowedResources) {
    data[resource] = getAllRows(resource);
  }
  res.json(data);
});

app.get("/api/:resource", (req, res) => {
  const { resource } = req.params;
  if (!allowedResources.includes(resource)) {
    return res.status(404).json({ error: "Recurso no válido" });
  }
  res.json(getAllRows(resource));
});

app.get("/api/:resource/:id", (req, res) => {
  const { resource, id } = req.params;
  if (!allowedResources.includes(resource)) {
    return res.status(404).json({ error: "Recurso no válido" });
  }
  const row = getRowById(resource, Number(id));
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

app.post("/api/:resource", (req, res) => {
  const { resource } = req.params;
  const payload = req.body;
  if (!allowedResources.includes(resource)) {
    return res.status(404).json({ error: "Recurso no válido" });
  }
  try {
    const inserted = insertRow(resource, payload);
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.patch("/api/:resource/:id", (req, res) => {
  const { resource, id } = req.params;
  const payload = req.body;
  if (!allowedResources.includes(resource)) {
    return res.status(404).json({ error: "Recurso no válido" });
  }
  try {
    const updated = updateRow(resource, Number(id), payload);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/:resource/:id", (req, res) => {
  const { resource, id } = req.params;
  if (!allowedResources.includes(resource)) {
    return res.status(404).json({ error: "Recurso no válido" });
  }
  try {
    deleteRow(resource, Number(id));
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ── WhatsApp ──────────────────────────────────────────────────────────────────
app.post("/api/whatsapp/init", async (req, res) => {
  try {
    console.log("[API] POST /api/whatsapp/init - Solicitado");
    await initWhatsApp();
    console.log("[API] POST /api/whatsapp/init - Éxito");
    res.json({ ok: true });
  } catch (e) {
    console.error("[API] POST /api/whatsapp/init - Error:", e.message);
    res.status(500).json({ 
      error: e.message || "Error al iniciar WhatsApp. Verifica tu conexión a internet."
    });
  }
});

app.get("/api/whatsapp/status", (req, res) => {
  const status = waGetStatus();
  res.json(status);
});

app.post("/api/whatsapp/send", async (req, res) => {
  const { phone, message } = req.body;
  try {
    if (!phone || !message) {
      return res.status(400).json({ error: "Faltan campos requeridos: phone y message" });
    }
    console.log("[API] POST /api/whatsapp/send - Enviando a:", phone);
    await waSend(phone, message);
    console.log("[API] POST /api/whatsapp/send - Enviado");
    res.json({ ok: true });
  } catch (e) {
    console.error("[API] POST /api/whatsapp/send - Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/whatsapp/disconnect", async (req, res) => {
  try { 
    console.log("[API] POST /api/whatsapp/disconnect - Solicitado");
    await waDisconnect(); 
    console.log("[API] POST /api/whatsapp/disconnect - Desconectado");
    res.json({ ok: true }); 
  }
  catch (e) { 
    console.error("[API] POST /api/whatsapp/disconnect - Error:", e.message);
    res.status(500).json({ error: e.message }); 
  }
});

app.post("/api/uploads", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió archivo" });
  }
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ path: filePath });
});

export async function startServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Backend SQLite iniciado en http://localhost:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
