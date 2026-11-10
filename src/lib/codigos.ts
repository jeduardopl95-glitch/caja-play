export function coincidenciasCodigo<T extends { codigo: string }>(catalogo: T[], codigo: string): T[] {
  const query = codigo.trim().toLowerCase();
  const equivalente = /^0\d{12}$/.test(query) ? query.slice(1) : /^\d{12}$/.test(query) ? "0" + query : null;
  return catalogo.filter(item => {
    const value = item.codigo.trim().toLowerCase();
    return value === query || value === equivalente;
  });
}
