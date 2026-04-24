import Dexie, { Table } from "dexie";
import { backendGet } from "@/lib/backend";

export type Role = "admin" | "empleado";

export interface User {
  id?: number;
  username: string;
  password: string; // local app, almacenado en claro a propósito (offline)
  name: string;
  role: Role;
  active: boolean;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  notes?: string;
  createdAt: string;
}

export interface Bike {
  id?: number;
  customerId: number;
  plate: string;
  model: string; // tipo/modelo
  year?: string;
  color?: string;
  createdAt: string;
}

export type OrderStatus =
  | "ingresada"
  | "diagnostico"
  | "esperando_repuestos"
  | "reparacion"
  | "lista"
  | "entregada";

export interface OrderItem {
  productId?: number; // si proviene de inventario
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrderService {
  description: string;
  price: number;
}

export interface WorkOrder {
  id?: number;
  number: string; // OR-00001
  customerId: number;
  bikeId: number;
  problem: string;
  status: OrderStatus;
  entryDate: string;
  estimatedDate?: string;
  parts: OrderItem[];
  services: OrderService[];
  evidences: string[]; // dataURLs
  locked: boolean;
  total: number;
  notes?: string;
}

export interface Product {
  id?: number;
  code: string;
  name: string;
  stock: number;
  minStock: number;
  shelf?: string;
  price: number;
  cost?: number;
  active: boolean;
  supplierId?: number;
  createdAt: string;
}

export interface SaleItem {
  productId: number;
  code: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export type PaymentMethod = "efectivo" | "transferencia" | "qr";

export interface Sale {
  id?: number;
  number: string; // 00001
  date: string;
  items: SaleItem[];
  total: number;
  method: PaymentMethod;
  type: "mostrador" | "orden";
  orderId?: number;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  productsHint?: string;
  active: boolean;
}

export interface Employee {
  id?: number;
  name: string;
  role?: string;
  phone?: string;
  active: boolean;
}

export interface EmployeePayment {
  id?: number;
  employeeId: number;
  amount: number;
  date: string;
  note?: string;
}

export interface CashEntry {
  id?: number;
  date: string;
  type: "ingreso" | "egreso";
  amount: number;
  concept: string;
  refType?: "venta" | "orden" | "compra" | "pago_empleado" | "manual";
  refId?: number;
}

export interface Note {
  id?: number;
  title: string;
  body: string;
  createdAt: string;
  done: boolean;
}

export interface MessageTemplate {
  id?: number;
  key: string; // ingreso, proceso, finalizacion
  label: string;
  body: string; // soporta {cliente} {placa} {moto} {orden} {estado}
}

export interface Counter {
  id?: number;
  key: "order" | "sale";
  value: number;
}

class TallerDB extends Dexie {
  users!: Table<User, number>;
  customers!: Table<Customer, number>;
  bikes!: Table<Bike, number>;
  orders!: Table<WorkOrder, number>;
  products!: Table<Product, number>;
  sales!: Table<Sale, number>;
  suppliers!: Table<Supplier, number>;
  employees!: Table<Employee, number>;
  employeePayments!: Table<EmployeePayment, number>;
  cash!: Table<CashEntry, number>;
  notes!: Table<Note, number>;
  templates!: Table<MessageTemplate, number>;
  counters!: Table<Counter, number>;

  constructor() {
    super("MotoTallerDB");
    this.version(1).stores({
      users: "++id,&username,role,active",
      customers: "++id,name,phone",
      bikes: "++id,customerId,plate",
      orders: "++id,&number,customerId,bikeId,status,entryDate",
      products: "++id,&code,name,active,shelf,stock",
      sales: "++id,&number,date,type",
      suppliers: "++id,name,active",
      employees: "++id,name,active",
      employeePayments: "++id,employeeId,date",
      cash: "++id,date,type",
      notes: "++id,createdAt,done",
      templates: "++id,&key",
      counters: "++id,&key",
    });
  }
}

export const db = new TallerDB();

export const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  ingresada: { label: "Ingresada", color: "bg-warning/15 text-warning-foreground border-warning/30" },
  diagnostico: { label: "En diagnóstico", color: "bg-warning/15 text-warning-foreground border-warning/30" },
  esperando_repuestos: { label: "Esperando repuestos", color: "bg-info/15 text-info border-info/30" },
  reparacion: { label: "En reparación", color: "bg-info/15 text-info border-info/30" },
  lista: { label: "Lista para entregar", color: "bg-success/15 text-success border-success/30" },
  entregada: { label: "Entregada", color: "bg-muted text-muted-foreground border-border" },
};

export async function nextCounter(key: "order" | "sale"): Promise<number> {
  return db.transaction("rw", db.counters, async () => {
    const c = await db.counters.where("key").equals(key).first();
    if (!c) {
      await db.counters.add({ key, value: 1 });
      return 1;
    }
    const next = c.value + 1;
    await db.counters.update(c.id!, { value: next });
    return next;
  });
}

export function formatOrderNumber(n: number) {
  return "OR-" + String(n).padStart(5, "0");
}
export function formatSaleNumber(n: number) {
  return String(n).padStart(5, "0");
}

async function loadBackendData(): Promise<boolean> {
  try {
    const payload = await backendGet("/sync/all");
    if (!payload || typeof payload !== "object") return false;

    const count = await db.users.count();
    if (count !== 0) return true;

    await db.transaction(
      "rw",
      db.users,
      db.customers,
      db.bikes,
      db.orders,
      db.products,
      db.sales,
      db.suppliers,
      db.employees,
      db.employeePayments,
      db.cash,
      db.notes,
      db.templates,
      db.counters,
      async () => {
        if (Array.isArray(payload.usuarios)) await db.users.bulkPut(payload.usuarios);
        if (Array.isArray(payload.clientes)) await db.customers.bulkPut(payload.clientes);
        if (Array.isArray(payload.motos)) await db.bikes.bulkPut(payload.motos);
        if (Array.isArray(payload.ordenes)) await db.orders.bulkPut(payload.ordenes);
        if (Array.isArray(payload.productos)) await db.products.bulkPut(payload.productos);
        if (Array.isArray(payload.ventas)) await db.sales.bulkPut(payload.ventas);
        if (Array.isArray(payload.proveedores)) await db.suppliers.bulkPut(payload.proveedores);
        if (Array.isArray(payload.empleados)) await db.employees.bulkPut(payload.empleados);
        if (Array.isArray(payload.pagos_empleados)) await db.employeePayments.bulkPut(payload.pagos_empleados);
        if (Array.isArray(payload.caja)) await db.cash.bulkPut(payload.caja);
        if (Array.isArray(payload.notas)) await db.notes.bulkPut(payload.notas);
        if (Array.isArray(payload.templates)) await db.templates.bulkPut(payload.templates);
        if (Array.isArray(payload.counters)) await db.counters.bulkPut(payload.counters);
      },
    );
    return true;
  } catch (error) {
    console.warn("Load backend data failed:", error);
    return false;
  }
}

export async function seed() {
  const hasBackendData = await loadBackendData();

  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd([
      { username: "admin", password: "admin", name: "Administrador", role: "admin", active: true },
      { username: "empleado", password: "1234", name: "Empleado Demo", role: "empleado", active: true },
    ]);
  }
  const tplCount = await db.templates.count();
  if (tplCount === 0) {
    await db.templates.bulkAdd([
      { key: "ingreso", label: "Ingreso de moto", body: "Hola {cliente}, recibimos tu moto {moto} placa {placa}. Orden {orden}. Te avisaremos cuando avance. ¡Gracias!" },
      { key: "proceso", label: "Cambio de estado", body: "Hola {cliente}, tu orden {orden} ahora está en estado: {estado}." },
      { key: "finalizacion", label: "Lista para entregar", body: "Hola {cliente}, tu moto {moto} ({placa}) está lista para entregar. Orden {orden}. Te esperamos." },
    ]);
  }
  const prodCount = await db.products.count();
  if (prodCount === 0) {
    const now = new Date().toISOString();
    await db.products.bulkAdd([
      { code: "7501001", name: "Aceite 20W50 1L", stock: 12, minStock: 5, shelf: "A1", price: 35000, active: true, createdAt: now },
      { code: "7501002", name: "Filtro de aire universal", stock: 4, minStock: 5, shelf: "B2", price: 22000, active: true, createdAt: now },
      { code: "7501003", name: "Pastillas de freno", stock: 20, minStock: 6, shelf: "C1", price: 28000, active: true, createdAt: now },
      { code: "7501004", name: "Bujía NGK", stock: 2, minStock: 4, shelf: "D3", price: 12000, active: true, createdAt: now },
    ]);
  }
}
