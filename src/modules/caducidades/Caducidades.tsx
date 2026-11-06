import { useEffect, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { Check, LogOut, Plus } from "lucide-react";
import { getSavedInventory, type CatalogItem } from "../../lib/inventorySync";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;
type Registro = { id: string; producto: string; fecha: string; cantidad: number; resuelto: boolean };

export default function Caducidades() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [stores, setStores] = useState<string[]>();
  const [store, setStore] = useState("");
  const [records, setRecords] = useState<Registro[]>();
  const [inventory] = useState(getSavedInventory);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [product, setProduct] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [filter, setFilter] = useState("pendientes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const user = session?.user.id;

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
    let active = true;
    db.from("caducidades").select("id,producto,fecha,cantidad,resuelto").eq("sucursal", store).order("fecha").then(result => {
      if (!active) return;
      if (result.error) setError("No se pudieron cargar los registros.");
      else setRecords(result.data);
    });
    return () => { active = false; };
  }, [store, user, revision]);

  const matches = product.trim() && !selected ? inventory.filter(item =>
    item.descripcion.toLowerCase().includes(product.trim().toLowerCase()) || item.codigo.includes(product.trim())
  ).slice(0, 6) : [];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const today = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  const nextWeek = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const visible = records?.filter(r => filter === "resueltos" ? r.resuelto : !r.resuelto);

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
                setStore(e.target.value); setRecords(undefined); setProduct(""); setSelected(null); setDate(""); setQuantity("1"); setError(""); setNotice("");
              }}>
                <option value="">Selecciona una sucursal</option>
                {stores?.map(name => <option key={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {stores?.length === 0 && <p role="status">Tu cuenta todavía no tiene sucursales asignadas.</p>}
          {stores === undefined && !error && <p role="status">Cargando sucursales…</p>}
          {error && (!stores || (store && !records)) && <button type="button" className="pricing-reset" onClick={() => { setError(""); setRevision(n => n + 1); }}>Volver a intentar</button>}
          {store && (
            <div className="pricing-grid">
              <form className="pricing-fields" onSubmit={async e => {
                e.preventDefault();
                if (busy || !product.trim()) return;
                setBusy(true); setError(""); setNotice("");
                const result = await db.from("caducidades").insert({
                  sucursal: store, producto: product.trim(), codigo: selected?.codigo || null, fecha: date, cantidad: Number(quantity)
                }).select("id,producto,fecha,cantidad,resuelto").single();
                setBusy(false);
                if (result.error) { setError("No se guardó el registro. Conservamos la captura para que puedas reintentar."); return; }
                setRecords(previous => previous && [...previous, result.data].sort((a, b) => a.fecha.localeCompare(b.fecha)));
                setProduct(""); setSelected(null); setDate(""); setQuantity("1"); setFilter("pendientes"); setNotice("Registro guardado.");
              }}>
                <label>Producto o código de barras
                  <input required maxLength={200} value={product} onChange={e => { setProduct(e.target.value); setSelected(null); }} />
                </label>
                {!!matches.length && <ul className="divide-y divide-neutral-200">
                  {matches.map(item => <li key={item.id}><button type="button" className="w-full text-left px-2 py-2" onClick={() => { setProduct(item.descripcion); setSelected(item); }}>{item.descripcion}</button></li>)}
                </ul>}
                <label>Fecha de caducidad<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label>Piezas<input required type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
                <button className="pricing-reset flex items-center gap-2" disabled={busy || !records}><Plus size={17} />{busy ? "Guardando…" : "Guardar registro"}</button>
              </form>
              <section aria-label="Registros de caducidad">
                <label className="grid gap-1 font-semibold">Registros de {store}
                  <select className="min-h-11 px-3" value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="pendientes">Pendientes</option><option value="resueltos">Resueltos</option>
                  </select>
                </label>
                {!records && !error && <p role="status" className="mt-3">Cargando registros…</p>}
                {visible?.length === 0 && <p className="mt-3">No hay registros {filter}.</p>}
                <ul className="divide-y divide-neutral-200 mt-3">
                  {visible?.map(record => (
                    <li key={record.id} className="py-3">
                      <p className="font-bold break-words">{record.producto}</p>
                      <p className="text-sm">{record.fecha} · {record.cantidad} piezas · {record.resuelto ? "Resuelto" : record.fecha < today ? "Vencido" : record.fecha === today ? "Vence hoy" : record.fecha <= nextWeek ? "Próximo a vencer" : "Vigente"}</p>
                      {!record.resuelto && <button type="button" className="flex items-center gap-2 text-sm font-semibold" disabled={busy} onClick={async () => {
                        setBusy(true); setError(""); setNotice("");
                        const result = await db.from("caducidades").update({ resuelto: true }).eq("id", record.id).eq("sucursal", store).select("id").single();
                        setBusy(false);
                        if (result.error) { setError("No se pudo marcar como resuelto."); return; }
                        setRecords(previous => previous?.map(item => item.id === record.id ? { ...item, resuelto: true } : item));
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
          else { setStore(""); setRecords(undefined); setProduct(""); setSelected(null); setDate(""); setQuantity("1"); }
        }}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </section>
  );
}
