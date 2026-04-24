import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db, OrderStatus, STATUS_META, OrderItem, OrderService, formatSaleNumber, nextCounter } from "@/lib/db";
import { dateShort, money, todayISO } from "@/lib/format";
import { buildTemplate, waLink, sendOrOpenMessage } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Camera, Lock, MessageCircle, Plus, Printer, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function OrdenDetalle() {
  const { id } = useParams();
  const orderId = Number(id);
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const order = useLiveQuery(() => db.orders.get(orderId), [orderId]);
  const customer = useLiveQuery(() => (order ? db.customers.get(order.customerId) : undefined), [order?.customerId]);
  const bike = useLiveQuery(() => (order ? db.bikes.get(order.bikeId) : undefined), [order?.bikeId]);
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const [partQuery, setPartQuery] = useState("");
  const [serviceForm, setServiceForm] = useState({ description: "", price: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => {
    if (!order) return 0;
    return order.parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + order.services.reduce((a, b) => a + b.price, 0);
  }, [order]);

  if (!order) return <div className="p-6 text-sm text-muted-foreground">Cargando orden...</div>;

  const update = async (patch: Partial<typeof order>) => {
    await db.orders.update(orderId, patch);
  };

  const addPart = async (productId: number) => {
    if (order.locked) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (p.stock <= 0) return toast.error("Sin stock");
    const parts = [...order.parts];
    const idx = parts.findIndex((x) => x.productId === productId);
    if (idx >= 0) parts[idx].qty += 1;
    else parts.push({ productId: p.id!, name: p.name, qty: 1, unitPrice: p.price });
    await update({ parts, total: parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + order.services.reduce((a, b) => a + b.price, 0) });
  };
  const removePart = async (i: number) => {
    if (order.locked) return;
    const parts = order.parts.filter((_, idx) => idx !== i);
    await update({ parts, total: parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + order.services.reduce((a, b) => a + b.price, 0) });
  };
  const updatePartQty = async (i: number, qty: number) => {
    if (order.locked) return;
    const parts = [...order.parts];
    parts[i].qty = Math.max(1, qty);
    await update({ parts, total: parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + order.services.reduce((a, b) => a + b.price, 0) });
  };
  const addService = async () => {
    if (order.locked) return;
    if (!serviceForm.description) return;
    const services = [...order.services, { ...serviceForm }];
    await update({ services, total: order.parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + services.reduce((a, b) => a + b.price, 0) });
    setServiceForm({ description: "", price: 0 });
  };
  const removeService = async (i: number) => {
    if (order.locked) return;
    const services = order.services.filter((_, idx) => idx !== i);
    await update({ services, total: order.parts.reduce((a, b) => a + b.qty * b.unitPrice, 0) + services.reduce((a, b) => a + b.price, 0) });
  };
  const handleStatus = async (status: OrderStatus) => {
    if (order.locked) return toast.error("Orden bloqueada");
    await update({ status });
    if (customer) {
      const key = status === "lista" ? "finalizacion" : "proceso";
      const msg = await buildTemplate(key, { cliente: customer.name, placa: bike?.plate, moto: bike?.model, orden: order.number, estado: status });
      await sendOrOpenMessage(customer.phone, msg);
    }
    toast.success("Estado actualizado");
  };

  const handlePhotos = async (files: FileList | null) => {
    if (!files || order.locked) return;
    const arr = await Promise.all(Array.from(files).map((f) => new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(f);
    })));
    await update({ evidences: [...order.evidences, ...arr] });
  };
  const removePhoto = async (i: number) => {
    if (order.locked) return;
    await update({ evidences: order.evidences.filter((_, idx) => idx !== i) });
  };

  const finalize = async () => {
    if (order.locked) return;
    if (!confirm("¿Finalizar orden? Quedará bloqueada (solo lectura) y se descontará el inventario.")) return;
    // Discount stock
    for (const p of order.parts) {
      if (p.productId) {
        const prod = await db.products.get(p.productId);
        if (prod) await db.products.update(prod.id!, { stock: Math.max(0, prod.stock - p.qty) });
      }
    }
    // Generate invoice (sale type orden)
    const n = await nextCounter("sale");
    const number = formatSaleNumber(n);
    await db.sales.add({
      number, date: todayISO(),
      items: order.parts.map((p) => ({ productId: p.productId ?? 0, code: "", name: p.name, qty: p.qty, unitPrice: p.unitPrice })),
      total: total, method: "efectivo", type: "orden", orderId: order.id,
    });
    await db.cash.add({ date: todayISO(), type: "ingreso", amount: total, concept: `Orden ${order.number}`, refType: "orden", refId: order.id });
    await update({ locked: true, status: "entregada", total });
    if (customer) {
      const msg = await buildTemplate("finalizacion", { cliente: customer.name, placa: bike?.plate, moto: bike?.model, orden: order.number });
      await sendOrOpenMessage(customer.phone, msg);
    }
    toast.success(`Orden finalizada. Factura ${number}`);
  };

  const filteredProducts = products.filter((p) => {
    const t = partQuery.toLowerCase();
    return p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t) || (p.shelf ?? "").toLowerCase().includes(t);
  }).slice(0, 20);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="mr-1 h-4 w-4" />Atrás</Button>
        <h1 className="text-2xl font-bold tracking-tight">Orden <span className="font-mono">{order.number}</span></h1>
        <span className={`rounded border px-2 py-1 text-xs uppercase ${STATUS_META[order.status].color}`}>{STATUS_META[order.status].label}</span>
        {order.locked && <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"><Lock className="h-3 w-3" /> Bloqueada</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
          {!order.locked && <Button onClick={finalize} className="bg-success text-success-foreground hover:bg-success/90">Finalizar</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cliente y moto</h3>
          <div className="space-y-1 text-sm">
            <div className="font-semibold">{customer?.name}</div>
            <div className="text-muted-foreground">{customer?.phone}</div>
            <div className="mt-3 rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Moto</div>
              <div className="font-mono font-semibold">{bike?.plate}</div>
              <div className="text-sm">{bike?.model}</div>
            </div>
          </div>
          {customer?.phone && (
            <Button asChild size="sm" variant="outline" className="mt-3 w-full">
              <a href={waLink(customer.phone, `Hola ${customer.name}, sobre tu orden ${order.number}.`)} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1 h-4 w-4 text-success" /> WhatsApp
              </a>
            </Button>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datos</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={order.status} onValueChange={(v) => handleStatus(v as OrderStatus)}>
                <SelectTrigger disabled={order.locked}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha estimada</Label>
              <Input type="date" disabled={order.locked} value={order.estimatedDate?.slice(0, 10) ?? ""} onChange={(e) => update({ estimatedDate: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Problema reportado</Label>
              <Textarea rows={2} disabled={order.locked} value={order.problem} onChange={(e) => update({ problem: e.target.value })} />
            </div>
            <div className="text-xs text-muted-foreground sm:col-span-2">Ingreso: {dateShort(order.entryDate)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="mb-3 font-semibold">Repuestos</h3>
          {!order.locked && (
            <div className="mb-3 space-y-2">
              <Input placeholder="Buscar repuesto por nombre o código..." value={partQuery} onChange={(e) => setPartQuery(e.target.value)} />
              {partQuery && (
                <div className="max-h-44 overflow-y-auto rounded-md border bg-background">
                  {filteredProducts.map((p) => (
                    <button key={p.id} onClick={() => { addPart(p.id!); setPartQuery(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                      <span>{p.name} <span className="text-xs text-muted-foreground">· {p.code}</span></span>
                      <span className="text-xs">{money(p.price)} · stock {p.stock}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <div className="p-3 text-xs text-muted-foreground">Sin resultados</div>}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            {order.parts.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <div className="flex-1 text-sm">{p.name}</div>
                <Input type="number" className="h-8 w-16" min={1} value={p.qty} disabled={order.locked} onChange={(e) => updatePartQty(i, Number(e.target.value))} />
                <span className="w-24 text-right text-sm">{money(p.qty * p.unitPrice)}</span>
                {!order.locked && <Button size="icon" variant="ghost" onClick={() => removePart(i)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            ))}
            {order.parts.length === 0 && <p className="text-xs text-muted-foreground">Sin repuestos.</p>}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="mb-3 font-semibold">Servicios (mano de obra)</h3>
          {!order.locked && (
            <div className="mb-3 flex gap-2">
              <Input placeholder="Descripción" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
              <Input type="number" className="w-28" placeholder="Precio" value={serviceForm.price || ""} onChange={(e) => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} />
              <Button onClick={addService}><Plus className="h-4 w-4" /></Button>
            </div>
          )}
          <div className="space-y-2">
            {order.services.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <div className="flex-1 text-sm">{s.description}</div>
                <span className="w-24 text-right text-sm">{money(s.price)}</span>
                {!order.locked && <Button size="icon" variant="ghost" onClick={() => removeService(i)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            ))}
            {order.services.length === 0 && <p className="text-xs text-muted-foreground">Sin servicios.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Evidencias</h3>
          {!order.locked && (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => handlePhotos(e.target.files)} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Camera className="mr-1 h-4 w-4" />Agregar fotos</Button>
            </>
          )}
        </div>
        {order.evidences.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin fotos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {order.evidences.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-md border">
                <img src={src} alt="evidencia" className="h-full w-full object-cover" />
                {!order.locked && (
                  <button onClick={() => removePhoto(i)} className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition group-hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-gradient-primary p-5 text-primary-foreground shadow-elevated">
        <div className="text-sm uppercase tracking-wide opacity-80">Total orden</div>
        <div className="text-3xl font-bold">{money(total)}</div>
      </div>
    </div>
  );
}
