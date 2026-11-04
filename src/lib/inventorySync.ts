// src/lib/inventorySync.ts
import { DEFAULT_CATALOG } from "./defaultCatalog";

export const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTG_LvBPsXaYVInLNGlYpF8mWN1kgdAHh85-IhSrrvVoloCeYhcb26J89Lqevu2W854exnVtrPn2THm/pub?output=csv";

export interface CatalogItem {
  id: string;
  codigo: string;
  descripcion: string;
  precio: number;
  departamento: string;
}

/**
 * Detects the most probable delimiter in a CSV line: , ; \t |
 */
function detectDelimiter(firstLine: string): string {
  const delimiters = [",", ";", "\t", "|"];
  let bestDelim = ",";
  let maxCount = -1;

  for (const d of delimiters) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') inQuotes = !inQuotes;
      else if (firstLine[i] === d && !inQuotes) count++;
    }
    if (count > maxCount) {
      maxCount = count;
      bestDelim = d;
    }
  }

  return bestDelim;
}

/**
 * Universal CSV parser supporting quotes, multiple delimiters, UTF-8 BOM, and flexible header mapping.
 */
export function parseSheetsCSV(csvText: string): CatalogItem[] {
  // Strip UTF-8 Byte Order Mark if present
  let cleanText = csvText.replace(/^\uFEFF/, "");

  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < cleanText.length; i++) {
    const c = cleanText[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (cur.trim()) lines.push(cur.trim());
      cur = "";
      if (c === '\r' && cleanText[i + 1] === '\n') i++;
    } else {
      cur += c;
    }
  }
  if (cur.trim()) lines.push(cur.trim());

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);

  const parseRow = (row: string) => {
    const cols: string[] = [];
    let val = "";
    let q = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        q = !q;
      } else if (c === delimiter && !q) {
        cols.push(val.trim());
        val = "";
      } else {
        val += c;
      }
    }
    cols.push(val.trim());
    return cols.map(s => s.replace(/^"|"$/g, '').trim());
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase());

  const idxCodigo = headers.findIndex(h => 
    h.includes("código") || h.includes("codigo") || h.includes("barras") || 
    h.includes("barcode") || h.includes("upc") || h.includes("ean") || 
    h === "cod" || h === "sku" || h === "clave"
  );
  
  const idxDesc = headers.findIndex(h => 
    h.includes("descripción") || h.includes("descripcion") || h.includes("producto") || 
    h.includes("nombre") || h.includes("artículo") || h.includes("articulo") || 
    h.includes("concepto") || h.includes("detalle") || h.includes("item")
  );

  const idxPrecio = headers.findIndex(h => 
    h.includes("venta") || h.includes("precio") || h.includes("p. venta") || 
    h.includes("p.venta") || h.includes("costo") || h.includes("pvp") || 
    h.includes("importe") || h.includes("total")
  );

  const idxDepto = headers.findIndex(h => 
    h.includes("departamento") || h.includes("depto") || h.includes("categoría") || 
    h.includes("categoria") || h.includes("familia") || h.includes("grupo") || 
    h.includes("rubro") || h.includes("fam") || h.includes("seccion")
  );

  const items: CatalogItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const cod = idxCodigo >= 0 ? cols[idxCodigo] || "" : cols[0] || "";
    const desc = idxDesc >= 0 ? cols[idxDesc] || "" : cols[1] || "";
    let rawPrice = idxPrecio >= 0 ? cols[idxPrecio] || "0" : cols[2] || "0";
    const depto = idxDepto >= 0 ? cols[idxDepto] || "" : cols[4] || cols[3] || "";

    // Clean price string ($12.50, 12,50, etc.)
    rawPrice = rawPrice.replace(/[\$,\sMXN]/gi, '');
    // If comma is decimal separator (e.g., 25,50), replace with period
    if (rawPrice.includes(",") && !rawPrice.includes(".")) {
      rawPrice = rawPrice.replace(",", ".");
    } else {
      rawPrice = rawPrice.replace(/,/g, "");
    }
    const precio = parseFloat(rawPrice);

    if (desc && !isNaN(precio)) {
      items.push({
        id: `prod_${i}_${cod || Date.now()}`,
        codigo: cod,
        descripcion: desc,
        precio: precio > 0 ? precio : 0,
        departamento: depto || "General"
      });
    }
  }

  return items;
}

/**
 * Converts a list of CatalogItem back to a clean CSV string for export / backup
 */
export function exportInventoryToCSV(items: CatalogItem[]): string {
  const header = "Código,Descripcion,Precio,Departamento";
  const rows = items.map(item => {
    const cod = `"${(item.codigo || "").replace(/"/g, '""')}"`;
    const desc = `"${(item.descripcion || "").replace(/"/g, '""')}"`;
    const price = `$${item.precio.toFixed(2)}`;
    const depto = `"${(item.departamento || "General").replace(/"/g, '""')}"`;
    return `${cod},${desc},${price},${depto}`;
  });
  return [header, ...rows].join("\n");
}

/**
 * Gets currently saved inventory from localStorage or falls back to DEFAULT_CATALOG
 */
export function getSavedInventory(): CatalogItem[] {
  try {
    const saved = localStorage.getItem("cajaplay_sheets_inventory");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    /* ignore error */
  }
  return DEFAULT_CATALOG;
}

/**
 * Saves a new inventory into localStorage
 */
export function saveInventoryLocally(items: CatalogItem[], sourceName?: string): string {
  const nowStr = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  const label = sourceName ? `${nowStr} (${sourceName})` : nowStr;
  localStorage.setItem("cajaplay_sheets_inventory", JSON.stringify(items));
  localStorage.setItem("cajaplay_sheets_last_sync", label);
  return label;
}

export async function syncSheetsInventory(customUrl?: string): Promise<{
  success: boolean;
  items: CatalogItem[];
  lastSync: string | null;
  error?: string;
}> {
  const urlToFetch = customUrl || SHEETS_CSV_URL;
  try {
    const res = await fetch(urlToFetch, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseSheetsCSV(text);
    if (parsed.length > 0) {
      const nowStr = saveInventoryLocally(parsed, "Google Sheets");
      return { success: true, items: parsed, lastSync: nowStr };
    }
    throw new Error("El archivo CSV no contiene productos válidos");
  } catch (err: any) {
    const current = getSavedInventory();
    const savedSync = localStorage.getItem("cajaplay_sheets_last_sync") || "Catálogo local precargado";
    return {
      success: false,
      items: current,
      lastSync: savedSync,
      error: err?.message || "Sin conexión: utilizando copia local offline"
    };
  }
}
