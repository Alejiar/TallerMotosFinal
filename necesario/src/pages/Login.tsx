import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (!ok) toast.error("Usuario o contraseña inválidos");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-primary p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-elevated animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-accent text-accent-foreground">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">MotoTaller</h1>
            <p className="text-xs text-muted-foreground">Sistema de gestión local</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u">Usuario</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Contraseña</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <div className="mt-6 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Usuarios de prueba</div>
          <div>Admin: <span className="font-mono">admin / admin</span></div>
          <div>Empleado: <span className="font-mono">empleado / 1234</span></div>
        </div>
      </div>
    </div>
  );
}
