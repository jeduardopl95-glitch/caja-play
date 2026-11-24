import { normalizarCantidad } from "./decimal";
import { crearIdInventario } from "./identificador";
import { seleccionarDepartamento } from "./importador";
import { corregir, registrar } from "./movimientos";
import type { InventarioActivo, Movimiento, ProductoImportado, ProductoInventario } from "./tipos";

const base = "caja-play-inventario";
const version = 1;
const tiendas = ["CHETUMALITO", "DOS HERMANOS", "JUNIOR", "PLAYITA"] as const;
type Sucursal = InventarioActivo["sucursal"];
type Nuevo = Pick<InventarioActivo, "sucursal" | "departamento" | "fechaReferencia">;
type Estado = InventarioActivo & {
  readonly revision: number;
  readonly externos: readonly ProductoInventario[];
  readonly movimientos: readonly Movimiento[];
  readonly eliminados: readonly string[];
};
type Clave = Pick<Estado, "sucursal" | "id" | "revision">;
type Avance = Omit<Estado, "eliminados"> & { readonly catalogo: readonly ProductoImportado[] };
const codigoClave = (codigo: string) => codigo.trim().toLowerCase();

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(base, version);
    let bloqueado = false;
    solicitud.onupgradeneeded = () => {
      solicitud.result.createObjectStore("activos");
      solicitud.result.createObjectStore("catalogos");
    };
    solicitud.onblocked = () => {
      bloqueado = true;
      reject(new Error("Cierra las otras pestanas antes de actualizar el almacenamiento."));
    };
    solicitud.onerror = () => reject(solicitud.error);
    solicitud.onsuccess = () => {
      const db = solicitud.result;
      if (bloqueado) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function transaccion<T>(
  sucursal: Sucursal, modo: IDBTransactionMode,
  aplicar: (estado: Estado | undefined, catalogo: ProductoImportado[] | undefined, tx: IDBTransaction) => T
): Promise<T> {
  if (!tiendas.includes(sucursal)) throw new Error("Sucursal invalida.");
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["activos", "catalogos"], modo);
      const activo = tx.objectStore("activos").get(sucursal);
      const catalogo = tx.objectStore("catalogos").get(sucursal);
      let resultado: T;
      let fallo: unknown;
      tx.oncomplete = () => resolve(resultado);
      tx.onabort = () => reject(fallo ?? tx.error ?? new Error("No se completo la transaccion de Inventario."));
      // Validate and queue writes synchronously inside the request event, including in Safari.
      catalogo.onsuccess = () => {
        try {
          if (activo.result && activo.result.version !== version) throw new Error("Version de inventario no compatible.");
          if (Boolean(activo.result) !== Boolean(catalogo.result)) throw new Error("Inventario local incompleto.");
          resultado = aplicar(activo.result, catalogo.result, tx);
        } catch (error) {
          fallo = error;
          tx.abort();
        }
      };
    });
  } finally { db.close(); }
}

function leerAvance(estado: Estado, catalogo: readonly ProductoImportado[]): Avance {
  const { eliminados: _eliminados, ...avance } = estado;
  return { ...avance, catalogo };
}

function mismoInventario(clave: Clave, estado: Estado | undefined): asserts estado is Estado {
  if (!estado || estado.id !== clave.id) throw new Error("El inventario cambio. Vuelve a cargarlo.");
}

function mismaRevision(clave: Clave, estado: Estado) {
  if (clave.revision !== estado.revision) throw new Error("Otra pestana actualizo el inventario. Vuelve a cargarlo.");
}

export function abrirAlmacenInventario() {
  const pendientes = new Set<Promise<unknown>>();
  const fallos = new Map<Sucursal, unknown>();
  function escribir<T>(sucursal: Sucursal, aplicar: Parameters<typeof transaccion<T>>[2]): Promise<T> {
    const escritura = transaccion(sucursal, "readwrite", aplicar);
    pendientes.add(escritura);
    void escritura.then(
      () => { pendientes.delete(escritura); fallos.delete(sucursal); },
      error => { pendientes.delete(escritura); fallos.set(sucursal, error); }
    );
    return escritura;
  }

  function actualizar(estado: Estado, cambios: Partial<Pick<Estado, "externos" | "movimientos" | "eliminados">>, catalogo: ProductoImportado[], tx: IDBTransaction) {
    const siguiente = { ...estado, ...cambios, revision: estado.revision + 1, actualizadoEn: new Date().toISOString() };
    tx.objectStore("activos").put(siguiente, estado.sucursal);
    return leerAvance(siguiente, catalogo);
  }

  return {
    leer: (sucursal: Sucursal) => transaccion(sucursal, "readonly", (estado, catalogo) =>
      estado ? leerAvance(estado, catalogo!) : null),

    crear: (nuevo: Nuevo, catalogo: readonly ProductoImportado[]) => escribir(nuevo.sucursal, (estado, _, tx) => {
      if (estado) throw new Error("Ya existe un inventario activo en esta sucursal.");
      if (!Number.isFinite(Date.parse(nuevo.fechaReferencia))) throw new Error("Fecha de referencia invalida.");
      seleccionarDepartamento(catalogo, nuevo.departamento);
      const codigos = new Set<string>();
      const productos = catalogo.map(({ codigo, descripcion, departamento, original }) => {
        const clave = codigoClave(codigo);
        if (!clave || !descripcion.trim() || !departamento.trim() || codigos.has(clave)) throw new Error("Catalogo invalido o con codigos duplicados.");
        codigos.add(clave);
        return { codigo, descripcion, departamento, original: normalizarCantidad(original) };
      });
      const siguiente: Estado = {
        ...nuevo, id: crearIdInventario(), actualizadoEn: new Date().toISOString(), version,
        revision: 0, movimientos: [], externos: [], eliminados: []
      };
      tx.objectStore("activos").add(siguiente, nuevo.sucursal);
      tx.objectStore("catalogos").add(productos, nuevo.sucursal);
      return leerAvance(siguiente, productos);
    }),

    registrar: (clave: Clave, movimiento: Movimiento, externo?: ProductoInventario) => escribir(clave.sucursal, (estado, catalogo, tx) => {
      mismoInventario(clave, estado);
      const codigo = movimiento.codigo;
      const importado = catalogo!.find(p => p.codigo === codigo && p.departamento === estado.departamento);
      const existente = estado.externos.find(p => p.codigo === codigo);
      if (externo && (externo.codigo !== codigo || externo.original !== null || !codigoClave(codigo) || !externo.descripcion.trim()
        || catalogo!.some(p => p.departamento === estado.departamento && codigoClave(p.codigo) === codigoClave(codigo))
        || estado.externos.some(p => codigoClave(p.codigo) === codigoClave(codigo) && p.codigo !== codigo))) {
        throw new Error("Codigo de producto externo invalido o en conflicto.");
      }
      const producto = importado ?? existente ?? externo;
      if (!producto) throw new Error("Producto no disponible en el inventario activo.");
      const anterior = estado.movimientos.find(m => m.id === movimiento.id);
      if (estado.eliminados.includes(movimiento.id) || (anterior && anterior.codigo !== codigo)) {
        throw new Error("Identificador de movimiento ya utilizado.");
      }
      if (anterior && externo && existente &&
        (externo.descripcion !== existente.descripcion || externo.departamento !== existente.departamento)) {
        throw new Error("El identificador corresponde a otro contenido.");
      }
      if (!anterior) mismaRevision(clave, estado);
      if (Date.parse(movimiento.fecha) < Date.parse(estado.fechaReferencia)) throw new Error("Movimiento anterior a la referencia del inventario.");
      const historial = estado.movimientos.filter(m => m.codigo === codigo);
      const siguiente = registrar(producto, historial, movimiento);
      if (siguiente === historial) return leerAvance(estado, catalogo!);
      return actualizar(estado, {
        movimientos: [...estado.movimientos, siguiente[siguiente.length - 1]],
        externos: externo && !existente ? [...estado.externos, { codigo, descripcion: externo.descripcion, departamento: externo.departamento, original: null }] : estado.externos
      }, catalogo!, tx);
    }),

    corregir: (clave: Clave, id: string, cantidad: string | null, contabilizadas?: string) => escribir(clave.sucursal, (estado, catalogo, tx) => {
      mismoInventario(clave, estado);
      mismaRevision(clave, estado);
      const anterior = estado.movimientos.find(m => m.id === id);
      if (!anterior) throw new Error("Movimiento no encontrado.");
      const producto = catalogo!.find(p => p.codigo === anterior.codigo && p.departamento === estado.departamento)
        ?? estado.externos.find(p => p.codigo === anterior.codigo);
      if (!producto) throw new Error("Producto del movimiento no disponible.");
      const historial = corregir(producto, estado.movimientos.filter(m => m.codigo === anterior.codigo), id, cantidad, contabilizadas);
      const editado = historial.find(m => m.id === id);
      return actualizar(estado, editado
        ? { movimientos: estado.movimientos.map(m => m.id === id ? editado : m) }
        : { movimientos: estado.movimientos.filter(m => m.id !== id), eliminados: [...estado.eliminados, id] }, catalogo!, tx);
    }),

    eliminar: (clave: Clave) => escribir(clave.sucursal, (estado, _, tx) => {
      mismoInventario(clave, estado);
      mismaRevision(clave, estado);
      tx.objectStore("activos").delete(clave.sucursal);
      tx.objectStore("catalogos").delete(clave.sucursal);
    }),

    async confirmarGuardado(sucursal?: Sucursal) {
      while (pendientes.size) await Promise.allSettled(pendientes);
      if (sucursal ? fallos.has(sucursal) : fallos.size) {
        throw new Error("Queda una escritura sin confirmar. Revisa el error antes de continuar.");
      }
    }
  };
}
