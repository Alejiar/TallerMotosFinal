import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { seed } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Motos from "@/pages/Motos";
import Ordenes from "@/pages/Ordenes";
import OrdenDetalle from "@/pages/OrdenDetalle";
import Clientes from "@/pages/Clientes";
import Inventario from "@/pages/Inventario";
import Ventas from "@/pages/Ventas";
import Facturas from "@/pages/Facturas";
import Proveedores from "@/pages/Proveedores";
import Compras from "@/pages/Compras";
import Empleados from "@/pages/Empleados";
import Caja from "@/pages/Caja";
import Notas from "@/pages/Notas";
import Garantias from "@/pages/Garantias";
import Mensajes from "@/pages/Mensajes";
import WhatsApp from "@/pages/WhatsApp";
import Buscar from "@/pages/Buscar";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Protected() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/motos" element={<Motos />} />
        <Route path="/ordenes" element={<Ordenes />} />
        <Route path="/ordenes/:id" element={<OrdenDetalle />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/facturas" element={<Facturas />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/empleados" element={<Empleados />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/notas" element={<Notas />} />
        <Route path="/garantias" element={<Garantias />} />
        <Route path="/whatsapp" element={<WhatsApp />} />
        <Route path="/mensajes" element={<Mensajes />} />
        <Route path="/buscar" element={<Buscar />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

const App = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => { seed().then(() => setReady(true)); }, []);
  if (!ready) return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Iniciando MotoTaller...</div>;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <AuthProvider>
            <Protected />
          </AuthProvider>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
