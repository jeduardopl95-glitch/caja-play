// src/modules/cobro/CobroSinLuz.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  ReceiptText,
  RefreshCw,
  Search,
  CheckCircle,
  Share2,
  Copy,
  AlertTriangle,
  PlusCircle,
  ChevronDown,
  ChevronUp,
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
import {
  CatalogItem,
  syncSheetsInventory,
  getSavedInventory,
  saveInventoryLocally,
  parseSheetsCSV,
  exportInventoryToCSV,
  SHEETS_CSV_URL
} from "../../lib/inventorySync";

interface CobroSinLuzProps {
  onBack: () => void;
}

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

export default function CobroSinLuz({ onBack }: CobroSinLuzProps) {
  // Inventory state from localStorage or pre-bundled default catalog
  const [inventory, setInventory] = useState<CatalogItem[]>(() => {
    return getSavedInventory();
  });

  const [lastSyncDate, setLastSyncDate] = useState<string | null>(() => {
    return localStorage.getItem("cajaplay_sheets_last_sync") || "Catálogo local activo";
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart state
  const [cart, setCart] = useState<Product[]>(() => {
    const saved = localStorage.getItem("cajaplay_active_cart");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        /* ignore */
      }
    }
    return [];
  });

  // Manual fallback input state (collapsed by default)
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");

  // Cash payment state
  const [cashReceived, setCashReceived] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastCompletedSummary, setLastCompletedSummary] = useState("");
  const [copiedNotification, setCopiedNotification] = useState(false);

  // CSV Import Modal & Tools State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<"file" | "paste" | "sheets">("file");
  const [pastedCSV, setPastedCSV] = useState("");
  const [customSheetUrl, setCustomSheetUrl] = useState(SHEETS_CSV_URL);
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
    const saved = localStorage.getItem("cajaplay_sheets_inventory");
    if (!saved) {
      handleSync();
    }
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    const res = await syncSheetsInventory(customSheetUrl);
    if (res.success) {
      setInventory(res.items);
      setLastSyncDate(res.lastSync);
      setImportNotification(`Inventario actualizado: ${res.items.length} productos desde Google Sheets`);
      setTimeout(() => setImportNotification(null), 5000);
    } else {
      if (res.items.length > 0) {
        setInventory(res.items);
      }
      if (res.lastSync) {
        setLastSyncDate(res.lastSync);
      }
      setSyncError(res.error || "Sin conexión: utilizando copia local offline");
    }
    setIsSyncing(false);
  };

  const saveCart = (newCart: Product[]) => {
    setCart(newCart);
    localStorage.setItem("cajaplay_active_cart", JSON.stringify(newCart));
  };

  // CSV File Processing
  const processCSVText = (text: string, sourceName: string) => {
    setPreviewError(null);
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processCSVText(text, file.name);
    };
    reader.onerror = () => {
      setPreviewError("Error al leer el archivo arrastrado.");
    };
    reader.readAsText(file, "UTF-8");
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
    const raw = searchQuery.trim();
    if (!raw) return inventory.slice(0, 40); // Muestra top 40 inicial

    const q = raw.toLowerCase();

    // %texto -> Buscar dentro de la descripción
    if (q.startsWith("%")) {
      const text = q.slice(1).trim();
      if (!text) return inventory.slice(0, 40);
      return inventory.filter((item) => item.descripcion.toLowerCase().includes(text));
    }

    // #departamento -> Buscar por departamento
    if (q.startsWith("#")) {
      const deptoQuery = normalizeStr(q.slice(1));
      if (!deptoQuery) return inventory.slice(0, 40);
      return inventory.filter((item) => normalizeStr(item.departamento).includes(deptoQuery));
    }

    // $precio -> Buscar por precio exacto
    if (q.startsWith("$")) {
      const priceQuery = parseFloat(q.slice(1).trim());
      if (isNaN(priceQuery)) return [];
      return inventory.filter((item) => item.precio === priceQuery);
    }

    // @codigo -> Buscar exclusivamente por código de barras
    if (q.startsWith("@")) {
      const codeQuery = q.slice(1).trim().toLowerCase();
      if (!codeQuery) return [];
      return inventory.filter((item) => item.codigo.toLowerCase() === codeQuery);
    }

    // Búsqueda general automática en: Código de barras, Descripción, Departamento
    return inventory.filter((item) => {
      const cod = item.codigo.toLowerCase();
      const desc = item.descripcion.toLowerCase();
      const dep = item.departamento.toLowerCase();
      return cod.includes(q) || desc.includes(q) || dep.includes(q);
    });
  }, [searchQuery, inventory]);

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

  // Select product into cart
  const handleSelectProduct = (item: CatalogItem) => {
    const idx = cart.findIndex((p) => p.codigo === item.codigo && p.name === item.descripcion);
    if (idx > -1) {
      const updated = [...cart];
      updated[idx].quantity += 1;
      saveCart(updated);
    } else {
      const newProd: Product = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
        name: item.descripcion,
        price: item.precio,
        quantity: 1,
        codigo: item.codigo,
        departamento: item.departamento
      };
      saveCart([...cart, newProd]);
    }
  };

  // Barcode scanner handling (USB / Bluetooth send Enter)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = searchQuery.trim().replace(/^@/, "");
      if (!raw) return;

      // 1. Coincidencia exacta de código de barras
      const exactBarcodeMatch = inventory.find((p) => p.codigo.toLowerCase() === raw.toLowerCase());
      if (exactBarcodeMatch) {
        handleSelectProduct(exactBarcodeMatch);
        setSearchQuery("");
        searchInputRef.current?.focus();
        return;
      }

      // 2. Si hay exactamente 1 coincidencia en resultados
      if (filteredResults.length === 1) {
        handleSelectProduct(filteredResults[0]);
        setSearchQuery("");
        searchInputRef.current?.focus();
      }
    }
  };

  // Barcode scanner fast typing handling
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    const raw = val.trim().replace(/^@/, "");
    // Si el lector escribe rápido puros dígitos de un código exacto
    if (raw.length >= 8 && /^\d+$/.test(raw)) {
      const exactMatch = inventory.find((p) => p.codigo === raw);
      if (exactMatch) {
        handleSelectProduct(exactMatch);
        setSearchQuery("");
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }
    }
  };

  const handleAddManualProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPrice || parseFloat(manualPrice) <= 0) return;

    const price = parseFloat(manualPrice);
    const qty = parseInt(manualQty) || 1;

    const existingIndex = cart.findIndex((p) => p.name.toLowerCase() === manualName.trim().toLowerCase());
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += qty;
      saveCart(updated);
    } else {
      const newProduct: Product = {
        id: Date.now().toString(),
        name: manualName.trim(),
        price,
        quantity: qty,
        departamento: "Manual"
      };
      saveCart([...cart, newProduct]);
    }

    setManualName("");
    setManualPrice("");
    setManualQty("1");
    searchInputRef.current?.focus();
  };

  const handleIncrement = (id: string) => {
    const updated = cart.map((item) => {
      if (item.id === id) {
        return { ...item, quantity: item.quantity + 1 };
      }
      return item;
    });
    saveCart(updated);
  };

  const handleDecrement = (id: string) => {
    const updated = cart
      .map((item) => {
        if (item.id === id) {
          const nextQty = item.quantity - 1;
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        }
        return item;
      })
      .filter((item): item is Product => item !== null);
    saveCart(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = cart.filter((item) => item.id !== id);
    saveCart(updated);
  };

  const handleClearCart = () => {
    if (confirm("¿Estás seguro de que quieres limpiar el ticket actual?")) {
      saveCart([]);
      setCashReceived("");
      setShowSuccess(false);
      searchInputRef.current?.focus();
    }
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotal = cartSubtotal;
  const changeAmount = cashReceived ? Math.max(0, parseFloat(cashReceived) - cartTotal) : 0;
  const isEnoughCash = cashReceived ? parseFloat(cashReceived) >= cartTotal : false;

  const handleFinalizedSale = async () => {
    if (cart.length === 0) return;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let summaryText = `VENTA SIN LUZ\n${dateStr} ${timeStr}\n\n`;
    cart.forEach((item) => {
      const itemTot = (item.price * item.quantity).toFixed(2);
      summaryText += `${item.name} x${item.quantity} $${itemTot}\n`;
    });
    summaryText += `\nTOTAL: $${cartTotal.toFixed(2)}`;

    // Guardar historial en localStorage
    const finishedSales = JSON.parse(localStorage.getItem("cajaplay_completed_sales") || "[]");
    const newSale = {
      id: Date.now().toString(),
      fecha: `${dateStr} ${timeStr}`,
      items: cart,
      total: cartTotal,
      efectivo: cashReceived ? parseFloat(cashReceived) : cartTotal,
      cambio: changeAmount,
      resumen: summaryText
    };
    finishedSales.unshift(newSale);
    localStorage.setItem("cajaplay_completed_sales", JSON.stringify(finishedSales));

    // Copiar automáticamente al portapapeles
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    } catch (err) {
      /* ignore if permissions issue */
    }

    setLastCompletedSummary(summaryText);
    setShowSuccess(true);
  };

  const handleManualCopy = async () => {
    try {
      await navigator.clipboard.writeText(lastCompletedSummary);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    } catch (err) {}
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {importNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-[#3D405B] text-white border border-[#E07A5F] px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-mono font-bold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{importNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUCCESS MODAL ON SALE FINISHED */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-[#E6D5AB] rounded-[30px] max-w-md w-full p-6 md:p-8 text-center shadow-2xl font-sans"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>

              <h3 className="font-serif text-2xl font-bold text-[#3D405B] mb-1">Cobro Registrado</h3>

              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold py-2.5 px-4 rounded-xl mb-4 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Venta copiada al portapapeles</span>
              </div>

              {/* Resumen generado */}
              <div className="bg-[#FFFCF2] border border-[#E6D5AB] rounded-xl p-4 text-left font-mono text-xs text-neutral-800 mb-5 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {lastCompletedSummary}
              </div>

              {cashReceived !== "" && (
                <div className="text-xs font-mono text-[#3D405B] bg-[#F4F1DE] border border-[#F2CC8F] p-3 rounded-xl mb-6 flex justify-between items-center px-4">
                  <span>Su cambio:</span>
                  <span className="text-emerald-700 font-bold text-base">${changeAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const url = `https://wa.me/?text=${encodeURIComponent(lastCompletedSummary)}`;
                    window.open(url, "_blank");
                  }}
                  className="w-full bg-[#25D366] hover:bg-[#1fb855] text-white py-3.5 px-6 rounded-xl text-xs uppercase font-mono tracking-wider font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Compartir por WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualCopy}
                  className="w-full bg-[#FFFCF2] hover:bg-neutral-200 text-neutral-700 border border-[#E6D5AB] py-3 px-6 rounded-xl text-xs uppercase font-mono tracking-wider font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedNotification ? "¡Copiado!" : "Volver a copiar texto"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    saveCart([]);
                    setCashReceived("");
                    setShowSuccess(false);
                    searchInputRef.current?.focus();
                  }}
                  className="w-full bg-[#3D405B] hover:bg-[#E07A5F] text-white py-3.5 px-6 rounded-xl text-xs uppercase font-mono tracking-wider font-bold transition-all cursor-pointer mt-1"
                >
                  Nueva Venta
                </button>
              </div>
            </motion.div>
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
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border border-[#E6D5AB] rounded-[32px] max-w-2xl w-full p-6 md:p-8 shadow-2xl font-sans my-8"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#E6D5AB] pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F4F1DE] border border-[#F2CC8F] flex items-center justify-center text-[#E07A5F]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-[#3D405B]">
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
              <div className="flex border-b border-[#E6D5AB] mb-6 gap-2">
                <button
                  type="button"
                  onClick={() => setImportTab("file")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "file"
                      ? "border-[#E07A5F] text-[#3D405B]"
                      : "border-transparent text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Archivo (.csv)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTab("paste")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "paste"
                      ? "border-[#E07A5F] text-[#3D405B]"
                      : "border-transparent text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Pegar Texto CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTab("sheets")}
                  className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                    importTab === "sheets"
                      ? "border-[#E07A5F] text-[#3D405B]"
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
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      isDraggingFile
                        ? "border-[#E07A5F] bg-[#F4F1DE]"
                        : "border-[#E6D5AB] hover:border-neutral-400 bg-[#FFFCF2]"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInputChange}
                      accept=".csv, .txt, text/csv"
                      className="hidden"
                    />
                    <div className="w-14 h-14 rounded-full bg-white border border-[#E6D5AB] flex items-center justify-center mx-auto mb-3 text-[#E07A5F] shadow-2xs">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-sans font-semibold text-neutral-800 mb-1">
                      Haz clic para seleccionar o arrastra tu archivo CSV aquí
                    </p>
                    <p className="text-xs text-neutral-500 font-mono">
                      Compatible con INVENTARIO 30SEP26, Excel CSV delimitado por comas o punto y coma
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#3D405B] text-white rounded-xl text-xs font-mono font-bold">
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
                      className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-2xl p-4 text-xs font-mono text-neutral-800"
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
                      className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-xl px-4 py-3 text-xs font-mono text-neutral-800"
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
                      try {
                        const res = await fetch(customSheetUrl, { cache: "no-store" });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const text = await res.text();
                        processCSVText(text, "Google Sheets en Línea");
                      } catch (err: any) {
                        setPreviewError(`Error descargando Google Sheets: ${err?.message || "No responde"}`);
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    disabled={isSyncing}
                    className="w-full bg-white border border-[#E6D5AB] hover:bg-[#3D405B] hover:text-white py-3 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
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
                <div className="mt-6 border border-[#E6D5AB] rounded-2xl p-4 bg-[#FFFCF2] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6D5AB] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="text-xs font-mono font-bold text-neutral-900">
                        {previewItems.length} productos detectados
                      </span>
                      {previewSourceName && (
                        <span className="text-[11px] font-mono text-neutral-500 bg-white border border-[#E6D5AB] px-2 py-0.5 rounded">
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
                  <div className="bg-white border border-[#E6D5AB] rounded-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-[#E6D5AB]">
                    {previewItems.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs font-mono gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] bg-[#3D405B] text-white px-1.5 py-0.5 rounded font-bold">
                            {item.departamento}
                          </span>
                          <span className="text-neutral-800 truncate font-sans font-medium">
                            {item.descripcion}
                          </span>
                          {item.codigo && (
                            <span className="text-neutral-400 text-[10px]">({item.codigo})</span>
                          )}
                        </div>
                        <span className="font-bold text-[#81B29A] shrink-0">
                          ${item.precio.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      className="flex-1 bg-[#3D405B] hover:bg-[#E07A5F] text-white py-3.5 px-6 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
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
                      className="bg-white border border-[#E6D5AB] hover:bg-neutral-100 text-neutral-600 py-3.5 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
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
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border border-[#E6D5AB] rounded-[32px] max-w-4xl w-full p-6 md:p-8 shadow-2xl font-sans my-6 max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E6D5AB] pb-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F4F1DE] border border-[#F2CC8F] flex items-center justify-center text-[#E07A5F]">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-[#3D405B]">
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
                    className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs font-sans"
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
                    className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-xl px-3 py-2.5 text-xs font-mono text-neutral-800 cursor-pointer"
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
              <div className="flex-1 overflow-y-auto border border-[#E6D5AB] rounded-2xl divide-y divide-[#E6D5AB]">
                {catalogModalFiltered.length > 0 ? (
                  catalogModalFiltered.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 hover:bg-[#F4F1DE] transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold bg-[#3D405B] text-white px-2 py-0.5 rounded uppercase">
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
                        <span className="font-mono font-bold text-base text-[#81B29A]">
                          ${item.precio.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectProduct(item);
                            setImportNotification(`Agregado: ${item.descripcion}`);
                            setTimeout(() => setImportNotification(null), 2500);
                          }}
                          className="px-3 py-1.5 bg-neutral-100 hover:bg-[#3D405B] text-neutral-700 hover:text-white rounded-lg font-mono font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
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
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-neutral-500 pt-3 border-t border-[#E6D5AB] shrink-0">
                <span>
                  Mostrando {catalogModalFiltered.length} de {inventory.length} productos
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 bg-[#FFFCF2] hover:bg-neutral-200 text-neutral-700 border border-[#E6D5AB] rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Catálogo CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(false)}
                    className="px-4 py-1.5 bg-[#3D405B] text-white rounded-xl text-xs font-mono font-bold cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER BACK & OFFLINE TAG */}
      <div className="mb-6 flex items-center justify-between border-b border-[#E6D5AB] pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 group text-neutral-500 hover:text-[#3D405B] transition-colors py-2 text-xs font-mono uppercase tracking-widest font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-neutral-400 group-hover:text-[#3D405B]" />
          <span>Volver al menú</span>
        </button>
        <div className="flex items-center gap-2 bg-[#F4F1DE] border border-[#F2CC8F] px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 rounded-full bg-[#E07A5F] animate-pulse"></div>
          <span className="text-[10px] font-mono tracking-widest text-[#81B29A] uppercase font-bold">
            Módulo Offline Activo
          </span>
        </div>
      </div>

      {/* TITLE & DESCRIPTION */}
      <div className="mb-6 space-y-1">
        <h1 className="font-serif text-3xl md:text-4xl font-light text-neutral-900 tracking-tight">
          Cobro sin Luz
        </h1>
        <p className="text-[#5D627B] font-sans font-light text-sm max-w-2xl">
          Módulo de cobro rápido con escáneres USB / Bluetooth y precios actualizados fuera de línea.
        </p>
      </div>

      {/* INVENTORY MANAGEMENT BAR */}
      <div className="bg-[#FFFCF2] border border-[#E6D5AB] rounded-2xl p-4 mb-8 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isSyncing ? "bg-amber-400 animate-ping" : syncError ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
          <div className="text-xs font-sans text-neutral-700">
            <span className="font-bold text-neutral-900">Catálogo Activo: </span>
            <span className="font-mono font-bold text-[#81B29A] text-sm">{inventory.length}</span>{" "}
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
            className="flex items-center gap-2 px-3.5 py-2 bg-[#3D405B] hover:bg-[#E07A5F] text-white rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
            title="Cargar nuevo archivo CSV de costos e inventario (ej. INVENTARIO 30SEP26)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Cargar Archivo CSV</span>
            <span className="bg-[#E07A5F] text-[9px] px-1.5 py-0.2 rounded text-white uppercase tracking-wider">
              Nuevos Costos
            </span>
          </button>

          {/* View Catalog */}
          <button
            onClick={() => setShowCatalogModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#E6D5AB] rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs"
            title="Ver catálogo completo de precios"
          >
            <Eye className="w-3.5 h-3.5 text-neutral-500" />
            <span>Ver Catálogo</span>
          </button>

          {/* Sync Sheets */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#E6D5AB] rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs"
            title="Sincronizar desde Google Sheets en la nube"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "..." : "Sheets"}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-2 bg-white hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 border border-[#E6D5AB] rounded-xl text-xs transition-all cursor-pointer shadow-2xs"
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

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10 items-start">
        {/* Left Column: Smart Searcher & Catalog */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E6D5AB] rounded-[30px] p-6 md:p-8 shadow-xs">
            <label className="block text-xs font-mono font-bold tracking-widest text-[#3D405B] uppercase mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#E07A5F]" />
                Buscador Inteligente de Productos
              </span>
              <span className="text-[10px] text-neutral-400 font-normal normal-case">
                Lector USB / Bluetooth compatible
              </span>
            </label>

            <div className="relative">
              <input
                type="text"
                ref={searchInputRef}
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Escanea código o busca por descripción, depto..."
                className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-2xl px-5 py-4 text-base font-sans text-[#3D405B] placeholder:text-neutral-400 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-400 hover:text-neutral-700 bg-neutral-200/60 px-2 py-1 rounded-md"
                >
                  ESC
                </button>
              )}
            </div>

            {/* Visual Help Guide */}
            <div className="mt-3 bg-[#FFFCF2] border border-[#E6D5AB] rounded-2xl p-3.5 text-[11px] text-[#5D627B] font-sans">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                <span className="font-mono font-bold text-[#3D405B] uppercase tracking-wider text-[10px]">
                  BUSCAR POR:
                </span>
                <span>
                  <b className="text-neutral-900">normal</b> → general
                </span>
                <span>
                  <b className="text-[#E07A5F] font-mono">%texto</b> → descripción
                </span>
                <span>
                  <b className="text-blue-700 font-mono">#depto</b> → departamento
                </span>
                <span>
                  <b className="text-emerald-700 font-mono">$precio</b> → precio
                </span>
                <span>
                  <b className="text-purple-700 font-mono">@codigo</b> → código de barras
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-neutral-500 border-t border-[#E6D5AB] pt-2">
                <span className="font-sans font-semibold text-neutral-600 mr-1">Ejemplos:</span>
                <span className="bg-white border border-[#E6D5AB] px-1.5 py-0.5 rounded text-[#E07A5F] font-semibold">
                  %naranja
                </span>
                <span className="bg-white border border-[#E6D5AB] px-1.5 py-0.5 rounded text-blue-700 font-semibold">
                  #pepsi
                </span>
                <span className="bg-white border border-[#E6D5AB] px-1.5 py-0.5 rounded text-emerald-700 font-semibold">
                  $23
                </span>
                <span className="bg-white border border-[#E6D5AB] px-1.5 py-0.5 rounded text-purple-700 font-semibold">
                  @7501055300012
                </span>
              </div>
            </div>

            {/* Live Search Results List */}
            <div className="mt-6 border border-[#E6D5AB] rounded-2xl bg-white overflow-hidden max-h-[440px] overflow-y-auto divide-y divide-[#E6D5AB]">
              {filteredResults.length > 0 ? (
                filteredResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectProduct(item)}
                    className="p-4 hover:bg-[#F4F1DE] transition-colors cursor-pointer flex items-center justify-between gap-4 group active:scale-[0.995]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono font-bold text-white bg-[#3D405B] group-hover:bg-[#E07A5F] px-2 py-0.5 rounded transition-colors uppercase tracking-wider">
                          {item.departamento}
                        </span>
                        {item.codigo && (
                          <span className="text-[11px] font-mono text-neutral-400">{item.codigo}</span>
                        )}
                      </div>
                      <p className="text-sm font-sans font-semibold text-neutral-900 truncate group-hover:text-[#E07A5F] transition-colors">
                        {item.descripcion}
                      </p>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <span className="text-base font-mono font-bold text-[#81B29A]">
                        ${item.precio.toFixed(2)}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-[#FFFCF2] group-hover:bg-[#E07A5F] group-hover:text-white text-neutral-400 flex items-center justify-center transition-colors shrink-0">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-neutral-400 text-xs font-sans italic">
                  No se encontraron productos que coincidan con &quot;{searchQuery}&quot;
                </div>
              )}
            </div>

            <div className="mt-3 text-right">
              <span className="text-[10px] font-mono text-neutral-400">
                Mostrando {filteredResults.length} de {inventory.length} productos
              </span>
            </div>
          </div>

          {/* Collapsible Manual Fallback Input */}
          <div className="bg-[#FFFCF2] border border-[#E6D5AB] rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManualFallback(!showManualFallback)}
              className="w-full p-5 flex items-center justify-between text-xs font-mono font-bold text-neutral-600 hover:text-[#3D405B] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-neutral-500" />
                ¿Producto fuera de catálogo? Ingreso manual rápido
              </span>
              {showManualFallback ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <AnimatePresence>
              {showManualFallback && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleAddManualProduct}
                  className="p-6 pt-2 space-y-4 border-t border-[#E6D5AB] bg-white"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-6">
                      <label className="block text-[10px] tracking-widest uppercase text-neutral-500 font-bold mb-1">
                        Producto / Concepto
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Hielo Extra"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-sans"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[10px] tracking-widest uppercase text-neutral-500 font-bold mb-1">
                        Precio ($)
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                        className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-mono"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[10px] tracking-widest uppercase text-neutral-500 font-bold mb-1">
                        Ctd.
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={manualQty}
                        onChange={(e) => setManualQty(e.target.value)}
                        className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-sans"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#3D405B] hover:bg-[#E07A5F] text-white py-3 px-4 rounded-xl text-xs uppercase font-mono tracking-widest font-bold transition-colors cursor-pointer"
                  >
                    Agregar Manual al Ticket
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Ticket Details & Checkout */}
        <div className="lg:col-span-5 space-y-6 sticky top-6">
          <div className="bg-white border border-[#E6D5AB] rounded-[30px] flex flex-col overflow-hidden shadow-xs">
            <div className="p-5 bg-[#FFFCF2] border-b border-[#E6D5AB] flex items-center justify-between">
              <h3 className="font-serif text-base font-light text-neutral-950 flex items-center gap-2.5">
                <ReceiptText className="w-4 h-4 text-[#81B29A]" />
                <span>Ticket Actual</span>
              </h3>
              <span className="text-[10px] font-mono font-bold text-white bg-[#E07A5F] px-2.5 py-1 rounded-sm uppercase tracking-wider">
                {cart.length} Artículos
              </span>
            </div>

            {/* Ticket Items List */}
            <div className="p-6 max-h-[340px] overflow-y-auto space-y-3 divide-y divide-[#F4F1DE]">
              <AnimatePresence initial={false}>
                {cart.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-3 first:pt-0 flex items-center justify-between gap-3 overflow-hidden"
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <p className="text-xs font-sans font-semibold text-neutral-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] font-mono text-neutral-500 mt-0.5">
                        ${item.price.toFixed(2)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center border border-[#E6D5AB] rounded-lg bg-[#FFFCF2] p-0.5">
                        <button
                          type="button"
                          onClick={() => handleDecrement(item.id)}
                          className="p-1 hover:bg-neutral-200 text-neutral-600 rounded transition cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono font-bold px-2 text-neutral-800 min-w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIncrement(item.id)}
                          className="p-1 hover:bg-neutral-200 text-neutral-600 rounded transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="text-xs font-mono font-bold text-neutral-900 w-16 text-right">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-neutral-300 hover:text-red-500 transition-colors cursor-pointer"
                        title="Quitar artículo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {cart.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-xs text-neutral-400 font-sans italic">El ticket está vacío.</p>
                  <p className="text-[11px] text-neutral-300 font-sans mt-1.5">
                    Escanea productos o escríbelos en el buscador para cobrar.
                  </p>
                </div>
              )}
            </div>

            {/* Ticket Totals Summary */}
            <div className="p-6 bg-[#FFFCF2] border-t border-[#E6D5AB] space-y-2.5">
              <div className="flex justify-between text-xs text-neutral-600 font-sans">
                <span>Subtotal</span>
                <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-950 font-medium border-t border-[#E6D5AB] pt-3 text-xl">
                <span className="font-serif font-light">TOTAL</span>
                <span className="font-mono text-[#81B29A] font-bold">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Checkout Cash Tender Section */}
          {cart.length > 0 && (
            <div className="bg-white border border-[#E6D5AB] rounded-[30px] p-6 md:p-8 space-y-5 shadow-xs">
              <h3 className="font-serif text-base text-neutral-950 font-light">Pago con Efectivo</h3>

              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-sm font-mono text-neutral-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Efectivo entregado"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-none rounded-xl pl-8 pr-4 py-3.5 text-lg font-mono text-[#3D405B] font-bold"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[20, 50, 100, 200, 500].map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setCashReceived(bill.toString())}
                      className="flex-1 min-w-[45px] bg-[#FFFCF2] hover:bg-[#E07A5F] border border-[#E6D5AB] hover:border-[#E07A5F] hover:text-white text-neutral-700 rounded-lg py-1.5 px-2 text-[11px] font-mono font-bold transition-all text-center cursor-pointer"
                    >
                      ${bill}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCashReceived(cartTotal.toString())}
                    className="flex-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 hover:border-emerald-600 text-emerald-800 rounded-lg py-1.5 px-2 text-[11px] font-mono font-bold transition-all text-center cursor-pointer"
                  >
                    Exacto
                  </button>
                </div>
              </div>

              {cashReceived !== "" && (
                <div className="bg-neutral-50 border border-[#E6D5AB] rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] tracking-widest uppercase font-bold text-neutral-500">
                      {isEnoughCash ? "Su Cambio:" : "Falta Cobrar:"}
                    </span>
                    <p className="text-xl font-mono font-bold mt-0.5 text-neutral-950">
                      ${Math.abs(changeAmount).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    {isEnoughCash ? (
                      <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-700 bg-emerald-100/60 border border-emerald-200 rounded px-2.5 py-1">
                        Liquidado
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase font-bold tracking-widest text-red-700 bg-red-100/60 border border-red-200 rounded px-2.5 py-1">
                        Incompleto
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="bg-[#FFFCF2] border border-[#E6D5AB] hover:bg-red-50 hover:text-red-700 text-neutral-500 rounded-xl px-5 py-4 text-xs font-sans font-medium uppercase tracking-wide transition-colors flex items-center justify-center cursor-pointer shrink-0"
                  title="Limpiar ticket"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleFinalizedSale}
                  disabled={cart.length === 0 || (cashReceived !== "" && !isEnoughCash)}
                  className={`flex-1 rounded-xl text-xs uppercase font-mono tracking-widest font-bold text-center py-4 px-6 transition-all ${
                    cart.length > 0 && (cashReceived === "" || isEnoughCash)
                      ? "bg-[#3D405B] hover:bg-[#E07A5F] text-white cursor-pointer shadow-sm active:scale-[0.99]"
                      : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  }`}
                >
                  Cobrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
