import { calcular } from "./movimientos";
import type { InventarioActivo, Movimiento, ProductoImportado, ProductoInventario } from "./tipos";

export type FuenteResultados = Pick<InventarioActivo, "departamento"> & {
  catalogo: readonly ProductoImportado[];
  externos: readonly ProductoInventario[];
  movimientos: readonly Movimiento[];
};

export function filasInventario(avance: FuenteResultados) {
  const grupos = new Map<string, Movimiento[]>();
  for (const m of avance.movimientos) {
    const grupo = grupos.get(m.codigo);
    if (grupo) grupo.push(m); else grupos.set(m.codigo, [m]);
  }
  return [...avance.catalogo.filter(p => p.departamento === avance.departamento), ...avance.externos]
    .map(producto => ({ producto, saldo: calcular(producto, grupos.get(producto.codigo) ?? []) }));
}
