import assert from "node:assert/strict";
import { test } from "node:test";
import { generarPDFInventario } from "../src/modules/inventario/pdf";
import type { Movimiento, ProductoImportado } from "../src/modules/inventario/tipos";

const producto = (codigo: string, descripcion: string, original = "1.25"): ProductoImportado =>
  ({ codigo, descripcion, original, departamento: "Abarrotes" });
const catalogo = [
  producto("A1", "Pan ficticio"), producto("B2", "Arroz ficticio"), producto("C3", "Sal ficticia"),
  producto("D4", "Pendiente ficticio"), producto("E5", "Cero opcional", "0"),
  producto("F6", "Cero con venta"), { ...producto("G7", "Otro departamento"), departamento: "Bebidas" }
];
const fecha = "2026-11-24T14:00:00Z";
const conteo = (codigo: string, cantidad: string): Movimiento => ({ id: codigo, codigo, cantidad, fecha, tipo: "conteo" });
const movimientos: Movimiento[] = [
  conteo("A1", "0"), conteo("B2", "1.25"), conteo("C3", "1.2500000000000001"), conteo("EXT", "0.2"),
  { id: "venta", codigo: "F6", tipo: "venta", cantidad: "1.25", contabilizadas: "0", fecha }
];
const fuente = {
  sucursal: "JUNIOR", departamento: "Abarrotes", fechaReferencia: fecha, catalogo, movimientos,
  externos: [{ codigo: "EXT", descripcion: "Externo ficticio", original: null, departamento: null }]
} as const;
const paginas = (doc: ReturnType<typeof generarPDFInventario>["doc"]) =>
  (doc.internal as unknown as {pages: string[][]}).pages.slice(1).map(p => p.join("\n"));

test("PDF horizontal, subtotales solo de revisados y secciones separadas", () => {
  const antes = JSON.stringify(fuente);
  const { doc, blob, resumen } = generarPDFInventario(fuente, new Date("2026-11-25T14:00:00Z"));
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  assert.equal(blob.type, "application/pdf");
  assert.equal(JSON.stringify(fuente), antes);
  assert.deepEqual(resumen, { revisados: 3, pendientes: 2, faltantes: 1, sobrantes: 1, coincidentes: 1 });
  const texto = paginas(doc).join("\n");
  for (const visible of ["INCOMPLETO", "JUNIOR", "Abarrotes", "24/11/2026", "25/11/2026", "Pan ficticio",
    "Pendiente ficticio", "Cero con venta", "Externo ficticio", "N/D", "-1.25", "0.0000000000000001"]) assert.ok(texto.includes(visible), visible);
  assert.doesNotMatch(texto, /Cero opcional|Otro departamento/);
  const pendiente = texto.slice(texto.indexOf("Pendiente ficticio"), texto.indexOf("Externo ficticio"));
  assert.doesNotMatch(pendiente, /\(-1\.25\)/);
  assert.match(paginas(generarPDFInventario({ ...fuente, catalogo: catalogo.slice(0,3) }).doc).join("\n"), /Inventario: COMPLETO/);
});

test("PDF multipagina repite columnas y conserva el final de una fila larga", () => {
  const catalogoLargo = Array.from({ length: 85 }, (_, i) => producto("F" + i, "Producto ficticio " + i));
  catalogoLargo.push(producto("LARGO", Array.from({length:110}, (_, i) => "Linea-" + i).join("\n")));
  const { doc } = generarPDFInventario({ ...fuente, catalogo: catalogoLargo, externos: [], movimientos: [] });
  const hojas = paginas(doc);
  assert.ok(hojas.length > 4);
  for (const hoja of hojas) assert.match(hoja, /\(Entradas\)/);
  for (let i = 0; i < 110; i++) assert.ok(hojas.some(hoja => hoja.includes("(Linea-" + i + ")")), "Linea-" + i);
});
