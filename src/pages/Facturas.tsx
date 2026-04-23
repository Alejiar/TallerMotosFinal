import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dateTime, money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Facturas() {
  const sales = useLiveQuery(() => db.sales.orderBy("date").reverse().toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [view, setView] = useState<typeof sales[number] | null>(null);
  const filtered = useMemo(() => sales.filter((s) => !q || s.number.includes(q)), [q, sales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturas / Tickets</h1>
        <p className="text-sm text-muted-foreground">Historial completo de ventas y cierres de orden.</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por número..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Número</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Pago</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">{s.number}</td>
                <td className="px-3 py-2 text-xs">{dateTime(s.date)}</td>
                <td className="px-3 py-2 capitalize">{s.type}</td>
                <td className="px-3 py-2 capitalize">{s.method}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(s.total)}</td>
                <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => setView(s)}><Printer className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Sin facturas.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Factura #{view?.number}</DialogTitle></DialogHeader>
          {view && (
            <>
              <div className="mx-auto max-w-xs rounded border bg-white p-4 font-mono text-xs text-black">
                <div className="text-center font-bold">MOTOTALLER</div>
                <div className="mb-2 text-center text-[10px]">Ticket #{view.number}</div>
                <div className="mb-2 text-[10px]">{dateTime(view.date)}</div>
                {view.items.map((it, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{it.qty}x {it.name}</span>
                    <span>{(it.qty * it.unitPrice).toLocaleString("es-CO")}</span>
                  </div>
                ))}
                <div className="my-2 border-t border-dashed" />
                <div className="flex justify-between font-bold"><span>TOTAL</span><span>{view.total.toLocaleString("es-CO")}</span></div>
                <div className="mt-1 text-[10px] uppercase">{view.method}</div>
              </div>
              <div className="flex justify-end"><Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir</Button></div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
