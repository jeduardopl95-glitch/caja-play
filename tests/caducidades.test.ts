import assert from "node:assert/strict";
import { test } from "node:test";
import { diasParaVencer, productoExacto, proveedorDe, proximaVisita, tipoAviso } from "../src/modules/caducidades/visitas";

test("manual capture identifies exact, unique products by name or code", () => {
  const frijol = { codigo: "001", descripcion: "Frijol Negro", departamento: "Abarrotes", id: "1", precio: 22 };
  assert.equal(productoExacto([frijol], " frijol NEGRO "), frijol);
  assert.equal(productoExacto([frijol], "001"), frijol);
  assert.equal(productoExacto([frijol], "001", "codigo"), frijol);
  assert.equal(productoExacto([frijol], "Frijol Negro", "codigo"), undefined);
  assert.equal(productoExacto([frijol], "001", "descripcion"), undefined);
  assert.equal(productoExacto([frijol], "Frijol"), undefined);
  assert.equal(productoExacto([frijol, { ...frijol, codigo: "002" }], "Frijol Negro"), undefined);
});

test("supplier alerts start five days before expiration in Chetumalito", () => {
  assert.equal(diasParaVencer("2026-11-07", "2026-11-12"), 5);
  assert.equal(tipoAviso(6, "Coca Cola", true), null);
  assert.equal(tipoAviso(5, "Coca Cola", true), "cambio");
  assert.equal(tipoAviso(5, "Coca Cola", false), null);
});

test("grocery promotions start immediately for a new lot due in 22 days", () => {
  assert.equal(tipoAviso(31, "Abarrotes", true), null);
  assert.equal(tipoAviso(30, "Abarrotes", true), "promocion");
  assert.equal(tipoAviso(22, "Abarrotes", false), "promocion");
  assert.equal(tipoAviso(-1, "Abarrotes", true), "vencido");
});

test("next eligible visit skips deliveries and repeats weekly", () => {
  assert.equal(proveedorDe("Coca Cola"), "Coca-Valle");
  assert.equal(proveedorDe("Abarrotes"), "");
  assert.deepEqual(proximaVisita("2026-11-11", "Coca-Valle"), { dia: "Jueves", fecha: "2026-11-12" });
  assert.deepEqual(proximaVisita("2026-11-08", "Sigma"), { dia: "Sábado", fecha: "2026-11-14" });
  assert.equal(proximaVisita("2026-11-07", "Jumex"), null);
});
