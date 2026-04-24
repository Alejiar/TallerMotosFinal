import { useLiveQuery } from "dexie-react-hooks";
import { db, Employee } from "@/lib/db";
import { dateShort, money, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Empleados() {
  const list = useLiveQuery(() => db.employees.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.employeePayments.orderBy("date").reverse().toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Employee>>({ name: "", role: "", phone: "", active: true });
  const [payOpen, setPayOpen] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, note: "" });
  const { isAdmin } = useAuth();

  const save = async () => {
    if (!form.name) return toast.error("Nombre requerido");
    await db.employees.add({ ...form, active: true } as any);
    setOpen(false); setForm({ name: "", role: "", phone: "", active: true });
  };
  const pay = async () => {
    if (!payOpen || !payForm.amount) return toast.error("Monto requerido");
    const date = todayISO();
    await db.employeePayments.add({ employeeId: payOpen, amount: payForm.amount, date, note: payForm.note });
    await db.cash.add({ date, type: "egreso", amount: payForm.amount, concept: `Pago empleado`, refType: "pago_empleado", refId: payOpen });
    setPayForm({ amount: 0, note: "" }); setPayOpen(null);
    toast.success("Pago registrado");
  };
  const remove = async (id: number) => {
    if (!isAdmin) return toast.error("Solo admin");
    if (!confirm("¿Eliminar?")) return;
    await db.employees.delete(id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Empleados</h1><p className="text-sm text-muted-foreground">Equipo y registro de pagos.</p></div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nuevo</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => {
          const pays = payments.filter((p) => p.employeeId === e.id);
          const total = pays.reduce((a, b) => a + b.amount, 0);
          return (
            <div key={e.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{e.role || "—"} · {e.phone || ""}</div>
                </div>
                {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(e.id!)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
              </div>
              <div className="mt-3 rounded bg-muted/50 p-2 text-xs">
                <div className="flex justify-between"><span>Pagos totales</span><span className="font-semibold">{money(total)}</span></div>
                <div className="flex justify-between"><span>Registros</span><span>{pays.length}</span></div>
              </div>
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs">
                {pays.map((p) => (
                  <div key={p.id} className="flex justify-between text-muted-foreground">
                    <span>{dateShort(p.date)}</span>
                    <span className="font-semibold text-foreground">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-3 w-full" variant="outline" onClick={() => setPayOpen(e.id!)}><DollarSign className="mr-1 h-3.5 w-3.5" />Registrar pago</Button>
            </div>
          );
        })}
        {list.length === 0 && <div className="text-sm text-muted-foreground">Sin empleados.</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Rol</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen !== null} onOpenChange={(v) => !v && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Monto</Label><Input type="number" value={payForm.amount || ""} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Nota</Label><Input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setPayOpen(null)}>Cancelar</Button><Button onClick={pay}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
