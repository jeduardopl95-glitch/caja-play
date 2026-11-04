// src/types.ts

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  codigo?: string;
  departamento?: string;
}

export interface QuickProduct {
  name: string;
  price: number;
}

export interface TerminalEntry {
  id: string;
  name: string;
  amount: number;
}

export interface TicketConsumo {
  id: string;
  description: string;
  amount: number;
}

export interface AjusteTurno {
  id: string;
  description: string;
  amount: number;
  type: 'sumar' | 'restar'; // 'sumar' (+) to add to expected cash, 'restar' (-) to subtract from expected cash
}

export interface ApartadoEfectivo {
  id: string;
  description: string;
  amount: number;
}

export interface CorteCajaData {
  // 1. Información del corte
  fecha: string;
  sucursal: string;
  cajeroName: string; // opcional

  // 2. Validación de tarjetas
  tarjetaManana: number;
  tarjetaTarde: number;
  terminalSantander: number;
  otrasTerminales: TerminalEntry[];
  tarjetaObservaciones: string;

  // 3. Datos del efectivo
  ventasEfectivoManual: number;
  entradasEfectivo: number;
  salidasEfectivo: number;
  ticketsConsumo: TicketConsumo[];
  ajustesTurno: AjusteTurno[];

  // 4. Conteo físico
  efectivoConteo: { [key: number]: number }; // key is denomination (using 20 for $20 bills and 20.1 for $20 coins)
  dolaresConteo: number;
  modoMonedas?: "desglose" | "total";
  totalMonedasManual?: number;
  tipoCambioUSD?: number;
  apartadosEfectivo?: ApartadoEfectivo[];
  // Campos heredados para abrir cortes guardados en versiones anteriores.
  fondoSiguienteTurno?: number;
  fondoMotivo?: string;
}

export interface CorteCajaResult {
  tarjetasTicket: number; // Mañana + Tarde
  totalTerminales: number; // Santander + Otras
  diferenciaTarjetas: number; // Tarjetas Ticket - totalTerminales
  totalTicketsConsumo: number; // sum of all tickets
  totalAjustesTurno: number; // net sum of all turn adjustments (+ / -)
  efectivoEsperado: number; // (Ventas efectivo + Entradas) - Salidas - Tickets consumo + totalAjustesTurno
  subtotalBilletes: number;
  subtotalMonedas: number;
  subtotalDolares: number; // dolaresConteo * tipoCambioUSD
  totalApartados?: number;
  fondoSiguienteTurno?: number;
  efectivoContado: number; // subtotalBilletes + subtotalMonedas + subtotalDolares + fondoSiguienteTurno
  efectivoEntregado?: number; // efectivoContado - fondoSiguienteTurno
  diferenciaEfectivo: number; // efectivoContado - efectivoEsperado
  statusDiferencia: "exacto" | "sobrante" | "faltante";
}
