import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, todayDateOnly } from "@/lib/format";
import {
  Bike, AlertTriangle, Wrench, CheckCircle2, Wallet, TrendingUp, MessageCircleOff,
} from "lucide-react";
import { Link } from "react-router-dom";

function StatCard({ icon: Icon, label, value, hint, accent }: any) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const lowStock = useLiveQuery(() => db.products.filter((p) => p.active && p.stock <= p.minStock).toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const today = todayDateOnly();
  const cash = useLiveQuery(() => db.cash.filter((c) => c.date.startsWith(today)).toArray(), [today]) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];

  const pending = orders.filter((o) => ["ingresada", "diagnostico"].includes(o.status));
  const inProgress = orders.filter((o) => ["esperando_repuestos", "reparacion"].includes(o.status));
  const ready = orders.filter((o) => o.status === "lista");

  const ingresos = cash.filter((c) => c.type === "ingreso").reduce((a, b) => a + b.amount, 0);
  const egresos = cash.filter((c) => c.type === "egreso").reduce((a, b) => a + b.amount, 0);

  const topProducts = (() => {
    const map = new Map<number, { name: string; qty: number }>();
    sales.forEach((s) =>
      s.items.forEach((it) => {
        const cur = map.get(it.productId) ?? { name: it.name, qty: 0 };
        cur.qty += it.qty;
        map.set(it.productId, cur);
      })
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resumen del taller</h1>
        <p className="text-sm text-muted-foreground">Estado en tiempo real de motos, caja e inventario.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Bike} label="Motos pendientes" value={pending.length} accent="bg-warning/15 text-warning" />
        <StatCard icon={Wrench} label="En proceso" value={inProgress.length} accent="bg-info/15 text-info" />
        <StatCard icon={CheckCircle2} label="Listas para entregar" value={ready.length} accent="bg-success/15 text-success" />
        <StatCard
          icon={Wallet}
          label="Caja del día"
          value={money(ingresos - egresos)}
          hint={`Ingresos ${money(ingresos)} · Egresos ${money(egresos)}`}
          accent="bg-accent/15 text-accent"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Productos con stock bajo</h2>
            <Link to="/inventario" className="text-xs font-medium text-primary hover:underline">Ver inventario</Link>
          </div>
          {lowStock.length === 0 ? (
            <div className="rounded-lg bg-muted/60 p-6 text-center text-sm text-muted-foreground">
              ✓ Todo el inventario tiene stock saludable.
            </div>
          ) : (
            <div className="divide-y">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Código {p.code} · Estante {p.shelf || "-"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
                      {p.stock} / min {p.minStock}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-accent" /> Top productos vendidos
          </h2>
          {topProducts.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aún sin ventas registradas.</div>
          ) : (
            <ol className="space-y-2">
              {topProducts.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="line-clamp-1">{p.name}</span>
                  </span>
                  <span className="font-semibold">{p.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
        <div className="flex items-center gap-3">
          <MessageCircleOff className="h-5 w-5 text-warning" />
          <div className="flex-1">
            <div className="text-sm font-medium">WhatsApp en modo manual</div>
            <div className="text-xs text-muted-foreground">
              Los mensajes se generan listos para enviar por WhatsApp Web. La integración automática se habilitará en la versión de escritorio.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
