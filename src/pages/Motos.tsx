import { useLiveQuery } from "dexie-react-hooks";
import { db, OrderStatus, STATUS_META, formatOrderNumber, nextCounter } from "@/lib/db";
import { dateShort, todayISO } from "@/lib/format";
import { buildTemplate, waLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Plus, Eye, MessageCircle, Calendar } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const COLUMNS: { key: OrderStatus[]; title: string; tint: string }[] = [
  { key: ["ingresada", "diagnostico"], title: "Pendientes", tint: "bg-col-pending" },
  { key: ["esperando_repuestos", "reparacion"], title: "En reparación", tint: "bg-col-progress" },
  { key: ["lista"], title: "Listas para entregar", tint: "bg-col-ready" },
];

export default function Motos() {
  const orders = useLiveQuery(() => db.orders.where("status").notEqual("entregada").toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const bikes = useLiveQuery(() => db.bikes.toArray(), []) ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: 0, bikeId: 0, problem: "", estimatedDate: "",
    newCustomerName: "", newCustomerPhone: "", newPlate: "", newModel: "",
    mode: "existing" as "existing" | "new",
  });

  const cusMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const bikeMap = useMemo(() => Object.fromEntries(bikes.map((b) => [b.id, b])), [bikes]);

  const createOrder = async () => {
    let customerId = form.customerId;
    let bikeId = form.bikeId;
    if (form.mode === "new") {
      if (!form.newCustomerName || !form.newCustomerPhone || !form.newPlate) {
        toast.error("Completa cliente, teléfono y placa");
        return;
      }
      customerId = (await db.customers.add({
        name: form.newCustomerName.trim(),
        phone: form.newCustomerPhone.trim(),
        createdAt: todayISO(),
      })) as number;
      bikeId = (await db.bikes.add({
        customerId,
        plate: form.newPlate.trim().toUpperCase(),
        model: form.newModel.trim(),
        createdAt: todayISO(),
      })) as number;
    } else if (!customerId || !bikeId) {
      toast.error("Selecciona cliente y moto");
      return;
    }
    const n = await nextCounter("order");
    const number = formatOrderNumber(n);
    const id = await db.orders.add({
      number, customerId, bikeId,
      problem: form.problem,
      status: "ingresada",
      entryDate: todayISO(),
      estimatedDate: form.estimatedDate || undefined,
      parts: [], services: [], evidences: [],
      locked: false, total: 0,
    });
    toast.success(`Orden ${number} creada`);
    setOpen(false);
    setForm({ customerId: 0, bikeId: 0, problem: "", estimatedDate: "", newCustomerName: "", newCustomerPhone: "", newPlate: "", newModel: "", mode: "existing" });

    // WhatsApp ingreso
    const c = await db.customers.get(customerId);
    const b = await db.bikes.get(bikeId);
    if (c) {
      const msg = await buildTemplate("ingreso", { cliente: c.name, placa: b?.plate, moto: b?.model, orden: number });
      window.open(waLink(c.phone, msg), "_blank");
    }
    return id;
  };

  const changeStatus = async (orderId: number, status: OrderStatus) => {
    const order = await db.orders.get(orderId);
    if (!order) return;
    if (order.locked) return toast.error("Orden bloqueada");
    await db.orders.update(orderId, { status });
    const c = await db.customers.get(order.customerId);
    const b = await db.bikes.get(order.bikeId);
    if (c) {
      const key = status === "lista" ? "finalizacion" : "proceso";
      const msg = await buildTemplate(key, { cliente: c.name, placa: b?.plate, moto: b?.model, orden: order.number, estado: status });
      window.open(waLink(c.phone, msg), "_blank");
    }
    toast.success(`Estado: ${STATUS_META[status].label}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Motos en taller</h1>
          <p className="text-sm text-muted-foreground">Vista tipo Kanban. Mueve por estado y notifica al cliente.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nueva orden / Ingreso</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.key.includes(o.status));
          return (
            <section key={col.title} className="kanban-col">
              <header className={`mb-3 flex items-center justify-between rounded-lg ${col.tint} px-3 py-2`}>
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs font-medium">{list.length}</span>
              </header>
              <div className="space-y-2 overflow-y-auto pr-1">
                {list.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-background/50 p-4 text-center text-xs text-muted-foreground">
                    Sin motos
                  </div>
                )}
                {list.map((o) => {
                  const c = cusMap[o.customerId];
                  const b = bikeMap[o.bikeId];
                  return (
                    <article key={o.id} className="rounded-lg border bg-card p-3 shadow-card transition hover:shadow-elevated">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold text-primary">{o.number}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_META[o.status].color}`}>
                          {STATUS_META[o.status].label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">{c?.name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{b?.model} · <span className="font-mono">{b?.plate}</span></div>
                      <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{o.problem || "Sin descripción"}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Ingreso: {dateShort(o.entryDate)}</span>
                        {o.estimatedDate && <span>· Entrega: {dateShort(o.estimatedDate)}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Select value={o.status} onValueChange={(v) => changeStatus(o.id!, v as OrderStatus)}>
                          <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_META).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button asChild size="icon" variant="outline" className="h-7 w-7">
                          <Link to={`/ordenes/${o.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                        {c?.phone && (
                          <Button asChild size="icon" variant="outline" className="h-7 w-7">
                            <a href={waLink(c.phone, `Hola ${c.name}, te escribo del taller sobre tu orden ${o.number}.`)} target="_blank" rel="noreferrer">
                              <MessageCircle className="h-3.5 w-3.5 text-success" />
                            </a>
                          </Button>
                        )}
                        {c?.phone && (
                          <Button asChild size="icon" variant="outline" className="h-7 w-7">
                            <a href={`tel:${c.phone}`}><Phone className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ingresar moto / Nueva orden</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant={form.mode === "existing" ? "default" : "outline"} onClick={() => setForm({ ...form, mode: "existing" })}>Cliente existente</Button>
            <Button size="sm" variant={form.mode === "new" ? "default" : "outline"} onClick={() => setForm({ ...form, mode: "new" })}>Nuevo cliente</Button>
          </div>
          {form.mode === "existing" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cliente</Label>
                <Select value={String(form.customerId)} onValueChange={(v) => setForm({ ...form, customerId: Number(v), bikeId: 0 })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} · {c.phone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Moto</Label>
                <Select value={String(form.bikeId)} onValueChange={(v) => setForm({ ...form, bikeId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona moto" /></SelectTrigger>
                  <SelectContent>
                    {bikes.filter((b) => b.customerId === form.customerId).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.plate} · {b.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Nombre cliente</Label><Input value={form.newCustomerName} onChange={(e) => setForm({ ...form, newCustomerName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.newCustomerPhone} onChange={(e) => setForm({ ...form, newCustomerPhone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Placa</Label><Input value={form.newPlate} onChange={(e) => setForm({ ...form, newPlate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tipo / Modelo</Label><Input value={form.newModel} onChange={(e) => setForm({ ...form, newModel: e.target.value })} /></div>
            </div>
          )}
          <div className="space-y-1.5"><Label>Problema reportado</Label><Textarea rows={3} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Fecha estimada de entrega</Label><Input type="date" value={form.estimatedDate} onChange={(e) => setForm({ ...form, estimatedDate: e.target.value })} /></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createOrder}>Crear orden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
