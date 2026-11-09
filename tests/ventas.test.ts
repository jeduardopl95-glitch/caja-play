import assert from "node:assert/strict";
import { test } from "node:test";
import { guardarVenta, leerCaja } from "../src/modules/cobro/ventas";

test("un cobro consume el ticket activo y conserva el historial anterior", () => {
  const cart = [{ id: "1", name: "Agua", price: 20, quantity: 1 }];
  const venta = { id: "2", fecha: "09/11/2026", items: cart, total: 20, efectivo: 20, cambio: 0, resumen: "Agua" };
  const anterior = { ...venta, id: "1" };
  const data = new Map([
    ["cajaplay_active_cart", JSON.stringify(cart)],
    ["cajaplay_completed_sales", JSON.stringify([anterior])],
  ]);
  let writes = 0;
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { writes++; data.set(key, value); } };
  assert.equal(guardarVenta(storage, venta), true);
  assert.equal(guardarVenta(storage, venta), false);
  assert.equal(writes, 1);
  assert.deepEqual(leerCaja(storage), { cart: [], sales: [venta, anterior] });
});
