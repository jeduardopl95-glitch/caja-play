export type Metodo = "efectivo" | "dolares" | "tarjeta" | "mixto";

export type CapturaPago = {
  metodo: Metodo;
  efectivo?: string;
  dolares?: string;
  tarjeta?: string;
  cambio: string;
  folio?: string;
};

export function leerCentavos(texto: string): number {
  const partes = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!partes) return NaN;
  const centavos = Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : NaN;
}

export function calcularPago(total: number, captura: CapturaPago) {
  const { metodo } = captura;
  const mixto = metodo === "mixto";
  const monto = (activo: boolean, valor?: string) => activo ? (mixto && !valor ? 0 : leerCentavos(valor ?? "")) : 0;
  const efectivo = monto(mixto || metodo === "efectivo", captura.efectivo);
  const dolares = monto(mixto || metodo === "dolares", captura.dolares);
  const tarjeta = monto(mixto || metodo === "tarjeta", captura.tarjeta);
  const tasa = leerCentavos(captura.cambio);
  const conversionValida = Number.isSafeInteger(tasa) && tasa > 0;
  const equivalente = dolares && conversionValida && Number.isSafeInteger(dolares)
    ? Number((BigInt(dolares) * BigInt(tasa) + 50n) / 100n) : 0;
  const recibido = efectivo + equivalente + tarjeta;
  const valido = Number.isSafeInteger(total) && total >= 0 && Number.isSafeInteger(recibido)
    && (!(mixto || metodo === "dolares") || conversionValida);
  const pendiente = valido ? Math.max(0, total - recibido) : Math.max(0, total);
  const usdPara = (mxn: number) => conversionValida && Number.isSafeInteger(mxn)
    ? Number((BigInt(mxn) * 100n + BigInt(tasa) - 1n) / BigInt(tasa)) : 0;
  return {
    metodo, efectivo, dolares, tarjeta, tasa, equivalente, recibido, valido, pendiente,
    suficiente: valido && recibido >= total,
    cambioMXN: valido ? Math.max(0, recibido - total) : 0,
    usdNecesarios: usdPara(total), usdPendientes: usdPara(pendiente),
    folio: tarjeta > 0 ? captura.folio?.trim() ?? "" : ""
  };
}

type TotalesPago = Pick<ReturnType<typeof calcularPago>, "efectivo" | "dolares" | "tarjeta" | "equivalente" | "cambioMXN">;

export function resumirCobros(ventas: readonly { total: number; pago: TotalesPago; traspasada: boolean }[]) {
  return ventas.reduce((resumen, { total, pago, traspasada }) => ({
    ventas: resumen.ventas + 1, total: resumen.total + total,
    efectivoNeto: resumen.efectivoNeto + pago.efectivo - pago.cambioMXN,
    dolares: resumen.dolares + pago.dolares,
    equivalente: resumen.equivalente + pago.equivalente,
    tarjeta: resumen.tarjeta + pago.tarjeta,
    pendientes: resumen.pendientes + Number(!traspasada),
    traspasadas: resumen.traspasadas + Number(traspasada),
  }), { ventas: 0, total: 0, efectivoNeto: 0, dolares: 0, equivalente: 0, tarjeta: 0, pendientes: 0, traspasadas: 0 });
}
