import assert from "node:assert/strict";
import { test } from "node:test";
import { fechaCancun } from "../src/lib/fecha";
import { calcularCobro, conciliarEfectivo } from "../src/lib/dinero";
import { cargarPaginas } from "../src/modules/caducidades/paginas";

test("cobro acepta el pago exacto y calcula el faltante", () => {
  const ticket = [{ price: 0.1, quantity: 1 }, { price: 0.2, quantity: 1 }];
  assert.deepEqual(calcularCobro(ticket, "0.30"), { total: 0.30, diferencia: 0, suficiente: true });
  assert.deepEqual(calcularCobro(ticket, "0.29"), { total: 0.30, diferencia: -0.01, suficiente: false });
});

test("corte usa el dia de Cancun al cruzar medianoche UTC", () => {
  assert.equal(fechaCancun(new Date("2026-11-08T00:00:00Z")), "2026-11-07");
});

test("un centavo no cuadra y el ruido decimal no crea diferencias", () => {
  assert.deepEqual(conciliarEfectivo(0.3, 0.1 + 0.2), { diferencia: 0, estado: "exacto" });
  assert.deepEqual(conciliarEfectivo(0.29, 0.30), { diferencia: -0.01, estado: "faltante" });
  assert.deepEqual(conciliarEfectivo(0.31, 0.30), { diferencia: 0.01, estado: "sobrante" });
});

test("caducidades carga mas de mil registros y no devuelve listas parciales ante errores", async () => {
  const rows = Array.from({ length: 1051 }, (_, i) => ({ fecha: "2026-11-10", id: String(i).padStart(4, "0") }));
  let pendientes = rows;
  assert.deepEqual(await cargarPaginas<typeof rows[number]>(async (cursor, limite) => {
    if (cursor) pendientes = rows.slice(1);
    return pendientes.filter(row => !cursor || row.id > cursor.id).slice(0, limite);
  }), rows);
  await assert.rejects(cargarPaginas<typeof rows[number]>(async (cursor, limite) => {
    if (cursor) throw new Error("sin conexion");
    return rows.slice(0, limite);
  }), /sin conexion/);
});
