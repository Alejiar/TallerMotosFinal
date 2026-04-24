export const money = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

export const dateShort = (s?: string) => {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

export const dateTime = (s?: string) => {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const todayISO = () => new Date().toISOString();
export const todayDateOnly = () => new Date().toISOString().slice(0, 10);
