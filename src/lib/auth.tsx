import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { db, User, Role } from "./db";

interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

interface AuthCtx {
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "mototaller.session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
  }, []);

  const login = async (username: string, password: string) => {
    const u = await db.users
      .where("username")
      .equalsIgnoreCase(username.trim())
      .first();
    if (!u || !u.active || u.password !== password) return false;
    const sess: SessionUser = { id: u.id!, username: u.username, name: u.name, role: u.role };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sess));
    setUser(sess);
    return true;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
