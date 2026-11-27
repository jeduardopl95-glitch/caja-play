import type { Product } from "../../types";

type Venta = { id: string; fecha: string; items: Product[]; total: number; efectivo: number; cambio: number; resumen: string };
type Caja = { cart: Product[]; sales: Venta[] };
type StorageCaja = Pick<Storage, "getItem">;
const clave = "cajaplay_checkout";

export function leerCaja(storage: StorageCaja): Caja {
  const saved = storage.getItem(clave);
  if (saved) return JSON.parse(saved);
  return {
    cart: JSON.parse(storage.getItem("cajaplay_active_cart") || "[]"),
    sales: JSON.parse(storage.getItem("cajaplay_completed_sales") || "[]"),
  };
}
