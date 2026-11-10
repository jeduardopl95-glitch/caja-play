import assert from "node:assert/strict";
import { test } from "node:test";
import { coincidenciasCodigo } from "../src/lib/codigos";

test("UPC-A and zero-prefixed EAN-13 are equivalent without stripping other zeros", () => {
  const upc = { codigo: "012345678905" };
  const ean = { codigo: "0012345678905" };
  assert.deepEqual(coincidenciasCodigo([ean], upc.codigo), [ean]);
  assert.deepEqual(coincidenciasCodigo([upc], ean.codigo), [upc]);
  assert.deepEqual(coincidenciasCodigo([upc, ean], upc.codigo), [upc, ean]);
  assert.deepEqual(coincidenciasCodigo([{ codigo: "001" }], "1"), []);
});
