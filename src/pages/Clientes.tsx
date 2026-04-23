import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dateShort, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2, Phone, MessageCircle, Bike } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { waLink } from "@/lib/whatsapp";

export default function Clientes() {
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const bikes = useLiveQuery(() => db.bikes.toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [bikeOpen, setBikeOpen] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [bikeForm, setBikeForm] = useState({ plate: "", model: "", year: "", color: "" });
  const { isAdmin } = useAuth();

  const save = async () => {
    if (!form.name || !form.phone) return toast.error("Nombre y teléfono requeridos");
    await db.customers.add({ ...form, createdAt: todayISO() });
    setOpen(false); setForm({ name: "", phone: "", notes: "" });
    toast.success("Cliente creado");
  };
  const addBike = async () => {
    if (!bikeOpen || !bikeForm.plate) return toast.error("Placa requerida");
    await db.bikes.add({ customerId: bikeOpen, plate: bikeForm.plate.toUpperCase(), model: bikeForm.model, year: bikeForm.year, color: bikeForm.color, createdAt: todayISO() });
    setBikeForm({ plate: "", model: "", year: "", color: "" }); setBikeOpen(null);
    toast.success("Moto agregada");
  };
  const removeCustomer = async (id: number) => {
    if (!isAdmin) return toast.error("Solo admin");
    if (!confirm("¿Eliminar cliente?")) return;
    await db.customers.delete(id);
  };

  const filtered = customers.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Registra clientes y sus motos.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nuevo cliente</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => {
          const cBikes = bikes.filter((b) => b.customerId === c.id);
          const cOrders = orders.filter((o) => o.customerId === c.id);
          return (
            <div key={c.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                </div>
                <div className="flex gap-1">
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={`tel:${c.phone}`}><Phone className="h-3.5 w-3.5" /></a></Button>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={waLink(c.phone, `Hola ${c.name}`)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5 text-success" /></a></Button>
                  {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeCustomer(c.id!)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {cBikes.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1.5 text-xs">
                    <Bike className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono font-semibold">{b.plate}</span>
                    <span className="text-muted-foreground">· {b.model}</span>
                  </div>
                ))}
                {cBikes.length === 0 && <div className="text-xs text-muted-foreground">Sin motos registradas</div>}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{cOrders.length} órdenes · desde {dateShort(c.createdAt)}</span>
                <Button size="sm" variant="outline" onClick={() => setBikeOpen(c.id!)}><Plus className="mr-1 h-3 w-3" />Moto</Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">Sin clientes.</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bikeOpen !== null} onOpenChange={(v) => !v && setBikeOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar moto</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Placa</Label><Input value={bikeForm.plate} onChange={(e) => setBikeForm({ ...bikeForm, plate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Modelo</Label><Input value={bikeForm.model} onChange={(e) => setBikeForm({ ...bikeForm, model: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Año</Label><Input value={bikeForm.year} onChange={(e) => setBikeForm({ ...bikeForm, year: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Color</Label><Input value={bikeForm.color} onChange={(e) => setBikeForm({ ...bikeForm, color: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setBikeOpen(null)}>Cancelar</Button><Button onClick={addBike}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
