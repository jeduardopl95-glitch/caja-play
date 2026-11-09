import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import type * as Inventory from "../src/lib/inventorySync";

const { outputFiles: [bundle] } = await build({
  entryPoints: ["src/lib/inventorySync.ts"],
  bundle: true,
  write: false,
  format: "esm",
  loader: { ".csv": "text" },
});
const inventory: typeof Inventory = await import(`data:text/javascript;base64,${Buffer.from(bundle.contents).toString("base64")}`);

test("CSV export renders potential formulas as text without changing the source", () => {
  const item = { id: "1", codigo: "001", descripcion: ' =HYPERLINK("x")', precio: 15, departamento: "@SUM(1)" };
  const csv = inventory.exportInventoryToCSV([item]);
  assert.match(csv, /"' =HYPERLINK\(""x""\)"/);
  assert.match(csv, /"'@SUM\(1\)"/);
  assert.equal(item.descripcion, ' =HYPERLINK("x")');
});

test("CSV download rejects oversized streams even without Content-Length", async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    },
  }));
  await assert.rejects(() => inventory.leerCSVRemoto(response), /2 MB/);
});

test("bundled catalog keeps all 1826 products and their sale prices", () => {
  const items = inventory.getSharedInventory();
  assert.equal(items.length, 1826);
  assert.equal(items.find(item => item.codigo === "11210000834")?.precio, 69);
  assert.equal(items.find(item => item.codigo === "7500810036624")?.precio, 28);
});

test("shared catalog requires valid sale prices on every row", () => {
  assert.equal(inventory.parseSharedCatalog("Código;Producto;P. Costo;Departamento\n001;Frijol;12;Abarrotes").length, 0);
  const header = "Código;Producto;P. Costo;P. Venta;Departamento\n";
  const valid = "001;Frijol;12;22,50;Abarrotes";
  assert.equal(inventory.parseSharedCatalog(header + valid)[0]?.precio, 22.5);
  assert.equal(inventory.parseSharedCatalog(header + valid + "\n002;Arroz;12;;Abarrotes").length, 0);
  assert.equal(inventory.parseSharedCatalog(header + "001;Frijol;12;22oops;Abarrotes").length, 0);
});
