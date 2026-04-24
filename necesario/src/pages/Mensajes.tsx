import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const VARS = ["{cliente}", "{placa}", "{moto}", "{orden}", "{estado}"];

export default function Mensajes() {
  const templates = useLiveQuery(() => db.templates.toArray(), []) ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(templates.map((t) => [t.id!, t.body])));
  }, [templates.length]);

  const save = async (id: number) => {
    await db.templates.update(id, { body: drafts[id] ?? "" });
    toast.success("Plantilla guardada");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plantillas de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Variables: {VARS.map((v) => <code key={v} className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">{v}</code>)}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-4 shadow-card">
            <div className="mb-2"><Label>{t.label}</Label></div>
            <Textarea rows={6} value={drafts[t.id!] ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id!]: e.target.value })} />
            <Button className="mt-3 w-full" size="sm" onClick={() => save(t.id!)}>Guardar</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
