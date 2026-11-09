export async function cargarPaginas<T extends { fecha: string; id: string }>(leer: (cursor: T | undefined, limite: number) => Promise<T[]>) {
  const size = 100;
  const rows: T[] = [];
  for (;;) {
    const page = await leer(rows.at(-1), size);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
