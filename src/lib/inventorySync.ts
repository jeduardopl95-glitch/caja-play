// src/lib/inventorySync.ts
import bundledCatalog from "./catalogo.csv?raw";

export const INVENTORY_OVERRIDE = "cajaplay_inventory_override_v2";
export const INVENTORY_SYNC_LABEL = "cajaplay_inventory_sync_label_v2";
const SHARED_CACHE = "cajaplay_shared_catalog_v2";

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
export function parseSharedCatalog(csvText: string): CatalogItem[] {
  return parseSheetsCSV(csvText, true);
}

export function parseSheetsCSV(csvText: string, shared = false): CatalogItem[] {
  // Strip UTF-8 Byte Order Mark if present
  let cleanText = csvText.replace(/^\uFEFF/, "");

  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < cleanText.length; i++) {
    const c = cleanText[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (cur.trim()) lines.push(cur.trim());
      cur = "";
      if (c === '\r' && cleanText[i + 1] === '\n') i++;
    } else {
      cur += c;
    }
  }
  if (shared && inQuotes) return [];
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
        if (q && row[i + 1] === '"') {
          val += '"';
          i++;
          continue;
        }
        q = !q;
      } else if (c === delimiter && !q) {
        cols.push(val.trim());
        val = "";
      } else {
        val += c;
      }
    }
    cols.push(val.trim());
    return cols;
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

  const saleColumn = headers.findIndex(h => h.includes("venta") || h === "pvp");
  const idxPrecio = saleColumn >= 0 ? saleColumn : headers.findIndex(h =>
    h.includes("precio") || h.includes("costo") ||
    h.includes("importe") || h.includes("total")
  );

  const idxDepto = headers.findIndex(h => 
    h.includes("departamento") || h.includes("depto") || h.includes("categoría") || 
    h.includes("categoria") || h.includes("familia") || h.includes("grupo") || 
    h.includes("rubro") || h.includes("fam") || h.includes("seccion")
  );
  if (shared && [idxCodigo, idxDesc, saleColumn, idxDepto].some(index => index < 0)) return [];

  const items: CatalogItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const cod = idxCodigo >= 0 ? cols[idxCodigo] || "" : cols[0] || "";
    const desc = idxDesc >= 0 ? cols[idxDesc] || "" : cols[1] || "";
    let rawPrice = idxPrecio >= 0 ? cols[idxPrecio] || "" : cols[2] || "";
    const depto = idxDepto >= 0 ? cols[idxDepto] || "" : cols[4] || cols[3] || "";

    // Clean price string ($12.50, 12,50, etc.)
    rawPrice = rawPrice.replace(/[\$\sMXN]/gi, '');
    if (shared && (cols.length !== headers.length || !cod || !desc ||
      !/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/.test(rawPrice))) return [];
    if (!rawPrice && !shared) rawPrice = "0";
    // If comma is decimal separator (e.g., 25,50), replace with period
    if (/^\d+,\d{1,2}$/.test(rawPrice)) {
      rawPrice = rawPrice.replace(",", ".");
    } else {
      rawPrice = rawPrice.replace(/,/g, "");
    }
    const precio = parseFloat(rawPrice);
    if (shared && (!Number.isFinite(precio) || precio <= 0)) return [];

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
 * Gets the locally imported inventory or the shared catalog.
 */
export function getSavedInventory(): CatalogItem[] {
  return readCatalog(INVENTORY_OVERRIDE) || getSharedInventory();
}

export function getSharedInventory(): CatalogItem[] {
  return readCatalog(SHARED_CACHE) || parseSharedCatalog(bundledCatalog);
}

function readCatalog(key: string): CatalogItem[] | undefined {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    /* ignore error */
  }
}

/**
 * Saves a new inventory into localStorage
 */
export function saveInventoryLocally(items: CatalogItem[], sourceName?: string): string {
  const nowStr = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  const label = sourceName ? `${nowStr} (${sourceName})` : nowStr;
  localStorage.setItem(INVENTORY_OVERRIDE, JSON.stringify(items));
  localStorage.setItem(INVENTORY_SYNC_LABEL, label);
  return label;
}

let pendingSync: ReturnType<typeof fetchInventory> | undefined;

export function syncSharedInventory() {
  return pendingSync ??= fetchInventory().finally(() => { pendingSync = undefined; });
}

async function fetchInventory(): Promise<{
  success: boolean;
  items: CatalogItem[];
  lastSync: string | null;
  error?: string;
}> {
  try {
    const project = import.meta.env.VITE_SUPABASE_URL;
    if (!project) throw new Error("Catálogo local precargado");
    const res = await fetch(`${project}/storage/v1/object/public/catalogo/catalogo.csv`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
    const parsed = parseSharedCatalog(text);
    if (parsed.length > 0) {
      const nowStr = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
      try { localStorage.setItem(SHARED_CACHE, JSON.stringify(parsed)); } catch { /* Cache is optional. */ }
      return { success: true, items: parsed, lastSync: nowStr };
    }
    throw new Error("El archivo CSV no contiene productos válidos");
  } catch {
    return {
      success: false,
      items: getSharedInventory(),
      lastSync: "Copia local del catálogo",
      error: "No se pudo consultar el catálogo compartido. Se conserva la copia local."
    };
  }
}
