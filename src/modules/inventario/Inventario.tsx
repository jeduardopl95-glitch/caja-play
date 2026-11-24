import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, ChartNoAxesColumn, ClipboardList, Download, FileText, History, ListChecks, Save, Share2 } from "lucide-react";
import EscanerCodigo from "../../components/EscanerCodigo";
import { abrirAlmacenInventario } from "./almacenamiento";
import { crearIdInventario } from "./identificador";
import { buscarCodigo, departamentos, importarInventario } from "./importador";
import { avisoEntrada } from "./movimientos";
import { filasInventario } from "./resultados";
import type { InventarioActivo, Movimiento, ProductoImportado, ProductoInventario } from "./tipos";
import "./inventario.css";

type Sucursal = InventarioActivo["sucursal"];
type Avance = NonNullable<Awaited<ReturnType<ReturnType<typeof abrirAlmacenInventario>["leer"]>>>;
const sucursales: Sucursal[] = ["CHETUMALITO", "DOS HERMANOS", "JUNIOR", "PLAYITA"];
const vistas = [
  ["Conteo", ClipboardList], ["Pendientes", ListChecks], ["Resultados", ChartNoAxesColumn], ["Historial", History]
] as const;
const operaciones = { conteo: "Conteo", venta: "Venta", entrada: "Entrada" };
const normalizar = (texto: string) => texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const cantidadDecimal = (texto: string) => texto.trim().replace(",", ".");

export default function Inventario({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [almacen] = useState(abrirAlmacenInventario);
  const [sucursal, setSucursal] = useState<Sucursal>();
  const [avance, setAvance] = useState<Avance | null>();
  const [catalogo, setCatalogo] = useState<ProductoImportado[]>([]);
  const [depto, setDepto] = useState("");
  const [vista, setVista] = useState<(typeof vistas)[number][0]>("Conteo");
  const [consulta, setConsulta] = useState("");
  const [producto, setProducto] = useState<ProductoInventario | null>(null);
  const [externo, setExterno] = useState("");
  const [tipo, setTipo] = useState<Movimiento["tipo"]>("conteo");
  const [cantidad, setCantidad] = useState("");
  const [contabilizadas, setContabilizadas] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [mostrarCeros, setMostrarCeros] = useState(false);
  const [edicion, setEdicion] = useState<{ id: string; cantidad: string; contabilizadas?: string }>();
  const [confirmar, setConfirmar] = useState<"nuevo" | "movimiento" | "cero">();
  const [borrarId, setBorrarId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [conflicto, setConflicto] = useState(false);
  const [reporte, setReporte] = useState<{ base: Avance; archivo: File; compartible: boolean }>();
  const actual = useRef(0);
  const operando = useRef(false);
  const intento = useRef<Movimiento>();
  const buscador = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => () => { actual.current++; onBusyChange(false); }, [onBusyChange]);
  useEffect(() => { setReporte(undefined); }, [avance]);
  useEffect(() => {
    if (confirmar && !dialogo.current?.open) dialogo.current?.showModal();
    else if (!confirmar && dialogo.current?.open) dialogo.current.close();
  }, [confirmar]);

  async function operar<T>(accion: () => Promise<T>, aplicar: (valor: T) => void) {
    if (operando.current) return;
    const contexto = actual.current;
    operando.current = true;
    setOcupado(true); onBusyChange(true); setError(""); setAviso("");
    try {
      const resultado = await accion();
      if (actual.current === contexto) aplicar(resultado);
    } catch (causa) {
      if (actual.current !== contexto) return;
      const detalle = causa instanceof DOMException
        ? "No se pudo completar la operación local. Revisa el almacenamiento e inténtalo de nuevo."
        : causa instanceof Error ? causa.message : "No se pudo completar la operación.";
      setError(detalle);
      if (/otra pestana|vuelve a cargarlo|ya existe un inventario activo/i.test(detalle)) setConflicto(true);
    } finally {
      if (actual.current === contexto) {
        operando.current = false; setOcupado(false); onBusyChange(false);
      }
    }
  }

  function limpiar() {
    intento.current = undefined;
    setConsulta(""); setProducto(null); setExterno(""); setCantidad(""); setContabilizadas(""); setTipo("conteo");
  }
  function cambiarVista(siguiente: typeof vista) {
    setVista(siguiente); window.scrollTo(0, 0);
  }
  function cambiarSucursal() {
    if (operando.current) return;
    if ((cantidad || externo || edicion || intento.current) && !window.confirm("¿Cambiar de sucursal y descartar la captura sin guardar?")) return;
    actual.current++;
    setSucursal(undefined); setAvance(undefined); setCatalogo([]); setDepto(""); setConflicto(false);
    setEdicion(undefined); setMostrarCeros(false); setAviso(""); setError(""); limpiar(); cambiarVista("Conteo");
  }
  function cargar(tienda: Sucursal) {
    setSucursal(tienda);
    void operar<Avance | null>(() => almacen.leer(tienda), resultado => {
      if (avance && avance.id !== resultado?.id) {
        limpiar(); setEdicion(undefined); cambiarVista("Conteo");
        setAviso("El inventario anterior ya no está activo.");
      } else if (conflicto && intento.current && resultado && !resultado.movimientos.some(m => m.id === intento.current?.id)) {
        // A rejected revision did not write; retry the same ID after the newly loaded history.
        intento.current = { ...intento.current, fecha: new Date().toISOString() };
      }
      setAvance(resultado); setConflicto(false); setConfirmar(undefined);
    });
  }

  const { filas, porCodigo } = useMemo(() => {
    const filas = avance ? filasInventario(avance) : [];
    return { filas, porCodigo: new Map(filas.map(fila => [fila.producto.codigo, fila])) };
  }, [avance]);
  const productos = useMemo(() => avance ? [...avance.externos, ...avance.catalogo.filter(p =>
    !avance.externos.some(e => e.codigo === p.codigo))] : [], [avance]);
  const texto = normalizar(consulta);
  const exactos = texto ? buscarCodigo(productos, consulta) : [];
  const encontrados = texto ? (exactos.length ? exactos : productos.filter(p =>
    normalizar(p.descripcion).includes(texto) || normalizar(p.codigo).includes(texto)).slice(0, 12)) : [];
  const esOtro = (p: ProductoInventario) => p.original !== null && p.departamento !== avance?.departamento;
  const saldo = producto ? porCodigo.get(producto.codigo)?.saldo : undefined;
  const entradaPendiente = saldo && tipo === "conteo" ? avisoEntrada(saldo) : null;
  const pendientes = filas.filter(f => f.producto.original !== null && f.saldo.revision === "pendiente");
  const revisados = filas.filter(f => f.producto.original !== null && f.saldo.revision === "revisado").length;
  const opcionales = filas.filter(f => f.saldo.revision === "opcional");
  const filasResultado = filas.filter(f => f.saldo.revision !== "opcional");
  const movimientoEditado = avance?.movimientos.find(m => m.id === edicion?.id);
  const gruposDepartamento = departamentos(catalogo);
  const productosDepto = catalogo.filter(p => p.departamento === depto);
  const reporteActual = reporte?.base === avance ? reporte : undefined;

  function prepararReporte() {
    if (!avance) return;
    setReporte(undefined);
    void operar(async () => {
      const guardado = await almacen.leer(avance.sucursal);
      if (!guardado || guardado.id !== avance.id) throw new Error("El inventario cambió. Vuelve a cargarlo.");
      const { generarPDFInventario } = await import("./pdf");
      const { blob } = generarPDFInventario(guardado);
      const nombre = guardado.sucursal.replace(/[^a-zA-Z0-9_-]/g, "_");
      const archivo = new File([blob], `Inventario_${nombre}_${guardado.fechaReferencia.slice(0, 10)}.pdf`, { type: "application/pdf" });
      return { base: avance, archivo, compartible: !!navigator.share && !!navigator.canShare?.({ files: [archivo] }) };
    }, resultado => { setReporte(resultado); setAviso("Reporte listo."); });
  }

  function compartirReporte(archivo: File) {
    // A separate press supplies the user activation required by native sharing.
    void operar(async () => {
      try {
        await navigator.share({ files: [archivo], title: "Inventario de Playita" });
      } catch (causa) {
        if (causa instanceof DOMException && causa.name === "AbortError") return;
        throw new Error("No se pudo compartir el reporte. Puedes descargar el PDF.");
      }
    }, () => {});
  }

  function descargarReporte(archivo: File) {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url; enlace.download = archivo.name;
    document.body.append(enlace);
    enlace.click(); enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function elegir(p: ProductoInventario) {
    if (esOtro(p)) return;
    intento.current = undefined;
    setProducto(p); setConsulta(p.codigo); setCantidad(""); setContabilizadas(""); setExterno(""); setError(""); setAviso("");
  }
  function guardar(cero = false) {
    if (!avance || !producto || operando.current || conflicto) return;
    const p = producto.original === null && !porCodigo.has(producto.codigo)
      ? { ...producto, descripcion: externo.trim() } : producto;
    if (!p.descripcion || (!cero && !cantidad.trim())) { setError("Completa el nombre y la cantidad."); return; }
    setConfirmar(undefined);
    void operar(async () => {
      if (!intento.current) {
        const comun = { id: crearIdInventario(), codigo: p.codigo, fecha: new Date().toISOString(), cantidad: cero ? "0" : cantidadDecimal(cantidad) };
        intento.current = tipo === "venta" ? { ...comun, tipo, contabilizadas: cantidadDecimal(contabilizadas || "0") } : { ...comun, tipo };
      }
      return almacen.registrar(avance, intento.current, p.original === null ? p : undefined);
    }, guardado => {
      setAvance(guardado); limpiar(); setAviso(operaciones[tipo] + " guardad" + (tipo === "conteo" ? "o." : "a."));
    });
  }

  return <section className="pricing inv">
    <div className="inv-head">
      <div><h1>Inventario</h1>{sucursal && <p>{sucursal}{avance && " · " + avance.departamento}</p>}</div>
      {sucursal && <button type="button" disabled={ocupado} onClick={cambiarSucursal}>Cambiar sucursal</button>}
    </div>
    {!sucursal && <div className="inv-stack">
      <h2>Elige tu tienda</h2>
      {sucursales.map(tienda => <button className="inv-row" type="button" disabled={ocupado} key={tienda} onClick={() => cargar(tienda)}>{tienda}</button>)}
    </div>}
    {sucursal && avance === undefined && <div>{ocupado ? <p role="status">Buscando inventario…</p>
      : <button type="button" onClick={() => cargar(sucursal)}>Reintentar lectura</button>}</div>}
    {sucursal && avance === null && <div className="inv-stack">
      <h2>Nuevo inventario</h2>
      <label>Archivo CSV<input type="file" accept=".csv,text/csv" disabled={ocupado} onChange={e => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        setCatalogo([]); setDepto("");
        void operar(async () => importarInventario(new Uint8Array(await archivo.arrayBuffer())), productos => {
          setCatalogo(productos);
          const grupos = departamentos(productos);
          setDepto(grupos.length === 1 ? grupos[0] : "");
        });
      }} /></label>
      {!!catalogo.length && <label>Departamento<select disabled={ocupado} value={depto} onChange={e => setDepto(e.target.value)}>
        <option value="">Selecciona un departamento</option>{gruposDepartamento.map(grupo => <option key={grupo}>{grupo}</option>)}
      </select></label>}
      {!!depto && <div className="inv-review inv-stack">
        <p><b>{sucursal} · {depto}</b></p>
        <p>{productosDepto.length} productos del departamento</p>
        <p>{productosDepto.filter(p => p.original !== "0").length} requieren revisión al iniciar</p>
        <button type="button" className="inv-primary" disabled={ocupado} onClick={() => void operar(
          () => almacen.crear({ sucursal, departamento: depto, fechaReferencia: new Date().toISOString() }, catalogo),
          resultado => { setAvance(resultado); setCatalogo([]); setAviso("Inventario iniciado."); }
        )}>Iniciar inventario</button>
      </div>}
    </div>}
    {avance && <>
      <div className="inv-progress">
        <p><b>{revisados}</b> revisados <span>· {pendientes.length} pendientes</span></p>
        <progress aria-label="Progreso del inventario" max={Math.max(1, revisados + pendientes.length)} value={pendientes.length ? revisados : Math.max(1, revisados)} />
        <small>{opcionales.length} en cero, revisión opcional · Referencia: {new Date(avance.fechaReferencia).toLocaleString("es-MX")}</small>
      </div>
      {vista === "Conteo" && <div className="inv-stack">
        <h2>Conteo</h2>
        <div className="inv-search">
          <label>Descripción o código<input ref={buscador} disabled={ocupado} autoComplete="off" value={consulta} onChange={e => {
            limpiar(); setAviso(""); setConsulta(e.target.value);
          }} /></label>
          <button type="button" className="inv-icon" aria-label="Escanear código" title="Escanear código" ref={camara}
            disabled={ocupado} onClick={() => setEscaneando(true)}><Barcode size={22} /></button>
        </div>
        {!producto && texto && <div className="inv-stack">
          {encontrados.map(p => esOtro(p)
            ? <div className="inv-row" key={p.codigo}><b>{p.descripcion}</b><small>{p.departamento} · Otro departamento</small>
                <button type="button" disabled={ocupado} onClick={() => { elegir({ ...p, original: null }); setExterno(p.descripcion); }}>Registrar aparte</button></div>
            : <button className="inv-row" type="button" disabled={ocupado} key={p.codigo} onClick={() => elegir(p)}>{p.descripcion} <small>{p.codigo}</small></button>)}
          {!encontrados.length && <button className="inv-row" type="button" disabled={ocupado} onClick={() =>
            elegir({ codigo: consulta.trim(), descripcion: "", departamento: null, original: null })}>Registrar producto externo</button>}
        </div>}
        {producto && <form className="inv-stack" onSubmit={e => { e.preventDefault(); guardar(); }}>
          <fieldset className="inv-stack" disabled={ocupado}>
            {producto.original === null && !porCodigo.has(producto.codigo)
              ? <label>Nombre del producto externo<input value={externo} required onChange={e => { intento.current = undefined; setExterno(e.target.value); }} /></label>
              : <p><b>{producto.descripcion}</b> · {producto.codigo}</p>}
            {saldo && <p>Físico: <b>{saldo.fisica}</b> · Ajustado: <b>{saldo.ajustada ?? "N/D"}</b></p>}
            <div className="inv-segment" aria-label="Tipo de operación">
              {(Object.keys(operaciones) as Movimiento["tipo"][]).map(id => <button type="button" key={id} aria-pressed={tipo === id}
                onClick={() => { if (tipo !== id) { intento.current = undefined; setTipo(id); } }}>{operaciones[id]}</button>)}
            </div>
            {entradaPendiente && <p className="inv-review">{entradaPendiente.restante === null
              ? "Puede quedar mercancía ya registrada por entradas. No la cuentes dos veces."
              : "El físico incluye " + entradaPendiente.restante + " piezas registradas por entradas."}</p>}
            <label>Cantidad<input inputMode="decimal" required value={cantidad} onChange={e => { intento.current = undefined; setCantidad(e.target.value); }} /></label>
            {tipo === "venta" && <>
              {saldo && saldo.fisica !== "0" && <div className="inv-actions">
                <button type="button" onClick={() => { intento.current = undefined; setContabilizadas(""); }}>Ninguna contada</button>
                <button type="button" disabled={!cantidad.trim()} onClick={() => { intento.current = undefined; setContabilizadas(cantidad); }}>Todas contadas</button>
              </div>}
              <label>Piezas ya contadas<input inputMode="decimal" placeholder="0" value={contabilizadas}
                onChange={e => { intento.current = undefined; setContabilizadas(e.target.value); }} /></label>
            </>}
            <button type="submit" className="inv-primary" disabled={conflicto}>Guardar {tipo}</button>
            {tipo === "conteo" && producto.descripcion && <button type="button" disabled={conflicto} onClick={() => {
              if (intento.current?.cantidad !== "0") intento.current = undefined;
              setConfirmar("cero");
            }}>{!saldo || saldo.fisica === "0" ? "Confirmar cero piezas" : "Confirmar sin piezas adicionales"}</button>}
          </fieldset>
        </form>}
      </div>}
      {vista === "Pendientes" && <div className="inv-stack">
        <h2>Pendientes</h2>
        <p>{pendientes.length ? pendientes.length + " productos por revisar" : "No hay revisiones obligatorias pendientes."}</p>
        <label className="inv-check"><input type="checkbox" checked={mostrarCeros} onChange={e => setMostrarCeros(e.target.checked)} /> Mostrar ceros opcionales</label>
        {[...pendientes, ...(mostrarCeros ? opcionales : [])].map(({ producto: p, saldo: c }) => <div className="inv-row" key={p.codigo}>
          <button type="button" onClick={() => { elegir(p); setTipo("conteo"); cambiarVista("Conteo"); }}>{p.descripcion} <small>{p.codigo}</small></button>
          <small>Existencia ajustada: {c.ajustada}{c.ajustada?.startsWith("-") ? " · Negativa" : ""}</small>
        </div>)}
      </div>}
      {vista === "Resultados" && <div className="inv-stack">
        <h2>Resultados provisionales</h2>
        <p>{pendientes.length ? "Inventario incompleto" : "Revisión completa"} · {pendientes.length} pendientes</p>
        <div className="inv-actions">
          <button type="button" className="inv-primary" disabled={ocupado} onClick={prepararReporte}><FileText size={17} aria-hidden="true" /> Generar PDF</button>
          {reporteActual?.compartible && <button type="button" disabled={ocupado} onClick={() => compartirReporte(reporteActual.archivo)}>
            <Share2 size={17} aria-hidden="true" /> Compartir PDF
          </button>}
          {reporteActual && <button type="button" disabled={ocupado} onClick={() => descargarReporte(reporteActual.archivo)}>
            <Download size={17} aria-hidden="true" /> Descargar PDF
          </button>}
        </div>
        {!filasResultado.length && <p>Aún no hay resultados.</p>}
        {filasResultado.map(({ producto: p, saldo: c }) => <div className="inv-row" key={p.codigo}>
          <b>{p.descripcion}</b><small>{p.codigo} · {p.original === null ? "Externo" : c.revision === "revisado" ? "Revisado" : "Pendiente"}</small>
          <dl className="inv-numbers">
            {([["Original",c.original],["Ajustada",c.ajustada],["Física",c.fisica],["Diferencia",c.diferencia]] as const).map(([nombre,valor]) =>
              <div key={nombre}><dt>{nombre}</dt><dd>{nombre === "Diferencia" && c.revision === "pendiente" ? "N/D" : valor ?? "N/D"}</dd></div>)}
          </dl>
        </div>)}
      </div>}
      {vista === "Historial" && <div className="inv-stack">
        <h2>Historial</h2>
        {!avance.movimientos.length && <p>Aún no hay movimientos.</p>}
        {[...avance.movimientos].reverse().map(m => <div className="inv-row" key={m.id}>
          <b>{porCodigo.get(m.codigo)?.producto.descripcion ?? m.codigo}</b>
          <p>{operaciones[m.tipo]} · {m.cantidad}{m.tipo === "venta" && " · " + m.contabilizadas + " ya contadas"}</p>
          <small>{new Date(m.fecha).toLocaleString("es-MX")}</small>
          {edicion?.id === m.id ? <form className="inv-stack" onSubmit={e => {
            e.preventDefault();
            const valores = edicion;
            void operar(() => almacen.corregir(avance, m.id, cantidadDecimal(valores.cantidad), valores.contabilizadas === undefined ? undefined : cantidadDecimal(valores.contabilizadas)),
              resultado => { setAvance(resultado); setEdicion(undefined); setAviso("Movimiento actualizado."); });
          }}>
            <label>Cantidad editada<input required inputMode="decimal" disabled={ocupado} value={edicion.cantidad} onChange={e => setEdicion({ ...edicion, cantidad: e.target.value })} /></label>
            {movimientoEditado?.tipo === "venta" && <label>Piezas ya contadas<input required inputMode="decimal" disabled={ocupado} value={edicion.contabilizadas} onChange={e => setEdicion({ ...edicion, contabilizadas: e.target.value })} /></label>}
            <div className="inv-actions"><button className="inv-primary" disabled={ocupado || conflicto}>Guardar cambios</button>
              <button type="button" disabled={ocupado} onClick={() => setEdicion(undefined)}>Cancelar edición</button></div>
          </form> : <div className="inv-actions">
            <button type="button" disabled={ocupado || conflicto} onClick={() => setEdicion({ id: m.id, cantidad: m.cantidad, ...(m.tipo === "venta" && { contabilizadas: m.contabilizadas }) })}>Editar</button>
            <button type="button" disabled={ocupado || conflicto} onClick={() => { setBorrarId(m.id); setConfirmar("movimiento"); }}>Eliminar</button>
          </div>}
        </div>)}
      </div>}
      <div className="inv-actions inv-footer">
        <button type="button" disabled={ocupado || conflicto} onClick={() => void operar(() => almacen.confirmarGuardado(avance.sucursal),
          () => setAviso("Avance guardado en este dispositivo."))}><Save size={17} /> Guardar avance</button>
        <button type="button" disabled={ocupado || conflicto} onClick={() => setConfirmar("nuevo")}>Nuevo inventario</button>
      </div>
    </>}
    <div className="inv-dock"><div className="inv-feedback">
      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}
      {ocupado && <p role="status">Procesando…</p>}
      {conflicto && sucursal && <button type="button" disabled={ocupado} onClick={() => cargar(sucursal)}>Recargar inventario</button>}
    </div>
    {avance && <nav className="inv-nav" aria-label="Vistas de Inventario">
      {vistas.map(([nombre, Icon]) => <button type="button" key={nombre} disabled={ocupado} aria-current={vista === nombre ? "page" : undefined}
        onClick={() => cambiarVista(nombre)}><Icon size={19} aria-hidden="true" />{nombre}</button>)}
    </nav>}
    </div>
    {escaneando && <EscanerCodigo onClose={() => { setEscaneando(false); requestAnimationFrame(() => camara.current?.focus()); }}
      onDetected={codigo => {
        setEscaneando(false); limpiar(); setConsulta(codigo);
        const candidatos = buscarCodigo(productos, codigo);
        if (candidatos.length === 1 && !esOtro(candidatos[0])) elegir(candidatos[0]);
      }} />}
    <dialog className="inv-dialog" ref={dialogo} aria-labelledby="inv-dialog-title" onCancel={e => { e.preventDefault(); setConfirmar(undefined); }}>
      {confirmar && <div className="inv-stack">
        <h2 id="inv-dialog-title">{confirmar === "nuevo" ? "¿Eliminar el inventario activo?" : confirmar === "movimiento" ? "¿Eliminar este movimiento?" : "¿Confirmar el conteo en cero?"}</h2>
        <p>{confirmar === "nuevo" ? "Se eliminarán el catálogo y los movimientos de " + sucursal + ". No se puede deshacer."
          : confirmar === "movimiento" ? "Se volverá a validar el historial después de quitarlo." : "La revisión se guardará sin añadir piezas al físico."}</p>
        <div className="inv-actions"><button type="button" autoFocus onClick={() => setConfirmar(undefined)}>Cancelar</button>
          <button type="button" className="inv-primary" disabled={ocupado} onClick={() => {
            if (!avance) return;
            if (confirmar === "cero") { guardar(true); return; }
            setConfirmar(undefined);
            if (confirmar === "nuevo") void operar(() => almacen.eliminar(avance), () => {
              setAvance(null); setEdicion(undefined); setMostrarCeros(false); cambiarVista("Conteo"); limpiar(); setAviso("Inventario anterior eliminado.");
            });
            else void operar(() => almacen.corregir(avance, borrarId, null), resultado => {
              setAvance(resultado); setEdicion(undefined); setAviso("Movimiento eliminado.");
            });
          }}>{confirmar === "nuevo" ? "Eliminar inventario" : confirmar === "movimiento" ? "Eliminar movimiento" : "Confirmar revisión"}</button>
        </div>
      </div>}
    </dialog>
  </section>;
}
