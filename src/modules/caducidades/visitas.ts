import type { CatalogItem } from "../../lib/inventorySync";

export const visitas = [
  { dia: "Lunes", preventa: [], mercancia: ["Bimbo", "Coca-Valle", "Yaxchilán"], directa: ["Ricolino", "Marlboro", "Gamesa"] },
  { dia: "Martes", preventa: ["Coca-Valle", "Peñafiel"], mercancia: [], directa: ["Donde"] },
  { dia: "Miércoles", preventa: ["Bimbo", "Yaxchilán"], mercancia: ["Coca-Valle", "Peñafiel"], directa: ["Barcel", "Agua Cristal", "Sabritas"] },
  { dia: "Jueves", preventa: ["Coca-Valle", "Merza", "Pepsi"], mercancia: ["Bimbo", "Yaxchilán"], directa: [] },
  { dia: "Viernes", preventa: ["Peñafiel", "Lala", "Bonafont-Danone"], mercancia: ["Pepsi", "Coca-Valle", "Jumex"], directa: [] },
  { dia: "Sábado", preventa: ["Coca-Valle", "Bimbo", "Yaxchilán"], mercancia: ["Lala", "Peñafiel", "Agua Cristal", "Merza", "Bonafont-Danone"], directa: ["Helados", "Sigma"] },
];

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export function productoExacto(catalogo: CatalogItem[], captura: string) {
  const query = normalize(captura);
  if (!query) return;
  const matches = catalogo.filter(item => normalize(item.codigo) === query || normalize(item.descripcion) === query);
  return matches.length === 1 ? matches[0] : undefined;
}
export const proveedores = [...new Set(visitas.flatMap(day => [...day.preventa, ...day.mercancia, ...day.directa]))].sort();
const aliases: Record<string, string> = { "coca cola": "Coca-Valle", danone: "Bonafont-Danone", "helados nestle": "Helados" };

export function proveedorDe(departamento: string) {
  const name = normalize(departamento);
  return aliases[name] ?? proveedores.find(provider => normalize(provider) === name) ?? "";
}

const dayMs = 86_400_000;
export const diasParaVencer = (hoy: string, fecha: string) => (Date.parse(fecha) - Date.parse(hoy)) / dayMs;

export function tipoAviso(dias: number, departamento: string, chetumalito: boolean) {
  if (dias < 0) return "vencido";
  if (normalize(departamento) === "abarrotes") return dias <= 30 ? "promocion" : null;
  return chetumalito && dias <= 5 ? "cambio" : null;
}

export function proximaVisita(hoy: string, proveedor: string) {
  for (let offset = 0; offset < 7; offset++) {
    const fecha = new Date(Date.parse(hoy) + offset * dayMs);
    const visita = visitas[fecha.getUTCDay() - 1];
    if (visita?.preventa.includes(proveedor) || visita?.directa.includes(proveedor)) {
      return { dia: visita.dia, fecha: fecha.toISOString().slice(0, 10) };
    }
  }
  return null;
}
