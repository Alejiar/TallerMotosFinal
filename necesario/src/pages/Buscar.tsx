import { useLiveQuery } from "dexie-react-hooks";
import { db, STATUS_META } from "@/lib/db";
import { dateShort, money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export default function Buscar() {
  const [q, setQ] = useState("");
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const bikes = useLiveQuery(() => db.bikes.toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];

  const term = q.toLowerCase().trim();
  const cus = useMemo(() => term ? customers.filter((c) => c.name.toLowerCase().includes(term) || c.phone.includes(q)) : [], [term, customers, q]);
  const bks = useMemo(() => term ? bikes.filter((b) => b.plate.toLowerCase().includes(term) || b.model.toLowerCase().includes(term)) : [], [term, bikes]);
  const ords = useMemo(() => term ? orders.filter((o) => o.number.toLowerCase().includes(term)) : [], [term, orders]);
  const prods = useMemo(() => term ? products.filter((p) => p.name.toLowerCase().includes(term) || p.code.includes(q)) : [], [term, products, q]);

  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const bikeById = Object.fromEntries(bikes.map((b) => [b.id, b]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Búsqueda global</h1>
        <p className="text-sm text-muted-foreground">Clientes, motos, órdenes, productos.</p>
      </div>
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input autoFocus className="pl-9" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!term && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Escribe para buscar.</div>}

      {term && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title={`Clientes (${cus.length})`}>
            {cus.map((c) => <Link key={c.id} to="/clientes" className="block rounded-md border bg-card p-3 hover:bg-muted/30"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.phone}</div></Link>)}
          </Section>
          <Section title={`Motos (${bks.length})`}>
            {bks.map((b) => <div key={b.id} className="rounded-md border bg-card p-3"><div className="font-mono font-semibold">{b.plate}</div><div className="text-xs">{b.model} · {customerById[b.customerId]?.name}</div></div>)}
          </Section>
          <Section title={`Órdenes (${ords.length})`}>
            {ords.map((o) => <Link key={o.id} to={`/ordenes/${o.id}`} className="block rounded-md border bg-card p-3 hover:bg-muted/30"><div className="flex justify-between"><span className="font-mono font-semibold">{o.number}</span><span className="text-xs">{dateShort(o.entryDate)}</span></div><div className="text-xs">{customerById[o.customerId]?.name} · {bikeById[o.bikeId]?.plate} · {STATUS_META[o.status].label}</div></Link>)}
          </Section>
          <Section title={`Productos (${prods.length})`}>
            {prods.map((p) => <div key={p.id} className="rounded-md border bg-card p-3"><div className="flex justify-between"><span className="font-medium">{p.name}</span><span className="font-semibold">{money(p.price)}</span></div><div className="text-xs text-muted-foreground">{p.code} · stock {p.stock}</div></div>)}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
