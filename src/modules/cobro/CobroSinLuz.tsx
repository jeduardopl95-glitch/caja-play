// src/modules/cobro/CobroSinLuz.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trash2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  CheckCircle,
  Share2,
  Copy,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  Download,
  Eye,
  X,
  FileText,
  Globe,
  Tag,
  Check
} from "lucide-react";
import { Product } from "../../types";
import { crearIdInventario as crearId } from "../inventario/identificador";
import { actualizar, cambiarVenta, finalizar, hayLegado, leer, limpiarHistorial, migrar, monto, sucursales, totalTicket, type CajaSucursal, type Sucursal, type VentaCaja } from "./caja";
import { calcularPago, leerCentavos, type CapturaPago } from "./pagos";
import { articulos, DialogoCaja, FormularioPago, HistorialCaja, LineasTicket, mxn, numeroVenta, resumenVenta } from "./PanelesCaja";
import "./cobro.css";
import { Barcode } from "lucide-react";
import EscanerCodigo from "../../components/EscanerCodigo";
import { coincidenciasCodigo } from "../../lib/codigos";
import {
  CatalogItem,
  syncSharedInventory,
  getSavedInventory,
  saveInventoryLocally,
  parseSheetsCSV,
  exportInventoryToCSV,
  leerCSVRemoto,
  LIMITE_CSV,
  ERROR_TAMANO_CSV,
  INVENTORY_OVERRIDE,
  INVENTORY_SYNC_LABEL
} from "../../lib/inventorySync";

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

const palabras = (texto: string) => texto.split(/[\s\p{Pd}]+/u).map(normalizeStr).filter(Boolean);
const buscarPalabras = (texto: string, consulta: string[]) => {
  const compacto = palabras(texto).join("");
  return consulta.length > 0 && consulta.every(p => compacto.includes(p));
};

export default function CobroSinLuz({ onBusyChange }: { onBusyChange: (ocupado: boolean) => void }) {
  // Inventory state from localStorage or pre-bundled default catalog
  const [inventory, setInventory] = useState<CatalogItem[]>(() => {
    return getSavedInventory();
  });

  const [lastSyncDate, setLastSyncDate] = useState<string | null>(() => {
    return localStorage.getItem(INVENTORY_SYNC_LABEL) || "Catálogo local activo";
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState({
    description: { enabled: false, value: "" },
    department: { enabled: false, value: "" },
    price: { enabled: false, value: "" },
    barcode: { enabled: false, value: "" }
  });
  const filterOptions = [
    { key: "description", label: "Descripción" },
    { key: "department", label: "Departamento" },
    { key: "price", label: "Precio" },
    { key: "barcode", label: "Código de barras" }
  ] as const;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const priceDialog = useRef<HTMLDialogElement>(null);
  const priceTrigger = useRef<HTMLButtonElement>(null);
  const [priceLookup, setPriceLookup] = useState<"closed" | "scanning" | { code: string; added: boolean }>("closed");
  const showingPrice = typeof priceLookup === "object";
  const priceMatches = typeof priceLookup === "object"
    ? coincidenciasCodigo<CatalogItem>(inventory, priceLookup.code) : [];
  const priceProduct = priceMatches.length === 1 ? priceMatches[0] : undefined;

  useEffect(() => {
    if (!showingPrice || !priceDialog.current) return;
    const dialog = priceDialog.current;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("#price-lookup-title")?.focus();
    return () => dialog.close();
  }, [showingPrice]);

  const closePriceLookup = () => {
    setPriceLookup("closed");
    requestAnimationFrame(() => priceTrigger.current?.focus());
  };

  const startPriceLookup = () => {
    setErrorCaja("");
    setPriceLookup("scanning");
  };

  const [tienda, setTienda] = useState<Sucursal>();
  const [caja, setCaja] = useState<CajaSucursal>();
  const [hayCopia, setHayCopia] = useState<boolean>();
  const [destinoLegado, setDestinoLegado] = useState<Sucursal>();
  const [ocupado, setOcupado] = useState(false);
  const operando = useRef(false);
  const intento = useRef<{ id: string; fecha: string }>();
  const [errorCaja, setErrorCaja] = useState("");
  const [conflicto, setConflicto] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [busqueda, setBusqueda] = useState(false);
  const [cantidadBusqueda, setCantidadBusqueda] = useState("1");
  const [escaneo, setEscaneo] = useState(false);
  const [captura, setCaptura] = useState<CapturaPago>();
  const [edicion, setEdicion] = useState<{ venta: VentaCaja; items: { producto: Product; precio: string; cantidad: string }[] }>();
  const [ultima, setUltima] = useState<VentaCaja>();
  const [confirmacion, setConfirmacion] = useState<VentaCaja | "historial" | "ticket">();
  const [copiado, setCopiado] = useState(false);
  const copiaActual = useRef<string>();
  const cart = caja?.cart ?? [];
  const ticketTotal = totalTicket(cart);

  async function operar<T>(accion: () => Promise<T>, listo: (dato: T) => void) {
    if (operando.current) return false;
    operando.current = true;
    setOcupado(true); onBusyChange(true); setErrorCaja("");
    try { listo(await accion()); return true; }
    catch (error) {
      const mensaje = error instanceof Error && !(error instanceof DOMException) ? error.message : "No se pudo guardar en este dispositivo. Puedes reintentar.";
      setErrorCaja(mensaje);
      if (mensaje.includes("Otra pestaña")) setConflicto(true);
      return false;
    } finally { operando.current = false; setOcupado(false); onBusyChange(false); }
  }

  const revisarLegado = () => void operar(hayLegado, setHayCopia);
  const abrirTienda = (sucursal: Sucursal, recuperar = false) => void operar(
    () => recuperar ? migrar(sucursal) : leer(sucursal),
    datos => {
      setTienda(sucursal); setCaja(datos); setHayCopia(false); setDestinoLegado(undefined);
      setHistorial(false); setUltima(undefined); setCopiado(false); setConflicto(false);
      copiaActual.current = undefined;
      setManualName(""); setManualPrice(""); setManualQty("1"); setShowManualFallback(false);
      setCaptura(undefined); setBusqueda(false); intento.current = undefined;
    }
  );

  // Manual fallback input state (collapsed by default)
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");

  // CSV Import Modal & Tools State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<"file" | "paste" | "sheets">("file");
  const [pastedCSV, setPastedCSV] = useState("");
  const [customSheetUrl, setCustomSheetUrl] = useState("");
  const [previewItems, setPreviewItems] = useState<CatalogItem[]>([]);
  const [previewSourceName, setPreviewSourceName] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importNotification, setImportNotification] = useState<string | null>(null);

  // Catalog Browser Modal State
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogDepto, setCatalogDepto] = useState("TODOS");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger auto sync on mount if needed
  useEffect(() => {
    // Only attempt background sync if not already having custom inventory
    const saved = localStorage.getItem(INVENTORY_OVERRIDE);
    if (!saved) {
      handleSync();
    }
    revisarLegado();
  }, []);

  useEffect(() => {
    if (!showImportModal && !showCatalogModal) return;
    const opener = document.activeElement;
    const dialog = document.querySelector<HTMLElement>('[data-catalog-dialog]');
    if (!dialog) return;
    dialog.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); setShowImportModal(false); setShowCatalogModal(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
      )).filter(control => control.tabIndex >= 0 && control.getClientRects().length);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (index === -1 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [showImportModal, showCatalogModal]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    const res = await syncSharedInventory();
    if (res.success) {
      localStorage.removeItem(INVENTORY_OVERRIDE);
      if (res.lastSync) localStorage.setItem(INVENTORY_SYNC_LABEL, res.lastSync);
      setInventory(res.items);
      setLastSyncDate(res.lastSync);
      setImportNotification(`Catálogo compartido actualizado: ${res.items.length} productos`);
      setTimeout(() => setImportNotification(null), 5000);
    } else {
      if (res.items.length > 0) {
        setInventory(getSavedInventory());
      }
      if (res.lastSync && !localStorage.getItem(INVENTORY_OVERRIDE)) {
        setLastSyncDate(res.lastSync);
      }
      setSyncError(res.error || "Sin conexión: utilizando copia local offline");
    }
    setIsSyncing(false);
  };

  const saveCart = (nuevo: Product[]) => tienda && caja && !conflicto
    ? operar(() => actualizar(tienda, caja.revision, {cart: nuevo}), datos => { setCaja(datos); setUltima(undefined); })
    : Promise.resolve(false);

  // CSV File Processing
  const processCSVText = (text: string, sourceName: string) => {
    setPreviewError(null);
    if (new Blob([text]).size > LIMITE_CSV) {
      setPreviewError(ERROR_TAMANO_CSV);
      setPreviewItems([]);
      return;
    }
    if (!text || !text.trim()) {
      setPreviewError("El contenido o archivo está vacío.");
      setPreviewItems([]);
      return;
    }

    try {
      const parsed = parseSheetsCSV(text);
      if (parsed.length === 0) {
        setPreviewError("No se pudieron identificar productos válidos. Asegúrate de incluir columnas como Código, Descripción, Precio y Departamento.");
        setPreviewItems([]);
        return;
      }
      setPreviewItems(parsed);
      setPreviewSourceName(sourceName);
    } catch (e: any) {
      setPreviewError(`Error procesando CSV: ${e?.message || "Formato inválido"}`);
      setPreviewItems([]);
    }
  };

  const previewCSVFile = (file?: File) => {
    if (!file) return;
    setPreviewItems([]);
    setPreviewError(null);
    if (!/\.(csv|txt)$/i.test(file.name) || file.size > LIMITE_CSV) {
      setPreviewError(file.size > LIMITE_CSV ? ERROR_TAMANO_CSV : "Selecciona un archivo CSV o TXT.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processCSVText(text, file.name);
    };
    reader.onerror = () => {
      setPreviewError("Error leyendo el archivo.");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => previewCSVFile(e.target.files?.[0]);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    previewCSVFile(e.dataTransfer.files?.[0]);
  };

  const handleApplyImport = () => {
    if (previewItems.length === 0) return;

    const sourceLabel = previewSourceName || "CSV Importado";
    const label = saveInventoryLocally(previewItems, sourceLabel);
    setInventory(previewItems);
    setLastSyncDate(label);

    // Update prices of any products in the current cart that match new inventory
    if (cart.length > 0) {
      const updatedCart = cart.map((p) => {
        const match = previewItems.find(
          (item) => (item.codigo && item.codigo === p.codigo) || item.descripcion.toLowerCase() === p.name.toLowerCase()
        );
        if (match) {
          return { ...p, price: match.precio, name: match.descripcion };
        }
        return p;
      });
      saveCart(updatedCart);
    }

    setShowImportModal(false);
    setImportNotification(`¡Catálogo actualizado con éxito! Se cargaron ${previewItems.length} productos.`);
    setTimeout(() => setImportNotification(null), 6000);

    // Reset preview
    setPreviewItems([]);
    setPreviewSourceName("");
    setPastedCSV("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExportCSV = () => {
    const csvData = exportInventoryToCSV(inventory);
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", `INVENTARIO_CAJAPLAY_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Distinct departments for filtering
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((item) => {
      if (item.departamento) set.add(item.departamento);
    });
    return Array.from(set).sort();
  }, [inventory]);

  // Filtered search results
  const filteredResults = useMemo(() => {
    const candidates = inventory.filter(item => {
      const { description, department, price, barcode } = searchFilters;
      if (description.enabled && description.value.trim() && !normalizeStr(item.descripcion).includes(normalizeStr(description.value))) return false;
      if (department.enabled && department.value.trim() && !normalizeStr(item.departamento).includes(normalizeStr(department.value))) return false;
      if (price.enabled && price.value.trim()) {
        const query = price.value.trim().replace(",", ".");
        const maximum = query.startsWith("-");
        const numericPart = maximum ? query.slice(1) : query;
        if (!/^\d+(?:\.\d{0,2})?$/.test(numericPart)) return false;
        const amount = Math.round(Number(numericPart) * 100);
        const productPrice = Math.round(item.precio * 100);
        if (!Number.isFinite(amount) || (maximum ? productPrice > amount : productPrice !== amount)) return false;
      }
      if (barcode.enabled && barcode.value.trim() && item.codigo !== barcode.value.trim()) return false;
      return true;
    });
    const raw = searchQuery.trim();
    if (!raw) return filterOptions.some(({ key }) => searchFilters[key].enabled && searchFilters[key].value.trim()) ? candidates : candidates.slice(0, 40); // Muestra top 40 inicial

    const q = raw.toLowerCase();

    // %texto -> Buscar dentro de la descripción
    if (q.startsWith("%")) {
      const text = q.slice(1).trim();
      if (!text) return candidates.slice(0, 40);
      return candidates.filter((item) => item.descripcion.toLowerCase().includes(text));
    }

    // #departamento -> Buscar por departamento
    if (q.startsWith("#")) {
      const deptoQuery = normalizeStr(q.slice(1));
      if (!deptoQuery) return candidates.slice(0, 40);
      return candidates.filter((item) => normalizeStr(item.departamento).includes(deptoQuery));
    }

    // $precio -> Buscar por precio exacto
    if (q.startsWith("$")) {
      const priceQuery = parseFloat(q.slice(1).trim());
      if (isNaN(priceQuery)) return [];
      return candidates.filter((item) => item.precio === priceQuery);
    }

    // @codigo -> Buscar exclusivamente por código de barras
    if (q.startsWith("@")) {
      const codeQuery = q.slice(1).trim().toLowerCase();
      if (!codeQuery) return [];
      return candidates.filter((item) => item.codigo.toLowerCase() === codeQuery);
    }

    const terminos = palabras(q);
    return candidates.filter(item => item.codigo.toLowerCase().includes(q)
      || item.descripcion.toLowerCase().includes(q) || item.departamento.toLowerCase().includes(q)
      || buscarPalabras(item.descripcion, terminos) || buscarPalabras(item.departamento, terminos));
  }, [searchQuery, inventory, searchFilters]);

  // Filtered list for Catalog Modal
  const catalogModalFiltered = useMemo(() => {
    let list = inventory;
    if (catalogDepto !== "TODOS") {
      list = list.filter((item) => item.departamento === catalogDepto);
    }
    const q = catalogSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.descripcion.toLowerCase().includes(q) ||
          item.codigo.toLowerCase().includes(q) ||
          item.departamento.toLowerCase().includes(q)
      );
    }
    return list;
  }, [inventory, catalogDepto, catalogSearch]);

  const agregar = async (datos: Omit<Product, "id">) => {
    if (!Number.isSafeInteger(datos.quantity) || datos.quantity < 1 || !Number.isFinite(datos.price) || datos.price < 0) {
      setErrorCaja("Revisa el precio y la cantidad."); return false;
    }
    if (edicion) {
      const indice = edicion.items.findIndex(({ producto, precio }) => producto.codigo === datos.codigo
        && producto.name.toLowerCase() === datos.name.toLowerCase() && Number(precio.replace(",", ".")) === datos.price);
      setEdicion({ ...edicion, items: indice >= 0
        ? edicion.items.map((p, i) => i === indice ? { ...p, cantidad: String(Number(p.cantidad) + datos.quantity) } : p)
        : [...edicion.items, { producto: { ...datos, id: crearId() }, precio: String(datos.price), cantidad: String(datos.quantity) }] });
      return true;
    }
    const indice = cart.findIndex(p => p.codigo === datos.codigo && p.name.toLowerCase() === datos.name.toLowerCase() && p.price === datos.price);
    return saveCart(indice >= 0
      ? cart.map((p, i) => i === indice ? { ...p, quantity: p.quantity + datos.quantity } : p)
      : [...cart, { ...datos, id: crearId() }]);
  };

  const handleSelectProduct = (item: CatalogItem, cantidad = 1) => agregar({
    name: item.descripcion, price: item.precio, quantity: cantidad, codigo: item.codigo, departamento: item.departamento
  });
  const cantidadValida = /^\d+$/.test(cantidadBusqueda) && Number.isSafeInteger(Number(cantidadBusqueda)) && Number(cantidadBusqueda) > 0;
  const seleccionarBusqueda = async (item: CatalogItem) => {
    if (!cantidadValida) return;
    if (await handleSelectProduct(item, Number(cantidadBusqueda))) setCantidadBusqueda("1");
  };
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.repeat || ocupado || !cantidadValida) return;
    e.preventDefault();
    const codigo = searchQuery.trim().replace(/^@/, "");
    if (!codigo) return;
    const exactos = coincidenciasCodigo(inventory, codigo);
    const item = exactos.length === 1 ? exactos[0] : filteredResults.length === 1 ? filteredResults[0] : undefined;
    if (item && await handleSelectProduct(item, Number(cantidadBusqueda))) {
      setSearchQuery(""); setCantidadBusqueda("1"); searchInputRef.current?.focus();
    }
  };
  const handleAddManualProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !(leerCentavos(manualPrice) > 0) || !/^\d+$/.test(manualQty)) {
      setErrorCaja("Introduce un nombre, un precio válido y una cantidad entera."); return;
    }
    if (await agregar({name: manualName.trim(), price: leerCentavos(manualPrice) / 100, quantity: Number(manualQty), departamento: "Manual"})) {
      setManualName(""); setManualPrice(""); setManualQty("1");
    }
  };

  function abrirBuscador(consulta = "") {
    if (!edicion) setHistorial(false);
    setBusqueda(true); setSearchQuery(consulta); setCantidadBusqueda("1"); setErrorCaja("");
  }
  function abrirPago() {
    if (!caja || !cart.length || ocupado || conflicto) return;
    setErrorCaja(""); setCaptura({metodo: "efectivo", efectivo: monto(ticketTotal), cambio: caja.cambio});
    intento.current = undefined;
  }
  function cerrarPago() {
    setCaptura(undefined); setEdicion(undefined); setErrorCaja(""); intento.current = undefined;
  }
  const itemsEditados = edicion?.items.map(({ producto, precio, cantidad }) =>
    ({ ...producto, price: leerCentavos(precio) / 100, quantity: /^\d+$/.test(cantidad) ? Number(cantidad) : NaN }));
  const totalPago = itemsEditados ? totalTicket(itemsEditados) : ticketTotal;
  const calculo = captura && calcularPago(totalPago, captura);
  const finalizarValido = !!calculo?.suficiente && !conflicto && !ocupado
    && (!itemsEditados || (itemsEditados.length > 0 && itemsEditados.every(i => Number.isSafeInteger(i.quantity) && i.quantity > 0)));
  async function guardarCobro() {
    if (!tienda || !caja || !captura || operando.current || !finalizarValido) return;
    if (edicion && itemsEditados) {
      void operar(() => cambiarVenta(tienda, caja.revision, edicion.venta.id, {items: itemsEditados, pago: captura}), datos => {
        setCaja(datos); cerrarPago(); setUltima(undefined);
      });
      return;
    }
    await operar(() => {
      intento.current ??= { id: crearId(), fecha: new Date().toISOString() };
      return finalizar(tienda, caja.revision, intento.current.id, captura, intento.current.fecha);
    }, datos => {
      const venta = datos.sales.find(v => v.id === intento.current?.id);
      setCaja(datos); setUltima(venta); setCopiado(false); cerrarPago();
      copiaActual.current = venta?.id;
      if (venta) void copiarResumen(venta);
    });
  }
  async function copiarResumen(venta: VentaCaja, manual = false) {
    try {
      await navigator.clipboard.writeText(resumenVenta(venta));
      if (copiaActual.current === venta.id) setCopiado(true);
    } catch {
      if (manual) setErrorCaja("No se pudo copiar. Puedes compartir la venta por WhatsApp.");
    }
  }
  function editarVenta(venta: VentaCaja) {
    const p = venta.pago;
    setEdicion({ venta, items: venta.items.map(producto => ({
      producto, precio: String(producto.price), cantidad: String(producto.quantity)
    })) });
    setCaptura({ metodo: p.metodo, efectivo: monto(p.efectivo), dolares: monto(p.dolares),
      tarjeta: monto(p.tarjeta), cambio: monto(p.tasa), folio: p.folio });
  }
  function recargar() {
    if (!tienda || !caja) return;
    void operar(() => leer(tienda), datos => {
      if (captura && !edicion && JSON.stringify(caja.cart) !== JSON.stringify(datos.cart)) {
        cerrarPago(); setErrorCaja("El ticket cambió en otra pestaña. Revísalo antes de abrir el cobro nuevamente.");
      }
      if (edicion && JSON.stringify(edicion.venta) !== JSON.stringify(datos.sales.find(v => v.id === edicion.venta.id))) {
        cerrarPago(); setErrorCaja("La venta cambió en otra pestaña. Revísala antes de volver a editarla.");
      }
      setCaja(datos); setConflicto(false);
    });
  }

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || !tienda || !caja || ocupado ||
        escaneo || confirmacion || priceLookup !== "closed" || showImportModal || showCatalogModal) return;
      if (e.key === "F10" && !busqueda && (!captura || edicion) && !conflicto) { e.preventDefault(); abrirBuscador(); }
      if (e.key === "F12" && !busqueda && !captura && !historial && cart.length && !conflicto) { e.preventDefault(); abrirPago(); }
      if (e.key === "F2" && captura && !busqueda && !edicion) { e.preventDefault(); void guardarCobro(); }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  });

  return (
    <div className="labs-cobro max-w-7xl mx-auto px-4 md:px-8 py-8 relative">
      {priceLookup === "scanning" && <EscanerCodigo onClose={closePriceLookup}
        onDetected={code => setPriceLookup({ code, added: false })} />}
      {typeof priceLookup === "object" && (
        <dialog ref={priceDialog} aria-labelledby="price-lookup-title" aria-describedby="price-lookup-result"
          onCancel={event => { event.preventDefault(); if (!ocupado) closePriceLookup(); }}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-neutral-300 bg-white p-5 text-[#141418] backdrop:bg-black/60">
          <h2 id="price-lookup-title" tabIndex={-1} className="text-lg font-bold">Precio del producto</h2>
          <div id="price-lookup-result" className="my-4 break-words">
            {priceProduct ? <>
              <p className="font-semibold">{priceProduct.descripcion}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(priceProduct.precio)}</p>
            </> : <p>{priceMatches.length ? "Este código coincide con más de un producto." : "Producto no encontrado"}</p>}
            <p className="mt-1 text-sm">{priceLookup.code}</p>
          </div>
          {errorCaja && <p role="alert" className="mb-3 text-sm text-red-800">{errorCaja}</p>}
          {conflicto && <button type="button" disabled={ocupado} onClick={recargar}>Recargar caja</button>}
          <div className="flex flex-wrap gap-2">
            {priceProduct && <button type="button" disabled={priceLookup.added || ocupado || conflicto || !caja}
              className="min-h-11 rounded-lg bg-[#141418] px-3 font-semibold text-white disabled:opacity-60"
              onClick={async () => {
                if (!priceLookup.added && await handleSelectProduct(priceProduct)) setPriceLookup({ ...priceLookup, added: true });
              }}>{priceLookup.added ? "Agregado al ticket" : "Agregar al ticket"}</button>}
            <button type="button" disabled={ocupado} className="pricing-reset min-h-11" onClick={startPriceLookup}>Escanear otro</button>
            <button type="button" disabled={ocupado} className="pricing-reset min-h-11" onClick={closePriceLookup}>Cerrar</button>
          </div>
        </dialog>
      )}
      {/* Toast Notification */}
      <AnimatePresence>
        {importNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-[#141418] text-white border border-[#C1121F] px-5 py-3.5 rounded-lg shadow-xl flex items-center gap-3 text-xs font-mono font-bold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{importNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV IMPORT / UPDATE MODAL */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              role="dialog" aria-modal="true" aria-label="Catálogo e inventario" data-catalog-dialog tabIndex={-1}
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border border-[#b5bec6] rounded-lg max-w-2xl w-full p-6 md:p-8 shadow-2xl font-sans my-8"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#b5bec6] pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#edf2fd] border border-[#b5bec6] flex items-center justify-center text-[#780000]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-[#141418]">
                      Actualizar Costos e Inventario
                    </h3>
                    <p className="text-xs text-neutral-500 font-sans">
                      Carga tu archivo CSV (ej. INVENTARIO 30SEP26) para actualizar los precios del sistema
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setPreviewItems([]);
                    setPreviewError(null);
                  }}
                  className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[#b5bec6] mb-6 gap-2">
                <button
                  type="button"
                  onClick={() => setImportTab("file")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "file"
                      ? "border-[#C1121F] text-[#141418]"
                      : "border-transparent text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Archivo (.csv)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTab("paste")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "paste"
                      ? "border-[#C1121F] text-[#141418]"
                      : "border-transparent text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Pegar Texto CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTab("sheets")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "sheets"
                      ? "border-[#C1121F] text-[#141418]"
                      : "border-transparent text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Google Sheets</span>
                </button>
              </div>

              {/* TAB 1: FILE UPLOAD & DRAG DROP */}
              {importTab === "file" && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDraggingFile
                        ? "border-[#C1121F] bg-[#edf2fd]"
                        : "border-[#b5bec6] hover:border-neutral-400 bg-[#edf2fd]"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInputChange}
                      accept=".csv, .txt, text/csv"
                      className="hidden"
                    />
                    <div className="w-14 h-14 rounded-full bg-white border border-[#b5bec6] flex items-center justify-center mx-auto mb-3 text-[#780000] shadow-2xs">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-sans font-semibold text-neutral-800 mb-1">
                      Haz clic para seleccionar o arrastra tu archivo CSV aquí
                    </p>
                    <p className="text-xs text-neutral-500 font-mono">
                      Compatible con INVENTARIO 30SEP26, Excel CSV delimitado por comas o punto y coma
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#141418] text-white rounded-xl text-xs font-mono font-bold">
                      Examinar archivo
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PASTE CSV */}
              {importTab === "paste" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono font-bold text-neutral-700 uppercase tracking-wider mb-2">
                      Pega aquí los datos copiados desde Excel, Bloc de Notas o WhatsApp:
                    </label>
                    <textarea
                      rows={7}
                      value={pastedCSV}
                      onChange={(e) => {
                        setPastedCSV(e.target.value);
                        processCSVText(e.target.value, "Texto pegado");
                      }}
                      placeholder="Código,Descripcion,Precio,Departamento&#10;7501022014585,7 Up 600ml,$20.00,Pepsi&#10;7501005102704,Ades Guanabana 946ml,$30.00,Coca Cola"
                      className="w-full bg-[#edf2fd] border border-[#b5bec6] focus:border-[#C1121F] focus:bg-white focus:outline-none rounded-lg p-4 text-xs font-mono text-neutral-800"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: GOOGLE SHEETS URL */}
              {importTab === "sheets" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono font-bold text-neutral-700 uppercase tracking-wider mb-2">
                      Enlace de publicación CSV de Google Sheets:
                    </label>
                    <input
                      type="url"
                      value={customSheetUrl}
                      onChange={(e) => setCustomSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                      className="w-full bg-[#edf2fd] border border-[#b5bec6] focus:border-[#C1121F] focus:bg-white focus:outline-none rounded-xl px-4 py-3 text-xs font-mono text-neutral-800"
                    />
                    <p className="text-[11px] text-neutral-400 font-sans mt-2">
                      Obtén este enlace en Google Sheets yendo a: Archivo &gt; Compartir &gt; Publicar en la web &gt; Formato CSV.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSyncing(true);
                      setPreviewError(null);
                      setPreviewItems([]);
                      try {
                        const res = await fetch(customSheetUrl, { cache: "no-store" });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const text = await leerCSVRemoto(res);
                        processCSVText(text, "Google Sheets en Línea");
                      } catch (err: any) {
                        setPreviewError(`Error descargando Google Sheets: ${err?.message || "No responde"}`);
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    disabled={isSyncing}
                    className="w-full bg-white border border-[#b5bec6] hover:bg-[#141418] hover:text-white py-3 px-4 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Verificando..." : "Descargar y Previsualizar"}</span>
                  </button>
                </div>
              )}

              {/* ERROR ALERT */}
              {previewError && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs font-sans flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* PREVIEW OF PARSED DATA */}
              {previewItems.length > 0 && (
                <div className="mt-6 border border-[#b5bec6] rounded-lg p-4 bg-[#edf2fd] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b5bec6] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="text-xs font-mono font-bold text-neutral-900">
                        {previewItems.length} productos detectados
                      </span>
                      {previewSourceName && (
                        <span className="text-[11px] font-mono text-neutral-500 bg-white border border-[#b5bec6] px-2 py-0.5 rounded">
                          {previewSourceName}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-emerald-700 font-mono font-bold">
                      Listo para aplicar
                    </span>
                  </div>

                  {/* Sample rows */}
                  <div className="text-[11px] font-mono text-neutral-500 mb-1">
                    Muestra de los primeros productos parseados:
                  </div>
                  <div className="bg-white border border-[#b5bec6] rounded-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-[#b5bec6]">
                    {previewItems.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs font-mono gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] bg-[#141418] text-white px-1.5 py-0.5 rounded font-bold">
                            {item.departamento}
                          </span>
                          <span className="text-neutral-800 truncate font-sans font-medium">
                            {item.descripcion}
                          </span>
                          {item.codigo && (
                            <span className="text-neutral-400 text-[10px]">({item.codigo})</span>
                          )}
                        </div>
                        <span className="font-bold text-[#b5bec6] shrink-0">
                          ${item.precio.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      className="flex-1 bg-[#141418] hover:bg-[#C1121F] text-white py-3.5 px-6 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirmar y Actualizar Catálogo ({previewItems.length} productos)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewItems([]);
                        setPreviewSourceName("");
                      }}
                      className="bg-white border border-[#b5bec6] hover:bg-neutral-100 text-neutral-600 py-3.5 px-4 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL CATALOG EXPLORER MODAL */}
      <AnimatePresence>
        {showCatalogModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              role="dialog" aria-modal="true" aria-label="Catálogo e inventario" data-catalog-dialog tabIndex={-1}
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border border-[#b5bec6] rounded-lg max-w-4xl w-full p-6 md:p-8 shadow-2xl font-sans my-6 max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#b5bec6] pb-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#edf2fd] border border-[#b5bec6] flex items-center justify-center text-[#780000]">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-[#141418]">
                      Explorador de Precios y Catálogo
                    </h3>
                    <p className="text-xs text-neutral-500 font-sans">
                      {inventory.length} productos registrados en la base de datos local
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCatalogModal(false)}
                  className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 shrink-0">
                <div className="md:col-span-8 relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o código de barras..."
                    className="w-full bg-[#edf2fd] border border-[#b5bec6] focus:border-[#C1121F] focus:bg-white focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs font-sans"
                  />
                  {catalogSearch && (
                    <button
                      onClick={() => setCatalogSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-mono"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="md:col-span-4">
                  <select
                    value={catalogDepto}
                    onChange={(e) => setCatalogDepto(e.target.value)}
                    className="w-full bg-[#edf2fd] border border-[#b5bec6] focus:border-[#C1121F] focus:bg-white focus:outline-none rounded-xl px-3 py-2.5 text-xs font-mono text-neutral-800 cursor-pointer"
                  >
                    <option value="TODOS">Todos los departamentos ({departmentsList.length})</option>
                    {departmentsList.map((dep) => (
                      <option key={dep} value={dep}>
                        {dep}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table / List */}
              <div className="flex-1 overflow-y-auto border border-[#b5bec6] rounded-lg divide-y divide-[#b5bec6]">
                {catalogModalFiltered.length > 0 ? (
                  catalogModalFiltered.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 hover:bg-[#edf2fd] transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold bg-[#141418] text-white px-2 py-0.5 rounded uppercase">
                            {item.departamento}
                          </span>
                          {item.codigo && (
                            <span className="text-[10px] font-mono text-neutral-400">
                              {item.codigo}
                            </span>
                          )}
                        </div>
                        <p className="font-sans font-semibold text-neutral-900 truncate">
                          {item.descripcion}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono font-bold text-base text-[#b5bec6]">
                          ${item.precio.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectProduct(item);
                            setImportNotification(`Agregado: ${item.descripcion}`);
                            setTimeout(() => setImportNotification(null), 2500);
                          }}
                          className="px-3 py-1.5 bg-neutral-100 hover:bg-[#141418] text-neutral-700 hover:text-white rounded-lg font-mono font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Agregar</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-neutral-400 font-sans text-xs italic">
                    No se encontraron productos con el filtro aplicado.
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-neutral-500 pt-3 border-t border-[#b5bec6] shrink-0">
                <span>
                  Mostrando {catalogModalFiltered.length} de {inventory.length} productos
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 bg-[#edf2fd] hover:bg-neutral-200 text-neutral-700 border border-[#b5bec6] rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Catálogo CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(false)}
                    className="px-4 py-1.5 bg-[#141418] text-white rounded-xl text-xs font-mono font-bold cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="caja-encabezado">
        <div><h1>Cobro sin luz</h1>{tienda && <p>{tienda}</p>}</div>
        {tienda && <button type="button" disabled={ocupado} onClick={() => {
          setTienda(undefined); setCaja(undefined); setUltima(undefined); setConflicto(false); setErrorCaja("");
        }}>Cambiar sucursal</button>}
      </div>
      {errorCaja && !busqueda && !captura && typeof priceLookup !== "object" && <p role="alert" className="caja-error">{errorCaja}</p>}
      {!tienda && <section className="caja-columna">
        <h2>{hayCopia ? "Recuperar la caja anterior" : "Elige tu sucursal"}</h2>
        {hayCopia && <p>El ticket y las ventas anteriores no tienen sucursal. Se copiarán juntos a la tienda que elijas.</p>}
        {hayCopia === undefined && (ocupado ? <p role="status">Abriendo almacenamiento…</p> : <button type="button" onClick={revisarLegado}>Reintentar</button>)}
        {hayCopia !== undefined && <div className="caja-tiendas">
          {sucursales.map(sucursal => <button type="button" key={sucursal} disabled={ocupado}
            aria-pressed={hayCopia ? destinoLegado === sucursal : undefined}
            onClick={() => hayCopia ? setDestinoLegado(sucursal) : abrirTienda(sucursal)}>{sucursal}</button>)}
        </div>}
        {hayCopia && <button type="button" className="caja-primario" disabled={ocupado || !destinoLegado}
          onClick={() => destinoLegado && abrirTienda(destinoLegado, true)}>Recuperar en esta sucursal</button>}
      </section>}
      {tienda && caja && <>
        <div className="caja-acciones caja-vistas" aria-label="Vista de caja">
          <button type="button" aria-pressed={!historial} onClick={() => setHistorial(false)}>Ticket</button>
          <button type="button" aria-pressed={historial} onClick={() => setHistorial(true)}>Historial</button>
          {conflicto && !busqueda && !captura && <button type="button" onClick={recargar} disabled={ocupado}>Recargar caja</button>}
        </div>
        {historial ? <HistorialCaja caja={caja} ocupado={ocupado || conflicto}
          estado={venta => void operar(() => cambiarVenta(tienda, caja.revision, venta.id, {traspasada: !venta.traspasada}), setCaja)}
          editar={editarVenta} borrar={setConfirmacion} limpiar={() => setConfirmacion("historial")} /> : <>
          {ultima && <section className="caja-confirmacion">
            <p role="status"><CheckCircle size={18} /> Venta {numeroVenta(ultima.numero)} registrada. Cambio: {mxn(ultima.pago.cambioMXN)} MXN.</p>
            <details><summary>Compartir venta</summary><div className="caja-acciones">
              <button type="button" onClick={() => void copiarResumen(ultima, true)}><Copy size={17} />{copiado ? "Copiado" : "Copiar texto"}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(resumenVenta(ultima))}`} target="_blank" rel="noopener noreferrer">
                <Share2 size={17} /> WhatsApp</a>
            </div></details>
          </section>}
          <section className="caja-columna" aria-label="Ticket actual">
            <div className="caja-encabezado"><h2>Ticket actual</h2>
              {!!cart.length && <button type="button" disabled={ocupado || conflicto}
                onClick={() => setConfirmacion("ticket")}>Limpiar ticket</button>}
            </div>
            {cart.length ? <fieldset disabled={ocupado || conflicto}><LineasTicket items={cart} cambiar={items => void saveCart(items)} /></fieldset>
              : <p className="caja-vacio">No hay productos en el ticket.</p>}
          </section>
          <details className="caja-catalogo">
            <summary>Catálogo y herramientas</summary>
      {/* INVENTORY MANAGEMENT BAR */}
      <div className="bg-[#edf2fd] border border-[#b5bec6] rounded-lg p-4 mb-8 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isSyncing || syncError ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
          <div role="status" className="text-xs font-sans text-neutral-700">
            {isSyncing ? "Actualizando catálogo. Puedes seguir usando la copia local." : syncError ? "Usando catálogo local." : null}
            <span className="font-bold text-neutral-900">Catálogo Activo: </span>
            <span className="font-mono font-bold text-[#b5bec6] text-sm">{inventory.length}</span>{" "}
            productos cargados.
            {lastSyncDate && (
              <span className="text-neutral-500 font-mono text-[11px] block sm:inline sm:ml-2">
                ({lastSyncDate})
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Action: Upload CSV */}
          <button
            onClick={() => {
              setShowImportModal(true);
              setImportTab("file");
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#141418] hover:bg-[#C1121F] text-white rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer shadow-sm"
            title="Cargar nuevo archivo CSV de costos e inventario (ej. INVENTARIO 30SEP26)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Cargar Archivo CSV</span>
            <span className="bg-[#C1121F] text-[9px] px-1.5 py-0.2 rounded text-white uppercase tracking-wider">
              Nuevos Costos
            </span>
          </button>

          {/* View Catalog */}
          <button
            onClick={() => setShowCatalogModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#b5bec6] rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer shadow-2xs"
            title="Ver catálogo completo de precios"
          >
            <Eye className="w-3.5 h-3.5 text-neutral-500" />
            <span>Ver Catálogo</span>
          </button>

          {/* Shared catalog sync */}
          <button type="button" ref={priceTrigger} onClick={startPriceLookup}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-[#b5bec6] bg-white px-3 text-sm font-semibold hover:bg-neutral-100">
            <Barcode size={17} aria-hidden="true" /> Consultor de precios
          </button>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#b5bec6] rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer shadow-2xs"
            title="Actualizar catálogo compartido"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "..." : "Actualizar catálogo"}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-2 bg-white hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 border border-[#b5bec6] rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
            title="Descargar copia de respaldo en formato CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle Offline / Warning */}
      {syncError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs font-sans mb-8 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-medium">{syncError}</span>
        </div>
      )}
          </details>
          <section className="caja-barra" aria-label="Captura y cobro">
            <p className="caja-total"><span>{articulos(cart)}</span><strong>{mxn(ticketTotal)} MXN</strong></p>
            <div className="caja-metodos caja-comandos">
              <button type="button" title="Buscar productos" disabled={ocupado || conflicto} onClick={() => abrirBuscador()}><Search size={19} />F10</button>
              <button type="button" aria-label="Escanear producto" title="Escanear producto" disabled={ocupado || conflicto}
                onClick={() => { setErrorCaja(""); setEscaneo(true); }}><Barcode size={20} /><span>Escanear</span></button>
              <button type="button" className="caja-primario" title="Cobrar venta" disabled={ocupado || conflicto || !cart.length}
                onClick={abrirPago}><ReceiptText size={19} />F12</button>
            </div>
          </section>
        </>}
      </>}
      {escaneo && <EscanerCodigo onClose={() => {
        setEscaneo(false); abrirBuscador();
      }} onDetected={async codigo => {
        setEscaneo(false);
        const candidatos = coincidenciasCodigo<CatalogItem>(inventory, codigo);
        if (candidatos.length !== 1 || !await handleSelectProduct(candidatos[0])) {
          setBusqueda(true); setSearchQuery(codigo); setCantidadBusqueda("1");
          if (!candidatos.length) setShowManualFallback(true);
        }
      }} />}
      {confirmacion && tienda && caja && <DialogoCaja titulo={confirmacion === "historial" ? "¿Limpiar historial?" :
        confirmacion === "ticket" ? "¿Limpiar el ticket actual?" : `¿Eliminar la venta ${numeroVenta(confirmacion.numero)}?`}
        ocupado={ocupado} cerrar={() => setConfirmacion(undefined)}>
        <p>{confirmacion === "historial" ? `Se eliminarán las ventas traspasadas de ${tienda} y se reiniciará la numeración. El ticket actual seguirá intacto.`
          : "Esta acción no se puede deshacer."}</p>
        {errorCaja && <p role="alert" className="caja-error">{errorCaja}</p>}
        <div className="caja-acciones caja-pie">
          <button autoFocus type="button" disabled={ocupado} onClick={() => setConfirmacion(undefined)}>Cancelar</button>
          <button type="button" disabled={ocupado || conflicto} onClick={async () => {
            const resultado = confirmacion === "ticket" ? await saveCart([]) :
              await operar(() => confirmacion === "historial" ? limpiarHistorial(tienda, caja.revision) :
                cambiarVenta(tienda, caja.revision, confirmacion.id, null), datos => { setCaja(datos); setUltima(undefined); });
            if (resultado) setConfirmacion(undefined);
          }}>Eliminar definitivamente</button>
        </div>
      </DialogoCaja>}
      {busqueda && <DialogoCaja titulo="Buscar productos" ocupado={ocupado} cerrar={() => setBusqueda(false)}>
        <fieldset className="caja-columna" disabled={ocupado || conflicto}>
          <div className="caja-busqueda">
            <label>Nombre o código<input ref={searchInputRef} autoFocus autoComplete="off" type="search" value={searchQuery}
              onKeyDown={handleSearchKeyDown} onChange={e => setSearchQuery(e.target.value)} /></label>
            <label>Cantidad<input inputMode="numeric" value={cantidadBusqueda} onChange={e => setCantidadBusqueda(e.target.value)} /></label>
          </div>
          <details className="caja-filtros"><summary>Filtros de búsqueda</summary>
            <div className="caja-acciones">
            {filterOptions.map(({key,label}) => <button key={key} type="button" aria-pressed={searchFilters[key].enabled}
              onClick={() => setSearchFilters(prev => ({...prev,[key]:{...prev[key],enabled:!prev[key].enabled}}))}>{label}</button>)}
            </div>
            <div className="caja-campos">
            {filterOptions.filter(({key}) => searchFilters[key].enabled).map(({key,label}) => <label key={key}>{label}
              <input inputMode={key === "barcode" ? "numeric" : "text"} value={searchFilters[key].value}
                onChange={e => setSearchFilters(prev => ({...prev,[key]:{...prev[key],value:e.target.value}}))} /></label>)}
            </div>
          </details>
          <div className="caja-resultados">
            {filteredResults.slice(0, 100).map(item => <button type="button" key={item.id} disabled={!cantidadValida}
              onClick={() => void seleccionarBusqueda(item)}><span>{item.descripcion}<small>{item.codigo} · {item.departamento}</small></span>
              <strong>{mxn(Math.round(item.precio * 100))}</strong></button>)}
            {!filteredResults.length && <p>No se encontraron productos.</p>}
            {filteredResults.length > 100 && <p>100 de {filteredResults.length} productos. Puedes acotar la búsqueda.</p>}
          </div>
        </fieldset>
        <details open={showManualFallback} onToggle={e => setShowManualFallback(e.currentTarget.open)} className="caja-filtros">
          <summary>Ingreso manual</summary>
          <form onSubmit={handleAddManualProduct}><fieldset disabled={ocupado || conflicto} className="caja-campos">
            <label>Producto o concepto<input required value={manualName} onChange={e => setManualName(e.target.value)} /></label>
            <label>Precio MXN<input required inputMode="decimal" value={manualPrice} onChange={e => setManualPrice(e.target.value)} /></label>
            <label>Cantidad manual<input inputMode="numeric" required value={manualQty} onChange={e => setManualQty(e.target.value)} /></label>
            <button type="submit">Agregar manual</button>
          </fieldset></form>
        </details>
        {!cantidadValida && <p className="caja-error">Introduce una cantidad entera mayor a cero.</p>}
        {errorCaja && <p role="alert" className="caja-error">{errorCaja}</p>}
        {conflicto && <button type="button" disabled={ocupado} onClick={recargar}>Recargar caja</button>}
        <p className="caja-total" role="status"><span>{articulos(itemsEditados ?? cart)}</span>
          <strong>{mxn(edicion ? totalPago : ticketTotal)} MXN</strong></p>
      </DialogoCaja>}
      {captura && !busqueda && <DialogoCaja titulo={edicion ? `Editar venta ${numeroVenta(edicion.venta.numero)}` : "Cobrar venta"}
        ocupado={ocupado} cerrar={cerrarPago}>
        <form onSubmit={e => { e.preventDefault(); void guardarCobro(); }}>
          <fieldset className="caja-columna" disabled={ocupado || conflicto}>
            {edicion && <>
              {edicion.items.map(({producto, precio, cantidad}, i) => <div className="caja-edicion" key={producto.id}>
                <b>{producto.name}</b>
                <div className="caja-campos">
                  <label>Cantidad<input inputMode="numeric" value={cantidad} onChange={e => {
                    setEdicion({...edicion,items:edicion.items.map((p,j) => i === j ? {...p,cantidad:e.target.value} : p)});
                  }} /></label>
                  <label>Precio unitario<input inputMode="decimal" value={precio} onChange={e => {
                    setEdicion({...edicion,items:edicion.items.map((p,j) => i === j ? {...p,precio:e.target.value} : p)});
                  }} /></label>
                  <button type="button" aria-label={`Quitar ${producto.name}`} onClick={() =>
                    setEdicion({...edicion, items: edicion.items.filter((_, j) => i !== j)})}><Trash2 size={18} /></button>
                </div>
              </div>)}
              <button type="button" onClick={() => abrirBuscador()}><Plus size={18} /> Agregar producto</button>
            </>}
            <FormularioPago total={totalPago} captura={captura} cambiar={valor => {
              intento.current = undefined; setCaptura(valor); setErrorCaja("");
            }} editar={!!edicion} guardarTasa={() => {
              if (tienda && caja) void operar(() => actualizar(tienda, caja.revision, {cambio: captura.cambio}), setCaja);
            }} />
          </fieldset>
          {calculo && !calculo.valido && <p className="caja-error">Revisa los importes y el tipo de cambio.</p>}
          {errorCaja && <p role="alert" className="caja-error">{errorCaja}</p>}
          {conflicto && <button type="button" disabled={ocupado} onClick={recargar}>Recargar caja</button>}
          <div className="caja-acciones caja-pie">
            <button type="button" disabled={ocupado} onClick={cerrarPago}>Cancelar</button>
            <button type="submit" title={edicion ? undefined : "Finalizar venta"} className="caja-primario" disabled={!finalizarValido}>
              <Check size={20} />{edicion ? "Guardar cambios" : "F2"}</button>
          </div>
        </form>
      </DialogoCaja>}
    </div>
  );
}
