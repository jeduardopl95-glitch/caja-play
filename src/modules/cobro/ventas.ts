import type { Product } from "../../types";

type Venta = { id: string; fecha: string; items: Product[]; total: number; efectivo: number; cambio: number; resumen: string };
type Caja = { cart: Product[]; sales: Venta[] };
type StorageCaja = Pick<Storage, "getItem" | "setItem">;
const clave = "cajaplay_checkout";

export function leerCaja(storage: StorageCaja): Caja {
  const saved = storage.getItem(clave);
  if (saved) return JSON.parse(saved);
  return {
    cart: JSON.parse(storage.getItem("cajaplay_active_cart") || "[]"),
    sales: JSON.parse(storage.getItem("cajaplay_completed_sales") || "[]"),
  };
}

export function guardarTicket(storage: StorageCaja, cart: Product[]) {
  storage.setItem(clave, JSON.stringify({ ...leerCaja(storage), cart }));
}

export function guardarVenta(storage: StorageCaja, venta: Venta) {
  const caja = leerCaja(storage);
  if (!caja.cart.length || JSON.stringify(caja.cart) !== JSON.stringify(venta.items)) return false;
  storage.setItem(clave, JSON.stringify({ cart: [], sales: [venta, ...caja.sales] }));
  return true;
}
