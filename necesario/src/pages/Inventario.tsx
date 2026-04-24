import { useLiveQuery } from "dexie-react-hooks";
import { db, Product } from "@/lib/db";
import { money, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Edit2, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Barcode from "@/components/Barcode";
import { useAuth } from "@/lib/auth";

const empty: Partial<Product> = { code: "", name: "", stock: 0, minStock: 1, shelf: "", price: 0, active: true };

export default function Inventario() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [printing, setPrinting] = useState<Product | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useAuth();

  const save = async () => {
    if (!editing?.code || !editing?.name) return toast.error("Código y nombre requeridos");
    if (editing.id) {
      await db.products.update(editing.id, editing as any);
    } else {
      const exists = await db.products.where("code").equals(editing.code).first();
      if (exists) return toast.error("Código ya existe");
      await db.products.add({ ...empty, ...editing, createdAt: todayISO() } as any);
    }
    setOpen(false); setEditing(null);
    toast.success("Producto guardado");
  };
  const toggleActive = async (p: Product) => {
    await db.products.update(p.id!, { active: !p.active });
  };
  const remove = async (id: number) => {
    if (!isAdmin) return toast.error("Solo admin");
    if (!confirm("¿Eliminar producto definitivamente?")) return;
    await db.products.delete(id);
  };

  const filtered = products.filter((p) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return p.name.toLowerCase().includes(t) || p.code.includes(q) || (p.shelf ?? "").toLowerCase().includes(t);
  });

  // Scanner shortcut: Enter al escanear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); scanRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">Productos, stock, códigos de barras. Tip: presiona <kbd className="rounded bg-muted px-1">/</kbd> para escanear.</p>
        </div>
        <Button onClick={() => { setEditing({ ...empty }); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nuevo producto</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input ref={scanRef} className="pl-9" placeholder="Buscar por nombre, código o estante..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Estante</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => {
              const low = p.stock <= p.minStock;
              return (
                <tr key={p.id} className={`hover:bg-muted/30 ${!p.active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-2">{p.name}{!p.active && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">inactivo</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.shelf || "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-flex items-center gap-1 ${low ? "rounded bg-warning/15 px-1.5 py-0.5 font-semibold text-warning" : ""}`}>
                      {low && <AlertTriangle className="h-3 w-3" />} {p.stock}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{money(p.price)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPrinting(p)}><Printer className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(p); setOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(p)}><span className="text-xs">{p.active ? "🚫" : "✓"}</span></Button>
                    {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(p.id!)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Sin productos.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} producto</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Código (escanear o manual)</Label><Input autoFocus value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nombre</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Estante</Label><Input value={editing.shelf} onChange={(e) => setEditing({ ...editing, shelf: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Stock</Label><Input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Stock mínimo</Label><Input type="number" value={editing.minStock} onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Precio venta</Label><Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printing} onOpenChange={(v) => !v && setPrinting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sticker — {printing?.name}</DialogTitle></DialogHeader>
          <div id="print-area" className="flex flex-col items-center gap-1 rounded border bg-white p-4 text-black">
            <div className="text-xs font-semibold">{printing?.name}</div>
            {printing && <Barcode value={printing.code} />}
            <div className="text-sm font-bold">{printing && money(printing.price)}</div>
          </div>
          <DialogFooter><Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
