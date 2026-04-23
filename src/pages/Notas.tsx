import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dateShort, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Notas() {
  const list = useLiveQuery(() => db.notes.orderBy("createdAt").reverse().toArray(), []) ?? [];
  const [form, setForm] = useState({ title: "", body: "" });

  const add = async () => {
    if (!form.title) return toast.error("Título requerido");
    await db.notes.add({ ...form, createdAt: todayISO(), done: false });
    setForm({ title: "", body: "" });
  };
  const toggle = async (id: number, done: boolean) => db.notes.update(id, { done: !done });
  const remove = async (id: number) => db.notes.delete(id);

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h3 className="mb-3 font-semibold">Nueva nota</h3>
        <div className="space-y-2">
          <Input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea rows={4} placeholder="Detalle..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <Button className="w-full" onClick={add}><Plus className="mr-1 h-4 w-4" />Guardar</Button>
        </div>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Notas y recordatorios</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((n) => (
            <div key={n.id} className={`rounded-xl border bg-card p-4 shadow-card ${n.done ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className={`font-semibold ${n.done ? "line-through" : ""}`}>{n.title}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{dateShort(n.createdAt)}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(n.id!, n.done)}><Check className="h-3.5 w-3.5 text-success" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(n.id!)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{n.body}</p>
            </div>
          ))}
          {list.length === 0 && <div className="text-sm text-muted-foreground">Sin notas.</div>}
        </div>
      </div>
    </div>
  );
}
