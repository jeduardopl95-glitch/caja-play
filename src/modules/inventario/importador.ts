import { coincidenciasCodigo } from "../../lib/codigos";
import { normalizarCantidad } from "./decimal";
import type { ProductoImportado, ProductoInventario } from "./tipos";

const columnas = ["codigo", "producto", "existencia", "departamento"];
const encabezado = (nombre: string) => nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function* filas(texto: string, separador: string) {
  let fila: string[] = [], campo = "", entreComillas = false, cerrado = false, numero = 1;
  for (let i = 0; i <= texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === undefined) throw new Error(`Comillas sin cerrar en fila ${numero}.`);
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') { campo += c; i++; }
      else { entreComillas = false; cerrado = true; }
      continue;
    }
    if (c === separador || c === "\r" || c === "\n" || c === undefined) {
      fila.push(campo.trim()); campo = ""; cerrado = false;
      if (c !== separador) {
        if (fila.length > 1 || fila[0]) yield { fila, numero };
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila = []; numero++;
      }
    } else if (!cerrado && c === '"' && !campo.trim()) {
      campo = ""; entreComillas = true;
    } else if (c === '"' || (cerrado && c !== " ")) {
      throw new Error(`Comillas invalidas en fila ${numero}.`);
    } else if (!cerrado) campo += c;
  }
}

export function importarInventario(bytes: Uint8Array): ProductoImportado[] {
  let texto: string;
  try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { texto = new TextDecoder("windows-1252").decode(bytes); }
  const opciones = [",", ";", "\t"].flatMap(separador => {
    const lector = filas(texto, separador);
    try {
      const primera = lector.next();
      if (!primera.value) return [];
      const cabecera = primera.value.fila.map(encabezado);
      return columnas.every(nombre => cabecera.filter(c => c === nombre).length === 1)
        ? [{ lector, cabecera }] : [];
    } catch { return []; }
  });
  if (opciones.length !== 1) throw new Error("Encabezados requeridos o separador no identificados de forma inequivoca.");
  const [{ lector, cabecera }] = opciones;
  const indices = columnas.map(nombre => cabecera.indexOf(nombre));
  const productos: ProductoImportado[] = [];
  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  for (const { fila, numero } of lector) {
    if (fila.length !== cabecera.length) throw new Error(`Numero de columnas invalido en fila ${numero}.`);
    const [codigo, descripcion, existencia, departamento] = indices.map(i => fila[i]);
    if (!codigo || !descripcion || !departamento) throw new Error(`Datos requeridos en fila ${numero}.`);
    let original: string;
    try { original = normalizarCantidad(existencia); }
    catch { throw new Error(`Existencia invalida en fila ${numero}.`); }
    const clave = codigo.toLowerCase();
    if (vistos.has(clave)) duplicados.add(codigo);
    vistos.add(clave);
    productos.push({ codigo, descripcion, departamento, original });
  }
  if (duplicados.size) throw new Error(`Codigos duplicados: ${[...duplicados].join(", ")}.`);
  if (!productos.length) throw new Error("El CSV no contiene productos.");
  return productos;
}

export const departamentos = (catalogo: readonly ProductoImportado[]) =>
  [...new Set(catalogo.map(p => p.departamento))].sort((a, b) => a.localeCompare(b, "es"));

export function seleccionarDepartamento(catalogo: readonly ProductoImportado[], departamento: string) {
  const seleccion = catalogo.filter(p => p.departamento === departamento);
  if (!seleccion.length) throw new Error("Departamento no disponible.");
  return seleccion;
}

export function buscarCodigo<T extends ProductoInventario>(catalogo: T[], codigo: string) {
  return coincidenciasCodigo(catalogo, codigo);
}
