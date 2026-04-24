import { db, OrderStatus, STATUS_META } from "./db";

const sanitizePhone = (phone: string) => phone.replace(/\D/g, "");

export function waLink(phone: string, message: string) {
  return `https://wa.me/${sanitizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

export async function sendOrOpenMessage(phone: string, message: string): Promise<void> {
  if (!phone) return;
  try {
    const res = await fetch("http://localhost:3000/api/whatsapp/status");
    const { status } = await res.json();
    if (status === "connected") {
      await fetch("http://localhost:3000/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      return;
    }
  } catch {}
  window.open(waLink(phone, message), "_blank");
}

export async function buildTemplate(
  key: "ingreso" | "proceso" | "finalizacion",
  vars: { cliente?: string; placa?: string; moto?: string; orden?: string; estado?: OrderStatus }
) {
  const tpl = await db.templates.where("key").equals(key).first();
  let body = tpl?.body ?? "";
  body = body
    .replace(/\{cliente\}/g, vars.cliente ?? "")
    .replace(/\{placa\}/g, vars.placa ?? "")
    .replace(/\{moto\}/g, vars.moto ?? "")
    .replace(/\{orden\}/g, vars.orden ?? "")
    .replace(/\{estado\}/g, vars.estado ? STATUS_META[vars.estado].label : "");
  return body;
}
