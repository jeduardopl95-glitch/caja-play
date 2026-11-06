// src/utils/pdf.ts
import { jsPDF } from "jspdf";
import { CorteCajaData, CorteCajaResult } from "../types";

const formatMXN = (val: number): string => {
  return "$" + val.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MXN";
};

export function generateCortePDF(data: CorteCajaData, results: CorteCajaResult) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  });

  // Playita palette, kept in sync with the application theme.
  const darkNavy = [0, 48, 73];       // #3D405B Twilight Indigo
  const oliveGreen = [0, 48, 73];  // #81B29A Muted Teal
  const coolGray = [0, 48, 73];      // Muted indigo for text labels
  const darkTextColor = [0, 48, 73];  // Twilight Indigo for text readability
  const lightGrayBg = [255, 255, 255]; // #FFFCF2 Warm surface
  const borderGray = [102, 155, 188];  // #E6D5AB Warm line separator
  
  // Specific restricted indicators
  const accentRed = [193, 18, 31];    // #E07A5F Burnt Peach for differences
  const accentGreen = [16, 124, 65];   // Strictly for success / exact / cards squared

  let y = 18;
  const margin = 20;
  const contentWidth = 176; // 216 - 40

  // Helper function to manage page heights dynamically
  const checkPageBreak = (needed: number) => {
    if (y + needed > 258) {
      doc.addPage();
      y = 20;
      drawPageBorder();
    }
  };

  const drawPageBorder = () => {
    // Subtle border decoration to look extremely professional
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.2);
    doc.rect(13, 12, 190, 252, "S");
  };

  drawPageBorder();

  // --- HEADER SECTION ---
  doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(20, y, contentWidth, 24, "F");

  // Title in White
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("CAJA PLAY", 26, y + 10);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("REPORTE OFICIAL DE CIERRE & ARQUEO DE CAJA", 26, y + 16);

  // Date and branch inside the dark blue block (right-aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`FECHA DEL TURNO:`, 130, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(data.fecha || new Date().toISOString().split("T")[0], 190, y + 8, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text(`SUCURSAL:`, 130, y + 15);
  doc.setFont("helvetica", "normal");
  doc.text((data.sucursal || "No especificada").toUpperCase(), 190, y + 15, { align: "right" });

  y += 32;

  // --- SECCIÓN 1: GENERAL INFO (CAJERO) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(coolGray[0], coolGray[1], coolGray[2]);
  doc.text("DATOS PERSONALES Y SEGURIDAD", 20, y);

  doc.setDrawColor(coolGray[0], coolGray[1], coolGray[2]);
  doc.setLineWidth(0.4);
  doc.line(20, y + 2, 20 + contentWidth, y + 2);

  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text("CAJERO RESPONSABLE:", 22, y);
  
  doc.setFont("helvetica", "normal");
  doc.text(data.cajeroName || "Sin registrar / Operación Manual", 70, y);

  doc.setFont("helvetica", "bold");
  doc.text("ESTABLECIMIENTO:", 22, y + 5);
  
  doc.setFont("helvetica", "normal");
  doc.text(data.sucursal || "Matriz General", 70, y + 5);

  y += 12;

  // Helper for rendering structured rows resembling a table
  const drawTableRow = (label: string, value: string, isHeader = false, isBold = false, isDiff = false, diffVal = 0) => {
    checkPageBreak(7);
    
    // Row background (zebra striping style)
    if (isHeader) {
      doc.setFillColor(oliveGreen[0], oliveGreen[1], oliveGreen[2]);
      doc.rect(20, y, contentWidth, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
      doc.rect(20, y, contentWidth, 6.5, "F");
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.rect(20, y, contentWidth, 6.5, "S");
      
      if (isBold) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
      }
      
      if (isDiff) {
        if (Math.abs(diffVal) < 0.01) {
          doc.setTextColor(accentGreen[0], accentGreen[1], accentGreen[2]);
        } else {
          doc.setTextColor(accentRed[0], accentRed[1], accentRed[2]);
        }
      }
    }

    doc.text(label, 24, y + (isHeader ? 5 : 4.5));
    doc.text(value, 192, y + (isHeader ? 5 : 4.5), { align: "right" });
    y += (isHeader ? 7 : 6.5) + 0.8;
  };

  // --- SECCIÓN 2: VALIDACIÓN DE TARJETAS ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text("1. VALIDACIÓN DE TARJETAS (VENTAS VS TERMINALES)", 20, y);
  
  y += 3.5;
  drawTableRow("CONCEPTO REGISTRADO", "MONTO EN MXN", true);
  drawTableRow("Tickets Mañana (Venta de Tarjetas)", formatMXN(data.tarjetaManana));
  drawTableRow("Tickets Tarde (Venta de Tarjetas)", formatMXN(data.tarjetaTarde));
  drawTableRow("TOTAL REPORTADO EN TICKETS:", formatMXN(results.tarjetasTicket), false, true);
  
  drawTableRow("Cierre de Terminal Santander (Física)", formatMXN(data.terminalSantander));
  
  // Calculate and show other terminals in table
  const otherTerminalsTotal = data.otrasTerminales.reduce((sum, t) => sum + t.amount, 0);
  data.otrasTerminales.forEach((term) => {
    drawTableRow(`Terminal Adicional (${term.name})`, formatMXN(term.amount));
  });
  
  drawTableRow("TOTAL AUDITADO EN TERMINALES:", formatMXN(results.totalTerminales), false, true);
  const absDiffTarjetas = Math.abs(results.diferenciaTarjetas);
  let diffTarjetasStr = "CUADRADO ($0.00)";
  if (absDiffTarjetas >= 0.01) {
    if (results.diferenciaTarjetas > 0) {
      diffTarjetasStr = `${formatMXN(absDiffTarjetas)} MÁS EN TERM.`;
    } else {
      diffTarjetasStr = `${formatMXN(absDiffTarjetas)} MENOS EN TERM.`;
    }
  }
  drawTableRow("DIFERENCIA TOTAL EN TARJETAS:", diffTarjetasStr, false, true, true, results.diferenciaTarjetas);

  y += 2;

  // Observation warning built if any deviation exists
  if (Math.abs(results.diferenciaTarjetas) >= 0.01) {
    checkPageBreak(12);
    doc.setFillColor(244, 241, 222);
    doc.setDrawColor(accentRed[0], accentRed[1], accentRed[2]);
    doc.setLineWidth(0.35);
    doc.rect(20, y, contentWidth, 10.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(accentRed[0], accentRed[1], accentRed[2]);
    doc.text("JUSTIFICACIÓN DEL DESCUADRE EN TARJETAS:", 23, y + 4);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(data.tarjetaObservaciones || "Sin observaciones declaradas", 23, y + 7.5, { maxWidth: 170 });
    y += 14;
  } else {
    y += 4;
  }

  // --- SECCIÓN 3: FLUJO DEL EFECTIVO ---
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text("2. FLUJO DEL EFECTIVO (DESGLOSE DE CAJA)", 20, y);

  y += 3.5;
  drawTableRow("CONCEPTO DE EFECTIVO", "IMPACTO DE CAJA (MXN)", true);
  drawTableRow("Ventas registradas en Efectivo (Turno completo)", `(+) ${formatMXN(data.ventasEfectivoManual)}`);
  drawTableRow("Entradas de Efectivo (Fondo Fijo, Cambio Inicial)", `(+) ${formatMXN(data.entradasEfectivo)}`);
  drawTableRow("Salidas de Efectivo (Retiros parciales, Pagos proveedores)", `(-) ${formatMXN(data.salidasEfectivo)}`);
  drawTableRow("Consumos Internos Autorizados (Personal)", `(-) ${formatMXN(results.totalTicketsConsumo)}`);
  
  // Shift adjustments row in PDF
  const totalAjustes = results.totalAjustesTurno || 0;
  const totalAjustesStr = totalAjustes >= 0 ? `(+) ${formatMXN(totalAjustes)}` : `(-) ${formatMXN(Math.abs(totalAjustes))}`;
  drawTableRow("Ajustes del Turno (Neto)", totalAjustesStr);
  
  // Bold expected total
  drawTableRow("(=) EFECTIVO NETO ESPERADO EN CAJA:", formatMXN(results.efectivoEsperado), false, true);

  // Print individual consumable breakdown if they exist
  if (data.ticketsConsumo && data.ticketsConsumo.length > 0) {
    checkPageBreak(12);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 110, 120);
    const textCons = "Desglose Consumos: " + data.ticketsConsumo.map(t => `${t.description || "Vale"}: ${formatMXN(t.amount)}`).join(" | ");
    doc.text(textCons, 22, y, { maxWidth: 170 });
    y += 5;
  }

  y += 4;
  for (const [index, adjustment] of (data.ajustesTurno || []).entries()) {
    const sign = adjustment.type === "sumar" ? "+" : "-";
    const heading = `Ajuste ${index + 1} (${sign}): ${formatMXN(adjustment.amount)}`;
    const lineHeight = 4;
    const paddingAndHeader = 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines: string[] = doc.splitTextToSize(adjustment.description?.trim() || "Sin motivo registrado", contentWidth - 8);

    for (let offset = 0; offset < lines.length;) {
      checkPageBreak(paddingAndHeader + lineHeight);
      const capacity = Math.floor((258 - y - paddingAndHeader) / lineHeight);
      const chunk = lines.slice(offset, offset + capacity);
      const height = paddingAndHeader + chunk.length * lineHeight;
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.rect(margin, y, contentWidth, height, "S");
      doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
      doc.setFont("helvetica", "bold");
      doc.text(offset ? `${heading} (continuación)` : heading, margin + 4, y + 5);
      doc.setFont("helvetica", "normal");
      doc.text(chunk, margin + 4, y + 11, { lineHeightFactor: lineHeight * 72 / (25.4 * 9) });
      y += height + 4;
      offset += chunk.length;
    }
  }
  y += 3;

  // --- SECCIÓN 4: CONTEO FÍSICO ARQUEO ---
  checkPageBreak(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text("3. DETALLE DE ARQUEO FISICO (NO SE MUESTRAN VALORES EN CERO)", 20, y);

  y += 4;

  const physicalRows: { label: string; count: number; value: number }[] = [];

  // Filter bills to only show the ones with count > 0 As requested!
  const billDenoms = [1000, 500, 200, 100, 50, 20];
  billDenoms.forEach((denom) => {
    const count = data.efectivoConteo[denom] || 0;
    if (count > 0) {
      physicalRows.push({
        label: `Billete de $${denom} MXN`,
        count,
        value: denom * count
      });
    }
  });

  // Check if coins are > 0 to display them as well to maintain perfect alignment
  const coinDenoms = [
    { key: 20.1, val: 20, label: "Moneda de $20 MXN" },
    { key: 10, val: 10, label: "Moneda de $10 MXN" },
    { key: 5, val: 5, label: "Moneda de $5 MXN" },
    { key: 2, val: 2, label: "Moneda de $2 MXN" },
    { key: 1, val: 1, label: "Moneda de $1 MXN" },
    { key: 0.5, val: 0.5, label: "Moneda de $0.50 MXN" }
  ];
  
  (data.modoMonedas === "total" ? [] : coinDenoms).forEach((c) => {
    const count = data.efectivoConteo[c.key] || 0;
    if (count > 0) {
      physicalRows.push({
        label: c.label,
        count,
        value: c.val * count
      });
    }
  });

  drawTableRow("MONTONES / DENOMINACIÓN FÍSICA", "CANT × VALOR = SUB-TOTAL", true);

  if (physicalRows.length === 0) {
    if (data.modoMonedas !== "total" || !results.subtotalMonedas) {
      drawTableRow("Sin desglose de billetes o monedas", "$0.00 MXN");
    }
  } else {
    physicalRows.forEach((row) => {
      const multiplicationText = `${row.count} × $${(row.value / row.count).toLocaleString("es-MX", { minimumFractionDigits: 0 })} = ${formatMXN(row.value)}`;
      drawTableRow(row.label, multiplicationText);
    });
  }

  // Subtotals clearly formatted
  y += 2;
  drawTableRow("SUBTOTAL EN BILLETES FISICOS:", formatMXN(results.subtotalBilletes), false, true);
  drawTableRow("SUBTOTAL EN MONEDAS FISICAS:", formatMXN(results.subtotalMonedas), false, true);
  
  // Dolares detailed row if count is greater than zero
  const dolaresCount = data.dolaresConteo || 0;
  if (dolaresCount > 0) {
    drawTableRow(`Dólares Físicos en Caja (${dolaresCount} USD @ $${(data.tipoCambioUSD || 15).toFixed(2)} MXN):`, formatMXN(results.subtotalDolares), false, true);
  }
  
  drawTableRow("EFECTIVO FÍSICO ARQUEADO (TOTAL CONTADO):", formatMXN(results.efectivoContado), false, true);

  y += 6;

  // --- SECCIÓN: APARTADOS DE EFECTIVO ---
  const apartados = data.apartadosEfectivo?.length
    ? data.apartadosEfectivo
    : data.fondoSiguienteTurno
      ? [{ id: "apartado-legado", description: data.fondoMotivo || "Fondo para siguiente turno", amount: data.fondoSiguienteTurno }]
      : [];
  const totalApartados = results.totalApartados || 0;
  if (totalApartados > 0) {
    checkPageBreak(34 + apartados.length * 5);
    doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
    doc.setDrawColor(oliveGreen[0], oliveGreen[1], oliveGreen[2]);
    doc.setLineWidth(0.35);
    const panelHeight = 20 + apartados.length * 5;
    doc.rect(20, y, contentWidth, panelHeight, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(oliveGreen[0], oliveGreen[1], oliveGreen[2]);
    doc.text("APARTADOS DE EFECTIVO (RETENIDO EN TIENDA)", 24, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    
    let apartadoY = y + 10.5;
    apartados.forEach((apartado, index) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}.`, 24, apartadoY);
      doc.setFont("helvetica", "normal");
      doc.text(apartado.description || "Apartado", 31, apartadoY, { maxWidth: 100 });
      doc.text(formatMXN(apartado.amount), 192, apartadoY, { align: "right" });
      apartadoY += 5;
    });

    doc.setFont("helvetica", "bold");
    doc.text("Total Apartados:", 24, apartadoY + 1);
    doc.setFont("helvetica", "normal");
    doc.text(formatMXN(totalApartados), 65, apartadoY + 1);

    doc.setFont("helvetica", "bold");
    doc.text("Efectivo Entregado:", 125, apartadoY + 1);
    doc.setFont("helvetica", "normal");
    doc.text(formatMXN(results.efectivoEntregado || 0), 192, apartadoY + 1, { align: "right" });

    y += panelHeight + 4;
  }

  // --- SECCIÓN 5: RESULTADO FINAL (LARGE BOX) ---
  checkPageBreak(38);
  
  // Custom box styling for primary outcomes as requested by user
  let bannerColor = oliveGreen; // Default Sobrante is Olive Green
  let stateLabel = "SOBRANTE DE CAJA";
  let stateDesc = "Existe un excedente positivo del dinero físico contra los registros esperados.";
  
  if (results.statusDiferencia === "exacto") {
    bannerColor = accentGreen;
    stateLabel = "CAJA EXACTA / BALANCEADA";
    stateDesc = "El dinero físico coincide exactamente con el flujo del efectivo esperado.";
  } else if (results.statusDiferencia === "faltante") {
    bannerColor = accentRed;
    stateLabel = "FALTANTE DE CAJA / DÉFICIT";
    stateDesc = "Se detectó falta de efectivo físico en relación al ingreso y egresos calculados.";
  }

  // Large Box border and title
  doc.setLineWidth(0.65);
  doc.setDrawColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  
  // Background inside result frame is pure white to contrast cleanly
  doc.setFillColor(255, 255, 255);
  doc.rect(20, y, contentWidth, 32, "FD");

  // Bold Left Indicator inside the box
  doc.setFillColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  doc.rect(20.3, y + 0.3, 5, 31.4, "F"); // Colored ribbon stripe on the left

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  doc.text(stateLabel, 30, y + 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(stateDesc, 30, y + 10.5);

  // Actual summary data inside box with ample spacing
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  
  doc.text("(+) EFECTIVO ARQUEADO EN FÍSICO:", 30, y + 17);
  doc.text("(-) EFECTIVO NETO ESPERADO:", 30, y + 21);
  doc.text("(=) DIFERENCIA DE CONCILIACIÓN:", 30, y + 25);

  doc.text(formatMXN(results.efectivoContado), 186, y + 17, { align: "right" });
  doc.text(formatMXN(results.efectivoEsperado), 186, y + 21, { align: "right" });
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  doc.text(formatMXN(results.diferenciaEfectivo), 186, y + 25, { align: "right" });

  y += 42;

  // --- SIGNATURES ---
  checkPageBreak(25);
  
  // Draw clean line separators
  doc.setLineWidth(0.25);
  doc.setDrawColor(coolGray[0], coolGray[1], coolGray[2]);
  
  doc.line(30, y, 85, y);
  doc.line(125, y, 180, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text("FIRMA DEL CAJERO", 44, y + 4, { align: "left" });
  doc.text("FIRMA DE SUPERVISOR / AUDITOR", 128, y + 4, { align: "left" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(140, 140, 140);
  doc.text(`Identificación Cajero: ${data.cajeroName || "Sin nombre registrado"}`, 30, y + 7.5);
  doc.text(`Cierre generado el: ${new Date().toLocaleString("es-MX")}`, 125, y + 7.5);

  // Footer
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(coolGray[0], coolGray[1], coolGray[2]);
  doc.text("ESTE DOCUMENTO CONSTITUYE UN ACTA DE CONCILIACIÓN DE CAJA PLAY Y TIENE VALIDEZ DE REVISION DIARIA.", 20, 260);

  const pdfBlob = doc.output("blob");
  const url = "";
  
  return {
    doc,
    url,
    blob: pdfBlob
  };
}
