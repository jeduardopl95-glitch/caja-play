import { useEffect, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { Check, LogOut, Plus } from "lucide-react";
import { getSharedInventory, syncSharedInventory, type CatalogItem } from "../../lib/inventorySync";
import { fechaCancun } from "../../lib/fecha";
import { cargarPaginas } from "./paginas";
import { diasParaVencer, productoExacto, proveedorDe, proveedores, proximaVisita, tipoAviso, visitas } from "./visitas";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;
type Registro = { id: string; producto: string; codigo: string | null; departamento: string | null; proveedor: string | null; fecha: string; cantidad: number; resuelto: boolean };
const columnas = "id,producto,codigo,departamento,proveedor,fecha,cantidad,resuelto";

function cargarRegistros(store: string, resuelto: boolean, signal: AbortSignal) {
  return cargarPaginas(async (inicio, fin) => {
    if (!db) throw new Error("Supabase no configurado");
    const result = await db.from("caducidades").select(columnas)
      .eq("sucursal", store).eq("resuelto", resuelto)
      .order("fecha").order("id").range(inicio, fin).abortSignal(signal);
    if (result.error) throw result.error;
    return result.data;
  });
}

export default function Caducidades() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [stores, setStores] = useState<string[]>();
  const [store, setStore] = useState("");
  const [records, setRecords] = useState<Registro[]>();
  const [resolved, setResolved] = useState<Registro[]>();
  const [resolvedError, setResolvedError] = useState(false);
  const [inventory, setInventory] = useState(getSharedInventory);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [product, setProduct] = useState("");
  const [barcode, setBarcode] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [manualCategory, setManualCategory] = useState("");
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [filter, setFilter] = useState("pendientes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const user = session?.user.id;
  const chetumalito = store === "CHETUMALITO";

  useEffect(() => {
    let active = true;
    void syncSharedInventory().then(result => { if (active) setInventory(result.items); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setStores(undefined);
    if (!db || !user) return;
    let active = true;
    db.from("caducidad_accesos").select("sucursal").order("sucursal").then(result => {
      if (!active) return;
      if (result.error) setError("No se pudieron consultar tus sucursales.");
      else setStores(result.data.map(row => row.sucursal));
    });
    return () => { active = false; };
  }, [user, revision]);

  useEffect(() => {
    setRecords(undefined);
    if (!db || !store || !user) return;
    const controller = new AbortController();
    cargarRegistros(store, false, controller.signal).then(rows => {
      if (!controller.signal.aborted) setRecords(rows);
    }).catch(() => {
      if (!controller.signal.aborted) setError("No se pudieron cargar los registros.");
    });
    return () => controller.abort();
  }, [store, user, revision]);

  useEffect(() => {
    setResolved(undefined);
    setResolvedError(false);
    if (!db || !store || !user || filter !== "resueltos") return;
    const controller = new AbortController();
    cargarRegistros(store, true, controller.signal).then(rows => {
      if (!controller.signal.aborted) setResolved(rows);
    }).catch(() => {
      if (!controller.signal.aborted) setResolvedError(true);
    });
    return () => controller.abort();
  }, [store, user, filter, revision]);

  const field = barcode.trim() ? "codigo" : "descripcion";
  const query = (field === "codigo" ? barcode : product).trim().toLowerCase();
  const catalogProduct = selected ?? productoExacto(inventory, query, field);
  const matches = query && !catalogProduct
    ? inventory.filter(item => item[field].toLowerCase().includes(query)).slice(0, 6)
    : [];
  const today = fechaCancun();
  const visible = filter === "resueltos" ? resolved : records;
  const avisos = (records ?? []).flatMap(record => {
    const departamento = record.departamento ?? (record.codigo ? inventory.find(item => item.codigo === record.codigo)?.departamento : "") ?? "";
    const proveedor = record.proveedor ?? proveedorDe(departamento);
    const dias = diasParaVencer(today, record.fecha);
    const tipo = tipoAviso(dias, departamento, chetumalito);
    if (!tipo) return [];
    return [{ ...record, dias, tipo, proveedor, visita: proveedor && chetumalito ? proximaVisita(today, proveedor) : null }];
  });

  return (
    <section className="pricing">
      <h1>Caducidades</h1>
      {!db ? <p role="status">Caducidades aún no está conectado a Supabase.</p> : session === undefined ? <p role="status">Cargando sesión…</p> : !session ? (
        <form className="pricing-fields max-w-md" onSubmit={async e => {
          e.preventDefault();
          setBusy(true); setError("");
          const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (error) setError("No se pudo iniciar sesión. Revisa tus datos o la conexión.");
          else setPassword("");
        }}>
          <label>Correo<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="pricing-reset" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 items-end mb-5">
            <label className="grid gap-1 font-semibold">Sucursal
              <select className="min-h-11 px-3" value={store} disabled={busy || !stores?.length} onChange={e => {
                setStore(e.target.value); setRecords(undefined); setResolved(undefined); setFilter("pendientes"); setProduct(""); setBarcode(""); setSelected(null); setManualCategory(""); setDate(""); setQuantity("1"); setError(""); setNotice("");
              }}>
                <option value="">Selecciona una sucursal</option>
                {stores?.map(name => <option key={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {stores?.length === 0 && <p role="status">Tu cuenta todavía no tiene sucursales asignadas.</p>}
          {stores === undefined && !error && <p role="status">Cargando sucursales…</p>}
          {error && (!stores || (store && !records)) && <button type="button" className="pricing-reset" onClick={() => { setError(""); setRevision(n => n + 1); }}>Volver a intentar</button>}
          {!!avisos.length && (
            <section aria-labelledby="caducidades-avisos" className="mb-6 border-y border-current/15 py-4">
              <h2 id="caducidades-avisos" className="font-bold">Avisos de caducidad</h2>
              <ul className="divide-y divide-neutral-200">
                {avisos.map(aviso => (
                  <li key={aviso.id} className="py-2 break-words">
                    <strong>{aviso.tipo === "promocion" ? "Poner en promoción" : aviso.tipo === "vencido" ? "Vencido" : "Preparar cambio"}:</strong> {aviso.producto} · {aviso.cantidad} piezas
                    <p className="text-sm">
                      {aviso.dias === 0 ? "Vence hoy" : aviso.dias > 0 ? `Vence en ${aviso.dias} días` : `Venció hace ${-aviso.dias} días`}
                      {chetumalito && aviso.tipo !== "promocion" && (aviso.visita
                        ? ` · ${aviso.proveedor}: ${aviso.visita.dia} ${aviso.visita.fecha}`
                        : aviso.proveedor ? ` · ${aviso.proveedor}: sin visita para cambios` : " · Sin proveedor")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {chetumalito && (
            <details className="mb-6 border-b border-current/15 pb-3">
              <summary className="cursor-pointer py-3 font-bold">Visitas de proveedores</summary>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visitas.map(visita => (
                  <li key={visita.dia}>
                    <strong>{visita.dia}</strong>
                    {!!visita.preventa.length && <p><b>Preventa:</b> {visita.preventa.join(", ")}</p>}
                    {!!visita.mercancia.length && <p><b>Mercancía:</b> {visita.mercancia.join(", ")}</p>}
                    {!!visita.directa.length && <p><b>Pedido y entrega:</b> {visita.directa.join(", ")}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {store && (
            <div className="pricing-grid">
              <form className="pricing-fields" onSubmit={async e => {
                e.preventDefault();
                const nombre = catalogProduct?.descripcion || product.trim();
                if (busy || !nombre) return;
                setBusy(true); setError(""); setNotice("");
                const departamento = catalogProduct?.departamento || (manualCategory === "Abarrotes" ? "Abarrotes" : "");
                const proveedor = chetumalito ? proveedorDe(departamento) || (manualCategory !== "Abarrotes" ? manualCategory : "") : "";
                const result = await db.from("caducidades").insert({
                  sucursal: store, producto: nombre, codigo: catalogProduct?.codigo || barcode.trim() || null, fecha: date, cantidad: Number(quantity),
                  departamento: departamento || null, proveedor: proveedor || null
                }).select(columnas).single();
                setBusy(false);
                if (result.error) { setError("No se guardó el registro. Conservamos la captura para que puedas reintentar."); return; }
                setRecords(previous => previous && [...previous, result.data].sort((a, b) => a.fecha.localeCompare(b.fecha)));
                setProduct(""); setBarcode(""); setSelected(null); setManualCategory(""); setDate(""); setQuantity("1"); setFilter("pendientes"); setNotice("Registro guardado.");
              }}>
                <label>Nombre del producto
                  <input type="text" inputMode="text" required={!catalogProduct} maxLength={200} value={product} onChange={e => {
                    if (catalogProduct) setBarcode("");
                    setProduct(e.target.value); setSelected(null); setManualCategory("");
                  }} />
                </label>
                <label>Código de barras
                  <input type="text" inputMode="numeric" autoComplete="off" maxLength={200} value={barcode} onChange={e => {
                    if (catalogProduct) setProduct("");
                    setBarcode(e.target.value); setSelected(null); setManualCategory("");
                  }} />
                </label>
                {field === "codigo" && catalogProduct && <p role="status">{catalogProduct.descripcion}</p>}
                {field === "codigo" && !catalogProduct && !matches.length && <p role="status">No encontramos ese código. Puedes escribir el nombre del producto.</p>}
                {!!matches.length && <ul className="divide-y divide-neutral-200">
                  {matches.map(item => <li key={item.id}><button type="button" className="w-full text-left px-2 py-2" onClick={() => { setProduct(item.descripcion); setBarcode(item.codigo); setSelected(item); setManualCategory(""); }}>{item.descripcion}</button></li>)}
                </ul>}
                {product.trim() && (!catalogProduct || (chetumalito && !proveedorDe(catalogProduct.departamento) && catalogProduct.departamento !== "Abarrotes")) && (
                  <label>{catalogProduct ? "Proveedor (opcional)" : "Abarrotes o proveedor (opcional)"}
                    <select className="min-h-11 px-3" value={manualCategory} onChange={e => setManualCategory(e.target.value)}>
                      <option value="">Sin asignar</option>
                      {!catalogProduct && <option>Abarrotes</option>}
                      {chetumalito && proveedores.map(nombre => <option key={nombre}>{nombre}</option>)}
                    </select>
                  </label>
                )}
                <label>Fecha de caducidad<input className="min-w-0 max-w-full" required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label>Piezas<input required type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
                <button className="pricing-reset flex items-center gap-2" disabled={busy || !records}><Plus size={17} />{busy ? "Guardando…" : "Guardar registro"}</button>
              </form>
              <section aria-label="Registros de caducidad">
                <label className="grid gap-1 font-semibold">Registros de {store}
                  <select className="min-h-11 px-3" value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}>
                    <option value="pendientes">Pendientes</option><option value="resueltos">Resueltos</option>
                  </select>
                </label>
                {filter === "resueltos" && resolvedError && (
                  <p role="alert" className="mt-3">No se pudieron cargar los registros resueltos. <button type="button" className="underline" onClick={() => setRevision(n => n + 1)}>Reintentar</button></p>
                )}
                {!visible && (filter === "resueltos" ? !resolvedError : !error) && <p role="status" className="mt-3">Cargando registros…</p>}
                {visible?.length === 0 && <p className="mt-3">No hay registros {filter}.</p>}
                <ul className="divide-y divide-neutral-200 mt-3">
                  {visible?.map(record => (
                    <li key={record.id} className="py-3">
                      <p className="font-bold break-words">{record.producto}</p>
                      <p className="text-sm">{record.fecha} · {record.cantidad} piezas · {record.resuelto ? "Resuelto" : record.fecha < today ? "Vencido" : record.fecha === today ? "Vence hoy" : diasParaVencer(today, record.fecha) <= 5 ? "Próximo a vencer" : "Vigente"}</p>
                      {!record.resuelto && <button type="button" className="flex items-center gap-2 text-sm font-semibold" disabled={busy} onClick={async () => {
                        setBusy(true); setError(""); setNotice("");
                        const result = await db.from("caducidades").update({ resuelto: true }).eq("id", record.id).eq("sucursal", store).select("id").single();
                        setBusy(false);
                        if (result.error) { setError("No se pudo marcar como resuelto."); return; }
                        setRecords(previous => previous?.filter(item => item.id !== record.id));
                        setNotice("Registro marcado como resuelto.");
                      }}><Check size={17} /> Marcar como resuelto</button>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 text-green-800">{notice}</p>}
      {session && (
        <div className="mt-10 flex justify-end border-t border-current/15 pt-5">
        <button type="button" className="pricing-reset min-h-11 flex items-center gap-2" disabled={busy} onClick={async () => {
          setError(""); setNotice("");
          if ((await db.auth.signOut()).error) setError("No se pudo cerrar la sesión.");
          else { setStore(""); setRecords(undefined); setResolved(undefined); setFilter("pendientes"); setProduct(""); setBarcode(""); setSelected(null); setManualCategory(""); setDate(""); setQuantity("1"); }
        }}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </section>
  );
}
