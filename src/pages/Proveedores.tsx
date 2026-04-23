import { useLiveQuery } from "dexie-react-hooks";
import { db, Supplier } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { waLink } from "@/lib/whatsapp";

export default function Proveedores() {
  const list = useLiveQuery(() => db.suppliers.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>({ name: "", phone: "", productsHint: "", active: true });
  const { isAdmin } = useAuth();

  const save = async () => {
    if (!form.name) return toast.error("Nombre requerido");
    await db.suppliers.add({ ...form, active: true } as any);
    setOpen(false); setForm({ name: "", phone: "", productsHint: "", active: true });
    toast.success("Proveedor creado");
  };
  const toggle = async (s: Supplier) => db.suppliers.update(s.id!, { active: !s.active });
  const remove = async (id: number) => {
    if (!isAdmin) return toast.error("Solo admin");
    if (!confirm("¿Eliminar?")) return;
    await db.suppliers.delete(id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Proveedores</h1><p className="text-sm text-muted-foreground">Contactos para reposición de stock.</p></div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nuevo</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <div key={s.id} className={`rounded-xl border bg-card p-4 shadow-card ${!s.active ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.phone}</div>
              </div>
              <div className="flex gap-1">
                {s.phone && <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={waLink(s.phone, `Hola ${s.name}, necesito cotizar...`)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5 text-success" /></a></Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(s)}><span className="text-xs">{s.active ? "🚫" : "✓"}</span></Button>
                {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(s.id!)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.productsHint}</p>
          </div>
        ))}
        {list.length === 0 && <div className="text-sm text-muted-foreground">Sin proveedores.</div>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Productos que vende</Label><Input value={form.productsHint} onChange={(e) => setForm({ ...form, productsHint: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
