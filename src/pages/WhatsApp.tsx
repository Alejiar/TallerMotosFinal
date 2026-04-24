import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, QrCode, WifiOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type WaStatus = "disconnected" | "loading" | "qr" | "connected" | "error";

export default function WhatsApp() {
  const [status, setStatus] = useState<WaStatus>("disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [loadingTime, setLoadingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const previousStatusRef = useRef<WaStatus>("disconnected");
  const initAttemptRef = useRef(false);

  const fetchStatus = async () => {
    try {
      const r = await fetch("http://localhost:3000/api/whatsapp/status");
      if (!r.ok) return;
      const d = await r.json();
      
      // Detectar cambio de estado para notificaciones
      if (previousStatusRef.current !== d.status) {
        console.log(`[UI] Estado cambió de ${previousStatusRef.current} a ${d.status}`);
        
        // Si se desconectó
        if (previousStatusRef.current === "connected" && d.status === "disconnected") {
          toast.error("WhatsApp se desconectó. Intentando reconectar automáticamente...", {
            duration: 5000,
          });
        }
        
        // Si se reconectó
        if (previousStatusRef.current !== "connected" && d.status === "connected") {
          toast.success("WhatsApp conectado correctamente", {
            duration: 3000,
          });
        }
        
        previousStatusRef.current = d.status;
      }
      
      setStatus(d.status);
      setQr(d.qr ?? null);
      
      // Si se generó el QR, limpiar error
      if (d.status === "qr" || d.status === "connected") {
        setError(null);
      }
    } catch (e) {
      console.error("Error fetching status:", e);
    }
  };

  // Inicializar WhatsApp automáticamente al cargar
  useEffect(() => {
    const initializeWhatsApp = async () => {
      if (initAttemptRef.current) return;
      initAttemptRef.current = true;
      
      try {
        console.log("[UI] Inicializando WhatsApp automáticamente...");
        const r = await fetch("http://localhost:3000/api/whatsapp/init", { method: "POST" });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          console.error("[UI] Error al inicializar:", d.error);
        }
      } catch (e) {
        console.error("[UI] Error de conexión al inicializar:", e);
      }
    };

    initializeWhatsApp();
  }, []);

  // Monitoreo de timeout para loading
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (status === "loading") {
      setLoadingTime(0);
      timer = setInterval(() => {
        setLoadingTime(prev => {
          const newTime = prev + 1;
          // Timeout en 50 segundos (el backend usa 45)
          if (newTime > 50) {
            setStatus("error");
            setError("La conexión tardó demasiado. El sistema intentará reconectar automáticamente.");
            toast.error("Timeout: Reintentando conexión automáticamente");
            return prev;
          }
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  // Polling más frecuente mientras está cargando
  useEffect(() => {
    fetchStatus();
    
    // Intervalo diferente según el estado
    const interval = status === "loading" 
      ? setInterval(fetchStatus, 1000) // Cada 1 segundo si está cargando
      : setInterval(fetchStatus, 3000); // Cada 3 segundos en otros estados
    
    return () => clearInterval(interval);
  }, [status]);

  const disconnectWa = async () => {
    try {
      await fetch("http://localhost:3000/api/whatsapp/disconnect", { method: "POST" });
      setStatus("disconnected");
      setQr(null);
      setError(null);
      previousStatusRef.current = "disconnected";
      toast.success("WhatsApp desconectado manualmente");
    } catch (e) {
      toast.error("Error al desconectar");
    }
  };

  const retry = () => {
    setError(null);
    setStatus("disconnected");
    // Reintentar conexión
    fetch("http://localhost:3000/api/whatsapp/init", { method: "POST" }).catch(e => 
      console.error("[UI] Error al reintentar:", e)
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Vinculación automática de WhatsApp para notificaciones.
        </p>
      </div>

      <div className="mx-auto max-w-sm rounded-2xl border bg-card p-8 shadow-card text-center space-y-6">
        {status === "disconnected" && (
          <>
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-5">
                <WifiOff className="h-12 w-12 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold">Conectando...</p>
              <p className="mt-1 text-sm text-muted-foreground">
                El sistema está intentando conectar automáticamente.
              </p>
            </div>
            <Button className="w-full" size="lg" onClick={retry} variant="outline">
              <QrCode className="mr-2 h-5 w-5" />
              Reintentar Ahora
            </Button>
          </>
        )}

        {status === "loading" && (
          <>
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-5">
                <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold">Generando código QR...</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Por favor escanea el código con tu teléfono.
              </p>
              <div className="mt-4 space-y-2">
                <div className="w-full bg-muted rounded-full h-1">
                  <div
                    className="bg-primary h-1 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((loadingTime / 45) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {loadingTime}s / 45s
                </p>
              </div>
            </div>
          </>
        )}

        {status === "qr" && qr && (
          <>
            <div>
              <p className="text-lg font-semibold">✓ Código QR Listo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Abre WhatsApp en tu celular → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>
              </p>
            </div>
            <div className="flex justify-center">
              <img
                src={qr}
                alt="WhatsApp QR"
                className="rounded-xl border-4 border-white shadow-elevated w-52 h-52"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Escanea con tu teléfono para vincular WhatsApp
            </p>
          </>
        )}

        {status === "connected" && (
          <>
            <div className="flex justify-center">
              <div className="rounded-full bg-success/10 p-5">
                <CheckCircle2 className="h-12 w-12 text-success" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-success">WhatsApp Conectado ✓</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviando notificaciones automáticamente a los clientes.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={disconnectWa}>
              Desconectar
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-5">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-destructive">Error de conexión</p>
              {error && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {error}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground font-semibold">
                Verificar:
              </p>
              <ul className="mt-2 text-xs text-muted-foreground text-left space-y-1">
                <li>✓ Conexión a internet estable</li>
                <li>✓ WhatsApp Web no abierto</li>
                <li>✓ Sin sesión activa en otro dispositivo</li>
              </ul>
            </div>
            <Button className="w-full" onClick={retry}>
              Reintentar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
