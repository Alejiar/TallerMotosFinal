import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { waLink } from "@/lib/whatsapp";

export default function Compras() {
  const products = useLiveQuery(() => db.products.filter((p) => p.active).toArray(), []) ?? [];
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => s.active).toArray(), []) ?? [];
  const [supplierId, setSupplierId] = useState<number>(0);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<number, { name: string; code: string; qty: number; cost: number }>>({});

  const supplier = suppliers.find((s) => s.id === supplierId);
  const filtered = useMemo(() => {
    if (!q) return products.slice(0, 20);
    const t = q.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.code.includes(q));
  }, [q, products]);
  const total = Object.values(cart).reduce((a, b) => a + b.qty * b.cost, 0);

  const add = (id: number, name: string, code: string, cost: number) => {
    setCart((c) => ({ ...c, [id]: { name, code, cost, qty: (c[id]?.qty ?? 0) + 1 } }));
  };
  const setQty = (id: number, qty: number) => setCart((c) => ({ ...c, [id]: { ...c[id], qty: Math.max(0, qty) } }));
  const setCost = (id: number, cost: number) => setCart((c) => ({ ...c, [id]: { ...c[id], cost } }));
  const remove = (id: number) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });

  const buildMessage = () => {
    let msg = `Hola${supplier ? ` ${supplier.name}` : ""}, necesito cotizar / pedir:\n\n`;
    Object.entries(cart).forEach(([, it]) => {
      if (it.qty > 0) msg += `• ${it.qty} x ${it.name} (${it.code})\n`;
    });
    msg += `\nTotal estimado: ${money(total)}\n\nGracias.`;
    return msg;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras a proveedores</h1>
          <p className="text-sm text-muted-foreground">Arma el carrito y envía el pedido por WhatsApp.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(supplierId)} onValueChange={(v) => setSupplierId(Number(v))}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Proveedor (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">— Sin proveedor —</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar producto..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-right">{p.stock}</td>
                  <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => add(p.id!, p.name, p.code, p.cost ?? p.price)}><Plus className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h3 className="mb-3 font-semibold">Carrito de compra</h3>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {Object.keys(cart).length === 0 && <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">Vacío</div>}
          {Object.entries(cart).map(([id, it]) => (
            <div key={id} className="rounded-md border bg-muted/30 p-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-sm font-medium">{it.name}</div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(Number(id))}><Trash2 className="h-3 w-3" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[10px] uppercase text-muted-foreground">Cantidad</div><Input className="h-7" type="number" value={it.qty} onChange={(e) => setQty(Number(id), Number(e.target.value))} /></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Costo unit.</div><Input className="h-7" type="number" value={it.cost} onChange={(e) => setCost(Number(id), Number(e.target.value))} /></div>
              </div>
              <div className="mt-1 text-right text-xs font-semibold">{money(it.qty * it.cost)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">Total estimado</span>
          <span className="text-xl font-bold">{money(total)}</span>
        </div>
        <Button asChild className="mt-3 w-full" disabled={Object.keys(cart).length === 0}>
          <a href={supplier?.phone ? waLink(supplier.phone, buildMessage()) : `https://wa.me/?text=${encodeURIComponent(buildMessage())}`} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-1 h-4 w-4" /> Enviar por WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
