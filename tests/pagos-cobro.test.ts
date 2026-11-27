import test from "node:test";
import assert from "node:assert/strict";
import { calcularPago, resumirCobros } from "../src/modules/cobro/pagos";

test("calcula los cuatro métodos y redondea hacia arriba solo los USD necesarios", () => {
  const cambio = "15";
  const exacto = calcularPago(18400, { metodo: "efectivo", efectivo: "184", cambio });
  const efectivo = calcularPago(18400, { metodo: "efectivo", efectivo: "500", cambio });
  const dolares = calcularPago(18400, { metodo: "dolares", dolares: "20", cambio });
  const tarjeta = calcularPago(18400, { metodo: "tarjeta", tarjeta: "185", cambio, folio: "0004 " });
  const mezcla = { metodo: "mixto", efectivo: "50", tarjeta: "50", cambio } as const;
  const pendiente = calcularPago(18400, mezcla);
  const mixto = calcularPago(18400, { ...mezcla, dolares: "6" });
  assert.deepEqual([exacto.cambioMXN, efectivo.cambioMXN], [0, 31600]);
  assert.deepEqual([dolares.usdNecesarios, dolares.equivalente, dolares.cambioMXN], [1227, 30000, 11600]);
  assert.deepEqual([tarjeta.tarjeta, tarjeta.folio, tarjeta.suficiente], [18500, "0004", true]);
  assert.deepEqual([pendiente.pendiente, pendiente.usdPendientes, pendiente.suficiente], [8400, 560, false]);
  assert.deepEqual([mixto.recibido, mixto.cambioMXN], [19000, 600]);
  assert.deepEqual(resumirCobros([{ total: 18400, pago: efectivo, traspasada: true },
    { total: 18400, pago: dolares, traspasada: false }, { total: 18400, pago: mixto, traspasada: false }]), {
    ventas: 3, total: 55200, efectivoNeto: 11200, dolares: 2600, equivalente: 39000, tarjeta: 5000, pendientes: 2, traspasadas: 1
  });
});

test("rechaza importes inválidos y no usa importes de métodos inactivos", () => {
  for (const efectivo of ["-1", "1e3", "Infinity", "12.345", " "]) {
    assert.equal(calcularPago(100, { metodo: "efectivo", efectivo, cambio: "15" }).valido, false);
  }
  assert.equal(calcularPago(100, { metodo: "dolares", dolares: "2", cambio: "0" }).valido, false);
  assert.equal(calcularPago(100, { metodo: "tarjeta", tarjeta: "1,00", efectivo: "999", cambio: "15" }).recibido, 100);
  assert.equal(calcularPago(100, { metodo: "dolares", dolares: "0.01", cambio: "15.50" }).equivalente, 16);
});
