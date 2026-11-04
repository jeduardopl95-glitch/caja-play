// src/modules/corte/CorteCaja.tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, ArrowRight, User, Calendar, CreditCard, DollarSign, Plus, Trash2, 
  Coins, CheckCircle, FileText, Send, AlertCircle, Sparkles, RefreshCw, XCircle
} from "lucide-react";
import { CorteCajaData, CorteCajaResult, TerminalEntry, TicketConsumo, AjusteTurno, ApartadoEfectivo } from "../../types";
import { generateCortePDF } from "../../utils/pdf";

interface CorteCajaProps {
  onBack: () => void;
}

const WIZARD_STEPS = [
  { step: 1, label: "Información", desc: "Datos del corte y sucursal" },
  { step: 2, label: "Tarjetas", desc: "Validación de tickets y terminales" },
  { step: 3, label: "Datos Efectivo", desc: "Ventas, gastos y ajustes" },
  { step: 4, label: "Conteo Físico", desc: "Arqueo, dólares y apartados" },
  { step: 5, label: "Resumen", desc: "Conciliación y envío PDF" }
];

export default function CorteCaja({ onBack }: CorteCajaProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [shareError, setShareError] = useState("");

  // Load or Initialize general data supporting ajustesTurno
  const [data, setData] = useState<CorteCajaData>(() => {
    const saved = localStorage.getItem("cajaplay_corte_active_data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Handle migration from ticketsCancelados to ajustesTurno if needed
        const migratedAjustes = (parsed.ticketsCancelados || []).map((t: any) => ({
          id: t.id || Date.now().toString() + Math.random(),
          description: t.description || "Cancelación",
          amount: t.amount || 0,
          type: 'restar' as const
        }));

        const legacyApartados = parsed.apartadosEfectivo || (
          parsed.fondoSiguienteTurno > 0
            ? [{
                id: "apartado-legado",
                description: parsed.fondoMotivo || "Fondo para siguiente turno",
                amount: parsed.fondoSiguienteTurno
              }]
            : []
        );

        return {
          fecha: parsed.fecha || new Date().toISOString().split("T")[0],
          sucursal: parsed.sucursal || "",
          cajeroName: parsed.cajeroName || "",
          tarjetaManana: parsed.tarjetaManana || 0,
          tarjetaTarde: parsed.tarjetaTarde || 0,
          terminalSantander: parsed.terminalSantander || 0,
          otrasTerminales: parsed.otrasTerminales || [],
          tarjetaObservaciones: parsed.tarjetaObservaciones || "",
          ventasEfectivoManual: parsed.ventasEfectivoManual || 0,
          entradasEfectivo: parsed.entradasEfectivo || 0,
          salidasEfectivo: parsed.salidasEfectivo || 0,
          ticketsConsumo: parsed.ticketsConsumo || [],
          ajustesTurno: parsed.ajustesTurno || migratedAjustes || [],
          efectivoConteo: parsed.efectivoConteo || {
            1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0,
            20.1: 0, 10: 0, 5: 0, 2: 0, 1: 0, 0.5: 0
          },
          dolaresConteo: parsed.dolaresConteo || 0,
          modoMonedas: parsed.modoMonedas === "total" ? "total" : "desglose",
          totalMonedasManual: parsed.totalMonedasManual || 0,
          tipoCambioUSD: parsed.tipoCambioUSD || 15,
          apartadosEfectivo: legacyApartados,
          fondoSiguienteTurno: 0,
          fondoMotivo: ""
        };
      } catch (e) {
        // Fallback below on parse error
      }
    }
    return {
      fecha: new Date().toISOString().split("T")[0],
      sucursal: "",
      cajeroName: "",
      tarjetaManana: 0,
      tarjetaTarde: 0,
      terminalSantander: 0,
      otrasTerminales: [],
      tarjetaObservaciones: "",
      ventasEfectivoManual: 0,
      entradasEfectivo: 0,
      salidasEfectivo: 0,
      ticketsConsumo: [],
      ajustesTurno: [],
      efectivoConteo: {
        1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0,
        20.1: 0, 10: 0, 5: 0, 2: 0, 1: 0, 0.5: 0
      },
      dolaresConteo: 0,
      modoMonedas: "desglose",
      totalMonedasManual: 0,
      tipoCambioUSD: 15,
      apartadosEfectivo: [],
      fondoSiguienteTurno: 0,
      fondoMotivo: ""
    };
  });

  // Track state of adding terminal
  const [newTerminalName, setNewTerminalName] = useState("");
  const [newTerminalAmount, setNewTerminalAmount] = useState("");

  // Persist edits to localStorage automatically
  useEffect(() => {
    localStorage.setItem("cajaplay_corte_active_data", JSON.stringify(data));
    setLastSavedAt(Date.now());
  }, [data]);



  // Formatter helper for MXN currency
  const formatMXN = (val: number): string => {
    return "$" + val.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MXN";
  };

    // Math calculation engine
  const results = React.useMemo<CorteCajaResult>(() => {
    // 1. Tarjetas Ticket totals
    const tarjetasTicket = data.tarjetaManana + data.tarjetaTarde;

    // 2. Total Terminales Bancarias (Santander + other terminals)
    const otherTerminalsTotal = data.otrasTerminales.reduce((sum, t) => sum + t.amount, 0);
    const totalTerminales = data.terminalSantander + otherTerminalsTotal;

    // 3. Difference cards (Formula: Total de terminales - Total de tickets del sistema)
    const diferenciaTarjetas = totalTerminales - tarjetasTicket;

    // 4. Sum of consumption tickets
    const totalTicketsConsumo = data.ticketsConsumo.reduce((sum, t) => sum + t.amount, 0);

    // Sum of turn adjustments (+ / -)
    const totalAjustesTurno = (data.ajustesTurno || []).reduce((sum, adj) => {
      if (adj.type === 'sumar') {
        return sum + adj.amount;
      } else {
        return sum - adj.amount;
      }
    }, 0);

    // 5. Expected cash (updated formula!)
    const efectivoEsperado = (data.ventasEfectivoManual + data.entradasEfectivo)
      - data.salidasEfectivo
      - totalTicketsConsumo
      + totalAjustesTurno;

    // 6. Cash count sub-parts
    let subtotalBilletes = 0;
    let subtotalMonedas = 0;

    const billsList = [1000, 500, 200, 100, 50, 20];
    const coinsList = [20.1, 10, 5, 2, 1, 0.5]; // 20.1 maps to $20 coins

    billsList.forEach((denom) => {
      const count = data.efectivoConteo[denom] || 0;
      subtotalBilletes += denom * count;
    });

    coinsList.forEach((denom) => {
      const count = data.efectivoConteo[denom] || 0;
      const actualVal = denom === 20.1 ? 20 : denom;
      subtotalMonedas += actualVal * count;
    });

    if (data.modoMonedas === "total") subtotalMonedas = data.totalMonedasManual || 0;

    const subtotalDolares = (data.dolaresConteo || 0) * (data.tipoCambioUSD || 15);
    const totalApartados = (data.apartadosEfectivo || []).reduce((sum, apartado) => sum + apartado.amount, 0);
    const fondoSiguienteTurno = data.apartadosEfectivo !== undefined ? totalApartados : data.fondoSiguienteTurno || 0;
    const efectivoContado = subtotalBilletes + subtotalMonedas + subtotalDolares + fondoSiguienteTurno;
    const efectivoEntregado = efectivoContado - fondoSiguienteTurno;

    // Final calculations difference
    const diferenciaEfectivo = efectivoContado - efectivoEsperado;

    let statusDiferencia: 'exacto' | 'sobrante' | 'faltante' = 'exacto';
    if (diferenciaEfectivo > 0.01) {
      statusDiferencia = 'sobrante';
    } else if (diferenciaEfectivo < -0.01) {
      statusDiferencia = 'faltante';
    }

    return {
      tarjetasTicket,
      totalTerminales,
      diferenciaTarjetas,
      totalTicketsConsumo,
      totalAjustesTurno,
      efectivoEsperado,
      subtotalBilletes,
      subtotalMonedas,
      subtotalDolares,
      totalApartados: fondoSiguienteTurno,
      fondoSiguienteTurno,
      efectivoContado,
      efectivoEntregado,
      diferenciaEfectivo,
      statusDiferencia
    };
  }, [data]);

  // Handle Terminal addition
  const handleAddTerminal = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newTerminalAmount);
    if (!newTerminalName.trim() || isNaN(amount) || amount < 0) return;

    const entry: TerminalEntry = {
      id: Date.now().toString(),
      name: newTerminalName.trim(),
      amount
    };

    setData(prev => ({
      ...prev,
      otrasTerminales: [...prev.otrasTerminales, entry]
    }));

    setNewTerminalName("");
    setNewTerminalAmount("");
  };

  const handleDeleteTerminal = (id: string) => {
    setData(prev => ({
      ...prev,
      otrasTerminales: prev.otrasTerminales.filter(t => t.id !== id)
    }));
  };

  // Tickets de consumo dynamic list handlers
  const handleAddTicketConsumo = () => {
    const nextNum = data.ticketsConsumo.length + 1;
    const item: TicketConsumo = {
      id: Date.now().toString(),
      description: `Vale ${nextNum}`,
      amount: 0
    };
    setData(prev => ({
      ...prev,
      ticketsConsumo: [...prev.ticketsConsumo, item]
    }));
  };

  const handleUpdateTicketConsumo = (id: string, field: 'description' | 'amount', val: any) => {
    setData(prev => ({
      ...prev,
      ticketsConsumo: prev.ticketsConsumo.map(t => {
        if (t.id === id) {
          if (field === 'amount') {
            const parsed = parseFloat(val);
            return { ...t, amount: isNaN(parsed) ? 0 : parsed };
          }
          return { ...t, description: val };
        }
        return t;
      })
    }));
  };

  const handleDeleteTicketConsumo = (id: string) => {
    setData(prev => ({
      ...prev,
      ticketsConsumo: prev.ticketsConsumo.filter(t => t.id !== id)
    }));
  };

  // AJUSTES DEL TURNO dynamic list handlers
  const handleAddAjusteTurno = () => {
    const nextNum = (data.ajustesTurno || []).length + 1;
    const item: AjusteTurno = {
      id: Date.now().toString(),
      description: `Ajuste ${nextNum}`,
      amount: 0,
      type: 'restar' // default to subtract (like refunds/cancellations)
    };
    setData(prev => ({
      ...prev,
      ajustesTurno: [...(prev.ajustesTurno || []), item]
    }));
  };

  const handleUpdateAjusteTurno = (id: string, field: 'description' | 'amount' | 'type', val: any) => {
    setData(prev => ({
      ...prev,
      ajustesTurno: (prev.ajustesTurno || []).map(t => {
        if (t.id === id) {
          if (field === 'amount') {
            const parsed = parseFloat(val);
            return { ...t, amount: isNaN(parsed) ? 0 : parsed };
          }
          if (field === 'type') {
            return { ...t, type: val as 'sumar' | 'restar' };
          }
          return { ...t, description: val };
        }
        return t;
      })
    }));
  };

  const handleDeleteAjusteTurno = (id: string) => {
    setData(prev => ({
      ...prev,
      ajustesTurno: (prev.ajustesTurno || []).filter(t => t.id !== id)
    }));
  };

  const handleAddApartado = () => {
    const nextNum = (data.apartadosEfectivo || []).length + 1;
    const apartado: ApartadoEfectivo = {
      id: Date.now().toString(),
      description: `Apartado ${nextNum}`,
      amount: 0
    };
    setData(prev => ({
      ...prev,
      apartadosEfectivo: [...(prev.apartadosEfectivo || []), apartado],
      fondoSiguienteTurno: 0,
      fondoMotivo: ""
    }));
  };

  const handleUpdateApartado = (id: string, field: "description" | "amount", value: string) => {
    setData(prev => ({
      ...prev,
      apartadosEfectivo: (prev.apartadosEfectivo || []).map(apartado => {
        if (apartado.id !== id) return apartado;
        return field === "amount"
          ? { ...apartado, amount: Math.max(0, parseFloat(value) || 0) }
          : { ...apartado, description: value };
      })
    }));
  };

  const handleDeleteApartado = (id: string) => {
    setData(prev => ({
      ...prev,
      apartadosEfectivo: (prev.apartadosEfectivo || []).filter(apartado => apartado.id !== id)
    }));
  };

  // Adjust arqueo counters
  const adjustConteo = (denom: number, change: number) => {
    const curr = data.efectivoConteo[denom] || 0;
    const nextVal = Math.max(0, curr + change);
    setData(prev => ({
      ...prev,
      efectivoConteo: {
        ...prev.efectivoConteo,
        [denom]: nextVal
      }
    }));
  };

  const setDirectConteo = (denom: number, valStr: string) => {
    const parsed = parseInt(valStr);
    const val = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setData(prev => ({
      ...prev,
      efectivoConteo: {
        ...prev.efectivoConteo,
        [denom]: val
      }
    }));
  };

  const handleSendPDF = async () => {
    setShareError("");
    if (!navigator.share || !navigator.canShare) {
      setShareError("Este navegador no permite compartir archivos PDF. Abre la aplicación en un navegador compatible con compartir archivos, como Safari en iPhone o Chrome en Android.");
      return;
    }
    try {
      const { blob } = generateCortePDF(data, results);
      const file = new File([blob], `Corte_${data.sucursal.replace(/[^a-zA-Z0-9_-]/g, "_")}_${data.fecha}.pdf`, { type: "application/pdf" });
      if (!navigator.canShare({ files: [file] })) {
        setShareError("Este navegador no permite compartir este PDF. No se ha descargado ningún archivo.");
        return;
      }
      await navigator.share({ files: [file], title: "Corte de Caja - " + data.sucursal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError("No se pudo compartir el PDF. Intenta nuevamente. No se ha descargado ningún archivo.");
    }
  };

  const handleResetWizard = () => {
    if (window.confirm("¿Seguro que deseas iniciar un corte nuevo? Esto restablecerá todos los campos del formulario actual.")) {
      setData({
        fecha: new Date().toISOString().split("T")[0],
        sucursal: "",
        cajeroName: "",
        tarjetaManana: 0,
        tarjetaTarde: 0,
        terminalSantander: 0,
        otrasTerminales: [],
        tarjetaObservaciones: "",
        ventasEfectivoManual: 0,
        entradasEfectivo: 0,
        salidasEfectivo: 0,
        ticketsConsumo: [],
        ajustesTurno: [],
        efectivoConteo: {
          1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0,
          20.1: 0, 10: 0, 5: 0, 2: 0, 1: 0, 0.5: 0
        },
        dolaresConteo: 0,
      modoMonedas: "desglose",
      totalMonedasManual: 0,
        tipoCambioUSD: 15,
        apartadosEfectivo: [],
        fondoSiguienteTurno: 0,
        fondoMotivo: ""
      });
      setCurrentStep(1);
    }
  };

  // Fast direct step click if previous steps finished
  const handleStepClick = (stepNum: number) => {
    if (stepNum < currentStep || stepNum === 1) {
      setCurrentStep(stepNum);
      return;
    }

    // Basic validity checks per step to step up
    if (stepNum > 1 && !data.sucursal.trim()) {
      alert("Por favor ingresa la sucursal antes de proceder.");
      return;
    }
    setCurrentStep(stepNum);
  };

  const previewSections: { title: string; rows: [string, string][] }[] = [];
  const moneyRows = (rows: [string, number][]): [string, string][] =>
    rows.filter(([, amount]) => amount !== 0).map(([label, amount]) => [label, formatMXN(amount)]);
  previewSections.push({ title: "Información del corte", rows: [
    ["Fecha", data.fecha], ["Sucursal", data.sucursal], ...(data.cajeroName ? [["Cajero", data.cajeroName] as [string, string]] : [])
  ] });
  const cardRows = moneyRows([
    ["Ticket mañana", data.tarjetaManana], ["Ticket tarde", data.tarjetaTarde],
    ["Santander", data.terminalSantander], ...data.otrasTerminales.map(t => [t.name, t.amount] as [string, number])
  ]);
  if (cardRows.length) previewSections.push({ title: "Tarjetas", rows: [
    ...cardRows, ["Total tickets", formatMXN(results.tarjetasTicket)], ["Total terminales", formatMXN(results.totalTerminales)],
    ["Diferencia (terminales - tickets)", formatMXN(results.diferenciaTarjetas)],
    ...(data.tarjetaObservaciones ? [["Observaciones", data.tarjetaObservaciones] as [string, string]] : [])
  ] });
  const cashRows = moneyRows([
    ["Ventas en efectivo", data.ventasEfectivoManual], ["Entradas", data.entradasEfectivo], ["Salidas", -data.salidasEfectivo],
    ...data.ticketsConsumo.map(t => ["Consumo: " + t.description, -t.amount] as [string, number]),
    ...data.ajustesTurno.map(t => ["Ajuste: " + t.description, t.type === "sumar" ? t.amount : -t.amount] as [string, number])
  ]);
  if (cashRows.length) previewSections.push({ title: "Flujo de efectivo", rows: [...cashRows, ["Efectivo esperado", formatMXN(results.efectivoEsperado)]] });
  const physicalRows = moneyRows([
    ...[1000,500,200,100,50,20].map(d => [`Billetes de ${d} (${data.efectivoConteo[d] || 0} piezas)`, d * (data.efectivoConteo[d] || 0)] as [string, number]),
    ...(data.modoMonedas === "total" ? [["Monedas (total)", results.subtotalMonedas] as [string, number]] :
      [20.1,10,5,2,1,0.5].map(d => [`Monedas de ${d === 20.1 ? 20 : d} (${data.efectivoConteo[d] || 0} piezas)`, (d === 20.1 ? 20 : d) * (data.efectivoConteo[d] || 0)] as [string, number])),
    [`Dólares: ${data.dolaresConteo} USD × ${data.tipoCambioUSD || 15}`, results.subtotalDolares],
    ...(data.apartadosEfectivo || []).map(a => ["Apartado: " + a.description, a.amount] as [string, number])
  ]);
  if (physicalRows.length) previewSections.push({ title: "Conteo físico", rows: physicalRows });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      
      {/* Top Header Controls */}
      <div className="mb-8 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 group text-[#81B29A] hover:text-[#3D405B] transition-colors py-2 px-1 text-sm font-sans tracking-wide cursor-pointer font-bold"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver al menú</span>
        </button>
        <div className="flex items-center gap-3">
          {lastSavedAt && (
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#81B29A]">
              <CheckCircle className="w-3.5 h-3.5" />
              Guardado automático
            </span>
          )}
          <button
            onClick={handleResetWizard}
            className="text-xs font-sans text-[#E07A5F] hover:text-[#E07A5F]/90 transition font-bold uppercase tracking-widest border border-red-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer bg-white"
          >
            <RefreshCw className="w-3 h-3" />
            Limpiar Campos
          </button>
        </div>
      </div>

      {/* Primary Titles */}
      <div className="mb-8 text-center md:text-left">
        <h1 className="font-serif text-3xl font-extrabold text-[#3D405B] tracking-tight lg:text-4xl">
          Cierre de Caja Diario
        </h1>
        <p className="text-[#81B29A]/80 font-sans text-sm mt-1 max-w-xl">
          Complete el asistente paso a paso para cuadrar cobros por tarjeta, registrar flujo de efectivo y realizar el arqueo físico definitivo.
        </p>
      </div>

      {/* Step Progress Indicators using beautiful dark blues */}
      <div className="mb-8 bg-white border border-[#E6D5AB] rounded-2xl p-4 shadow-xs">
        <div className="flex justify-between items-center relative gap-3 flex-col sm:flex-row">
          {WIZARD_STEPS.map((step, idx) => {
            const isActive = currentStep === step.step;
            const isCompleted = currentStep > step.step;

            return (
              <React.Fragment key={step.step}>
                <div 
                  onClick={() => handleStepClick(step.step)}
                  className={`w-full sm:flex-1 flex items-center gap-3.5 p-2 rounded-xl transition-all ${
                    isActive 
                      ? "bg-[#F2CC8F]/15 border border-[#F2CC8F]/40 text-[#81B29A]" 
                      : isCompleted
                      ? "opacity-95 hover:bg-[#FFFCF2] cursor-pointer"
                      : "opacity-45 cursor-not-allowed"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-extrabold shrink-0 ${
                    isActive 
                      ? "bg-[#E07A5F] text-white" 
                      : isCompleted 
                      ? "bg-[#3D405B] text-white" 
                      : "bg-[#FFFCF2] text-[#81B29A]/80"
                  }`}>
                    {isCompleted ? "✓" : step.step}
                  </div>
                  <div className="text-left">
                    <p className={`text-[11px] uppercase tracking-wider font-extrabold ${isActive ? "text-[#81B29A]" : "text-neutral-700"}`}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-neutral-400 font-sans line-clamp-1">{step.desc}</p>
                  </div>
                </div>

                {idx < WIZARD_STEPS.length - 1 && (
                  <div className="hidden sm:block text-[#E6D5AB]">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Interactive Form steps with transition - White box, borders in light gray */}
      <div className="bg-white border border-[#E6D5AB] rounded-3xl p-6 md:p-8 shadow-sm min-h-[400px]">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: INFORMACIÓN DEL CORTE */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-serif text-2xl text-[#3D405B] font-extrabold flex items-center gap-2">
                  <User className="w-6 h-6 text-[#81B29A]" />
                  <span>Información del Turno</span>
                </h2>
                <p className="text-sm text-[#81B29A]/80 mt-1 font-sans">
                  Registre la fecha operacional, tienda o sucursal y el personal encargado directivo de la caja.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Fecha */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase font-extrabold tracking-wider text-[#3D405B]">Fecha del Turno</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Calendar className="w-4 h-4 text-[#81B29A]" />
                    </div>
                    <input
                      type="date"
                      value={data.fecha}
                      onChange={(e) => setData({ ...data, fecha: e.target.value })}
                      className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-hidden transition-colors rounded-xl pl-10 pr-4 py-3 text-sm text-[#3D405B] font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Sucursal */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase font-extrabold tracking-wider text-[#3D405B] flex items-center gap-1">
                    <span>Sucursal / Establecimiento</span>
                    <span className="text-[#E07A5F] font-sans font-bold">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Sparkles className="w-4 h-4 text-[#81B29A]" />
                    </div>
                    <select
                      value={data.sucursal}
                      onChange={(e) => setData({ ...data, sucursal: e.target.value })}
                      className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-hidden transition-colors rounded-xl pl-10 pr-10 py-3.5 text-sm text-[#3D405B] font-sans font-extrabold appearance-none cursor-pointer"
                    >
                      <option value="">-- Seleccionar Establecimiento --</option>
                      <option value="CHETUMALITO">CHETUMALITO</option>
                      <option value="DOS HERMANOS">DOS HERMANOS</option>
                      <option value="JUNIOR">JUNIOR</option>
                      <option value="PLAYITA">PLAYITA</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-[#81B29A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Nombre del cajero */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-xs uppercase font-extrabold tracking-wider text-[#3D405B]">
                    Nombre del Cajero <span className="text-neutral-400 font-normal italic">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-[#81B29A]" />
                    </div>
                    <input
                      type="text"
                      placeholder="Ej. Sofía Rodríguez"
                      value={data.cajeroName}
                      onChange={(e) => setData({ ...data, cajeroName: e.target.value })}
                      className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:border-[#E07A5F] focus:bg-white focus:outline-hidden transition-colors rounded-xl pl-10 pr-4 py-3 text-sm text-[#3D405B] font-sans font-semibold"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>

              {/* Next step buttons */}
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!data.sucursal.trim()) {
                      alert("Por favor ingresa la sucursal antes de proceder.");
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  className="bg-[#3D405B] hover:bg-[#81B29A] active:scale-[0.99] text-white py-3.5 px-8 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <span>Siguiente: Validación de Tarjetas</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: VALIDACIÓN DE TARJETAS */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-serif text-2xl text-[#3D405B] font-extrabold flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-[#81B29A]" />
                  <span>Validación de Tarjetas</span>
                </h2>
                <p className="text-sm text-[#81B29A]/80 mt-1 font-sans">
                  Registre la suma de tarjetas que indica el corte de ticket del software y verifique contra el total físico liquidado en terminales.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left block - card sales according to tickets */}
                <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-5 rounded-2xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] border-b border-[#E6D5AB] pb-2 flex items-center justify-between">
                    <span>1. Tarjetas en Tickets de Venta</span>
                    <span className="font-mono text-neutral-600 text-[10px] font-bold">Importe</span>
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] mb-1 uppercase font-bold tracking-wider text-[#81B29A]/80">Ticket Mañana (Soft Total Tarjetas)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={data.tarjetaManana || ""}
                        onChange={(e) => setData({ ...data, tarjetaManana: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                        autoComplete="off"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] mb-1 uppercase font-bold tracking-wider text-[#3D405B]">Ticket Tarde (Soft Total Tarjetas)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={data.tarjetaTarde || ""}
                        onChange={(e) => setData({ ...data, tarjetaTarde: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E6D5AB]/70 flex justify-between items-center text-xs text-neutral-700">
                    <span className="font-bold">Total Tarjetas Tickets:</span>
                    <span className="font-mono font-extrabold text-[#3D405B] bg-white border border-[#E6D5AB] px-2 py-1 rounded">
                      {formatMXN(results.tarjetasTicket)}
                    </span>
                  </div>
                </div>

                {/* Right block - terminal calculations */}
                <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-5 rounded-2xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] border-b border-[#E6D5AB] pb-2 flex items-center justify-between">
                    <span>2. Terminales Bancarias</span>
                    <span className="font-mono text-neutral-600 text-[10px] font-bold">Cierres</span>
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] mb-1 uppercase font-bold tracking-wider text-[#81B29A]/80">Terminal Santander (Default)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={data.terminalSantander || ""}
                        onChange={(e) => setData({ ...data, terminalSantander: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                        autoComplete="off"
                      />
                    </div>

                    {/* Rendering other terminals if added */}
                    {data.otrasTerminales.length > 0 && (
                      <div className="border-t border-dotted border-[#E6D5AB] pt-2 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-[#81B29A]/80 font-bold">Otras Terminales Adicionales:</p>
                        {data.otrasTerminales.map(col => (
                          <div key={col.id} className="flex justify-between items-center bg-white p-2 border border-[#E6D5AB] rounded-xl shadow-3xs">
                            <div className="text-xs text-[#3D405B] font-sans">
                              <span className="font-bold">{col.name}:</span>
                              <span className="font-mono ml-1 font-extrabold text-[#81B29A]">{formatMXN(col.amount)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteTerminal(col.id)}
                              className="text-[#E07A5F] hover:text-[#E07A5F]/90 p-1"
                              title="Eliminar terminal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add other terminal form */}
                    <div className="bg-white border border-[#E6D5AB] rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-extrabold tracking-wider text-[#3D405B] uppercase">Añadir otra terminal:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Nombre (ej. Clip, Banorte)"
                          value={newTerminalName}
                          onChange={(e) => setNewTerminalName(e.target.value)}
                          className="border border-[#E6D5AB] text-xs rounded-lg px-2.5 py-1.5 focus:outline-[#E07A5F] font-sans font-medium"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Monto ($)"
                          value={newTerminalAmount}
                          onChange={(e) => setNewTerminalAmount(e.target.value)}
                          className="border border-[#E6D5AB] text-xs rounded-lg px-2.5 py-1.5 focus:outline-[#E07A5F] font-mono font-bold"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          const amount = parseFloat(newTerminalAmount);
                          if (!newTerminalName.trim() || isNaN(amount) || amount < 0) return;
                          setData(prev => ({
                            ...prev,
                            otrasTerminales: [...prev.otrasTerminales, { id: Date.now().toString(), name: newTerminalName.trim(), amount }]
                          }));
                          setNewTerminalName("");
                          setNewTerminalAmount("");
                        }}
                        className="w-full bg-[#E07A5F] hover:bg-[#3D405B] text-white rounded-lg py-1.5 text-[10px] font-extrabold uppercase tracking-widest cursor-pointer transition-colors"
                      >
                        + Agregar Terminal
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E6D5AB]/70 flex justify-between items-center text-xs text-neutral-700">
                    <span className="font-bold">Total Terminales:</span>
                    <span className="font-mono font-extrabold text-[#3D405B] bg-white border border-[#E6D5AB] px-2 py-1 rounded">
                      {formatMXN(results.totalTerminales)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic status of difference card validation - Non-pastel colors */}
              <div className="pt-2">
                {Math.abs(results.diferenciaTarjetas) < 0.01 ? (
                  <div className="bg-white border-2 border-[#107C41] text-[#107C41] rounded-2xl p-5 flex gap-3.5 items-start shadow-sm">
                    <CheckCircle className="w-5.5 h-5.5 text-[#107C41] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase font-extrabold tracking-wider text-[#107C41] mb-1">Cierre de Tarjetas</p>
                      <p className="text-sm text-[#107C41] font-sans font-extrabold">
                        ✅ Las terminales cuadran perfectamente con el sistema.
                      </p>
                    </div>
                  </div>
                ) : results.diferenciaTarjetas > 0 ? (
                  <div className="bg-white border-2 border-[#107C41] text-[#107C41] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex gap-3.5 items-start">
                      <CheckCircle className="w-5.5 h-5.5 text-[#107C41] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs uppercase font-extrabold tracking-wider text-[#107C41] mb-1">Diferencia Detectada en Tarjetas (Sobrante)</p>
                        <p className="text-sm font-sans font-extrabold leading-normal">
                          🟢 Hay <span className="underline decoration-2 font-black">{formatMXN(Math.abs(results.diferenciaTarjetas))}</span> MÁS en las terminales que en el sistema.
                        </p>
                        <p className="text-xs text-neutral-600 font-sans font-semibold mt-2 leading-relaxed">
                          Esto normalmente significa que alguna venta fue registrada como efectivo cuando realmente fue cobrada con tarjeta.
                        </p>
                      </div>
                    </div>
                    
                    {/* Ask for details justification */}
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-[#107C41]/30">
                      <label className="text-[10px] uppercase font-extrabold tracking-wider text-[#107C41] flex items-center gap-1">
                        <span>Justificación / Observación obligatoria</span>
                        <span className="text-[#107C41]">*</span>
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Describa el motivo del descuadre (ej. Cobro duplicado, error de digitación, voucher cancelado...)"
                        value={data.tarjetaObservaciones}
                        onChange={(e) => setData({ ...data, tarjetaObservaciones: e.target.value })}
                        className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:outline-[#107C41] rounded-xl px-3 py-2 text-xs text-neutral-800 font-sans font-semibold"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-[#E07A5F] text-[#E07A5F] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex gap-3.5 items-start">
                      <AlertCircle className="w-5.5 h-5.5 text-[#E07A5F] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs uppercase font-extrabold tracking-wider text-[#E07A5F] mb-1">Diferencia Detectada en Tarjetas (Faltante)</p>
                        <p className="text-sm font-sans font-extrabold leading-normal">
                          🔴 Hay <span className="underline decoration-2 font-black">{formatMXN(Math.abs(results.diferenciaTarjetas))}</span> MENOS en las terminales que en el sistema.
                        </p>
                        <p className="text-xs text-neutral-600 font-sans font-semibold mt-2 leading-relaxed">
                          Esto normalmente significa que alguna venta fue registrada como tarjeta cuando realmente fue cobrada en efectivo.
                        </p>
                      </div>
                    </div>
                    
                    {/* Ask for details justification */}
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-[#E07A5F]/30">
                      <label className="text-[10px] uppercase font-extrabold tracking-wider text-[#E07A5F] flex items-center gap-1">
                        <span>Justificación / Observación obligatoria</span>
                        <span className="text-[#E07A5F]">*</span>
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Describa el motivo del descuadre (ej. Cobro duplicado, error de digitación, voucher cancelado...)"
                        value={data.tarjetaObservaciones}
                        onChange={(e) => setData({ ...data, tarjetaObservaciones: e.target.value })}
                        className="w-full bg-[#FFFCF2] border border-[#E6D5AB] focus:outline-[#E07A5F] rounded-xl px-3 py-2 text-xs text-neutral-800 font-sans font-semibold"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="bg-[#FFFCF2] hover:bg-[#F2CC8F] text-neutral-700 py-3 px-6 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all cursor-pointer min-h-[44px]"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="bg-[#3D405B] hover:bg-[#81B29A] active:scale-[0.99] text-white py-3 px-8 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <span>Siguiente: Datos de Efectivo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: DATOS DEL EFECTIVO */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-serif text-2xl text-[#3D405B] font-extrabold flex items-center gap-2">
                  <DollarSign className="w-6 h-6 text-[#81B29A]" />
                  <span>Datos del Efectivo, Gastos y Cancelaciones</span>
                </h2>
                <p className="text-sm text-[#81B29A]/80 mt-1 font-sans">
                  Ingrese las ventas en físico del cajón, indique fondos iniciales de cambio, deducciones de gastos de proveedores, consumos internos, y tickets cancelados o devoluciones para calcular el efectivo esperado.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                
                {/* Inputs for Cash flow */}
                <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-5 rounded-2xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] border-b border-[#E6D5AB] pb-2">
                    Operación de Efectivo
                  </h3>

                  <div className="space-y-3.5">
                    
                    {/* Ventas efectivo */}
                    <div>
                      <label className="block text-[11px] uppercase font-bold tracking-wider text-neutral-600 mb-1 flex justify-between">
                        <span>Ventas en Efectivo</span>
                        <span className="text-[9px] text-[#81B29A] lowercase uppercase italic font-black bg-white border border-[#E6D5AB] px-2 py-0.5 rounded">Requerido</span>
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-neutral-400 text-sm">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Monto total del reporte de ventas"
                          value={data.ventasEfectivoManual || ""}
                          onChange={(e) => setData({ ...data, ventasEfectivoManual: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {/* Entradas */}
                    <div>
                      <label className="block text-[11px] uppercase font-bold tracking-wider text-neutral-600 mb-1">Entradas de Efectivo (Fondo Inicial, Recargas)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-neutral-400 text-sm">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={data.entradasEfectivo || ""}
                          onChange={(e) => setData({ ...data, entradasEfectivo: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {/* Salidas */}
                    <div>
                      <label className="block text-[11px] uppercase font-bold tracking-wider text-neutral-600 mb-1">Salidas de Efectivo (Gastos, retiros, proveedores)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-neutral-400 text-sm">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={data.salidasEfectivo || ""}
                          onChange={(e) => setData({ ...data, salidasEfectivo: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                  </div>
                </div>

                {/* Right lists stack - Consumos + Cancelaciones */}
                <div className="space-y-6">
                  
                  {/* Tickets de consumo dinámicos */}
                  <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] border-b border-[#E6D5AB] pb-2 flex justify-between items-center">
                      <span>Vales o Consumos Internos</span>
                      <span className="font-mono text-[#81B29A] text-xs font-bold">Suma: {formatMXN(results.totalTicketsConsumo)}</span>
                    </h3>

                    {data.ticketsConsumo.length === 0 ? (
                      <div className="text-center py-4 border border-dashed border-[#E6D5AB] rounded-xl bg-white">
                        <p className="text-xs text-neutral-400 font-sans italic font-semibold">No se reportaron consumos internos.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                        {data.ticketsConsumo.map((ticket, idx) => (
                          <div key={ticket.id} className="bg-white border border-[#E6D5AB] p-3 rounded-xl space-y-2 relative shadow-3xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-extrabold text-[#81B29A] uppercase tracking-wider">Consumo {idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteTicketConsumo(ticket.id)}
                                className="text-[#E07A5F] hover:text-[#E07A5F]/90"
                                title="Borrar ticket"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Descripción"
                                value={ticket.description}
                                onChange={(e) => handleUpdateTicketConsumo(ticket.id, 'description', e.target.value)}
                                className="border border-[#E6D5AB] text-xs rounded-lg px-2 py-1.5 focus:outline-[#E07A5F] font-sans font-medium text-[#3D405B]"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                              <div className="relative">
                                <span className="absolute inset-y-0 left-2.5 flex items-center font-mono text-neutral-400 text-[10px]">$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  placeholder="Monto"
                                  value={ticket.amount || ""}
                                  onChange={(e) => handleUpdateTicketConsumo(ticket.id, 'amount', e.target.value)}
                                  className="w-full border border-[#E6D5AB] text-xs rounded-lg pl-5 pr-2 py-1.5 focus:outline-[#E07A5F] font-mono font-bold text-[#3D405B]"
                                  autoComplete="off"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddTicketConsumo}
                      className="w-full bg-[#F2CC8F]/15 hover:bg-[#F2CC8F]/25 text-[#81B29A] border border-dashed border-[#F2CC8F]/40 rounded-xl py-2.5 text-xs font-sans font-extrabold uppercase tracking-widest transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar Vale de Consumo</span>
                    </button>
                  </div>

                  {/* AJUSTES DEL TURNO */}
                  <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] border-b border-[#E6D5AB] pb-2 flex justify-between items-center">
                      <span>Ajustes del Turno</span>
                      <span className="font-mono text-[#81B29A] text-xs font-bold font-mono">Neto: {results.totalAjustesTurno >= 0 ? "+" : ""}{formatMXN(results.totalAjustesTurno)}</span>
                    </h3>

                    {(data.ajustesTurno || []).length === 0 ? (
                      <div className="text-center py-4 border border-dashed border-[#E6D5AB] rounded-xl bg-white">
                        <p className="text-xs text-neutral-400 font-sans italic font-semibold">No se reportaron ajustes del turno.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[190px] overflow-y-auto pr-1">
                        {(data.ajustesTurno || []).map((ajuste, idx) => (
                          <div key={ajuste.id} className="bg-white border border-[#E6D5AB] p-3 rounded-xl space-y-2 relative shadow-3xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-extrabold text-[#81B29A] uppercase tracking-wider">Ajuste {idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteAjusteTurno(ajuste.id)}
                                className="text-[#E07A5F] hover:text-[#E07A5F]/95 cursor-pointer"
                                title="Borrar ajuste"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="text"
                                placeholder="Descripción (ej. Cancelación, Devolución, Error pago...)"
                                value={ajuste.description}
                                onChange={(e) => handleUpdateAjusteTurno(ajuste.id, 'description', e.target.value)}
                                className="border border-[#E6D5AB] text-xs rounded-lg px-2 py-1.5 focus:outline-[#E07A5F] font-sans font-medium text-[#3D405B]"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                  <span className="absolute inset-y-0 left-2.5 flex items-center font-mono text-neutral-400 text-[10px]">$</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    placeholder="Monto"
                                    value={ajuste.amount || ""}
                                    onChange={(e) => handleUpdateAjusteTurno(ajuste.id, 'amount', e.target.value)}
                                    className="w-full border border-[#E6D5AB] text-xs rounded-lg pl-5 pr-2 py-1.5 focus:outline-[#E07A5F] font-mono font-bold text-[#3D405B]"
                                    autoComplete="off"
                                  />
                                </div>
                                <select
                                  value={ajuste.type}
                                  onChange={(e) => handleUpdateAjusteTurno(ajuste.id, 'type', e.target.value)}
                                  className="border border-[#E6D5AB] text-xs rounded-lg px-2 py-1.5 focus:outline-[#E07A5F] font-sans font-bold text-[#3D405B] bg-white cursor-pointer"
                                >
                                  <option value="restar">(-) Restar</option>
                                  <option value="sumar">(+) Sumar</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddAjusteTurno}
                      className="w-full bg-[#E07A5F]/10 hover:bg-[#E07A5F]/15 text-[#E07A5F] border border-dashed border-[#E07A5F]/30 rounded-xl py-2.5 text-xs font-sans font-extrabold uppercase tracking-widest transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar Ajuste del Turno</span>
                    </button>
                  </div>

                </div>
              </div>

              {/* Math calculation display step by step - Non-pastel cool executive layout */}
              <div className="bg-[#FFFCF2] border border-[#E6D5AB] rounded-2xl p-5 space-y-3">
                <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-[#3D405B]">Fórmula y desglose de efectivo esperado:</h4>
                <div className="space-y-1.5 text-xs font-sans text-neutral-700 font-semibold">
                  <div className="flex justify-between">
                    <span>(+) Ventas en efectivo de tu turno:</span>
                    <span className="font-mono text-[#3D405B] font-bold">{formatMXN(data.ventasEfectivoManual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>(+) Entradas de efectivo (Fondo / Otros):</span>
                    <span className="font-mono text-[#3D405B] font-bold">{formatMXN(data.entradasEfectivo)}</span>
                  </div>
                  <div className="flex justify-between text-[#E07A5F]">
                    <span>(-) Salidas de efectivo (Retiros / Pagos):</span>
                    <span className="font-mono font-bold">-{formatMXN(data.salidasEfectivo)}</span>
                  </div>
                  <div className="flex justify-between text-[#E07A5F]">
                    <span>(-) Tickets de consumo autorizados:</span>
                    <span className="font-mono font-bold">-{formatMXN(results.totalTicketsConsumo)}</span>
                  </div>
                  <div className={`flex justify-between ${results.totalAjustesTurno < 0 ? "text-[#E07A5F]" : results.totalAjustesTurno > 0 ? "text-emerald-700" : "text-neutral-500"}`}>
                    <span>{results.totalAjustesTurno >= 0 ? "(+) Ajustes del turno (Suma):" : "(-) Ajustes del turno (Resta):"}</span>
                    <span className="font-mono font-bold">
                      {results.totalAjustesTurno >= 0 ? "+" : "-"}
                      {formatMXN(Math.abs(results.totalAjustesTurno))}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#3D405B] border-t border-[#E6D5AB] pt-2.5 font-extrabold text-sm select-none">
                    <span>(=) Efectivo Neto Esperado:</span>
                    <span className="font-mono text-[#81B29A] font-black">{formatMXN(results.efectivoEsperado)}</span>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="bg-[#FFFCF2] hover:bg-[#F2CC8F] text-neutral-700 py-3 px-6 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all cursor-pointer min-h-[44px]"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="bg-[#3D405B] hover:bg-[#81B29A] active:scale-[0.99] text-white py-3 px-8 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <span>Siguiente: Conteo Físico</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: CONTEO FÍSICO */}
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-8"
            >
              <div>
                <h2 className="font-serif text-2xl text-[#3D405B] font-extrabold flex items-center gap-2">
                  <Coins className="w-6 h-6 text-[#81B29A]" />
                  <span>Arqueo de Conteo Físico</span>
                </h2>
                <p className="text-sm text-[#81B29A]/80 mt-1 font-sans">
                  Sume y declare las cantidades físicas de billetes, monedas y dólares en tu caja para balancearlo contra el efectivo esperado en tiempo real.
                </p>
              </div>

              {/* Real-time subtotal indicators banner (Navy & petrol theme) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#FFFCF2] border border-[#E6D5AB] p-4 rounded-2xl">
                <div className="bg-white border border-[#E6D5AB] p-3 rounded-xl text-center shadow-3xs">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#81B29A]/80 block mb-0.5">Billetes (MXN)</span>
                  <span className="font-mono text-xs font-bold text-[#3D405B]">{formatMXN(results.subtotalBilletes)}</span>
                </div>
                <div className="bg-white border border-[#E6D5AB] p-3 rounded-xl text-center shadow-3xs">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#81B29A]/80 block mb-0.5">Monedas (MXN)</span>
                  <span className="font-mono text-xs font-bold text-[#3D405B]">{formatMXN(results.subtotalMonedas)}</span>
                </div>
                <div className="bg-white border border-[#E6D5AB] p-3 rounded-xl text-center shadow-3xs">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#81B29A]/80 block mb-0.5">Dólares (MXN)</span>
                  <span className="font-mono text-xs font-bold text-[#3D405B]">{formatMXN(results.subtotalDolares)}</span>
                </div>
                <div className="bg-[#E07A5F] text-white p-3 rounded-xl text-center shadow-xs">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#F4F1DE] block mb-0.5">Total Físico Contado</span>
                  <span className="font-mono text-sm font-extrabold text-white">{formatMXN(results.efectivoContado)}</span>
                </div>
              </div>

              {/* Grid content and denomination controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Billetes column */}
                <div className="space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#81B29A] border-b border-[#E6D5AB] pb-2">
                    Billetes MXN
                  </h3>

                  <div className="space-y-3">
                    {[1000, 500, 200, 100, 50, 20].map((denom) => {
                      const count = data.efectivoConteo[denom] || 0;
                      const sub = denom * count;

                      return (
                        <div key={denom} className="flex justify-between items-center bg-[#FFFCF2] px-3 py-2 rounded-xl border border-[#E6D5AB]/60 shadow-3xs">
                          <span className="text-xs font-bold text-[#3D405B] min-w-[70px]">${denom} pesos</span>
                          
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustConteo(denom, -1)}
                              className="w-9 h-9 rounded-lg bg-white border border-[#E6D5AB] hover:bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold text-lg select-none cursor-pointer active:scale-95 transition-all text-center"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min="0"
                              value={count === 0 ? "" : count}
                              placeholder="0"
                              onChange={(e) => setDirectConteo(denom, e.target.value)}
                              className="w-14 bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden text-center rounded-lg py-2 text-xs font-mono font-bold text-[#3D405B]"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() => adjustConteo(denom, 1)}
                              className="w-9 h-9 rounded-lg bg-[#E07A5F] hover:bg-[#3D405B] text-white flex items-center justify-center font-bold text-lg select-none cursor-pointer active:scale-95 transition-all text-center"
                            >
                              +
                            </button>
                          </div>

                          <span className="min-w-[80px] text-right font-mono text-xs font-bold text-neutral-700">
                            {formatMXN(sub)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Monedas & Dólares column */}
                <div className="space-y-6">
                  
                  {/* Monedas subpart */}
                  <div className="space-y-4">
                    <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#81B29A] border-b border-[#E6D5AB] pb-2">
                      Monedas MXN
                    </h3>

                    <div className="flex gap-1 border border-[#E6D5AB] rounded-lg p-1" role="group" aria-label="Modo de conteo de monedas">
                      {(["desglose", "total"] as const).map(mode => (
                        <button type="button" key={mode} aria-pressed={(data.modoMonedas || "desglose") === mode}
                          onClick={() => setData(prev => ({ ...prev, modoMonedas: mode }))}
                          className={`flex-1 min-h-10 rounded px-2 text-xs font-bold cursor-pointer ${(data.modoMonedas || "desglose") === mode ? "bg-[#3D405B] text-white" : "text-[#3D405B]"}`}>
                          {mode === "desglose" ? "Por denominación" : "Total de monedas"}
                        </button>
                      ))}
                    </div>
                    {data.modoMonedas === "total" ? (
                      <label className="block text-xs font-bold text-[#3D405B]">
                        Total de monedas (MXN)
                        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                          value={data.totalMonedasManual || ""}
                          onChange={e => setData(prev => ({ ...prev, totalMonedasManual: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="mt-2 w-full border border-[#E6D5AB] rounded-lg bg-white px-3 py-3 text-base font-mono" />
                      </label>
                    ) : (
                    <div className="space-y-2">
                      {[
                        { k: 20.1, label: "$20", v: 20 },
                        { k: 10, label: "$10", v: 10 },
                        { k: 5, label: "$5", v: 5 },
                        { k: 2, label: "$2", v: 2 },
                        { k: 1, label: "$1", v: 1 },
                        { k: 0.5, label: "$0.50", v: 0.5 },
                      ].map((item) => {
                        const count = data.efectivoConteo[item.k] || 0;
                        const sub = item.v * count;

                        return (
                          <div key={item.k} className="flex justify-between items-center bg-[#FFFCF2] px-3 py-1.5 rounded-xl border border-[#E6D5AB]/60 shadow-3xs">
                            <span className="text-xs font-bold text-[#3D405B] min-w-[70px]">{item.label} pesos</span>
                            
                            <div className="flex items-center gap-1.5 font-sans">
                              <button
                                type="button"
                                onClick={() => adjustConteo(item.k, -1)}
                                className="w-8 h-8 rounded-lg bg-white border border-[#E6D5AB] hover:bg-neutral-100 text-[#3D405B] flex items-center justify-center font-bold text-md select-none cursor-pointer active:scale-95 transition-all text-center"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min="0"
                                value={count === 0 ? "" : count}
                                placeholder="0"
                                onChange={(e) => setDirectConteo(item.k, e.target.value)}
                                className="w-12 bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden text-center rounded-lg py-1.5 text-xs font-mono font-bold text-[#3D405B]"
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                onClick={() => adjustConteo(item.k, 1)}
                                className="w-8 h-8 rounded-lg bg-[#E07A5F] hover:bg-[#3D405B] text-white flex items-center justify-center font-bold text-md select-none cursor-pointer active:scale-95 transition-all text-center"
                              >
                                +
                              </button>
                            </div>

                            <span className="min-w-[80px] text-right font-mono text-xs font-bold text-neutral-750">
                              {formatMXN(sub)}
                            </span>
                          </div>
                        );
                      })}
                    </div>)}
                  </div>

                  {/* Dólares subpart */}
                  <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-4 rounded-2xl space-y-3">
                    <h4 className="text-xs uppercase tracking-widest font-extrabold text-[#81B29A] border-b border-[#E6D5AB] pb-1.5 flex justify-between items-center">
                      <span>Dólares Estadounidenses (USD)</span>
                      <label className="flex items-center gap-1 text-[10px] text-[#81B29A]/80 font-bold">
                        TC: $
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0.01"
                          value={data.tipoCambioUSD || 15}
                          onChange={(e) => setData({ ...data, tipoCambioUSD: Math.max(0.01, parseFloat(e.target.value) || 15) })}
                          className="w-12 bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded px-1 py-0.5 text-center font-mono text-[#3D405B]"
                          aria-label="Tipo de cambio de dólar a peso mexicano"
                        />
                        MXN
                      </label>
                    </h4>
                    
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#81B29A]/80 block mb-1">Dólares en Caja (USD)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0 USD"
                          value={data.dolaresConteo || ""}
                          onChange={(e) => setData({ ...data, dolaresConteo: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-[#3D405B]"
                          autoComplete="off"
                        />
                      </div>
                      <div className="w-1/2 text-right">
                        <p className="text-[10px] text-neutral-550 font-extrabold uppercase line-clamp-1">Equivalente MXN</p>
                        <p className="font-mono text-sm font-extrabold text-[#3D405B]">{formatMXN(results.subtotalDolares)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Apartados de efectivo */}
                  <div className="bg-[#FFFCF2] border border-[#E6D5AB] p-4 rounded-2xl space-y-4">
                    <h4 className="text-xs uppercase tracking-widest font-extrabold text-[#81B29A] border-b border-[#E6D5AB] pb-1.5 flex items-center gap-2">
                      <Coins className="w-4 h-4 text-[#81B29A]" />
                      <span>Apartados de Efectivo</span>
                    </h4>
                    <p className="text-[10px] text-neutral-500">Registre cada importe que permanecerá reservado en caja para el siguiente turno, proveedores o caja chica.</p>
                    <div className="space-y-2">
                      {(data.apartadosEfectivo || []).map((apartado) => (
                        <div key={apartado.id} className="grid grid-cols-[1fr_104px_32px] gap-2 items-center">
                          <input
                            type="text"
                            value={apartado.description}
                            onChange={(e) => handleUpdateApartado(apartado.id, "description", e.target.value)}
                            placeholder="Motivo del apartado"
                            className="min-w-0 bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-lg px-2.5 py-2 text-xs text-[#3D405B] font-medium"
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={apartado.amount || ""}
                            onChange={(e) => handleUpdateApartado(apartado.id, "amount", e.target.value)}
                            placeholder="Monto"
                            className="w-full bg-white border border-[#E6D5AB] focus:border-[#E07A5F] focus:outline-hidden rounded-lg px-2 py-2 text-xs font-mono font-bold text-[#3D405B]"
                          />
                          <button type="button" onClick={() => handleDeleteApartado(apartado.id)} className="p-2 text-[#E07A5F] hover:bg-[#F4F1DE] rounded-lg cursor-pointer" title="Eliminar apartado">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={handleAddApartado} className="w-full border border-dashed border-[#81B29A] hover:bg-[#F4F1DE] text-[#3D405B] rounded-xl py-2 text-[10px] uppercase tracking-wider font-extrabold cursor-pointer transition-colors">
                      + Agregar apartado
                    </button>
                  </div>

                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-[#E6D5AB] pt-5">
                <button type="button" onClick={() => setCurrentStep(3)} className="px-5 py-3 text-sm font-bold">Regresar</button>
                <button type="button" onClick={() => setCurrentStep(5)} className="flex items-center gap-2 bg-[#3D405B] text-white rounded-lg px-5 py-3 text-sm font-bold">Siguiente: Resumen <ArrowRight className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}
          {currentStep === 5 && (
            <motion.div key="step5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-serif font-bold text-[#3D405B]">Resumen del corte</h2>
              <div className="divide-y divide-[#E6D5AB]">
                {previewSections.map(section => (
                  <section key={section.title} className="py-4">
                    <h3 className="text-sm font-bold text-[#3D405B] mb-3">{section.title}</h3>
                    <dl className="space-y-2 text-sm">
                      {section.rows.map(([label, value], index) => (
                        <div key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                          <dt className="min-w-0 break-words">{label}</dt><dd className="font-semibold break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
              {/* RESUMEN DEL ARQUEO */}
              <div className="border-t border-[#E6D5AB] pt-6 space-y-4">
                <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] mb-1">
                  Resumen del Arqueo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
                  <div className="bg-white border border-[#E6D5AB] p-4 rounded-2xl flex flex-col justify-between shadow-3xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-neutral-500 block mb-1">Efectivo Físico Contado</span>
                      <p className="font-mono text-lg font-black text-[#3D405B]">{formatMXN(results.efectivoContado)}</p>
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-2">Billetes + Monedas + Dólares + Apartados</span>
                  </div>

                  <div className="bg-white border border-[#E6D5AB] p-4 rounded-2xl flex flex-col justify-between shadow-3xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-neutral-500 block mb-1">Apartados en Caja</span>
                      <p className="font-mono text-lg font-black text-[#81B29A]">{formatMXN(results.totalApartados || 0)}</p>
                    </div>
                    <span className="text-[10px] text-neutral-600 font-semibold mt-2 line-clamp-1">
                      {(data.apartadosEfectivo || []).length > 0 ? `${data.apartadosEfectivo!.length} registro(s) activo(s)` : "Sin apartados registrados"}
                    </span>
                  </div>

                  <div className="bg-[#3D405B] text-white p-4 rounded-2xl flex flex-col justify-between shadow-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#F4F1DE] block mb-1">Efectivo Entregado</span>
                      <p className="font-mono text-lg font-black text-white">{formatMXN(results.efectivoEntregado || 0)}</p>
                    </div>
                    <span className="text-[10px] text-[#F2CC8F] mt-2 font-bold">Fórmula: Contado - Apartados</span>
                  </div>
                </div>
              </div>

              {/* RESULTADO FINAL (Section with Solid Green, Azul, Rojo status - Purely avoiding pastel soft tones) */}
              <div className="border-t border-[#E6D5AB] pt-6 space-y-4">
                <h3 className="text-xs uppercase tracking-widest font-extrabold text-[#3D405B] mb-1">
                  Resultado de Auditoría de Conciliación
                </h3>

                {results.statusDiferencia === 'exacto' && (
                  <div className="bg-white border-2 border-[#107C41] text-[#107C41] rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex gap-3.5 items-start">
                      <CheckCircle className="w-9 h-9 text-[#107C41] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-serif font-black text-lg text-[#107C41]">¡Caja Cuadrada Exactamente!</h4>
                        <p className="text-xs text-[#107C41] font-sans font-bold mt-1">El conteo real del cajón físico coincide exactamente al centavo con el efectivo esperado del sistema.</p>
                      </div>
                    </div>
                    <div className="text-center shrink-0 bg-[#107C41] text-white rounded-xl px-5 py-3 font-mono font-black border border-emerald-700 min-w-[150px]">
                      <span className="text-[9px] uppercase tracking-wider block leading-none mb-1 text-emerald-100">DIFERENCIA</span>
                      <span className="text-base font-extrabold">$0.00 MXN</span>
                    </div>
                  </div>
                )}

                {results.statusDiferencia === 'sobrante' && (
                  <div className="bg-white border-2 border-[#81B29A] text-[#81B29A] rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex gap-3.5 items-start">
                      <AlertCircle className="w-9 h-9 text-[#81B29A] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-serif font-black text-lg text-[#81B29A]">Sobrante de {formatMXN(results.diferenciaEfectivo)}</h4>
                        <p className="text-xs text-[#81B29A] font-sans font-semibold mt-1">El conteo de caja física registra un sobrante de dinero en exceso sobre el efectivo esperado por el sistema.</p>
                      </div>
                    </div>
                    <div className="text-center shrink-0 bg-[#E07A5F] text-white rounded-xl px-5 py-3 font-mono font-black min-w-[150px]">
                      <span className="text-[9px] uppercase block leading-none mb-1 text-[#F2CC8F] font-bold">SOBRANTE</span>
                      <span className="text-base font-extrabold">+{formatMXN(results.diferenciaEfectivo)}</span>
                    </div>
                  </div>
                )}

                {results.statusDiferencia === 'faltante' && (
                  <div className="bg-white border-2 border-[#E07A5F] text-[#E07A5F] rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex gap-3.5 items-start">
                      <XCircle className="w-9 h-9 text-[#E07A5F] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-serif font-black text-lg text-[#E07A5F]">Faltante de {formatMXN(Math.abs(results.diferenciaEfectivo))}</h4>
                        <p className="text-xs text-[#E07A5F] font-sans font-bold mt-1">Atención crítica: El efectivo físico contado en el cajón es inferior al esperado por el sistema.</p>
                      </div>
                    </div>
                    <div className="text-center shrink-0 bg-[#E07A5F] text-white rounded-xl px-5 py-3 font-mono font-black min-w-[150px]">
                      <span className="text-[9px] uppercase block leading-none mb-1 text-red-100">FALTANTE</span>
                      <span className="text-base font-extrabold">-{formatMXN(Math.abs(results.diferenciaEfectivo))}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[#E6D5AB] pt-6">
                <button type="button" onClick={handleSendPDF} className="w-full flex items-center justify-center gap-2 bg-[#3D405B] text-white rounded-lg px-5 py-4 font-bold cursor-pointer">
                  <Send className="w-5 h-5" /> ENVIAR PDF
                </button>
                {shareError && <p role="alert" className="mt-3 text-sm text-red-700">{shareError}</p>}
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="bg-[#FFFCF2] hover:bg-[#F2CC8F] text-neutral-700 py-3 px-6 rounded-xl text-xs uppercase font-sans tracking-widest font-extrabold transition-all cursor-pointer min-h-[44px]"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="bg-[#3D405B] hover:bg-[#81B29A] active:scale-[0.99] text-white py-3 px-8 rounded-xl text-xs uppercase font-sans tracking-widest font-bold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  Finalizar y Cerrar Sesión
                </button>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
}
