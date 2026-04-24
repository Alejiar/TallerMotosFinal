import { useLiveQuery } from "dexie-react-hooks";
import { db, formatSaleNumber, nextCounter, PaymentMethod, Product, SaleItem } from "@/lib/db";
import { money, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Trash2, ShoppingCart, Receipt, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export default function Ventas() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [last, setLast] = useState<{ number: string; items: SaleItem[]; total: number; method: PaymentMethod; date: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!q) return [];
    const t = q.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(t) ||
      p.code.toLowerCase().includes(t) ||
      (p.shelf ?? "").toLowerCase().includes(t)
    ).slice(0, 20);
  }, [q, products]);

  const total = cart.reduce((a, b) => a + b.qty * b.unitPrice, 0);

  const add = (p: Product) => {
    if (p.stock <= 0) return toast.error("Sin stock");
    setCart((c) => {
      const idx = c.findIndex((x) => x.productId === p.id);
      if (idx >= 0) {
        const next = [...c]; next[idx].qty += 1; return next;
      }
      return [...c, { productId: p.id!, code: p.code, name: p.name, qty: 1, unitPrice: p.price }];
    });
    setQ(""); inputRef.current?.focus();
  };
  const inc = (i: number) => setCart((c) => c.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x));
  const dec = (i: number) => setCart((c) => c.map((x, j) => j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x));
  const rm = (i: number) => setCart((c) => c.filter((_, j) => j !== i));

  // Scan: enter en input cuando coincide código exacto
  const onKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && q) {
      const exact = products.find((p) => p.code === q.trim());
      if (exact) { add(exact); }
    }
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    const n = await nextCounter("sale");
    const number = formatSaleNumber(n);
    const date = todayISO();
    await db.sales.add({ number, date, items: cart, total, method, type: "mostrador" });
    for (const it of cart) {
      const prod = await db.products.get(it.productId);
      if (prod) await db.products.update(prod.id!, { stock: Math.max(0, prod.stock - it.qty) });
    }
    await db.cash.add({ date, type: "ingreso", amount: total, concept: `Venta ${number}`, refType: "venta" });
    setLast({ number, items: cart, total, method, date });
    setCart([]);
    toast.success(`Venta ${number} registrada`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas mostrador</h1>
          <p className="text-sm text-muted-foreground">Escanea o busca, luego agrega al carrito.</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <Input ref={inputRef} autoFocus placeholder="Escanear código o buscar producto..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          {filtered.length > 0 && (
            <div className="mt-2 divide-y rounded-md border bg-background">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => add(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                  <span>{p.name} <span className="text-xs text-muted-foreground">· {p.code}</span></span>
                  <span className="text-xs">{money(p.price)} · stock {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {last && (
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4" />Ticket #{last.number}</h3>
              <Button size="sm" variant="outline" onClick={() => window.print()}>Reimprimir</Button>
            </div>
            <div id="ticket" className="mx-auto max-w-xs rounded border bg-white p-4 font-mono text-xs text-black">
              <div className="text-center font-bold">MOTOTALLER</div>
              <div className="mb-2 text-center text-[10px]">Ticket #{last.number}</div>
              {last.items.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>{it.qty}x {it.name}</span>
                  <span>{(it.qty * it.unitPrice).toLocaleString("es-CO")}</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed" />
              <div className="flex justify-between font-bold"><span>TOTAL</span><span>{last.total.toLocaleString("es-CO")}</span></div>
              <div className="mt-1 text-[10px] uppercase">{last.method}</div>
              <div className="mt-2 text-center text-[10px]">¡Gracias por su compra!</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />Carrito</h3>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {cart.length === 0 && <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">Vacío</div>}
          {cart.map((it, i) => (
            <div key={i} className="rounded-md border bg-muted/30 p-2">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{it.name}</div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => rm(i)}><X className="h-3 w-3" /></Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => dec(i)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-xs font-semibold">{it.qty}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => inc(i)}><Plus className="h-3 w-3" /></Button>
                </div>
                <div className="text-sm font-semibold">{money(it.qty * it.unitPrice)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-bold">{money(total)}</span>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Método de pago</div>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="qr">QR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={cart.length === 0} onClick={checkout}>
            <Receipt className="mr-1 h-4 w-4" /> Cobrar y emitir ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
