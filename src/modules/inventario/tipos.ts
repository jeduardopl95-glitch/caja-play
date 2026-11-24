export type Cantidad = string;

export type ProductoInventario = Readonly<{
  codigo: string;
  descripcion: string;
  departamento: string | null;
  original: Cantidad | null;
}>;

export type ProductoImportado = ProductoInventario & { readonly original: Cantidad; readonly departamento: string };

export type InventarioActivo = Readonly<{
  id: string;
  sucursal: "CHETUMALITO" | "DOS HERMANOS" | "JUNIOR" | "PLAYITA";
  departamento: string;
  fechaReferencia: string;
  actualizadoEn: string;
  version: 1;
}>;

export type Movimiento = Readonly<{
  id: string;
  codigo: string;
  cantidad: Cantidad;
  fecha: string;
} & ({ tipo: "conteo" | "entrada" } | { tipo: "venta"; contabilizadas: Cantidad })>;
