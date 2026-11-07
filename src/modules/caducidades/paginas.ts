export async function cargarPaginas<T>(leer: (inicio: number, fin: number) => Promise<T[]>) {
  const size = 100;
  const rows: T[] = [];
  for (let inicio = 0; ; inicio += size) {
    const page = await leer(inicio, inicio + size - 1);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
