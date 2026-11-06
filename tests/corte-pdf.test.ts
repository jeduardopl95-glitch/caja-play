import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCortePDF } from "../src/utils/pdf";
import type { CorteCajaData, CorteCajaResult } from "../src/types";

test("a long adjustment spans pages before the physical count", () => {
  const data: CorteCajaData = {
    fecha: "2026-11-05", sucursal: "PLAYITA", cajeroName: "",
    tarjetaManana: 0, tarjetaTarde: 0, terminalSantander: 0,
    otrasTerminales: [], tarjetaObservaciones: "",
    ventasEfectivoManual: 100, entradasEfectivo: 0, salidasEfectivo: 0,
    ticketsConsumo: [], efectivoConteo: {}, dolaresConteo: 0,
    ajustesTurno: [
      { id: "1", type: "restar", amount: 29, description: Array.from({ length: 90 }, (_, i) => "Motivo linea " + String(i + 1).padStart(3, "0") + ".").join("\n") },
      { id: "2", type: "sumar", amount: 3, description: "Segundo motivo." }
    ]
  };
  const results: CorteCajaResult = {
    tarjetasTicket: 0, totalTerminales: 0, diferenciaTarjetas: 0,
    totalTicketsConsumo: 0, totalAjustesTurno: -26, efectivoEsperado: 74,
    subtotalBilletes: 0, subtotalMonedas: 0, subtotalDolares: 0,
    efectivoContado: 0, diferenciaEfectivo: -74, statusDiferencia: "faltante"
  };
  const { doc } = generateCortePDF(data, results);
  const pages = Array.from({ length: doc.getNumberOfPages() }, (_, i) =>
    (doc.internal as unknown as { pages: string[][] }).pages[i + 1].join("\n")
  );
  const first = pages.findIndex(page => page.includes("Motivo linea 001."));
  const last = pages.findIndex(page => page.includes("Motivo linea 090."));
  assert.ok(first >= 0 && last > first, "the justification must continue on another page");
  for (let i = 1; i <= 90; i++) {
    assert.ok(pages.some(page => page.includes("Motivo linea " + String(i).padStart(3, "0") + ".")));
  }
  const tail = pages.slice(last).join("\n");
  assert.ok(tail.indexOf("Segundo motivo.") > tail.indexOf("Motivo linea 090."));
  assert.ok(tail.indexOf("DETALLE DE ARQUEO") > tail.indexOf("Segundo motivo."));
});
