import assert from "node:assert/strict";
import { test } from "node:test";
import { leerCaja } from "../src/modules/cobro/ventas";

test("la migración puede leer ambos formatos de almacenamiento anterior sin combinarlos", () => {
  const cart = [{ id: "1", name: "Agua", price: 20, quantity: 1 }];
  const venta = { id: "2", fecha: "09/11/2026 14:00", items: cart, total: 20, efectivo: 20, cambio: 0, resumen: "Agua" };
  const anterior = { ...venta, id: "1" };
  const data = new Map([
    ["cajaplay_active_cart", JSON.stringify(cart)],
    ["cajaplay_completed_sales", JSON.stringify([anterior])],
  ]);
  const storage = { getItem: (key: string) => data.get(key) ?? null };
  assert.deepEqual(leerCaja(storage), { cart, sales: [anterior] });
  data.set("cajaplay_checkout", JSON.stringify({ cart: [], sales: [venta, anterior] }));
  assert.deepEqual(leerCaja(storage), { cart: [], sales: [venta, anterior] });
});
