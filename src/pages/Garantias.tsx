import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dateShort, money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Search, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export default function Garantias() {
  const orders = useLiveQuery(() => db.orders.filter((o) => o.locked).toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const bikes = useLiveQuery(() => db.bikes.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const cusMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const bkMap = useMemo(() => Object.fromEntries(bikes.map((b) => [b.id, b])), [bikes]);
  const filtered = orders.filter((o) => {
    if (!q) return true;
    const c = cusMap[o.customerId]; const b = bkMap[o.bikeId];
    return `${o.number} ${c?.name} ${b?.plate}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Shield className="h-6 w-6 text-primary" />Garantías</h1>
        <p className="text-sm text-muted-foreground">Historial de órdenes finalizadas con sus servicios y evidencias.</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por orden, cliente, placa..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((o) => {
          const c = cusMap[o.customerId]; const b = bkMap[o.bikeId];
          return (
            <Link key={o.id} to={`/ordenes/${o.id}`} className="rounded-xl border bg-card p-4 shadow-card transition hover:shadow-elevated">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-primary">{o.number}</span>
                <span className="text-xs text-muted-foreground">{dateShort(o.entryDate)}</span>
              </div>
              <div className="mt-1 font-semibold">{c?.name}</div>
              <div className="text-xs text-muted-foreground">{b?.model} · <span className="font-mono">{b?.plate}</span></div>
              <div className="mt-2 text-xs">{o.services.length} servicios · {o.parts.length} repuestos</div>
              <div className="mt-1 text-sm font-bold">{money(o.total)}</div>
              {o.evidences.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {o.evidences.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" className="h-10 w-10 rounded object-cover" />)}
                </div>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">Sin órdenes finalizadas.</div>}
      </div>
    </div>
  );
}
