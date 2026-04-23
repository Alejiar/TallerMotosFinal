import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dateTime, money, todayDateOnly, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Caja() {
  const all = useLiveQuery(() => db.cash.orderBy("date").reverse().toArray(), []) ?? [];
  const [from, setFrom] = useState(todayDateOnly());
  const [to, setTo] = useState(todayDateOnly());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ type: "ingreso" | "egreso"; amount: number; concept: string }>({ type: "ingreso", amount: 0, concept: "" });

  const filtered = useMemo(() => all.filter((c) => c.date.slice(0, 10) >= from && c.date.slice(0, 10) <= to), [all, from, to]);
  const ingresos = filtered.filter((c) => c.type === "ingreso").reduce((a, b) => a + b.amount, 0);
  const egresos = filtered.filter((c) => c.type === "egreso").reduce((a, b) => a + b.amount, 0);

  const save = async () => {
    if (!form.amount || !form.concept) return toast.error("Completa los datos");
    await db.cash.add({ date: todayISO(), type: form.type, amount: form.amount, concept: form.concept, refType: "manual" });
    setOpen(false); setForm({ type: "ingreso", amount: 0, concept: "" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Caja</h1><p className="text-sm text-muted-foreground">Ingresos y egresos del taller.</p></div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Movimiento manual</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="stat-card"><div className="text-xs uppercase text-muted-foreground">Ingresos</div><div className="mt-1 text-2xl font-bold text-success">{money(ingresos)}</div></div>
        <div className="stat-card"><div className="text-xs uppercase text-muted-foreground">Egresos</div><div className="mt-1 text-2xl font-bold text-destructive">{money(egresos)}</div></div>
        <div className="stat-card"><div className="text-xs uppercase text-muted-foreground">Balance</div><div className="mt-1 text-2xl font-bold">{money(ingresos - egresos)}</div></div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Concepto</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">Monto</th></tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs">{dateTime(c.date)}</td>
                <td className="px-3 py-2">{c.concept}</td>
                <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 text-xs ${c.type === "ingreso" ? "text-success" : "text-destructive"}`}>{c.type === "ingreso" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />} {c.type}</span></td>
                <td className={`px-3 py-2 text-right font-semibold ${c.type === "ingreso" ? "text-success" : "text-destructive"}`}>{money(c.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Movimiento manual</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ingreso">Ingreso</SelectItem><SelectItem value="egreso">Egreso</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Concepto</Label><Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Monto</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
