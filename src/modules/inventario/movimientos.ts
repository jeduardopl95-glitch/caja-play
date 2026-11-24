import { decimal, expresar, normalizarCantidad } from "./decimal";
import type { Movimiento, ProductoInventario } from "./tipos";

function validarMovimiento(m: Movimiento, producto: ProductoInventario) {
  if (m.tipo !== "conteo" && m.tipo !== "entrada" && m.tipo !== "venta") {
    throw new Error("Tipo de movimiento invalido.");
  }
  if (!m.id.trim() || m.codigo !== producto.codigo || !Number.isFinite(Date.parse(m.fecha))) {
    throw new Error(`Movimiento ${m.id}: identificador, producto o fecha invalidos.`);
  }
  const cantidad = normalizarCantidad(m.cantidad);
  if (cantidad.startsWith("-") || (cantidad === "0" && m.tipo !== "conteo")) {
    throw new Error(`Movimiento ${m.id}: cantidad no permitida.`);
  }
  return m.tipo === "venta"
    ? { ...m, cantidad, contabilizadas: normalizarCantidad(m.contabilizadas) }
    : { ...m, cantidad };
}

export function calcular(producto: ProductoInventario, historial: readonly Movimiento[]) {
  const valores = [
    decimal(producto.original ?? "0"),
    ...historial.flatMap(m => {
      try {
        return m.tipo === "venta" ? [decimal(m.cantidad), decimal(m.contabilizadas)] : [decimal(m.cantidad)];
      } catch { throw new Error(`Movimiento ${m.id}: cantidad decimal invalida.`); }
    })
  ];
  const escala = valores.reduce((max, valor) => Math.max(max, valor.escala), 0);
  const unidades = ({ entero, escala: origen }: ReturnType<typeof decimal>) => entero * 10n ** BigInt(escala - origen);
  const mostrar = (n: bigint) => expresar(n, escala);
  const original = unidades(valores[0]);
  let fisica = 0n, entradas = 0n, ventas = 0n, recibidasMin = 0n, recibidasMax = 0n;
  let revisado = false, fechaAnterior = -Infinity, indice = 1;
  const ids = new Set<string>();
  for (const movimiento of historial) {
    const m = validarMovimiento(movimiento, producto);
    const fecha = Date.parse(m.fecha);
    if (fecha < fechaAnterior) throw new Error(`Movimiento ${m.id}: fuera de orden cronologico.`);
    if (ids.has(m.id)) throw new Error(`Identificador de movimiento duplicado: ${m.id}.`);
    ids.add(m.id);
    fechaAnterior = fecha;
    const cantidad = unidades(valores[indice++]);
    if (m.tipo === "conteo") {
      revisado = true;
      fisica += cantidad;
    } else if (m.tipo === "entrada") {
      entradas += cantidad;
      fisica += cantidad;
      recibidasMin += cantidad;
      recibidasMax += cantidad;
    } else {
      const descontar = unidades(valores[indice++]);
      if (descontar < 0n || descontar > cantidad || descontar > fisica) {
        throw new Error(`Movimiento ${m.id}: la venta contabilizada supera la cantidad permitida.`);
      }
      ventas += cantidad;
      fisica -= descontar;
      // Sin lotes solo sabemos los limites de cuantas piezas recibidas quedan.
      recibidasMin = recibidasMin > descontar ? recibidasMin - descontar : 0n;
      recibidasMax = recibidasMax < fisica ? recibidasMax : fisica;
    }
  }
  const ajustada = original + entradas - ventas;
  return {
    original: producto.original === null ? null : mostrar(original),
    ajustada: producto.original === null ? null : mostrar(ajustada),
    diferencia: producto.original === null ? null : mostrar(fisica - ajustada),
    fisica: mostrar(fisica), entradas: mostrar(entradas), ventas: mostrar(ventas),
    recibidasMin: mostrar(recibidasMin), recibidasMax: mostrar(recibidasMax),
    revision: revisado ? "revisado" as const : producto.original !== null && original === 0n && !historial.length
      ? "opcional" as const : "pendiente" as const
  };
}

export function avisoEntrada({ recibidasMin, recibidasMax }: ReturnType<typeof calcular>) {
  if (recibidasMax === "0") return null;
  return { restante: recibidasMin === recibidasMax ? recibidasMax : null };
}

export function registrar(producto: ProductoInventario, historial: readonly Movimiento[], movimiento: Movimiento) {
  const m = validarMovimiento(movimiento, producto);
  const existente = historial.find(item => item.id === m.id);
  if (existente) {
    const anterior = validarMovimiento(existente, producto);
    if (anterior.codigo !== m.codigo || anterior.fecha !== m.fecha || anterior.tipo !== m.tipo
      || anterior.cantidad !== m.cantidad || (anterior.tipo === "venta" && m.tipo === "venta" && anterior.contabilizadas !== m.contabilizadas)) {
      throw new Error(`El identificador ${m.id} ya corresponde a otro movimiento.`);
    }
    return historial;
  }
  const candidato = [...historial, m];
  calcular(producto, candidato);
  return candidato;
}

export function corregir(producto: ProductoInventario, historial: readonly Movimiento[], id: string, cantidad: string | null, contabilizadas?: string) {
  const anterior = historial.find(m => m.id === id);
  if (!anterior) throw new Error("Movimiento no encontrado.");
  const candidato = cantidad === null ? historial.filter(m => m.id !== id) : historial.map(m => {
    if (m.id !== id) return m;
    return validarMovimiento(m.tipo === "venta" ? { ...m, cantidad, contabilizadas: contabilizadas ?? m.contabilizadas } : { ...m, cantidad }, producto);
  });
  calcular(producto, candidato);
  return candidato;
}
