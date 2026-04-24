import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Bike, ClipboardList, Package, ShoppingCart,
  Receipt, Truck, ShoppingBasket, Wrench, Wallet, StickyNote, Shield,
  MessageSquare, MessageCircle, LogOut, Menu, X, Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/motos", icon: Bike, label: "Motos" },
  { to: "/ordenes", icon: ClipboardList, label: "Órdenes" },
  { to: "/inventario", icon: Package, label: "Inventario" },
  { to: "/ventas", icon: ShoppingCart, label: "Ventas" },
  { to: "/facturas", icon: Receipt, label: "Facturas" },
  { to: "/proveedores", icon: Truck, label: "Proveedores" },
  { to: "/compras", icon: ShoppingBasket, label: "Compras" },
  { to: "/empleados", icon: Wrench, label: "Empleados" },
  { to: "/caja", icon: Wallet, label: "Caja" },
  { to: "/garantias", icon: Shield, label: "Garantías" },
  { to: "/notas", icon: StickyNote, label: "Notas" },
  { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp" },
  { to: "/mensajes", icon: MessageSquare, label: "Plantillas" },
  { to: "/buscar", icon: Search, label: "Búsqueda" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent text-accent-foreground">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">MotoTaller</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Gestión Pro</div>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="scroll-fade flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )
              }
            >
              <it.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-md bg-sidebar-accent/40 px-3 py-2">
            <div className="text-xs font-medium text-sidebar-foreground">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:px-6">
          <button className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-sm text-muted-foreground">
            {items.find((i) => i.to === loc.pathname)?.label ?? "MotoTaller"}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
