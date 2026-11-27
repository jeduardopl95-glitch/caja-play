import type { Product } from "../../types";
import { calcularCobro } from "../../lib/dinero";
import { calcularPago, leerCentavos, type CapturaPago } from "./pagos";
import { leerCaja } from "./ventas";

export const sucursales = ["CHETUMALITO", "DOS HERMANOS", "JUNIOR", "PLAYITA"] as const;
export type Sucursal = typeof sucursales[number];
export const monto = (centavos: number) => (centavos / 100).toFixed(2);
export const totalTicket = (items: Product[]) => Math.round(calcularCobro(items, "").total * 100);
export type Pago = Pick<ReturnType<typeof calcularPago>, "metodo" | "efectivo" | "dolares" | "tarjeta" | "tasa" | "equivalente" | "cambioMXN" | "folio">;
export type VentaCaja = {
  id: string; numero: number; fecha: string; sucursal: Sucursal; items: Product[];
  total: number; pago: Pago; traspasada: boolean;
};
export type CajaSucursal = { revision: number; cart: Product[]; sales: VentaCaja[]; siguiente: number; cambio: string };
const vacia: CajaSucursal = { revision: 0, cart: [], sales: [], siguiente: 1, cambio: "15" };
const legado = "legado";

function transaccion<T>(tienda: Sucursal, modo: IDBTransactionMode, aplicar: (
  caja: CajaSucursal, migrada: boolean, guardar: (caja: CajaSucursal, marcarMigrada?: boolean) => CajaSucursal
) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const apertura = indexedDB.open("caja-play-cobro", 1);
    let bloqueada = false;
    apertura.onupgradeneeded = () => { apertura.result.createObjectStore("cajas"); };
    apertura.onerror = () => reject(apertura.error);
    apertura.onblocked = () => { bloqueada = true; reject(new Error("Cierra las otras pestañas para abrir el almacenamiento.")); };
    apertura.onsuccess = () => {
      const db = apertura.result;
      if (bloqueada) { db.close(); return; }
      db.onversionchange = () => db.close();
      try {
        const tx = db.transaction("cajas", modo);
        const store = tx.objectStore("cajas");
        const actual = store.get(tienda);
        const migracion = store.get(legado);
        let resultado: T;
        let fallo: unknown;
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onabort = () => { db.close(); reject(fallo ?? tx.error ?? new Error("No se pudo guardar en este dispositivo.")); };
        migracion.onsuccess = () => {
          try {
            resultado = aplicar(actual.result ?? vacia, !!migracion.result, (caja, marcarMigrada) => {
              const nueva = { ...caja, revision: caja.revision + 1 };
              store.put(nueva, tienda);
              if (marcarMigrada) store.put(true, legado);
              return nueva;
            });
          } catch (error) { fallo = error; tx.abort(); }
        };
      } catch (error) { db.close(); reject(error); }
    };
  });
}

export const leer = (tienda: Sucursal) => transaccion(tienda, "readonly", caja => caja);

export const hayLegado = () => transaccion(sucursales[0], "readonly", (_, migrada) => {
  if (migrada) return false;
  const anterior = leerCaja(localStorage);
  return !!(anterior.cart.length || anterior.sales.length);
});

export const migrar = (tienda: Sucursal) => transaccion(tienda, "readwrite", (caja, migrada, guardar) => {
  if (migrada) return caja;
  const anterior = leerCaja(localStorage);
  if (caja.cart.length && anterior.cart.length) {
    throw new Error("Esa sucursal ya tiene un ticket en preparación. Elige otra sucursal o termina ese ticket primero.");
  }
  const sales = [...anterior.sales].reverse().map((venta, i): VentaCaja => {
    const partes = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(venta.fecha);
    if (!partes) throw new Error("No se pudo reconocer la fecha de una venta anterior. Los datos originales siguen guardados.");
    const [, dia, mes, anio, hora, minuto] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia, hora, minuto);
    const total = Math.round(venta.total * 100);
    const pago = validarPago(total, { metodo: "efectivo", efectivo: venta.efectivo.toFixed(2), cambio: caja.cambio });
    return { id: "anterior-" + (caja.siguiente + i), numero: caja.siguiente + i, fecha: fecha.toISOString(),
      sucursal: tienda, items: venta.items, total, pago, traspasada: false };
  });
  return guardar({ ...caja, sales: [...caja.sales, ...sales], siguiente: caja.siguiente + sales.length,
    cart: anterior.cart.length ? anterior.cart : caja.cart }, true);
});

function revisar(caja: CajaSucursal, revision: number) {
  if (caja.revision !== revision) throw new Error("Otra pestaña modificó esta caja. Recarga sus datos antes de continuar.");
}

function validarTicket(items: Product[], permitirVacio = false) {
  if ((!permitirVacio && !items.length) || items.some(p => !p.name.trim()
    || !Number.isSafeInteger(p.quantity) || p.quantity < 1 || !Number.isFinite(p.price) || p.price < 0)
    || !Number.isSafeInteger(totalTicket(items))) throw new Error("Revisa las cantidades y precios del ticket.");
}

function validarPago(total: number, captura: CapturaPago): Pago {
  const p = calcularPago(total, captura);
  if (!p.valido || !p.suficiente) throw new Error("Completa el pago con importes válidos y suficientes.");
  const { metodo, efectivo, dolares, tarjeta, tasa, equivalente, cambioMXN, folio } = p;
  return { metodo, efectivo, dolares, tarjeta, tasa: Number.isFinite(tasa) ? tasa : 1500, equivalente, cambioMXN, folio };
}

export const actualizar = (tienda: Sucursal, revision: number, cambios: Partial<Pick<CajaSucursal, "cart" | "cambio">>) =>
  transaccion(tienda, "readwrite", (caja, _, guardar) => {
    revisar(caja, revision);
    if (cambios.cart) validarTicket(cambios.cart, true);
    if (cambios.cambio !== undefined && !(leerCentavos(cambios.cambio) > 0)) throw new Error("Introduce un tipo de cambio válido.");
    return guardar({ ...caja, ...cambios });
  });

export const finalizar = (tienda: Sucursal, revision: number, id: string, captura: CapturaPago, fecha = new Date().toISOString()) =>
  transaccion(tienda, "readwrite", (caja, _, guardar) => {
    if (caja.sales.some(v => v.id === id)) return caja;
    revisar(caja, revision);
    validarTicket(caja.cart);
    const total = totalTicket(caja.cart);
    const pago = validarPago(total, captura);
    const siguiente: VentaCaja = { id, numero: caja.siguiente, fecha,
      sucursal: tienda, items: caja.cart, total, pago, traspasada: false };
    return guardar({ ...caja, cart: [], siguiente: caja.siguiente + 1, sales: [...caja.sales, siguiente],
      cambio: (pago.metodo === "mixto" || pago.metodo === "dolares") ? monto(pago.tasa) : caja.cambio });
  });

type EdicionVenta = { items: Product[]; pago: CapturaPago } | { traspasada: boolean } | null;
export const cambiarVenta = (tienda: Sucursal, revision: number, id: string, edicion: EdicionVenta) =>
  transaccion(tienda, "readwrite", (caja, _, guardar) => {
    revisar(caja, revision);
    const anterior = caja.sales.find(v => v.id === id);
    if (!anterior) throw new Error("No se encontró la venta.");
    if (edicion && "traspasada" in edicion) {
      return guardar({ ...caja, sales: caja.sales.map(v => v.id === id ? { ...v, ...edicion } : v) });
    }
    if (anterior.traspasada) throw new Error("Primero marca la venta como pendiente.");
    if (!edicion) return guardar({ ...caja, sales: caja.sales.filter(v => v.id !== id) });
    if (!("items" in edicion)) throw new Error("Cambios de venta no válidos.");
    validarTicket(edicion.items);
    const total = totalTicket(edicion.items);
    const pago = validarPago(total, edicion.pago);
    return guardar({ ...caja, sales: caja.sales.map(v => v.id === id ? { ...v, items: edicion.items, total, pago } : v) });
  });

export const limpiarHistorial = (tienda: Sucursal, revision: number) => transaccion(tienda, "readwrite", (caja, _, guardar) => {
  revisar(caja, revision);
  if (!caja.sales.length || caja.sales.some(v => !v.traspasada)) throw new Error("No puedes limpiar el historial si hay ventas pendientes o no hay ventas.");
  return guardar({ ...caja, sales: [], siguiente: 1 });
});
