import { useLiveQuery } from "dexie-react-hooks";
import { db, STATUS_META } from "@/lib/db";
import { dateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { Eye, Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function Ordenes() {
  const orders = useLiveQuery(() => db.orders.orderBy("entryDate").reverse().toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const bikes = useLiveQuery(() => db.bikes.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const cus = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const bk = useMemo(() => Object.fromEntries(bikes.map((b) => [b.id, b])), [bikes]);
  const filtered = orders.filter((o) => {
    if (!q) return true;
    const c = cus[o.customerId];
    const b = bk[o.bikeId];
    const t = `${o.number} ${c?.name ?? ""} ${b?.plate ?? ""} ${b?.model ?? ""}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Órdenes de trabajo</h1>
        <p className="text-sm text-muted-foreground">Listado completo, incluye entregadas.</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por orden, cliente, placa..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Orden</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Moto</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Ingreso</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((o) => {
              const c = cus[o.customerId]; const b = bk[o.bikeId];
              return (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{o.number}{o.locked && <span className="ml-1 text-[10px] text-muted-foreground">🔒</span>}</td>
                  <td className="px-3 py-2">{c?.name ?? "-"}</td>
                  <td className="px-3 py-2"><span className="font-mono">{b?.plate}</span> · {b?.model}</td>
                  <td className="px-3 py-2"><span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${STATUS_META[o.status].color}`}>{STATUS_META[o.status].label}</span></td>
                  <td className="px-3 py-2 text-xs">{dateShort(o.entryDate)}</td>
                  <td className="px-3 py-2 text-right font-medium">{o.total ? o.total.toLocaleString("es-CO") : "-"}</td>
                  <td className="px-3 py-2 text-right"><Button asChild size="sm" variant="outline"><Link to={`/ordenes/${o.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">Sin órdenes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
