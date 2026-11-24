import { jsPDF } from "jspdf";
import { filasInventario, type FuenteResultados } from "./resultados";
import type { InventarioActivo } from "./tipos";

type FuentePDF = FuenteResultados & Pick<InventarioActivo, "sucursal" | "fechaReferencia">;
const fechaCancun = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Cancun", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
const columnas = ["Código", "Descripción", "Original", "Entradas", "Ventas", "Ajustada", "Física", "Diferencia"];
const anchos = [32, 73, 28, 23, 23, 30, 32, 32];
type Fila = ReturnType<typeof filasInventario>[number];

export function generarPDFInventario(avance: FuentePDF, generado = new Date()) {
  const filas = filasInventario(avance);
  const revisados = filas.filter(f => f.producto.original !== null && f.saldo.revision === "revisado");
  const pendientes = filas.filter(f => f.producto.original !== null && f.saldo.revision === "pendiente");
  const externos = filas.filter(f => f.producto.original === null);
  const resumen = {
    revisados: revisados.length, pendientes: pendientes.length,
    faltantes: revisados.filter(f => f.saldo.diferencia.startsWith("-")).length,
    sobrantes: revisados.filter(f => f.saldo.diferencia !== "0" && !f.saldo.diferencia.startsWith("-")).length,
    coincidentes: revisados.filter(f => f.saldo.diferencia === "0").length
  };
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margen = 12, ancho = anchos.reduce((a, b) => a + b, 0);
  const alto = doc.internal.pageSize.getHeight(), limite = alto - 17, linea = 4.3;
  const tinta = "#153f39", acento = "#16544b";
  let y = margen;
  doc.setProperties({ title: "Playita | Reporte de inventario" });
  function texto(valor: string, x: number, base: number, size = 10, negrita = false) {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(tinta);
    doc.text(valor, x, base);
  }
  function tituloPagina() {
    doc.setFillColor(acento);
    doc.rect(margen, margen, ancho, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor("#ffffff");
    doc.text("PLAYITA  |  REPORTE DE INVENTARIO", margen + 4, margen + 7);
    y = margen + 18;
  }
  function nuevaPagina() {
    doc.addPage();
    tituloPagina();
  }
  function encabezado(seccion: string, continua = false) {
    texto(seccion + (continua ? " (continuación)" : ""), margen, y, 11, true);
    y += 3;
    doc.setFillColor("#d3eee9");
    doc.rect(margen, y, ancho, 8, "F");
    let x = margen;
    columnas.forEach((nombre, i) => {
      texto(nombre, x + 2, y + 5.5, 9, true);
      x += anchos[i];
    });
    y += 8;
  }
  function tabla(seccion: string, grupo: Fila[], diferenciaConfirmada: boolean) {
    if (y + 26 > limite) nuevaPagina();
    encabezado(seccion);
    if (!grupo.length) { texto("Sin productos.", margen + 2, y + 5); y += 13; return; }
    for (const [indice, { producto, saldo }] of grupo.entries()) {
      const valores = [producto.codigo, producto.descripcion, saldo.original, saldo.entradas, saldo.ventas,
        saldo.ajustada, saldo.fisica, diferenciaConfirmada ? saldo.diferencia : null];
      doc.setFont("helvetica", "normal");
      const celdas = valores.map((valor, i) => {
        doc.setFontSize(i < 2 ? 9 : 8);
        return doc.splitTextToSize(valor ?? "N/D", anchos[i] - 4) as string[];
      });
      const total = Math.max(...celdas.map(celda => celda.length));
      if (indice > 0 && total * linea + 4 > limite - y && y > margen + 29) {
        nuevaPagina(); encabezado(seccion, true);
      }
      for (let inicio = 0; inicio < total;) {
        const caben = Math.floor((limite - y - 4) / linea);
        if (caben < 1) { nuevaPagina(); encabezado(seccion, true); continue; }
        const fin = Math.min(inicio + caben, total);
        let x = margen;
        celdas.forEach((celda, i) => {
          for (let j = inicio; j < fin && j < celda.length; j++) texto(celda[j], x + 2, y + 4 + (j - inicio) * linea, i < 2 ? 9 : 8);
          x += anchos[i];
        });
        y += (fin - inicio) * linea + 4;
        doc.setDrawColor("#a5bdb8");
        doc.line(margen, y, margen + ancho, y);
        inicio = fin;
      }
    }
    y += 9;
  }
  tituloPagina();
  texto("Sucursal: " + avance.sucursal, margen, y, 11, true);
  texto("Inventario: " + (pendientes.length ? "INCOMPLETO" : "COMPLETO"), margen + 145, y, 11, true);
  y += 6;
  const departamento = doc.splitTextToSize("Departamento: " + avance.departamento, ancho);
  for (const linea of departamento) {
    if (y > limite) nuevaPagina();
    texto(linea, margen, y); y += 5;
  }
  if (y + 20 > limite) nuevaPagina();
  texto("Fecha del inventario: " + fechaCancun.format(new Date(avance.fechaReferencia)), margen, y);
  texto("Generado: " + fechaCancun.format(generado), margen + 145, y);
  y += 8;
  texto(`Revisados: ${resumen.revisados}  |  Pendientes obligatorios: ${resumen.pendientes}  |  Faltantes: ${resumen.faltantes}  |  Sobrantes: ${resumen.sobrantes}  |  Coincidentes: ${resumen.coincidentes}`, margen, y, 10, true);
  y += 11;
  tabla("Productos revisados", revisados, true);
  tabla("Pendientes de revisión obligatoria", pendientes, false);
  tabla("Productos registrados fuera del CSV", externos, false);
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina);
    texto(`Playita · Inventario  |  Página ${pagina} de ${total}`, margen, alto - 9, 8);
  }
  return { doc, blob: doc.output("blob"), resumen };
}
