import { useEffect, useRef, useState, type ReactNode } from "react";
import { Banknote, CircleDollarSign, CreditCard, Layers, Minus, Plus, Trash2, X } from "lucide-react";
import type { Product } from "../../types";
import { monto, totalTicket, type CajaSucursal, type VentaCaja } from "./caja";
import { calcularPago, leerCentavos, resumirCobros, type CapturaPago } from "./pagos";

const metodos = { efectivo: "Efectivo", dolares: "Dólares", tarjeta: "Tarjeta", mixto: "Mixto" };
const opciones = [["efectivo", Banknote], ["dolares", CircleDollarSign], ["tarjeta", CreditCard], ["mixto", Layers]] as const;
export const mxn = (cantidad: number) => "$" + (Number.isFinite(cantidad) ? monto(cantidad) : "0.00");
export const numeroVenta = (numero: number) => "#" + String(numero).padStart(3, "0");
export function articulos(items: Product[]) {
  const cantidad = items.reduce((total, p) => total + p.quantity, 0);
  return cantidad + (cantidad === 1 ? " artículo" : " artículos");
}
const reloj = new Intl.DateTimeFormat("es-MX", { hour:"numeric", minute:"2-digit", hour12:true });
const fechaVenta = (valor: string) => {
  const fecha = new Date(valor);
  return fecha.toLocaleDateString("es-MX") + " · " + reloj.format(fecha).replace(/([ap])\.\s*m\./i, "$1. m.");
};

export function resumenVenta(v: VentaCaja) {
  return [`VENTA SIN LUZ ${numeroVenta(v.numero)} · ${v.sucursal}`, fechaVenta(v.fecha), "",
    ...v.items.map(p => `${p.name} x${p.quantity} ${mxn(totalTicket([p]))}`),
    "", `TOTAL: ${mxn(v.total)} MXN · ${metodos[v.pago.metodo]}`, `Cambio: ${mxn(v.pago.cambioMXN)} MXN`].join("\n");
}

export function DialogoCaja({ titulo, cerrar, ocupado, children }: {
  titulo: string; cerrar: () => void; ocupado: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogo = ref.current!;
    dialogo.showModal();
    return () => dialogo.close();
  }, []);
  return <dialog ref={ref} className="caja-dialogo" aria-labelledby="caja-dialogo-titulo"
    onCancel={e => { e.preventDefault(); if (!ocupado) cerrar(); }}>
    <header><h2 id="caja-dialogo-titulo">{titulo}</h2>
      <button type="button" title="Cerrar" aria-label="Cerrar" disabled={ocupado} onClick={cerrar}><X size={19} /></button>
    </header>
    {children}
  </dialog>;
}

export function FormularioPago({ total, captura, cambiar, editar = false, guardarTasa }: {
  total: number; captura: CapturaPago; cambiar: (captura: CapturaPago) => void;
  editar?: boolean; guardarTasa?: () => void;
}) {
  const p = calcularPago(total, captura);
  const mixto = captura.metodo === "mixto";
  const usaDolares = mixto || captura.metodo === "dolares";
  const campo = (clave: "efectivo" | "dolares" | "tarjeta" | "cambio" | "folio", nombre: string) =>
    <label>{nombre}<input inputMode={clave === "folio" ? "text" : "decimal"} autoComplete="off" value={captura[clave] ?? ""}
      onChange={e => cambiar({ ...captura, [clave]: e.target.value })} /></label>;
  return <>
    <p className="caja-total"><span>Total de la venta</span><strong>{mxn(total)} MXN</strong></p>
    <div className="caja-metodos" role="group" aria-label="Método de pago">
      {opciones.map(([id, Icon]) => <button key={id} type="button" aria-pressed={id === captura.metodo} onClick={() => {
        if (id !== captura.metodo) cambiar({ metodo: id, cambio: captura.cambio,
          efectivo: id === "efectivo" ? monto(total) : "", tarjeta: id === "tarjeta" ? monto(total) : "" });
      }}><Icon size={19} aria-hidden="true" />{metodos[id]}</button>)}
    </div>
    <div className="caja-campos">
      {(mixto || captura.metodo === "efectivo") && campo("efectivo", mixto ? "Efectivo MXN" : "Pagó con")}
      {usaDolares && <>
        {campo("dolares", "Dólares recibidos")}
        {campo("cambio", "Tipo de cambio MXN / USD")}
        {!editar && guardarTasa && <button type="button" onClick={guardarTasa} disabled={!(leerCentavos(captura.cambio) > 0)}>Guardar tipo de cambio</button>}
      </>}
      {(mixto || captura.metodo === "tarjeta") && campo("tarjeta", "Tarjeta MXN")}
      {(captura.metodo === "tarjeta" || (mixto && p.tarjeta > 0)) && campo("folio", "Folio de terminal (opcional)")}
    </div>
    <dl className="caja-desglose" aria-live="polite">
      {usaDolares && <>
        <div><dt>Equivalente de los dólares</dt><dd>{mxn(p.equivalente)} MXN</dd></div>
        {!mixto && p.tasa > 0 && <div><dt>Equivalente necesario</dt><dd>{mxn(p.usdNecesarios)} USD</dd></div>}
      </>}
      <div><dt>Total recibido</dt><dd>{mxn(p.recibido)} MXN</dd></div>
      {p.pendiente > 0 && <div><dt>Importe pendiente</dt><dd>{mxn(p.pendiente)} MXN{usaDolares && p.tasa > 0 && ` · ${mxn(p.usdPendientes)} USD`}</dd></div>}
      <div><dt>Su cambio</dt><dd>{mxn(p.cambioMXN)} MXN</dd></div>
    </dl>
  </>;
}

export function LineasTicket({ items, cambiar }: { items: Product[]; cambiar?: (items: Product[]) => void }) {
  return <ul className="caja-lineas">
    {items.map(p => <li key={p.id}>
      <div><b>{p.name}</b><small>{p.codigo && p.codigo + " · "}{mxn(totalTicket([{ ...p, quantity: 1 }]))} por pieza</small></div>
      <strong>{mxn(totalTicket([p]))}</strong>
      {cambiar ? <div className="caja-acciones">
        <button type="button" aria-label={`Restar ${p.name}`} onClick={() => cambiar(p.quantity === 1
          ? items.filter(i => i.id !== p.id) : items.map(i => i.id === p.id ? { ...i, quantity: i.quantity - 1 } : i))}><Minus size={16} /></button>
        <span aria-label="Cantidad">{p.quantity}</span>
        <button type="button" aria-label={`Sumar ${p.name}`} onClick={() => cambiar(items.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i))}><Plus size={16} /></button>
        <button type="button" aria-label={`Quitar ${p.name}`} onClick={() => cambiar(items.filter(i => i.id !== p.id))}><Trash2 size={17} /></button>
      </div> : <small>Cantidad: {p.quantity}</small>}
    </li>)}
  </ul>;
}

export function HistorialCaja({ caja, ocupado, estado, editar, borrar, limpiar }: {
  caja: CajaSucursal; ocupado: boolean; estado: (venta: VentaCaja) => void; editar: (venta: VentaCaja) => void;
  borrar: (venta: VentaCaja) => void; limpiar: () => void;
}) {
  const [traspasadas, seleccionar] = useState(false);
  const r = resumirCobros(caja.sales);
  const ventas = caja.sales.filter(v => v.traspasada === traspasadas)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  return <section className="caja-columna" aria-label="Historial de ventas">
    <h2>Resumen de cobros</h2>
    <dl className="caja-desglose">
      <div><dt>Ventas registradas</dt><dd>{r.ventas}</dd></div>
      <div><dt>Importe total vendido</dt><dd>{mxn(r.total)} MXN</dd></div>
      <div><dt>Efectivo neto</dt><dd>{mxn(r.efectivoNeto)} MXN</dd></div>
      <div><dt>Dólares recibidos</dt><dd>{mxn(r.dolares)} USD</dd></div>
      <div><dt>Equivalente de los dólares</dt><dd>{mxn(r.equivalente)} MXN</dd></div>
      <div><dt>Tarjeta</dt><dd>{mxn(r.tarjeta)} MXN</dd></div>
    </dl>
    <div className="caja-acciones" role="group" aria-label="Estado del traspaso">
      <button type="button" aria-pressed={!traspasadas} onClick={() => seleccionar(false)}>Pendientes ({r.pendientes})</button>
      <button type="button" aria-pressed={traspasadas} onClick={() => seleccionar(true)}>Traspasadas ({r.traspasadas})</button>
    </div>
    {!ventas.length && <p>No hay ventas {traspasadas ? "traspasadas" : "pendientes"}.</p>}
    {ventas.map(v => <article key={v.id} className="caja-venta">
      <details>
        <summary><b>Venta {numeroVenta(v.numero)} · {mxn(v.total)}</b><small>{fechaVenta(v.fecha)} · {metodos[v.pago.metodo]}</small></summary>
        <p>{v.sucursal}</p>
        <LineasTicket items={v.items} />
        <dl className="caja-desglose">
          {!!v.pago.efectivo && <div><dt>Efectivo recibido</dt><dd>{mxn(v.pago.efectivo)} MXN</dd></div>}
          {!!v.pago.dolares && <div><dt>Dólares recibidos</dt><dd>{mxn(v.pago.dolares)} USD · {mxn(v.pago.tasa)} MXN / USD</dd></div>}
          {!!v.pago.tarjeta && <div><dt>Tarjeta</dt><dd>{mxn(v.pago.tarjeta)} MXN{v.pago.folio && ` · Folio ${v.pago.folio}`}</dd></div>}
          <div><dt>Cambio</dt><dd>{mxn(v.pago.cambioMXN)} MXN</dd></div>
        </dl>
      </details>
      <div className="caja-acciones">
        <button type="button" disabled={ocupado} onClick={() => estado(v)}>Marcar como {v.traspasada ? "pendiente" : "traspasada"}</button>
        {!v.traspasada && <>
          <button type="button" disabled={ocupado} onClick={() => editar(v)}>Editar</button>
          <button type="button" disabled={ocupado} onClick={() => borrar(v)}>Eliminar</button>
        </>}
      </div>
    </article>)}
    <button type="button" disabled={ocupado || !r.ventas || !!r.pendientes} onClick={limpiar}>Limpiar historial</button>
  </section>;
}
