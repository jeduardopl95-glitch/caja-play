import assert from "node:assert/strict";
import { test } from "node:test";
import { importarInventario, departamentos, seleccionarDepartamento, buscarCodigo } from "../src/modules/inventario/importador";
import { registrar, corregir, calcular, avisoEntrada } from "../src/modules/inventario/movimientos";
import type { Movimiento } from "../src/modules/inventario/tipos";

const cabecera = "Código;Producto;P. Venta;Existencia;Departamento";
const csv = cabecera + '\r\n0012;"Jabón; ""azul""";ignorar;4.00;Limpieza\r\nABC;Pan;;-0.25;Abarrotes';
const bytes = (s: string) => new TextEncoder().encode(s);

test("imports only inventory fields, with quoted records, decimals and legacy encodings", () => {
  const catalogo = importarInventario(bytes("\ufeff" + csv));
  assert.deepEqual(catalogo[0], { codigo: "0012", descripcion: 'Jabón; "azul"', original: "4", departamento: "Limpieza" });
  assert.equal(catalogo[1].original, "-0.25");
  assert.deepEqual(departamentos(catalogo), ["Abarrotes", "Limpieza"]);
  const activos = seleccionarDepartamento(catalogo, "Limpieza");
  assert.equal(activos.length, 1);
  assert.equal(buscarCodigo(catalogo, "abc")[0].departamento, "Abarrotes");
  assert.throws(() => seleccionarDepartamento(catalogo, "Otro"));
  const legacy = Uint8Array.from(csv, c => c.charCodeAt(0));
  assert.deepEqual(importarInventario(legacy), catalogo);
  assert.equal(importarInventario(bytes(csv.replaceAll(";", "\t").replace('Jabón\t', 'Jabón;'))).length, 2);
});

test("rejects malformed stock, records and duplicate codes; preserves equivalent candidates", () => {
  for (const valor of ["", "1,000", "4x", "1e3"]) {
    assert.throws(() => importarInventario(bytes(cabecera + "\nA;Pan;;" + valor + ";Abarrotes")), /fila 2/i);
  }
  assert.throws(() => importarInventario(bytes(csv + "\nabc;Pan;;0;Abarrotes")), /duplicado/i);
  assert.throws(() => importarInventario(bytes(cabecera + '\nA;"Pan"";;1;Abarrotes')), /fila 2/i);
  const catalogo = importarInventario(bytes("Código,Producto,Existencia,Departamento\n123456789012,A,0,X\n0123456789012,B,0,Y"));
  assert.equal(buscarCodigo(catalogo, "123456789012").length, 2);
  assert.deepEqual(buscarCodigo(catalogo, "desconocido"), []);
});

const producto = { codigo: "A", descripcion: "Pan", departamento: "Abarrotes", original: "30" };
const movimiento = (id: number, tipo: Movimiento["tipo"], cantidad: string, contabilizadas = "0"): Movimiento => ({
  id: String(id), codigo: "A", tipo, cantidad, fecha: `2026-11-24T00:00:${String(id).padStart(2, "0")}.000Z`,
  ...(tipo === "venta" ? { contabilizadas } : {})
} as Movimiento);
const conteo = movimiento(1, "conteo", "27");

test("replays cumulative counts, mixed sales and entries using exact decimals", () => {
  const historial = [conteo, movimiento(2,"conteo","0.1"),movimiento(3,"conteo","0.2"),movimiento(4,"entrada","10"),movimiento(5,"venta","5","2")];
  const r = calcular(producto, historial);
  assert.deepEqual([r.ajustada,r.fisica,r.diferencia,r.revision], ["35","35.3","0.3","revisado"]);
  assert.deepEqual(calcular(producto, [conteo, movimiento(2,"venta","5","5")]).fisica, "22");
  assert.deepEqual(calcular(producto, [conteo, movimiento(2,"venta","5")]).fisica, "27");
  assert.deepEqual(avisoEntrada(calcular(producto,historial)), { restante: null });
  assert.deepEqual(avisoEntrada(calcular(producto,historial.slice(0,4))), { restante: "10" });
});

test("distinguishes an optional zero, mandatory review and an explicitly reviewed zero", () => {
  const cero = {...producto,original:"0"};
  assert.equal(calcular(cero,[]).revision,"opcional");
  assert.equal(calcular({...producto,original:"-2"},[]).revision,"pendiente");
  assert.equal(calcular(producto,[movimiento(1,"venta","30")]).revision,"pendiente");
  assert.equal(calcular(cero,[movimiento(1,"entrada","0.1"),movimiento(2,"venta","0.1","0.1")]).revision,"pendiente");
  assert.equal(calcular(cero,[movimiento(1,"conteo","0")]).revision,"revisado");
});

test("external stock is unknown; validates chronological edits, deletion and operation retries", () => {
  const externo = {...producto,original:null,departamento:null};
  const r = calcular(externo,[movimiento(1,"entrada","2"),movimiento(2,"venta","1","1")]);
  assert.deepEqual([r.original,r.ajustada,r.fisica,r.diferencia],[null,null,"1",null]);
  const historial = registrar(producto,[conteo],movimiento(2,"venta","8","8"));
  assert.equal(registrar(producto,historial,{...conteo,cantidad:"27.0"}),historial);
  assert.throws(() => registrar(producto,historial,{...conteo,cantidad:"26"}), /identificador/i);
  assert.throws(() => registrar(producto,historial,{...conteo,id:"nuevo"}), /orden/i);
  assert.throws(() => corregir(producto,historial,"1","5"),/2/);
  assert.throws(() => corregir(producto,historial,"1",null),/2/);
  assert.equal(calcular(producto,corregir(producto,historial,"1","10")).fisica,"2");
  assert.deepEqual(corregir(producto,historial,"2",null),[conteo]);
  assert.throws(() => registrar(producto,[],movimiento(1,"venta","1","2")),/1/);
  assert.throws(() => registrar(producto,[],movimiento(1,"entrada","0")),/1/);
  assert.equal(calcular(producto,[movimiento(1,"venta","31")]).ajustada,"-1");
});

test("rejects unknown movement types before changing physical stock", () => {
  const invalido = { ...conteo, tipo: "otro" } as unknown as Movimiento;
  assert.throws(() => registrar(producto, [], invalido), /tipo.*invalido/i);
});

test("reports remaining entries exactly when no other counted units could have been sold", () => {
  const historial = [movimiento(1,"entrada","0.3"), movimiento(2,"venta","0.1","0.1")];
  assert.deepEqual(avisoEntrada(calcular(producto,historial)), { restante: "0.2" });
  assert.equal(avisoEntrada(calcular(producto,[...historial,movimiento(3,"venta","0.2","0.2")])), null);
  assert.equal(calcular(producto,corregir(producto,[conteo,movimiento(2,"venta","8","8")],"2","5","3")).fisica,"24");
});
